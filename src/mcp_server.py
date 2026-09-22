import sys
import json
import os
from typing import Dict, Any

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from src.ingest import search_chunks, DOCS_DIR

TOOLS_MANIFEST = [
    {
        "name": "search_docs",
        "description": "Searches internal document vector store for relevant chunks matching the query.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query string to look up in documentation."
                },
                "k": {
                    "type": "integer",
                    "description": "Number of top matching chunks to return (default: 3).",
                    "default": 3
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_doc",
        "description": "Retrieves the complete content of a specified documentation markdown file.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "The target documentation filename (e.g. 'fastapi_security.md')."
                }
            },
            "required": ["filename"]
        }
    }
]

def handle_search_docs(query: str, k: int = 3) -> Dict[str, Any]:
    results = search_chunks(query, k=k)
    return {
        "content": [
            {
                "type": "text",
                "text": json.dumps(results, indent=2)
            }
        ]
    }

def handle_get_doc(filename: str) -> Dict[str, Any]:
    doc_path = os.path.join(DOCS_DIR, filename)
    if not os.path.exists(doc_path):
        return {
            "content": [
                {
                    "type": "text",
                    "text": f"Error: Document '{filename}' not found in docs repository."
                }
            ],
            "isError": True
        }
    try:
        with open(doc_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {
            "content": [
                {
                    "type": "text",
                    "text": content
                }
            ]
        }
    except Exception as e:
        return {
            "content": [
                {
                    "type": "text",
                    "text": f"Error reading document: {str(e)}"
                }
            ],
            "isError": True
        }

def run_stdio_server():
    """Stdio JSON-RPC 2.0 loop for Model Context Protocol (MCP) process isolation."""
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue
            request = json.loads(line)
            req_id = request.get("id")
            method = request.get("method")
            params = request.get("params", {})

            if method == "initialize":
                response = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {
                            "tools": {}
                        },
                        "serverInfo": {
                            "name": "mcp-doc-search-server",
                            "version": "1.0.0"
                        }
                    }
                }
            elif method == "notifications/initialized":
                continue
            elif method == "tools/list":
                response = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "tools": TOOLS_MANIFEST
                    }
                }
            elif method == "tools/call":
                tool_name = params.get("name")
                args = params.get("arguments", {})
                if tool_name == "search_docs":
                    res = handle_search_docs(query=args.get("query", ""), k=args.get("k", 3))
                    response = {"jsonrpc": "2.0", "id": req_id, "result": res}
                elif tool_name == "get_doc":
                    res = handle_get_doc(filename=args.get("filename", ""))
                    response = {"jsonrpc": "2.0", "id": req_id, "result": res}
                else:
                    response = {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "error": {
                            "code": -32601,
                            "message": f"Method/Tool '{tool_name}' not found"
                        }
                    }
            elif method == "ping":
                response = {"jsonrpc": "2.0", "id": req_id, "result": {}}
            else:
                response = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {
                        "code": -32601,
                        "message": f"Unsupported method: {method}"
                    }
                }

            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()

        except Exception as e:
            error_resp = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {
                    "code": -32603,
                    "message": f"Internal RPC Error: {str(e)}"
                }
            }
            sys.stdout.write(json.dumps(error_resp) + "\n")
            sys.stdout.flush()

if __name__ == "__main__":
    run_stdio_server()
