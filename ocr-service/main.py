"""
OCR Service for Document Validation
Brazilian document processing with PaddleOCR
"""

import os
import re
import json
import base64
from io import BytesIO
from typing import Optional, Dict, Any, List
from datetime import datetime

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import numpy as np
from PIL import Image
from paddleocr import PaddleOCR
from validate_docbr import CPF, CNPJ, CNH
import cv2

# Initialize FastAPI
app = FastAPI(
    title="Document OCR Service",
    description="Brazilian document validation with OCR",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],  # Next.js dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize PaddleOCR (Portuguese language)
ocr = PaddleOCR(
    use_angle_cls=True,
    lang='pt',  # Portuguese
    use_gpu=False,  # Set to True if you have GPU
    show_log=False
)

# Document validators
cpf_validator = CPF()
cnpj_validator = CNPJ()
cnh_validator = CNH()


class DocumentData(BaseModel):
    """Document data model"""
    document_type: Optional[str] = None
    document_number: Optional[str] = None
    name: Optional[str] = None
    birth_date: Optional[str] = None
    rg_number: Optional[str] = None
    cpf_number: Optional[str] = None
    cnh_number: Optional[str] = None
    cnh_category: Optional[str] = None
    validity_date: Optional[str] = None
    issuing_body: Optional[str] = None
    raw_text: List[str] = []
    confidence: float = 0.0
    is_valid: bool = False
    validation_errors: List[str] = []


class ImageData(BaseModel):
    """Base64 image data model"""
    image: str  # Base64 encoded image
    document_type: Optional[str] = "auto"  # auto, cpf, rg, cnh


def preprocess_image(image: Image.Image) -> np.ndarray:
    """
    Preprocess image for better OCR results
    """
    # Convert PIL to OpenCV
    img_cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    
    # Convert to grayscale
    gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
    
    # Apply adaptive threshold
    thresh = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
        cv2.THRESH_BINARY, 11, 2
    )
    
    # Denoise
    denoised = cv2.fastNlMeansDenoising(thresh, None, 10, 7, 21)
    
    # Convert back to RGB for PaddleOCR
    result = cv2.cvtColor(denoised, cv2.COLOR_GRAY2RGB)
    
    return result


def extract_cpf(text: str) -> Optional[str]:
    """Extract CPF from text"""
    # Remove all non-digits
    text_clean = re.sub(r'\D', '', text)
    
    # Look for 11 consecutive digits
    cpf_pattern = r'\d{11}'
    matches = re.findall(cpf_pattern, text_clean)
    
    for match in matches:
        if cpf_validator.validate(match):
            # Format CPF: XXX.XXX.XXX-XX
            return f"{match[:3]}.{match[3:6]}.{match[6:9]}-{match[9:]}"
    
    # Try to find CPF with formatting
    cpf_formatted = r'\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\s]?\d{2}'
    matches = re.findall(cpf_formatted, text)
    
    for match in matches:
        clean = re.sub(r'\D', '', match)
        if len(clean) == 11 and cpf_validator.validate(clean):
            return f"{clean[:3]}.{clean[3:6]}.{clean[6:9]}-{clean[9:]}"
    
    return None


def extract_rg(text: str) -> Optional[str]:
    """Extract RG from text"""
    # RG patterns vary by state, but typically 7-10 digits
    rg_patterns = [
        r'RG[\s:]*(\d{1,2}[\.\s]?\d{3}[\.\s]?\d{3}[-\s]?\d{1,2})',
        r'REGISTRO GERAL[\s:]*(\d{7,10})',
        r'(\d{1,2}[\.\s]?\d{3}[\.\s]?\d{3}[-\s]?\d{1,2})',
    ]
    
    for pattern in rg_patterns:
        matches = re.findall(pattern, text.upper())
        if matches:
            # Clean and return the first match
            rg = re.sub(r'\D', '', matches[0])
            if 7 <= len(rg) <= 10:
                return rg
    
    return None


def extract_cnh(text: str) -> Optional[str]:
    """Extract CNH number from text"""
    # CNH is typically 11 digits
    cnh_patterns = [
        r'CNH[\s:]*(\d{11})',
        r'N[ºÚ°]?\s*REGISTRO[\s:]*(\d{11})',
        r'(\d{11})',  # Last resort: any 11 digits
    ]
    
    for pattern in cnh_patterns:
        matches = re.findall(pattern, text.upper())
        if matches:
            for match in matches:
                clean = re.sub(r'\D', '', match)
                if len(clean) == 11 and cnh_validator.validate(clean):
                    return clean
    
    return None


def extract_name(text_lines: List[str]) -> Optional[str]:
    """Extract name from document text"""
    name_keywords = ['NOME', 'NAME', 'FILIAÇÃO', 'FILIACAO']
    
    for i, line in enumerate(text_lines):
        line_upper = line.upper()
        for keyword in name_keywords:
            if keyword in line_upper:
                # Check current line after keyword
                parts = line_upper.split(keyword)
                if len(parts) > 1 and parts[1].strip():
                    name = parts[1].strip()
                    # Clean common suffixes
                    name = re.sub(r'(CPF|RG|DOC|DATA|NASC).*', '', name).strip()
                    if len(name) > 3:
                        return name.title()
                
                # Check next line
                if i + 1 < len(text_lines):
                    next_line = text_lines[i + 1].strip()
                    if len(next_line) > 3 and next_line.replace(' ', '').isalpha():
                        return next_line.title()
    
    # Try to find a line with only letters and spaces (likely a name)
    for line in text_lines:
        line_clean = line.strip()
        if len(line_clean) > 10 and re.match(r'^[A-Za-zÀ-ÿ\s]+$', line_clean):
            # Likely a name
            return line_clean.title()
    
    return None


def extract_date(text: str, keywords: List[str]) -> Optional[str]:
    """Extract date from text near keywords"""
    date_patterns = [
        r'\d{2}[/\-\.]\d{2}[/\-\.]\d{4}',  # DD/MM/YYYY
        r'\d{2}[/\-\.]\d{2}[/\-\.]\d{2}',   # DD/MM/YY
    ]
    
    for keyword in keywords:
        if keyword in text.upper():
            # Look for dates near the keyword
            for pattern in date_patterns:
                matches = re.findall(pattern, text)
                if matches:
                    return matches[0]
    
    return None


def detect_document_type(text: str) -> str:
    """Detect document type from OCR text"""
    text_upper = text.upper()
    
    if any(word in text_upper for word in ['CARTEIRA NACIONAL', 'HABILITAÇÃO', 'CNH', 'CONDUTOR']):
        return 'cnh'
    elif any(word in text_upper for word in ['REGISTRO GERAL', 'IDENTIDADE', 'RG', 'SSP']):
        return 'rg'
    elif 'CPF' in text_upper or 'CADASTRO DE PESSOA' in text_upper:
        return 'cpf'
    else:
        return 'unknown'


def process_ocr_results(result: List, image_shape: tuple) -> DocumentData:
    """Process OCR results and extract document data"""
    doc_data = DocumentData()
    
    # Extract all text lines
    text_lines = []
    total_confidence = 0
    conf_count = 0
    
    for line in result:
        for word_info in line:
            text = word_info[1][0]
            confidence = word_info[1][1]
            text_lines.append(text)
            total_confidence += confidence
            conf_count += 1
    
    doc_data.raw_text = text_lines
    doc_data.confidence = total_confidence / conf_count if conf_count > 0 else 0
    
    # Join all text for analysis
    full_text = ' '.join(text_lines)
    
    # Detect document type
    doc_data.document_type = detect_document_type(full_text)
    
    # Extract document numbers
    doc_data.cpf_number = extract_cpf(full_text)
    doc_data.rg_number = extract_rg(full_text)
    doc_data.cnh_number = extract_cnh(full_text)
    
    # Extract name
    doc_data.name = extract_name(text_lines)
    
    # Extract dates
    doc_data.birth_date = extract_date(full_text, ['NASCIMENTO', 'NASC', 'DATA DE NASCIMENTO'])
    doc_data.validity_date = extract_date(full_text, ['VALIDADE', 'VALID', 'VENCIMENTO'])
    
    # Validate documents
    validation_errors = []
    
    if doc_data.cpf_number:
        if not cpf_validator.validate(re.sub(r'\D', '', doc_data.cpf_number)):
            validation_errors.append("CPF inválido")
    
    if doc_data.cnh_number:
        if not cnh_validator.validate(doc_data.cnh_number):
            validation_errors.append("CNH inválida")
    
    doc_data.validation_errors = validation_errors
    doc_data.is_valid = len(validation_errors) == 0 and (
        doc_data.cpf_number is not None or 
        doc_data.rg_number is not None or 
        doc_data.cnh_number is not None
    )
    
    return doc_data


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "OCR Document Validation",
        "version": "1.0.0",
        "ocr_engine": "PaddleOCR",
        "supported_documents": ["CPF", "RG", "CNH"],
        "language": "Portuguese"
    }


@app.post("/ocr/extract")
async def extract_document(file: UploadFile = File(...)):
    """
    Extract text and validate document from uploaded image
    """
    try:
        # Read image file
        contents = await file.read()
        image = Image.open(BytesIO(contents))
        
        # Convert to RGB if necessary
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Preprocess image
        processed_img = preprocess_image(image)
        
        # Run OCR
        result = ocr.ocr(processed_img, cls=True)
        
        if not result or not result[0]:
            raise HTTPException(status_code=400, detail="No text found in image")
        
        # Process results
        doc_data = process_ocr_results(result[0], image.size)
        
        return doc_data
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ocr/extract-base64")
async def extract_document_base64(data: ImageData):
    """
    Extract text and validate document from base64 image
    """
    try:
        # Decode base64 image
        image_data = data.image
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        image = Image.open(BytesIO(image_bytes))
        
        # Convert to RGB if necessary
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Preprocess image
        processed_img = preprocess_image(image)
        
        # Run OCR
        result = ocr.ocr(processed_img, cls=True)
        
        if not result or not result[0]:
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "No text found in image",
                    "data": DocumentData().dict()
                }
            )
        
        # Process results
        doc_data = process_ocr_results(result[0], image.size)
        
        # Override document type if specified
        if data.document_type != "auto":
            doc_data.document_type = data.document_type
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "data": doc_data.dict()
            }
        )
        
    except Exception as e:
        return JSONResponse(
            status_code=200,
            content={
                "success": False,
                "error": str(e),
                "data": DocumentData().dict()
            }
        )


@app.post("/validate/cpf")
async def validate_cpf(cpf: str):
    """Validate CPF number"""
    cpf_clean = re.sub(r'\D', '', cpf)
    is_valid = cpf_validator.validate(cpf_clean)
    
    return {
        "cpf": cpf,
        "cpf_clean": cpf_clean,
        "is_valid": is_valid,
        "formatted": f"{cpf_clean[:3]}.{cpf_clean[3:6]}.{cpf_clean[6:9]}-{cpf_clean[9:]}" if is_valid else None
    }


@app.post("/validate/cnpj")
async def validate_cnpj(cnpj: str):
    """Validate CNPJ number"""
    cnpj_clean = re.sub(r'\D', '', cnpj)
    is_valid = cnpj_validator.validate(cnpj_clean)
    
    return {
        "cnpj": cnpj,
        "cnpj_clean": cnpj_clean,
        "is_valid": is_valid,
        "formatted": f"{cnpj_clean[:2]}.{cnpj_clean[2:5]}.{cnpj_clean[5:8]}/{cnpj_clean[8:12]}-{cnpj_clean[12:]}" if is_valid else None
    }


@app.post("/validate/cnh")
async def validate_cnh_number(cnh: str):
    """Validate CNH number"""
    cnh_clean = re.sub(r'\D', '', cnh)
    is_valid = cnh_validator.validate(cnh_clean)
    
    return {
        "cnh": cnh,
        "cnh_clean": cnh_clean,
        "is_valid": is_valid
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)