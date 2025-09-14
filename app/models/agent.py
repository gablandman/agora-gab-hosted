from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
from .action import Action

class Agent(BaseModel):
    id: str
    name: str
    mistral_id: Optional[str] = None
    model: str = "mistral-medium-latest"
    instructions: str
    visible: bool = False  # Start invisible, will enter on next turn
    temperature: float = 0.7
    created_at: datetime = Field(default_factory=datetime.now)
    action_history: List[Action] = []
    pending_deletion: bool = False  # Mark agent for deletion after leave action
    pending_entry: bool = True  # Mark agent to enter on next turn

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    instructions: str = Field(..., min_length=1, max_length=1000)
    model: Optional[str] = "mistral-medium-latest"
    temperature: Optional[float] = Field(default=0.7, ge=0.0, le=2.0)

class AgentResponse(BaseModel):
    id: str
    name: str
    mistral_id: Optional[str]
    model: str
    instructions: str
    visible: bool
    temperature: float
    created_at: str
    action_count: int