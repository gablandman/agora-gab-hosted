import uuid
import sys
import os
from typing import List, Optional, Dict, Any
from datetime import datetime
from app.models.agent import Agent, AgentCreate, AgentResponse
from app.models.action import Action
from app.services.storage_service import StorageService
from app.services.mistral_service import MistralService
from app.config import settings

# Add parent directory to path to import gemini_generate
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from gemini_generate import generate_character

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

        # Generate character sprites based on agent description
        character_id = None
        try:
            # Create a character description from name and instructions
            # We'll use the instructions as they contain the personality/appearance details
            character_description = f"{agent_data.name}: {agent_data.instructions}"

            # Run character generation in a separate thread to avoid event loop issues
            import concurrent.futures
            import asyncio

            def run_generation():
                return generate_character(
                    description=character_description,
                    character_id=agent_id  # Use same ID for easy matching
                )

            # Execute in thread pool to avoid event loop conflicts
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(run_generation)
                character_result = future.result(timeout=60)  # 60 second timeout

            if character_result:
                character_id = character_result.get('character_id', agent_id)
                print(f"✓ Generated character sprites for agent {agent_data.name} with ID: {character_id}")
        except Exception as e:
            print(f"Warning: Failed to generate character sprites: {str(e)}")
            # Continue without sprites - not critical for agent creation

        # Create agent object (store original name without prefix locally)
        agent = Agent(
            id=agent_id,
            name=agent_data.name,  # Keep original name locally
            mistral_id=mistral_id,
            model=agent_data.model or settings.MISTRAL_MODEL,
            instructions=agent_data.instructions,
            character_id=character_id,  # Store the character sprite ID
            temperature=agent_data.temperature or settings.MISTRAL_TEMPERATURE,
            created_at=datetime.now(),
            visible=False,  # Start invisible
            pending_entry=True  # Will enter on next turn
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

    async def clear_all_agents(self) -> int:
        """Delete all agents and return count of deleted agents"""
        agents = await self.list_agents()
        deleted_count = 0

        for agent in agents:
            try:
                # Delete from Mistral if we have the ID
                if agent.mistral_id:
                    await self.mistral.delete_agent(agent.mistral_id)

                # Delete from storage
                if await self.storage.delete_agent(agent.id):
                    deleted_count += 1
                    print(f"Deleted agent: {agent.name} ({agent.id})")
            except Exception as e:
                print(f"Error deleting agent {agent.id}: {e}")

        return deleted_count