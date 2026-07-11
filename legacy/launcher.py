#!/usr/bin/env python
import sys
import os
import threading
import time
import webbrowser
from pathlib import Path

# Ensure we are in the application directory
APP_DIR = Path(__file__).parent
os.chdir(APP_DIR)

def start_server():
    # Import uvicorn and run the FastAPI app
    import uvicorn
    uvicorn.run("api.main:app", host="127.0.0.1", port=8001, log_level="info")

def open_browser():
    # Wait a bit for server to start, then open browser
    time.sleep(2.5)
    webbrowser.open("http://127.0.0.1:8001")

if __name__ == "__main__":
    # Start browser opening in a thread
    threading.Thread(target=open_browser, daemon=True).start()
    # Start the server (this blocks)
    start_server()