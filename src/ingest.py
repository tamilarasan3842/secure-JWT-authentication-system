import os
import glob
import math
import json
from typing import List, Dict, Any

DOCS_DIR = os.path.join(os.path.dirname(__file__), "..", "docs")
VECTOR_STORE_FILE = os.path.join(os.path.dirname(__file__), "..", "vector_store.json")

CHUNK_SIZE = 500
CHUNK_OVERLAP = 100

def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    chunks = []
    start = 0
    text_len = len(text)
    
    if text_len == 0:
        return []
        
    while start < text_len:
        end = min(start + chunk_size, text_len)
        chunk = text[start:end]
        chunks.append(chunk)
        if end == text_len:
            break
        start += (chunk_size - overlap)
    return chunks

def simple_tokenize(text: str) -> List[str]:
    import re
    tokens = re.findall(r'\w+', text.lower())
    return tokens

def compute_tf_vector(tokens: List[str]) -> Dict[str, float]:
    counts = {}
    for t in tokens:
        counts[t] = counts.get(t, 0) + 1
    total = len(tokens) or 1
    return {t: count / total for t, count in counts.items()}

def cosine_similarity(vec1: Dict[str, float], vec2: Dict[str, float]) -> float:
    intersection = set(vec1.keys()) & set(vec2.keys())
    if not intersection:
        return 0.0
    dot_product = sum(vec1[t] * vec2[t] for t in intersection)
    mag1 = math.sqrt(sum(v**2 for v in vec1.values()))
    mag2 = math.sqrt(sum(v**2 for v in vec2.values()))
    if mag1 == 0 or mag2 == 0:
        return 0.0
    return dot_product / (mag1 * mag2)

def run_ingestion() -> List[Dict[str, Any]]:
    docs_path = os.path.abspath(DOCS_DIR)
    md_files = glob.glob(os.path.join(docs_path, "*.md"))
    
    vector_records = []
    chunk_counter = 0

    for file_path in md_files:
        filename = os.path.basename(file_path)
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        chunks = chunk_text(content, CHUNK_SIZE, CHUNK_OVERLAP)
        
        for idx, chunk_content in enumerate(chunks):
            tokens = simple_tokenize(chunk_content)
            tf_vector = compute_tf_vector(tokens)
            chunk_id = f"{filename}#chunk-{idx}"
            
            record = {
                "id": chunk_id,
                "source": filename,
                "chunk_index": idx,
                "content": chunk_content,
                "vector": tf_vector
            }
            vector_records.append(record)
            chunk_counter += 1

    # Save to JSON vector store
    with open(VECTOR_STORE_FILE, "w", encoding="utf-8") as f:
        json.dump(vector_records, f, indent=2)

    # Also try ChromaDB if chromadb package is available
    try:
        import chromadb
        chroma_client = chromadb.PersistentClient(path="./chroma_db")
        collection = chroma_client.get_or_create_collection(name="documents")
        
        # Reset collection
        existing = collection.get()
        if existing and existing.get("ids"):
            collection.delete(ids=existing["ids"])
            
        ids = [r["id"] for r in vector_records]
        documents = [r["content"] for r in vector_records]
        metadatas = [{"source": r["source"], "chunk_index": r["chunk_index"]} for r in vector_records]
        
        if ids:
            collection.add(
                ids=ids,
                documents=documents,
                metadatas=metadatas
            )
    except Exception as e:
        print(f"ChromaDB ingestion notice: {e}")

    print(f"Successfully ingested {len(md_files)} documents into {len(vector_records)} chunks (size={CHUNK_SIZE}, overlap={CHUNK_OVERLAP}).")
    return vector_records

def search_chunks(query: str, k: int = 3) -> List[Dict[str, Any]]:
    query_tokens = simple_tokenize(query)
    query_vec = compute_tf_vector(query_tokens)
    
    if not os.path.exists(VECTOR_STORE_FILE):
        run_ingestion()
        
    try:
        with open(VECTOR_STORE_FILE, "r", encoding="utf-8") as f:
            vector_records = json.load(f)
    except Exception:
        vector_records = run_ingestion()
        
    results = []
    for r in vector_records:
        score = cosine_similarity(query_vec, r["vector"])
        # Boost if query keyword appears in document source title or content directly
        query_words = [w for w in query_tokens if len(w) > 3]
        keyword_hits = sum(1 for w in query_words if w in r["content"].lower())
        boosted_score = score + (0.1 * keyword_hits)
        
        results.append({
            "id": r["id"],
            "source": r["source"],
            "chunk_index": r["chunk_index"],
            "content": r["content"],
            "score": round(boosted_score, 4)
        })

    # Sort descending by score
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:k]

if __name__ == "__main__":
    run_ingestion()
