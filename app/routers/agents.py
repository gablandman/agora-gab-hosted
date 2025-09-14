from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.models.agent import Agent, AgentCreate, AgentResponse
from app.services.agent_service import AgentService
from app.dependencies import get_agent_service

router = APIRouter()

@router.post("/", response_model=AgentResponse)
async def create_agent(
    agent_data: AgentCreate,
    agent_service: AgentService = Depends(get_agent_service)
):
    """Create a new agent"""
    try:
        agent = await agent_service.create_agent(agent_data)
        return AgentResponse(
            id=agent.id,
            name=agent.name,
            mistral_id=agent.mistral_id,
            model=agent.model,
            instructions=agent.instructions,
            character_id=agent.character_id,
            visible=agent.visible,
            temperature=agent.temperature,
            created_at=agent.created_at.isoformat(),
            action_count=len(agent.action_history)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/", response_model=List[AgentResponse])
async def list_agents(
    agent_service: AgentService = Depends(get_agent_service)
):
    """List all agents"""
    agents = await agent_service.list_agents()
    return [
        AgentResponse(
            id=agent.id,
            name=agent.name,
            mistral_id=agent.mistral_id,
            model=agent.model,
            instructions=agent.instructions,
            character_id=agent.character_id,
            visible=agent.visible,
            temperature=agent.temperature,
            created_at=agent.created_at.isoformat(),
            action_count=len(agent.action_history)
        )
        for agent in agents
    ]

@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: str,
    agent_service: AgentService = Depends(get_agent_service)
):
    """Get a specific agent"""
    agent = await agent_service.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    return AgentResponse(
        id=agent.id,
        name=agent.name,
        mistral_id=agent.mistral_id,
        model=agent.model,
        instructions=agent.instructions,
        character_id=agent.character_id,
        visible=agent.visible,
        temperature=agent.temperature,
        created_at=agent.created_at.isoformat(),
        action_count=len(agent.action_history)
    )

@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: str,
    agent_service: AgentService = Depends(get_agent_service)
):
    """Delete an agent"""
    success = await agent_service.delete_agent(agent_id)
    if not success:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"message": f"Agent {agent_id} deleted successfully"}