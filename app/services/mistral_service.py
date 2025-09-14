import os
from typing import Dict, Any, Optional, List
from mistralai import Mistral
import json
from app.config import settings
from app.models.action import ActionType

class MistralService:
    def __init__(self):
        self.api_key = settings.MISTRAL_API_KEY
        if not self.api_key:
            raise ValueError("MISTRAL_API_KEY is required")
        self.client = Mistral(api_key=self.api_key)

    async def create_agent(self, name: str, instructions: str, model: str = None, temperature: float = None) -> Dict[str, Any]:
        """Create a new Mistral agent"""
        try:
            # Prefix name with "agora" for shared space
            prefixed_name = f"agora-{name}" if not name.startswith("agora-") else name

            # Use beta.agents API for Mistral SDK
            agent = self.client.beta.agents.create(
                model=model or settings.MISTRAL_MODEL,
                name=prefixed_name,
                description=f"Agent: {name}",  # Add description field
                instructions=instructions,
                completion_args={
                    "temperature": temperature or settings.MISTRAL_TEMPERATURE
                }
            )

            return {
                "id": agent.id,
                "name": agent.name,
                "model": agent.model,
                "instructions": agent.instructions
            }
        except Exception as e:
            raise Exception(f"Failed to create Mistral agent: {str(e)}")

    async def list_agents(self) -> List[Dict[str, Any]]:
        """List all Mistral agents with 'agora' prefix"""
        try:
            # Use beta.agents API to list agents
            agents_response = self.client.beta.agents.list()
            agents_list = agents_response.data if hasattr(agents_response, 'data') else []

            # Filter only agents with "agora" prefix
            agora_agents = []
            for agent in agents_list:
                if agent.name and agent.name.startswith("agora-"):
                    agora_agents.append({
                        "id": agent.id,
                        "name": agent.name,
                        "model": getattr(agent, 'model', 'unknown'),
                        "description": getattr(agent, 'description', ''),
                        "instructions": getattr(agent, 'instructions', ''),
                        "created_at": str(getattr(agent, 'created_at', ''))
                    })

            return agora_agents
        except Exception as e:
            print(f"Warning: Failed to list Mistral agents: {str(e)}")
            return []

    async def delete_agent(self, mistral_id: str) -> bool:
        """Delete a Mistral agent"""
        try:
            # Use beta.agents API for deletion
            self.client.beta.agents.delete(mistral_id)
            return True
        except Exception as e:
            print(f"Warning: Failed to delete Mistral agent {mistral_id}: {str(e)}")
            return False

    async def generate_action(self, agent_data: Dict[str, Any], context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Generate an action for an agent based on context"""
        try:
            # Build the prompt
            prompt = self._build_action_prompt(agent_data, context)

            # Create chat completion
            response = self.client.chat.complete(
                model=agent_data.get('model', settings.MISTRAL_MODEL),
                messages=[
                    {
                        "role": "system",
                        "content": agent_data['instructions']
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=agent_data.get('temperature', settings.MISTRAL_TEMPERATURE),
                max_tokens=150
            )

            if not response.choices:
                return None

            content = response.choices[0].message.content.strip()

            # Try to parse JSON response
            try:
                # Extract JSON from the response
                start = content.find('{')
                end = content.rfind('}') + 1
                if start != -1 and end > 0:
                    json_str = content[start:end]
                    action_data = json.loads(json_str)

                    # Validate action type
                    if action_data.get('type') in [a.value for a in ActionType]:
                        return {
                            'type': action_data.get('type'),
                            'target': action_data.get('target'),
                            'content': action_data.get('content')
                        }
            except json.JSONDecodeError:
                pass

            # Fallback to a default action
            return {
                'type': ActionType.NOTHING.value,
                'target': None,
                'content': None
            }

        except Exception as e:
            print(f"Error generating action: {str(e)}")
            return None

    def _build_action_prompt(self, agent_data: Dict[str, Any], context: Dict[str, Any]) -> str:
        """Build the prompt for action generation"""
        from app.prompts.action_prompts import ACTION_PROMPT

        # Gather recent context
        recent_events = []

        if context.get('speakers'):
            for speaker in context['speakers'][-5:]:  # Last 5 speakers
                recent_events.append(f"- {speaker['name']} said: \"{speaker['message']}\"")

        if context.get('private_messages'):
            for msg in context['private_messages'][-3:]:  # Last 3 private messages
                if msg['to'] == agent_data['name']:
                    recent_events.append(f"- {msg['from']} said to you: \"{msg['message']}\"")

        if context.get('arrivals'):
            for name in context['arrivals']:
                recent_events.append(f"- {name} entered the room")

        if context.get('departures'):
            for dep in context['departures']:
                msg = f"- {dep['name']} left"
                if dep.get('message'):
                    msg += f" saying: \"{dep['message']}\""
                recent_events.append(msg)

        recent_context = "\n".join(recent_events) if recent_events else "Nothing notable happened recently."

        return ACTION_PROMPT.format(
            agent_name=agent_data['name'],
            map_description=context.get('map_description', 'A virtual agora where people gather'),
            agent_instructions=agent_data['instructions'],
            recent_context=recent_context
        )