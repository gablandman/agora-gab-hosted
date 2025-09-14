from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime

class ActionType(str, Enum):
    SAY = "say"
    SPEAK_TO = "speak_to"
    MOVE = "move"
    ENTER = "enter"
    LEAVE = "leave"
    NOTHING = "nothing"

class Action(BaseModel):
    type: ActionType
    target: Optional[str] = None
    content: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)

class GameAction(BaseModel):
    """Action format for game state"""
    type: str
    target: Optional[str] = None
    content: Optional[str] = None