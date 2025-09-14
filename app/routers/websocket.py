from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import Set
import asyncio
import json
from app.services.game_service import GameService
from app.dependencies import get_game_service

router = APIRouter()

# Store active WebSocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.broadcast_task = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast_state(self, state: dict):
        """Broadcast state to all connected clients"""
        if self.active_connections:
            print(f"[WebSocket] Broadcasting state to {len(self.active_connections)} clients (Turn: {state.get('turn', 'unknown')})")

        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_json(state)
            except Exception as e:
                print(f"[WebSocket] Failed to send to client: {e}")
                disconnected.add(connection)

        # Remove disconnected clients
        for conn in disconnected:
            self.active_connections.discard(conn)
            print(f"[WebSocket] Removed disconnected client (remaining: {len(self.active_connections)})")

manager = ConnectionManager()

@router.websocket("/ws/state")
async def websocket_endpoint(
    websocket: WebSocket,
    game_service: GameService = Depends(get_game_service)
):
    """WebSocket endpoint for real-time game state updates"""
    print(f"[WebSocket] New client connecting...")
    await manager.connect(websocket)
    print(f"[WebSocket] Client connected (total: {len(manager.active_connections)})")

    try:
        # Send initial state
        state = await game_service.get_game_state()
        print(f"[WebSocket] Sending initial state to new client (Turn: {state.turn})")
        await websocket.send_json(state.model_dump())

        # Keep connection alive but don't send periodic updates
        # Updates will be sent via notify_state_change when turns complete
        while True:
            # Just keep the connection alive with a ping
            await asyncio.sleep(30)
            try:
                await websocket.send_json({"type": "ping"})
            except:
                break

    except WebSocketDisconnect:
        print(f"[WebSocket] Client disconnected")
        manager.disconnect(websocket)
        print(f"[WebSocket] Remaining clients: {len(manager.active_connections)}")
    except Exception as e:
        print(f"[WebSocket] Error: {e}")
        manager.disconnect(websocket)

async def notify_state_change(game_service: GameService):
    """Notify all connected clients of state change"""
    state = await game_service.get_game_state()
    await manager.broadcast_state(state.model_dump())