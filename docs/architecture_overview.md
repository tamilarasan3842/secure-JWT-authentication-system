# Secure Document Q&A Architecture Overview

## Multi-Layer Architecture
1. **API Tier (FastAPI)**: Serves HTTP endpoints, enforces CORS policy, validates JWT tokens, hashes passwords using bcrypt, and interfaces with SQLite user store.
2. **Orchestration Tier (LangGraph)**: Implements stateful agent workflows. Coordinates retrieval, document relevance grading, query reformulation, and source-attributed text synthesis.
3. **Tool Tier (MCP Server)**: Standard IO process executing tool contracts (`search_docs`, `get_doc`) isolated from the main web application process.
4. **Data Tier (ChromaDB & SQLite)**: Local disk vector store for document embeddings and SQLite database for user accounts.

## Security Guarantees
- Zero cleartext passwords stored or logged.
- Strict token signature checking.
- Source chunk attribution enforced for every answer.
