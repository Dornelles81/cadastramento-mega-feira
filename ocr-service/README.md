# 📄 Serviço OCR para Validação de Documentos

Sistema de OCR (Optical Character Recognition) para validação automática de documentos brasileiros usando PaddleOCR.

## 🚀 Instalação Rápida

### Windows
```bash
# Executar o script de instalação
start_ocr.bat
```

### Linux/Mac
```bash
# Tornar o script executável
chmod +x start_ocr.sh

# Executar
./start_ocr.sh
```

## 📋 Funcionalidades

- ✅ **Extração automática de dados** de RG, CPF e CNH
- ✅ **Validação de documentos** brasileiros
- ✅ **Detecção automática** do tipo de documento
- ✅ **API REST** para integração fácil
- ✅ **Suporte a upload** de arquivos e base64
- ✅ **Pré-processamento** de imagem para melhor precisão

## 🔧 Requisitos

- Python 3.8 ou superior
- 2GB de RAM disponível
- 500MB de espaço em disco

## 📡 Endpoints da API

### Health Check
```
GET http://localhost:8000/
```

### Extrair dados de documento (arquivo)
```
POST http://localhost:8000/ocr/extract
Content-Type: multipart/form-data
Body: file (image)
```

### Extrair dados de documento (base64)
```
POST http://localhost:8000/ocr/extract-base64
Content-Type: application/json
Body: {
  "image": "base64_string",
  "document_type": "auto" // ou "cpf", "rg", "cnh"
}
```

### Validar CPF
```
POST http://localhost:8000/validate/cpf
Body: "12345678900"
```

### Validar CNPJ
```
POST http://localhost:8000/validate/cnpj
Body: "12345678000100"
```

### Validar CNH
```
POST http://localhost:8000/validate/cnh
Body: "12345678900"
```

## 📚 Documentação Interativa

Após iniciar o serviço, acesse:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 🎯 Exemplo de Resposta

```json
{
  "success": true,
  "data": {
    "document_type": "cpf",
    "name": "João da Silva",
    "cpf_number": "123.456.789-00",
    "rg_number": null,
    "cnh_number": null,
    "birth_date": "01/01/1990",
    "confidence": 0.95,
    "is_valid": true,
    "validation_errors": [],
    "raw_text": ["NOME", "JOÃO DA SILVA", "CPF", "123.456.789-00"]
  }
}
```

## 🔍 Dicas para Melhor Precisão

1. **Iluminação**: Use boa iluminação, evite sombras
2. **Foco**: Certifique-se que o documento está em foco
3. **Ângulo**: Capture o documento de frente, sem inclinação
4. **Resolução**: Use pelo menos 640x480 pixels
5. **Contraste**: Fundo contrastante ajuda na detecção

## 🐛 Solução de Problemas

### Erro: "Python não encontrado"
- Instale Python 3.8+ de https://www.python.org/

### Erro: "PaddlePaddle installation failed"
- Tente instalar manualmente:
```bash
pip install paddlepaddle -i https://mirror.baidu.com/pypi/simple
```

### OCR não detecta texto
- Verifique a qualidade da imagem
- Tente pré-processar a imagem (aumentar contraste)
- Use formato JPEG ou PNG

## 📞 Suporte

Para problemas ou sugestões, abra uma issue no repositório do projeto.