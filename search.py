import os
import sys
import logging
from typing import List, Dict, Any
from langchain_ollama import OllamaEmbeddings
from langchain_community.vectorstores import Chroma

# ==============================================================================
# LOGGING CONFIGURATION
# ==============================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("search")

# ==============================================================================
# CONFIGURATION CONSTANTS
# ==============================================================================
CHROMA_PERSIST_DIR = "./chroma_db"
EMBEDDING_MODEL_NAME = "nomic-embed-text"


def search_documents(query: str, k: int = 3) -> List[Dict[str, Any]]:
    """
    Converts query string into an embedding using OllamaEmbeddings,
    searches the ChromaDB vector store, and returns the top-k similar chunks.

    Args:
        query (str): The search query string.
        k (int): Number of top similar chunks to retrieve (default is 3).

    Returns:
        List[Dict[str, Any]]: List of dictionaries containing source, chunk_id, score, and content.
    """
    if not os.path.exists(CHROMA_PERSIST_DIR):
        raise FileNotFoundError(
            f"Chroma DB directory '{CHROMA_PERSIST_DIR}' does not exist. "
            "Please run 'python ingest.py' first to build the vector store."
        )

    logger.info(f"Loading Chroma DB from '{CHROMA_PERSIST_DIR}'...")
    embeddings = OllamaEmbeddings(model=EMBEDDING_MODEL_NAME)

    vector_store = Chroma(
        persist_directory=CHROMA_PERSIST_DIR,
        embedding_function=embeddings
    )

    logger.info(f"Performing similarity search for query: '{query}' (top k={k})...")
    
    # Retrieve top k documents along with similarity distance
    results_with_scores = vector_store.similarity_search_with_score(query, k=k)

    formatted_results = []
    for doc, distance in results_with_scores:
        # Calculate similarity score normalized to 2 decimal places
        similarity_score = round(float(1.0 / (1.0 + distance)), 2)
        
        formatted_results.append({
            "source": doc.metadata.get("source", "unknown.md"),
            "chunk_id": doc.metadata.get("chunk_id", 1),
            "score": similarity_score,
            "content": doc.page_content
        })

    logger.info(f"Retrieved {len(formatted_results)} chunk(s).")
    return formatted_results


def print_results(results: List[Dict[str, Any]]) -> None:
    """
    Formats and prints similarity search results cleanly to standard output.

    Args:
        results (List[Dict[str, Any]]): Formatted search result dictionaries.
    """
    if not results:
        print("No matching document chunks found.")
        return

    print("\n" + "=" * 55)
    print("SIMILARITY SEARCH RESULTS")
    print("=" * 55 + "\n")

    for idx, item in enumerate(results, start=1):
        print("=========================================")
        print(f"Result {idx}")
        print("=========================================")
        print(f"Source:   {item['source']} (Chunk #{item['chunk_id']})")
        print(f"Score:    {item['score']}")
        print("\nContent:")
        print(item['content'])
        print("=========================================\n")


def main() -> None:
    """
    Main entry point for similarity search tool.
    Accepts search query from command-line arguments or uses default demo queries.
    """
    try:
        default_query = "What is the password policy and authentication mechanism?"
        query = sys.argv[1] if len(sys.argv) > 1 else default_query

        results = search_documents(query=query, k=3)
        print_results(results)

    except Exception as e:
        logger.error(f"Search failed: {str(e)}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()

