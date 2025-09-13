from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
import json
import os

app = FastAPI()
templates = Jinja2Templates(directory="templates")

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/cache", StaticFiles(directory="cache"), name="cache")
app.mount("/template-images", StaticFiles(directory="template-images"), name="template-images")

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/characters")
async def get_characters():
    """Get list of available character IDs"""
    characters_file = "cache/characters.json"

    if os.path.exists(characters_file):
        with open(characters_file, 'r') as f:
            characters = json.load(f)
        return JSONResponse(content={"characters": characters})
    else:
        return JSONResponse(content={"characters": []})

@app.get("/state")
async def get_state():
    """Get the current state with character actions"""
    # For now, return the example state
    state_file = "state-example.json"

    if os.path.exists(state_file):
        with open(state_file, 'r') as f:
            state = json.load(f)
        return JSONResponse(content=state)
    else:
        # Return empty state if file doesn't exist
        return JSONResponse(content={"characters": {}})