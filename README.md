# Secure Document Q&A Service — FastAPI (JWT) + LangGraph + MCP

A production-grade, multi-tiered document Q&A microservice built with **FastAPI**, **JWT Authentication**, **LangGraph** stateful orchestration, **Model Context Protocol (MCP)** process isolation, and **ChromaDB** vector RAG.

---

## 🏗️ System Architecture

```
       HTTP request + JWT
              │
              ▼
     ┌────────────────────────────────┐
     │          FastAPI App           │
     │  POST /auth/register           │
     │  POST /auth/login  → token     │
     │  GET  /me          (protected) │
     │  POST /chat        (protected) │
     └───────────────┬────────────────┘
                     │
            ┌────────▼─────────┐
            │  LangGraph Agent │
            │  retrieve →      │
            │  (grade) →       │
            │  generate        │
            └────────┬─────────┘
                     │  MCP (stdio)
            ┌────────▼──────────────┐
            │      MCP Server       │   ← Separate Process (stdio IPC)
            │  tool: search_docs    │
            │  tool: get_doc        │
            └────────┬──────────────┘
                     │
            ┌────────▼──────────┐
            │  Chroma Vector DB │   ← Local disk vector store
            └───────────────────┘
```

---

## 🚀 Setup & Execution Guide (From Clean Clone)

### 1. Prerequisites & Dependencies
- Python 3.10+
- [`uv`](https://astral.sh/uv) package manager (or standard python `venv`)

### 2. Quickstart Instructions
```bash
# 1. Clone repository
git clone <repo_url>
cd rag-service

# 2. Create virtual environment & install dependencies with uv
uv venv .venv
source .venv/bin/activate    # On Windows: .venv\Scripts\activate
uv pip install fastapi "uvicorn[standard]" pyjwt bcrypt python-dotenv \
               langgraph langchain-core google-genai \
               mcp chromadb

# 3. Configure Environment Variables
cp .env.example .env
# Ensure JWT_SECRET is set in .env (never hardcode in source code)

# 4. Ingest Documents into Chroma Vector Database
python src/ingest.py

# 5. Launch FastAPI Backend Service
uv run uvicorn src.main:app --reload --port 8000
```

### 6. Test Interactive API Documentation
Open your browser to:
- Swagger Interactive Docs: `http://localhost:8000/docs`
- MCP Stdio Server Inspector: `uv run mcp dev src/mcp_server.py`

---

## 📐 Chunk Size & Overlap Strategy

- **Chunk Size**: `500 characters`
- **Chunk Overlap**: `100 characters`

### Rationale
- **Semantic Precision**: Standard markdown documentation paragraphs in support/technical guides average 300-600 characters. A 500-character window isolates distinct technical concepts (e.g., password reset steps or JWT claim handling) without diluting vector embeddings with irrelevant surrounding sections.
- **Context Boundary Continuity**: The 100-character overlap prevents information fragmentation across sentence edges. When key instructions span chunk boundaries, the 20% overlap guarantees that sentence fragments remain intact in adjacent chunks, maximizing cosine similarity hit rates.

---

## 🔌 Why Retrieval Sits Behind MCP (Model Context Protocol)

Architecting retrieval behind an isolated MCP stdio server (`src/mcp_server.py`) rather than calling python functions directly provides four distinct advantages:

1. **Process & Security Sandboxing**: The vector database, disk I/O, and raw markdown files execute in a dedicated process space. The LangGraph agent runtime cannot directly execute arbitrary filesystem operations—it must send typed JSON-RPC 2.0 requests across `stdio` streams.
2. **Protocol Standardization**: Adopting MCP allows any client (Claude Desktop, Cursor, IDE assistants, or custom LangGraph nodes) to reuse the exact same retrieval tools without code modification.
3. **Decoupled Scaling**: In production environments, the retrieval MCP server can be migrated to remote RPC or containerized microservices independently of the web/agent orchestration tier.
4. **Tool Versioning & Testability**: The retrieval process can be tested independently using the standard MCP Inspector (`uv run mcp dev src/mcp_server.py`) without instantiating FastAPI routes or LLM graphs.

---

## 💡 What Would Be Changed Given Another Week

If granted another week of engineering time, the following improvements would be prioritized:

1. **Server-Sent Events (SSE) Streaming**: Upgrade `POST /chat` to stream agent reasoning steps and generated tokens incrementally to reduce perceived latency.
2. **Multi-Corpus Tenant Namespaces**: Extend ChromaDB vector storage to isolate collections per user organization or permission role.
3. **Hybrid Sparse-Dense Retrieval**: Combine BM25 keyword matching with dense vector embeddings to handle exact code snippet matching alongside semantic queries.
4. **Dynamic Graph State Checkpointing**: Persist LangGraph conversation threads in SQLite state checkpointers for multi-turn conversational memory.

---

## 🧠 Gaps, Unknowns, and How They Were Resolved

| Topic | Initial Unknown / Challenge | Solution & Resolution |
| :--- | :--- | :--- |
| **MCP Stdio Transport** | Managing persistent sub-process pipes and stdio buffering between LangGraph nodes and Python subprocesses without blocking or deadlocking. | Implemented structured non-blocking JSON-RPC 2.0 message loop with newline delimiter flushing in `mcp_server.py` and subprocess lifecycle management in `graph.py`. |
| **LangGraph Conditional Edges** | Preventing infinite retrieval loops when the grade node repeatedly fails on ambiguous queries. | Added explicit `retry_count` state variable capped at `1` inside `AgentState`, cleanly routing to the `generate` node on cap exhaustion. |
| **JWT Verification** | Handling token signature expiration edge cases across timezone boundaries cleanly in FastAPI HTTPBearer dependencies. | Used UTC-based `datetime.utcnow()` timestamps for `exp` claims and explicit HTTP 401 exception handling in `auth.py`. |

---

## 🤖 AI Usage Disclosure

- **AI Tools Used**: Used Claude / Gemini for code architecture drafting, FastAPI boilerplate schema verification, and Markdown documentation formatting.
- **Human Guidance & Verification**: 
  - All JWT security logic, bcrypt hashing, SQLite schema definitions, state graph edge conditions, and MCP stdio JSON-RPC message handlers were manually verified, tested, and audited.
