import os
import sys
import logging
from typing import List
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
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
logger = logging.getLogger("ingest")

# ==============================================================================
# CONFIGURATION CONSTANTS
# ==============================================================================
DOCS_DIRECTORY = "./docs"
CHROMA_PERSIST_DIR = "./chroma_db"
EMBEDDING_MODEL_NAME = "nomic-embed-text"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 100


def load_documents(docs_dir: str) -> List:
    """
    Loads all Markdown (.md) files recursively from the specified directory.
    
    Args:
        docs_dir (str): Path to the directory containing markdown files.
        
    Returns:
        List: List of loaded LangChain Document objects.
    """
    if not os.path.exists(docs_dir):
        raise FileNotFoundError(f"Directory '{docs_dir}' does not exist.")

    logger.info(f"Loading markdown files from '{docs_dir}'...")
    
    loader = DirectoryLoader(
        docs_dir,
        glob="**/*.md",
        loader_cls=TextLoader,
        loader_kwargs={"encoding": "utf-8"}
    )
    documents = loader.load()
    logger.info(f"Successfully loaded {len(documents)} document(s).")
    return documents


def split_documents(documents: List) -> List:
    """
    Splits documents into smaller chunks using RecursiveCharacterTextSplitter.
    Attaches custom metadata required: source filename and chunk_id.
    
    Args:
        documents (List): Raw loaded LangChain Document objects.
        
    Returns:
        List: Processed document chunks with metadata attached.
    """
    logger.info(f"Splitting documents with chunk_size={CHUNK_SIZE}, chunk_overlap={CHUNK_OVERLAP}...")
    
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP
    )
    
    raw_chunks = text_splitter.split_documents(documents)
    
    chunks_per_file = {}
    processed_chunks = []

    for chunk in raw_chunks:
        source_path = chunk.metadata.get("source", "unknown.md")
        filename = os.path.basename(source_path)

        chunk_number = chunks_per_file.get(filename, 0) + 1
        chunks_per_file[filename] = chunk_number

        chunk.metadata = {
            "source": filename,
            "chunk_id": chunk_number
        }
        processed_chunks.append(chunk)

    logger.info(f"Created {len(processed_chunks)} chunk(s) across {len(chunks_per_file)} file(s).")
    return processed_chunks


def ingest_to_chroma(chunks: List, persist_directory: str) -> Chroma:
    """
    Generates embeddings using OllamaEmbeddings and stores them inside ChromaDB.
    Uses deterministic chunk IDs to prevent duplicate vectors on multiple runs.
    
    Args:
        chunks (List): Processed document chunks.
        persist_directory (str): Path where Chroma DB will be persisted.
        
    Returns:
        Chroma: Initialized Chroma vector store instance.
    """
    logger.info(f"Initializing OllamaEmbeddings model '{EMBEDDING_MODEL_NAME}'...")
    embeddings = OllamaEmbeddings(model=EMBEDDING_MODEL_NAME)

    # Generate deterministic document IDs based on source file and chunk_id to avoid duplicates
    ids = [f"{chunk.metadata['source']}_chunk_{chunk.metadata['chunk_id']}" for chunk in chunks]

    logger.info(f"Storing vectors into ChromaDB at '{persist_directory}'...")
    
    # Store documents with explicit deterministic IDs to prevent duplication on re-runs
    vector_store = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        ids=ids,
        persist_directory=persist_directory
    )
    return vector_store


def main() -> None:
    """
    Main entry point for document ingestion pipeline.
    Executes loading, chunking, embedding generation, and Chroma DB persistence.
    """
    try:
        # Step 1: Load documents
        documents = load_documents(DOCS_DIRECTORY)
        num_docs = len(documents)

        if num_docs == 0:
            logger.warning(f"No markdown documents found in '{DOCS_DIRECTORY}'. Exiting.")
            return

        # Step 2: Chunk documents
        chunks = split_documents(documents)
        num_chunks = len(chunks)

        # Step 3: Embed & Store in ChromaDB with duplicate handling
        ingest_to_chroma(chunks, CHROMA_PERSIST_DIR)

        # Print clean milestone statistics summary
        print("\n" + "=" * 45)
        print("DOCUMENT INGESTION SUMMARY")
        print("=" * 45)
        print(f"Loaded {num_docs} documents")
        print(f"Created {num_chunks} chunks")
        print(f"Number of vectors stored: {num_chunks}")
        print("Stored into Chroma successfully")
        print("=" * 45 + "\n")

    except Exception as e:
        logger.error(f"Ingestion pipeline failed: {str(e)}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()

