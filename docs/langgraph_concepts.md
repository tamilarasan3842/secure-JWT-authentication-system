# LangGraph Agent Concepts & Graph State Workflow

## Overview
LangGraph is a stateful orchestrator for LLM agents. In this service, it coordinates retrieval, relevance grading, query expansion, and answer generation.

## AgentState Schema
```python
class AgentState(TypedDict):
    query: str
    messages: List[str]
    retrieved_docs: List[Dict[str, Any]]
    answer: str
    sources: List[str]
    retry_count: int
    grade_result: str
```

## Graph Nodes & Edges
1. **Retrieve Node**: Connects to the MCP Stdio Server (`mcp_server.py`) over standard input/output streams and invokes the `search_docs` tool.
2. **Grade Node (M5)**: Evaluates whether retrieved document chunks contain sufficient information to answer the user query.
   - If relevant: Proceeds to `generate` node.
   - If irrelevant and `retry_count < 1`: Routes to `rewrite_query` node.
   - If irrelevant and cap reached: Routes to `generate` node (which returns a fallback notice).
3. **Rewrite Query Node**: Reformulates the user query with semantic expansions for a second retrieval attempt.
4. **Generate Node**: Synthesizes the final answer using retrieved context and formats explicit source citations (`[source_file.md]`).
