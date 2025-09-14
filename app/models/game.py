from typing import Dict, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
from .action import GameAction

class Character(BaseModel):
    name: str
    action: Optional[GameAction] = None

class GameState(BaseModel):
    turn: int = 0
    characters: Dict[str, Character]
    map: Optional[Dict[str, str]] = None

class TurnContext(BaseModel):
    """Context from the previous turn for agents to reference"""
    speakers: List[Dict[str, str]] = []  # [{"name": "Alice", "message": "Hello"}]
    private_messages: List[Dict[str, str]] = []  # [{"from": "Bob", "to": "Alice", "message": "Hi"}]
    movements: List[Dict[str, str]] = []  # [{"name": "Charlie", "action": "moved"}]
    arrivals: List[str] = []  # Names of agents who entered
    departures: List[Dict[str, str]] = []  # [{"name": "Diana", "message": "Goodbye"}]
    timestamp: datetime = Field(default_factory=datetime.now)

class MapInfo(BaseModel):
    id: str
    description: str