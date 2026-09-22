import os
import sys
import json
import subprocess
from typing import List, Dict, Any, TypedDict
from dotenv import load_dotenv

load_dotenv()

# Define Typed Agent State
class AgentState(TypedDict):
    query: str
    messages: List[Dict[str, str]]
    retrieved_docs: List[Dict[str, Any]]
    answer: str
    sources: List[str]
    retry_count: int
    grade_result: str
    node_history: List[str]

def call_mcp_stdio_server(query: str, k: int = 3) -> List[Dict[str, Any]]:
    """Spawns the MCP server as a separate process communicating via stdio JSON-RPC 2.0 protocol."""
    mcp_script = os.path.join(os.path.dirname(__file__), "mcp_server.py")
    python_exec = sys.executable

    try:
        proc = subprocess.Popen(
            [python_exec, mcp_script],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        # 1. Initialize
        init_req = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {"clientInfo": {"name": "langgraph-agent", "version": "1.0"}}
        }) + "\n"
        proc.stdin.write(init_req)
        proc.stdin.flush()
        proc.stdout.readline() # init response

        # 2. Call search_docs tool
        call_req = json.dumps({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "search_docs",
                "arguments": {"query": query, "k": k}
            }
        }) + "\n"
        proc.stdin.write(call_req)
        proc.stdin.flush()

        resp_line = proc.stdout.readline()
        proc.terminate()

        if resp_line:
            data = json.loads(resp_line)
            content_str = data.get("result", {}).get("content", [{}])[0].get("text", "[]")
            return json.loads(content_str)
    except Exception as e:
        print(f"Subprocess MCP invocation fallback notice: {e}")
        # Direct fallback import if subprocess stdio stream encounters OS pipe limit
        from src.ingest import search_chunks
        return search_chunks(query, k=k)

    from src.ingest import search_chunks
    return search_chunks(query, k=k)


# Node 1: Retrieve Node
def retrieve_node(state: AgentState) -> AgentState:
    history = state.get("node_history", [])
    history.append("retrieve")
    query = state["query"]
    
    docs = call_mcp_stdio_server(query, k=3)
    
    return {
        **state,
        "retrieved_docs": docs,
        "node_history": history
    }

# Node 2: Grade Documents Node (Milestone M5)
def grade_documents_node(state: AgentState) -> AgentState:
    history = state.get("node_history", [])
    history.append("grade_documents")
    docs = state.get("retrieved_docs", [])
    
    # Check max score among retrieved docs
    max_score = max([d.get("score", 0.0) for d in docs], default=0.0)
    
    # Relevance grading rule
    if max_score >= 0.05 and len(docs) > 0:
        grade = "relevant"
    else:
        grade = "irrelevant"
        
    return {
        **state,
        "grade_result": grade,
        "node_history": history
    }

# Node 3: Rewrite Query Node
def rewrite_query_node(state: AgentState) -> AgentState:
    history = state.get("node_history", [])
    history.append("rewrite_query")
    original_query = state["query"]
    current_retry = state.get("retry_count", 0) + 1
    
    # Expand query with context keywords
    expanded_query = f"{original_query} documentation guide tutorial concepts"
    
    return {
        **state,
        "query": expanded_query,
        "retry_count": current_retry,
        "node_history": history
    }

# Node 4: Generate Node
def generate_node(state: AgentState) -> AgentState:
    history = state.get("node_history", [])
    history.append("generate")
    query = state["query"]
    docs = state.get("retrieved_docs", [])
    grade = state.get("grade_result", "relevant")
    retry_count = state.get("retry_count", 0)

    # Hard Requirement #7: If documents don't contain the answer, say so.
    if grade == "irrelevant" and retry_count >= 1 or not docs or max([d.get("score", 0.0) for d in docs], default=0) < 0.01:
        return {
            **state,
            "answer": "I could not find sufficient information in the internal documentation repository to answer your question.",
            "sources": [],
            "node_history": history
        }

    # Extract unique sources
    sources = list(set([d["source"] for d in docs if d.get("source")]))

    # Try Gemini API if available, else format robust grounded response from docs
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key and gemini_key != "MY_GEMINI_API_KEY":
        try:
            from google import genai
            client = genai.Client(api_key=gemini_key)
            context_str = "\n\n".join([f"Source [{d['source']}]:\n{d['content']}" for d in docs])
            prompt = (
                f"You are an internal documentation assistant. Answer the user question based strictly on the context below.\n"
                f"Question: {query}\n\n"
                f"Context:\n{context_str}\n\n"
                f"Include clear references to source filenames like [filename.md]."
            )
            response = client.models.generate_content(
                model="gemini-3.6-flash",
                contents=prompt
            )
            answer_text = response.text
        except Exception:
            answer_text = build_fallback_synthesis(query, docs, sources)
    else:
        answer_text = build_fallback_synthesis(query, docs, sources)

    return {
        **state,
        "answer": answer_text,
        "sources": sources,
        "node_history": history
    }

def build_fallback_synthesis(query: str, docs: List[Dict[str, Any]], sources: List[str]) -> str:
    parts = []
    parts.append(f"Based on internal documentation ({', '.join([f'[{s}]' for s in sources])}):\n")
    for d in docs:
        parts.append(f"• From **{d['source']}**:\n  {d['content'].strip()[:300]}...")
    return "\n\n".join(parts)

# Construct LangGraph StateGraph
try:
    from langgraph.graph import StateGraph, START, END
    
    workflow = StateGraph(AgentState)
    
    workflow.add_node("retrieve", retrieve_node)
    workflow.add_node("grade_documents", grade_documents_node)
    workflow.add_node("rewrite_query", rewrite_query_node)
    workflow.add_node("generate", generate_node)
    
    workflow.add_edge(START, "retrieve")
    workflow.add_edge("retrieve", "grade_documents")
    
    def decide_next(state: AgentState):
        if state.get("grade_result") == "relevant":
            return "generate"
        if state.get("retry_count", 0) < 1:
            return "rewrite_query"
        return "generate"
        
    workflow.add_conditional_edges("grade_documents", decide_next, {
        "generate": "generate",
        "rewrite_query": "rewrite_query"
    })
    workflow.add_edge("rewrite_query", "retrieve")
    workflow.add_edge("generate", END)
    
    app_graph = workflow.compile()
except Exception as e:
    print(f"LangGraph StateGraph compilation notice: {e}")
    app_graph = None

def run_agent_workflow(user_query: str) -> Dict[str, Any]:
    initial_state: AgentState = {
        "query": user_query,
        "messages": [{"role": "user", "content": user_query}],
        "retrieved_docs": [],
        "answer": "",
        "sources": [],
        "retry_count": 0,
        "grade_result": "pending",
        "node_history": []
    }
    
    if app_graph is not None:
        try:
            final_state = app_graph.invoke(initial_state)
            return final_state
        except Exception as err:
            print(f"Graph invocation fallback: {err}")
            
    # Pure Python execution loop mirroring the StateGraph execution
    s1 = retrieve_node(initial_state)
    s2 = grade_documents_node(s1)
    if s2["grade_result"] == "irrelevant" and s2["retry_count"] < 1:
        s3 = rewrite_query_node(s2)
        s4 = retrieve_node(s3)
        s5 = grade_documents_node(s4)
        s6 = generate_node(s5)
        return s6
    else:
        s6 = generate_node(s2)
        return s6
