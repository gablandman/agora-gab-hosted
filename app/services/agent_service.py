import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime
from app.models.agent import Agent, AgentCreate, AgentResponse
from app.models.action import Action
from app.services.storage_service import StorageService
from app.services.mistral_service import MistralService
from app.config import settings

class AgentService:
    def __init__(self, storage_service: StorageService, mistral_service: MistralService):
        self.storage = storage_service
        self.mistral = mistral_service

    async def create_agent(self, agent_data: AgentCreate) -> Agent:
        """Create a new agent"""
        # Check if we've reached the maximum number of agents
        existing_agents = await self.storage.list_agents()
        if len(existing_agents) >= settings.MAX_AGENTS:
            raise ValueError(f"Maximum number of agents ({settings.MAX_AGENTS}) reached")

        # Generate unique ID
        agent_id = f"agent-{uuid.uuid4().hex[:8]}"

        # Create agent in Mistral
        try:
            mistral_agent = await self.mistral.create_agent(
                name=agent_data.name,
                instructions=agent_data.instructions,
                model=agent_data.model,
                temperature=agent_data.temperature
            )
            mistral_id = mistral_agent['id']
        except Exception as e:
            raise ValueError(f"Failed to create Mistral agent: {str(e)}")

        # Create agent object (store original name without prefix locally)
        agent = Agent(
            id=agent_id,
            name=agent_data.name,  # Keep original name locally
            mistral_id=mistral_id,
            model=agent_data.model or settings.MISTRAL_MODEL,
            instructions=agent_data.instructions,
            temperature=agent_data.temperature or settings.MISTRAL_TEMPERATURE,
            created_at=datetime.now()
        )

        # Save to YAML
        await self.storage.save_agent(agent_id, agent.model_dump())

        return agent

    async def get_agent(self, agent_id: str) -> Optional[Agent]:
        """Get an agent by ID"""
        agent_data = await self.storage.load_agent(agent_id)
        if agent_data:
            return Agent(**agent_data)
        return None

    async def list_agents(self) -> List[Agent]:
        """List all agents"""
        agents_data = await self.storage.list_agents()
        return [Agent(**data) for data in agents_data]

    async def delete_agent(self, agent_id: str) -> bool:
        """Mark an agent for deletion - will leave on next turn then be deleted"""
        agent_data = await self.storage.load_agent(agent_id)
        if not agent_data:
            return False

        # Mark agent as pending deletion
        agent_data['pending_deletion'] = True
        agent_data['visible'] = True  # Ensure visible for leave action
        await self.storage.save_agent(agent_id, agent_data)
        return True

    async def permanently_delete_agent(self, agent_id: str) -> bool:
        """Permanently delete an agent (called after leave action)"""
        # Get agent data to get Mistral ID
        agent = await self.get_agent(agent_id)
        if not agent:
            return False

        # Delete from Mistral if we have the ID
        if agent.mistral_id:
            await self.mistral.delete_agent(agent.mistral_id)

        # Delete from storage
        return await self.storage.delete_agent(agent_id)

    async def update_agent_position(self, agent_id: str, x: int, y: int) -> bool:
        """Update agent position"""
        agent_data = await self.storage.load_agent(agent_id)
        if not agent_data:
            return False

        agent_data['position'] = {'x': x, 'y': y}
        await self.storage.save_agent(agent_id, agent_data)
        return True

    async def update_agent_visibility(self, agent_id: str, visible: bool) -> bool:
        """Update agent visibility"""
        agent_data = await self.storage.load_agent(agent_id)
        if not agent_data:
            return False

        agent_data['visible'] = visible
        await self.storage.save_agent(agent_id, agent_data)
        return True

    async def add_agent_action(self, agent_id: str, action: Action) -> bool:
        """Add an action to agent's history"""
        return await self.storage.update_agent_action(agent_id, action.model_dump())

    async def generate_agent_action(self, agent_id: str, context: Dict[str, Any]) -> Optional[Action]:
        """Generate an action for an agent"""
        agent_data = await self.storage.load_agent(agent_id)
        if not agent_data:
            return None

        action_data = await self.mistral.generate_action(agent_data, context)
        if action_data:
            action = Action(**action_data)
            # Add to history
            await self.add_agent_action(agent_id, action)
            return action

        return None