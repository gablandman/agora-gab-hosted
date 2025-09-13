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