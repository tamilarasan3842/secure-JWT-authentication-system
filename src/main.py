import os
import sys
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from src.db import create_user, get_user_by_email, verify_password, init_db
from src.auth import create_access_token, get_current_user
from src.ingest import run_ingestion, search_chunks, DOCS_DIR
from src.graph import run_agent_workflow
from src.mcp_server import TOOLS_MANIFEST, handle_search_docs, handle_get_doc

load_dotenv()

app = FastAPI(
    title="Secure Document Q&A Service",
    description="FastAPI + JWT + LangGraph + MCP stdio protocol + Chroma Vector RAG",
    version="1.0.0"
)

# Enable CORS for frontend applet preview
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    init_db()
    # Ensure vector store is initialized on launch
    try:
        run_ingestion()
    except Exception as e:
        print(f"Startup ingestion notice: {e}")

# Request / Response Schemas
class UserRegisterRequest(BaseModel):
    email: str
    password: str

class UserLoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str

class ChatRequest(BaseModel):
    query: str

class MCPCallRequest(BaseModel):
    name: str
    arguments: Dict[str, Any]

# Auth Endpoints (Milestone M1)
@app.post("/auth/register", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
def register(req: UserRegisterRequest):
    email = req.email.strip() if req.email else ""
    if not email or "@" not in email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please enter a valid email address."
        )
    if not req.password or len(req.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long."
        )
    try:
        user = create_user(email, req.password)
        return {"message": "User registered successfully", "user": user}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@app.post("/auth/login", response_model=TokenResponse)
def login(req: UserLoginRequest):
    email = req.email.strip().lower() if req.email else ""
    if not email or "@" not in email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please enter a valid email address."
        )
    if not req.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please enter your password."
        )

    user = get_user_by_email(email)

    if not user:
        # Auto-create user if password is valid (>= 6 chars)
        if len(req.password) >= 6:
            try:
                create_user(email, req.password)
                user = get_user_by_email(email)
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password."
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account not found. Password must be at least 6 characters to register.",
            )

    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password for " + email + ".",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": user["email"]})
    return TokenResponse(access_token=access_token, token_type="bearer", email=user["email"])

@app.get("/me")
def read_current_user(current_user: Dict[str, Any] = Depends(get_current_user)):
    return {
        "status": "authenticated",
        "email": current_user["email"],
        "jwt_payload": current_user["payload"]
    }

# RAG & Protected Chat Endpoint (Milestone M4 & M5)
@app.post("/chat")
def chat(req: ChatRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    if not req.query.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query string cannot be empty."
        )
    
    # Run stateful LangGraph workflow
    result = run_agent_workflow(req.query)
    
    return {
        "query": req.query,
        "answer": result.get("answer", ""),
        "sources": result.get("sources", []),
        "retrieved_chunks": result.get("retrieved_docs", []),
        "execution_trace": result.get("node_history", []),
        "retry_count": result.get("retry_count", 0),
        "user": current_user["email"]
    }

# Ingestion & Corpus Endpoints (Milestone M2)
@app.post("/ingest")
def trigger_ingestion():
    records = run_ingestion()
    return {
        "status": "success",
        "message": f"Ingested {len(records)} document chunks into vector store.",
        "chunk_count": len(records)
    }

@app.get("/docs-list")
def list_documents():
    docs_path = os.path.abspath(DOCS_DIR)
    if not os.path.exists(docs_path):
        return {"documents": []}
    files = [f for f in os.listdir(docs_path) if f.endswith(".md")]
    docs_info = []
    for f in files:
        file_path = os.path.join(docs_path, f)
        size = os.path.getsize(file_path)
        docs_info.append({"filename": f, "size_bytes": size})
    return {"documents": docs_info}

# MCP Stdio Server Tool Inspector Endpoints (Milestone M3)
@app.get("/mcp/tools")
def list_mcp_tools():
    return {"tools": TOOLS_MANIFEST}

@app.post("/mcp/call")
def call_mcp_tool(req: MCPCallRequest):
    if req.name == "search_docs":
        query = req.arguments.get("query", "")
        k = req.arguments.get("k", 3)
        return handle_search_docs(query=query, k=k)
    elif req.name == "get_doc":
        filename = req.arguments.get("filename", "")
        return handle_get_doc(filename=filename)
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"MCP Tool '{req.name}' not found"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)
