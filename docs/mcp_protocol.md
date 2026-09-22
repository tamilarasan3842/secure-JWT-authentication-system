# Model Context Protocol (MCP) Stdio Transport Specification

## Overview
The Model Context Protocol (MCP) standardizes how AI agents interface with local and external tool servers.

## Server Architecture
- **Process Model**: `mcp_server.py` runs as an isolated, standalone process communicating with the LangGraph agent host over standard I/O (`stdio`).
- **Transport**: JSON-RPC 2.0 messages over standard input/output streams (`stdin` / `stdout`).

## Exposed Tools
1. **`search_docs`**:
   - Arguments: `query: str`, `k: int = 3`
   - Description: Performs vector similarity search against ChromaDB vector store and returns top-k matching document chunks along with source metadata and similarity scores.
2. **`get_doc`**:
   - Arguments: `filename: str`
   - Description: Retrieves the raw markdown content of a specified document file from the `docs/` repository directory.

## Isolation Rationale
Running retrieval as a separate MCP process provides clean security sandboxing, protocol interoperability across different LLM runners, and modular tool maintenance without coupling to the main web app process.
