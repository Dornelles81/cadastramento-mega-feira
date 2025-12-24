"""
Servidor OCR Simplificado para Testes
Retorna dados simulados sem processar imagens reais
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import re

app = FastAPI(
    title="Simple OCR Service (Mock)",
    description="Simulated OCR for testing",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ImageData(BaseModel):
    image: str  # Base64 encoded image
    document_type: Optional[str] = "auto"

@app.get("/")
async def root():
    return {
        "service": "Simple OCR Service (Mock)",
        "status": "running",
        "message": "Este é um servidor de teste que simula OCR. Retorna dados fictícios para desenvolvimento."
    }

@app.post("/ocr/extract-base64")
async def extract_ocr(data: ImageData):
    """
    Simula extração de OCR
    Retorna dados fictícios baseados no tipo de documento
    """

    doc_type = data.document_type.upper() if data.document_type else "AUTO"

    # Dados simulados baseados no tipo de documento
    mock_data = {
        "CNH": {
            "name": "João Silva Santos",
            "cpf_number": "123.456.789-00",
            "cnh_number": "12345678900",
            "birth_date": "01/01/1990",
            "rg_number": "12.345.678-9",
            "cnh_category": "AB",
            "validity_date": "01/01/2030",
            "issuing_body": "DETRAN/SP",
            "is_valid": True,
            "confidence": 0.95,
            "validation_errors": []
        },
        "RG": {
            "name": "Maria Oliveira Costa",
            "cpf_number": "987.654.321-00",
            "rg_number": "98.765.432-1",
            "birth_date": "15/05/1985",
            "issuing_body": "SSP/RJ",
            "is_valid": True,
            "confidence": 0.92,
            "validation_errors": []
        },
        "CPF": {
            "name": "Pedro Santos Lima",
            "cpf_number": "111.222.333-44",
            "birth_date": "20/10/1995",
            "is_valid": True,
            "confidence": 0.90,
            "validation_errors": []
        }
    }

    # Retorna dados simulados do tipo de documento
    result_data = mock_data.get(doc_type, mock_data["CNH"])

    print(f"📸 OCR Mock - Documento: {doc_type}")
    print(f"✅ Dados retornados: {result_data['name']}")

    return {
        "success": True,
        "data": result_data,
        "message": f"Dados simulados para {doc_type} (servidor de teste)",
        "mock": True
    }

if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*50)
    print("  Servidor OCR Simplificado (MOCK)")
    print("="*50)
    print("\n[AVISO] Este e um servidor de TESTE que retorna dados ficticios")
    print("[OK] Para desenvolvimento, use este servidor")
    print("[INFO] Para producao, instale o servidor OCR completo\n")
    print("[WEB] API rodando em: http://localhost:8000")
    print("[DOCS] Documentacao: http://localhost:8000/docs\n")

    uvicorn.run(app, host="0.0.0.0", port=8000)
