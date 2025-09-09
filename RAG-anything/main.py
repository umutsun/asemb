
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from raganything import RAGAnything

app = FastAPI(
    title="RAG-anything Service",
    description="A microservice to process documents using RAG-anything.",
    version="1.0.0"
)

# Initialize RAGAnything
# Note: You might need to configure API keys or other settings via environment variables
rag_anything_processor = RAGAnything()

class ProcessRequest(BaseModel):
    file_path: str
    question: str

@app.post("/process")
async def process_document(request: ProcessRequest):
    """
    Processes a document with a question using RAG-anything.
    Note: This is a simplified example. RAGAnything might work with file paths
    accessible from within the container.
    """
    try:
        # This is a placeholder for the actual logic.
        # The RAGAnything class might have a different method to call.
        # We are assuming a method like `query` exists.
        if not os.path.exists(request.file_path):
            raise HTTPException(status_code=404, detail=f"File not found: {request.file_path}")

        answer = rag_anything_processor.query(request.file_path, request.question)
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def read_root():
    return {"message": "RAG-anything Service is running. Use the /process endpoint."}

# To run this server:
# uvicorn main:app --reload --host 0.0.0.0 --port 8002
