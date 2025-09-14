from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import json
import os
import uvicorn
from pathlib import Path

# Import our app modules
from app.routers import agents, game
from app.config import settings

# Create FastAPI app
app = FastAPI(
    title="Agora Simulator API",
    description="A virtual agora where AI agents interact",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Templates
templates = Jinja2Templates(directory="templates")

# Include API routers
app.include_router(agents.router, prefix="/api/agents", tags=["agents"])
app.include_router(game.router, prefix="/api/game", tags=["game"])

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")
if os.path.exists("cache"):
    app.mount("/cache", StaticFiles(directory="cache"), name="cache")

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# Legacy endpoints for compatibility
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
    """Legacy endpoint - redirects to new game state"""
    from app.dependencies import get_game_service
    game_service = get_game_service()
    state = await game_service.get_game_state()
    return JSONResponse(content=state.model_dump())

@app.get("/api/overlays")
async def get_overlays():
    """Get list of available overlays"""
    overlays_file = "static/overlays.json"

    if os.path.exists(overlays_file):
        with open(overlays_file, 'r') as f:
            overlays = json.load(f)
        return JSONResponse(content={"overlays": overlays})
    else:
        # Check if default overlay exists
        default_overlay = "static/overlay.png"
        if os.path.exists(default_overlay):
            return JSONResponse(content={
                "overlays": [{
                    "theme": "Default",
                    "path": "/static/overlay.png",
                    "active": True
                }]
            })
        else:
            return JSONResponse(content={"overlays": []})

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "Agora Simulator"}

# Startup event
@app.on_event("startup")
async def startup_event():
    print(f"🚀 Agora Simulator starting on http://{settings.API_HOST}:{settings.API_PORT}")
    print(f"📁 Agents directory: {settings.AGENTS_DIR}")
    print(f"🤖 Mistral API configured: {'Yes' if settings.MISTRAL_API_KEY else 'No'}")

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    print("👋 Agora Simulator shutting down")

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=True
    )