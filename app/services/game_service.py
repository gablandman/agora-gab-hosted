import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime
from app.models.game import GameState, Character, TurnContext, MapInfo
from app.models.action import Action, ActionType, GameAction
from app.services.agent_service import AgentService
from app.config import settings

class GameService:
    def __init__(self, agent_service: AgentService):
        self.agent_service = agent_service
        self.current_map = MapInfo(
            id="map-plaza001",
            description="The bustling central plaza where citizens gather to discuss and debate"
        )
        self.last_context = TurnContext()
        self.turn_running = False
        self.turn_task = None

    async def get_game_state(self) -> GameState:
        """Get current game state with all agents as characters"""
        agents = await self.agent_service.list_agents()
        characters = {}

        for agent in agents:
            if agent.visible:
                # Get the most recent action
                recent_action = None
                if agent.action_history:
                    last_action = agent.action_history[0]
                    recent_action = GameAction(
                        type=last_action.type,
                        target=last_action.target,
                        content=last_action.content
                    )

                characters[agent.id] = Character(
                    name=agent.name,
                    action=recent_action
                )

        return GameState(
            characters=characters,
            map={"id": self.current_map.id, "description": self.current_map.description}
        )

    async def execute_turn(self) -> TurnContext:
        """Execute one game turn where all agents decide their actions"""
        agents = await self.agent_service.list_agents()

        # Build context from last turn
        context = {
            'map_description': self.current_map.description,
            'speakers': self.last_context.speakers,
            'private_messages': self.last_context.private_messages,
            'arrivals': self.last_context.arrivals,
            'departures': self.last_context.departures
        }

        # Clear context for new turn
        new_context = TurnContext()

        # Handle agents pending deletion first - they should leave
        agents_to_delete = []
        for agent in agents:
            if getattr(agent, 'pending_deletion', False) and agent.visible:
                # Force a leave action for agents pending deletion
                leave_action = Action(
                    type=ActionType.LEAVE,
                    content=f"Goodbye everyone, it's time for me to go!"
                )
                await self._process_action(agent, leave_action, new_context)
                await self.agent_service.add_agent_action(agent.id, leave_action)
                agents_to_delete.append(agent.id)

        # Generate actions for all other visible agents in parallel
        tasks = []
        for agent in agents:
            if agent.visible and not getattr(agent, 'pending_deletion', False):
                tasks.append(self._generate_agent_action(agent.id, context))

        # Wait for all actions
        actions = await asyncio.gather(*tasks) if tasks else []

        # Process actions and build new context
        visible_agents = [a for a in agents if a.visible and not getattr(a, 'pending_deletion', False)]
        for agent, action in zip(visible_agents, actions):
            if action:
                await self._process_action(agent, action, new_context)

        # Permanently delete agents that have left
        for agent_id in agents_to_delete:
            await self.agent_service.permanently_delete_agent(agent_id)

        # Update last context
        self.last_context = new_context
        return new_context

    async def _generate_agent_action(self, agent_id: str, context: Dict[str, Any]) -> Optional[Action]:
        """Generate action for a single agent"""
        try:
            return await self.agent_service.generate_agent_action(agent_id, context)
        except Exception as e:
            print(f"Error generating action for agent {agent_id}: {str(e)}")
            return None

    async def _process_action(self, agent: Any, action: Action, context: TurnContext):
        """Process an action and update context"""
        if action.type == ActionType.SAY:
            context.speakers.append({
                'name': agent.name,
                'message': action.content or "..."
            })

        elif action.type == ActionType.SPEAK_TO:
            context.private_messages.append({
                'from': agent.name,
                'to': action.target or "someone",
                'message': action.content or "..."
            })

        elif action.type == ActionType.MOVE:
            context.movements.append({
                'name': agent.name,
                'action': 'moved to a new position'
            })
            # Update agent position randomly (for now)
            import random
            new_x = random.randint(0, 9)
            new_y = random.randint(0, 9)
            await self.agent_service.update_agent_position(agent.id, new_x, new_y)

        elif action.type == ActionType.ENTER:
            context.arrivals.append(agent.name)
            if action.content:
                context.speakers.append({
                    'name': agent.name,
                    'message': action.content
                })
            # Make agent visible
            await self.agent_service.update_agent_visibility(agent.id, True)

        elif action.type == ActionType.LEAVE:
            context.departures.append({
                'name': agent.name,
                'message': action.content
            })
            # Make agent invisible
            await self.agent_service.update_agent_visibility(agent.id, False)

    async def start_turn_loop(self):
        """Start automatic turn execution"""
        if not self.turn_running:
            self.turn_running = True
            self.turn_task = asyncio.create_task(self._turn_loop())

    async def stop_turn_loop(self):
        """Stop automatic turn execution"""
        self.turn_running = False
        if self.turn_task:
            self.turn_task.cancel()
            try:
                await self.turn_task
            except asyncio.CancelledError:
                pass

    async def _turn_loop(self):
        """Background task for automatic turns"""
        while self.turn_running:
            try:
                await self.execute_turn()
                await asyncio.sleep(settings.GAME_TURN_INTERVAL)
            except Exception as e:
                print(f"Error in turn loop: {str(e)}")
                await asyncio.sleep(settings.GAME_TURN_INTERVAL)

    def change_map(self, map_id: str, description: str):
        """Change the current map"""
        self.current_map = MapInfo(id=map_id, description=description)
        # Clear context when map changes
        self.last_context = TurnContext()