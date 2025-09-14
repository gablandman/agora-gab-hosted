from fastapi import APIRouter, Depends, HTTPException
from app.models.game import GameState, TurnContext, MapInfo
from app.services.game_service import GameService
from app.dependencies import get_game_service

router = APIRouter()

@router.get("/state", response_model=GameState)
async def get_game_state(
    game_service: GameService = Depends(get_game_service)
):
    """Get current game state"""
    return await game_service.get_game_state()

@router.post("/turn", response_model=TurnContext)
async def execute_turn(
    game_service: GameService = Depends(get_game_service)
):
    """Execute one game turn"""
    print("[API] Manual turn execution requested")
    result = await game_service.execute_turn()
    print(f"[API] Turn execution completed")
    return result

@router.post("/start")
async def start_game(
    game_service: GameService = Depends(get_game_service)
):
    """Start automatic turn execution"""
    print("[API] Starting automatic turn execution")
    await game_service.start_turn_loop()
    return {"message": "Game started", "turn_interval": 10}

@router.post("/stop")
async def stop_game(
    game_service: GameService = Depends(get_game_service)
):
    """Stop automatic turn execution"""
    await game_service.stop_turn_loop()
    return {"message": "Game stopped"}

@router.get("/map")
async def get_map(
    game_service: GameService = Depends(get_game_service)
):
    """Get current map information"""
    return {
        "id": game_service.current_map.id,
        "description": game_service.current_map.description
    }

@router.post("/map")
async def change_map(
    map_info: MapInfo,
    game_service: GameService = Depends(get_game_service)
):
    """Change the current map"""
    game_service.change_map(map_info.id, map_info.description)
    return {"message": "Map changed successfully", "map": map_info.model_dump()}