#!/bin/bash
cd "$(dirname "$0")"
echo "Starting ForensIA 3D..."
/c/Users/explo/AppData/Local/Python/pythoncore-3.14-64/python.exe -m uvicorn api.main:app --host 127.0.0.1 --port 8001