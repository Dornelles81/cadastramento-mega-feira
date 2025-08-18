@echo off
echo ===============================================
echo   OCR Service - Document Validation
echo ===============================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org/
    pause
    exit /b 1
)

REM Create virtual environment if it doesn't exist
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
    echo Virtual environment created.
    echo.
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install/Update dependencies
echo Installing dependencies...
pip install --upgrade pip >nul 2>&1
pip install -r requirements.txt

echo.
echo ===============================================
echo   Starting OCR Service on http://localhost:8000
echo ===============================================
echo.
echo API Documentation: http://localhost:8000/docs
echo.

REM Start the FastAPI server
uvicorn main:app --reload --host 0.0.0.0 --port 8000