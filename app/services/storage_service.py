import yaml
import aiofiles
from pathlib import Path
from typing import List, Optional, Dict, Any
import asyncio
from datetime import datetime

class StorageService:
    def __init__(self, agents_dir: Path):
        self.agents_dir = agents_dir
        self.agents_dir.mkdir(exist_ok=True)
        self._lock = asyncio.Lock()

    async def save_agent(self, agent_id: str, data: Dict[str, Any]) -> None:
        """Save agent data to YAML file"""
        async with self._lock:
            file_path = self.agents_dir / f"{agent_id}.yml"

            # Convert datetime objects to ISO format strings
            if 'created_at' in data and hasattr(data['created_at'], 'isoformat'):
                data['created_at'] = data['created_at'].isoformat()

            if 'action_history' in data:
                for action in data['action_history']:
                    if 'timestamp' in action and hasattr(action['timestamp'], 'isoformat'):
                        action['timestamp'] = action['timestamp'].isoformat()
                    # Convert enum to string value
                    if 'type' in action and hasattr(action['type'], 'value'):
                        action['type'] = action['type'].value

            yaml_content = yaml.dump(data, default_flow_style=False, sort_keys=False)
            async with aiofiles.open(file_path, 'w') as f:
                await f.write(yaml_content)

    async def load_agent(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Load agent data from YAML file"""
        file_path = self.agents_dir / f"{agent_id}.yml"
        if not file_path.exists():
            return None

        async with aiofiles.open(file_path, 'r') as f:
            content = await f.read()
            data = yaml.safe_load(content)

            # Convert ISO strings back to datetime objects if needed
            if 'created_at' in data and isinstance(data['created_at'], str):
                try:
                    data['created_at'] = datetime.fromisoformat(data['created_at'])
                except:
                    pass

            if 'action_history' in data:
                for action in data['action_history']:
                    if 'timestamp' in action and isinstance(action['timestamp'], str):
                        try:
                            action['timestamp'] = datetime.fromisoformat(action['timestamp'])
                        except:
                            pass

            return data

    async def list_agents(self) -> List[Dict[str, Any]]:
        """List all agents from YAML files"""
        agents = []
        for file_path in self.agents_dir.glob("agent-*.yml"):
            agent_data = await self.load_agent(file_path.stem)
            if agent_data:
                agents.append(agent_data)
        return agents

    async def delete_agent(self, agent_id: str) -> bool:
        """Delete agent YAML file"""
        file_path = self.agents_dir / f"{agent_id}.yml"
        if file_path.exists():
            file_path.unlink()
            return True
        return False

    async def agent_exists(self, agent_id: str) -> bool:
        """Check if agent exists"""
        file_path = self.agents_dir / f"{agent_id}.yml"
        return file_path.exists()

    async def update_agent_action(self, agent_id: str, action: Dict[str, Any]) -> bool:
        """Add action to agent's history"""
        agent_data = await self.load_agent(agent_id)
        if not agent_data:
            return False

        if 'action_history' not in agent_data:
            agent_data['action_history'] = []

        # Add timestamp if not present
        if 'timestamp' not in action:
            action['timestamp'] = datetime.now()

        # Convert enum to string value if needed
        if 'type' in action and hasattr(action['type'], 'value'):
            action['type'] = action['type'].value

        agent_data['action_history'].insert(0, action)

        # Keep only last MAX_ACTION_HISTORY actions
        from app.config import settings
        if len(agent_data['action_history']) > settings.MAX_ACTION_HISTORY:
            agent_data['action_history'] = agent_data['action_history'][:settings.MAX_ACTION_HISTORY]

        await self.save_agent(agent_id, agent_data)
        return True