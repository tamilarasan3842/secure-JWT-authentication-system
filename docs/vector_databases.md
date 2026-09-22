# Vector Databases & Ingestion Pipeline Guide

## Overview
This document describes how raw markdown documentation is chunked, embedded, and stored in ChromaDB.

## Ingestion Strategy
- **Chunk Size**: 500 characters. Chosen to preserve dense semantic context while fitting cleanly into LLM context windows without diluting document source attribution.
- **Chunk Overlap**: 100 characters. Ensures continuity across sentence boundaries so key concepts spanning chunk boundaries are not lost.
- **Embedding Model**: Text embedding model or dense vectorizer (e.g. Gemini embedding / Chroma default sentence-transformers).
- **Storage**: Persistent local disk database (`./chroma_db`).

## Retrieval Process
1. Input query string is converted to a dense vector embedding.
2. Cosine similarity score is computed against indexed chunk embeddings.
3. Top `k` chunks (default k=3) are returned with source filename metadata and match scores.
