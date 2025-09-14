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
        self.turn_number = 0
        self.current_turn_actions = {}  # Store actions for current turn only

    async def get_game_state(self) -> GameState:
        """Get current game state with all agents as characters"""
        agents = await self.agent_service.list_agents()
        characters = {}

        for agent in agents:
            if agent.visible:
                # Only show actions from the current turn
                recent_action = self.current_turn_actions.get(agent.id)

                characters[agent.id] = Character(
                    name=agent.name,
                    action=recent_action
                )

        return GameState(
            turn=self.turn_number,
            characters=characters,
            map={"id": self.current_map.id, "description": self.current_map.description}
        )

    async def execute_turn(self) -> TurnContext:
        """Execute one game turn where all agents decide their actions"""
        # Clear previous turn's actions
        self.current_turn_actions.clear()

        # Increment turn number
        self.turn_number += 1
        print(f"\n=== EXECUTING TURN {self.turn_number} ===")

        agents = await self.agent_service.list_agents()
        print(f"Found {len(agents)} total agents")

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

        # Handle agents pending entry first - they should enter
        for agent in agents:
            if getattr(agent, 'pending_entry', False) and not agent.visible:
                print(f"  Agent {agent.name} is entering the room")
                # Force an enter action for agents pending entry
                enter_action = Action(
                    type=ActionType.ENTER,
                    content=f"Hello everyone! I'm {agent.name}."
                )
                # Store action for current turn display
                self.current_turn_actions[agent.id] = GameAction(
                    type=enter_action.type.value if hasattr(enter_action.type, 'value') else enter_action.type,
                    target=enter_action.target,
                    content=enter_action.content
                )
                await self._process_action(agent, enter_action, new_context)
                await self.agent_service.add_agent_action(agent.id, enter_action)

                # Clear pending_entry flag
                agent_data = await self.agent_service.storage.load_agent(agent.id)
                if agent_data:
                    agent_data['pending_entry'] = False
                    agent_data['visible'] = True
                    await self.agent_service.storage.save_agent(agent.id, agent_data)

        # Handle agents pending deletion - they should leave
        agents_to_delete = []
        for agent in agents:
            if getattr(agent, 'pending_deletion', False) and agent.visible:
                print(f"  Agent {agent.name} is leaving the room")
                # Force a leave action for agents pending deletion
                leave_action = Action(
                    type=ActionType.LEAVE,
                    content=f"Goodbye everyone, it's time for me to go!"
                )
                # Store action for current turn display
                self.current_turn_actions[agent.id] = GameAction(
                    type=leave_action.type.value if hasattr(leave_action.type, 'value') else leave_action.type,
                    target=leave_action.target,
                    content=leave_action.content
                )
                await self._process_action(agent, leave_action, new_context)
                await self.agent_service.add_agent_action(agent.id, leave_action)
                agents_to_delete.append(agent.id)

        # Generate actions for all other visible agents in parallel
        tasks = []
        visible_agents = []
        for agent in agents:
            # Check if agent should take a turn (visible, not pending deletion, not pending entry)
            is_pending_deletion = getattr(agent, 'pending_deletion', False)
            is_pending_entry = getattr(agent, 'pending_entry', False)

            if agent.visible and not is_pending_deletion and not is_pending_entry:
                print(f"  Asking agent {agent.name} (ID: {agent.id}) to take their turn")
                visible_agents.append(agent)
                tasks.append(self._generate_agent_action(agent.id, context))
            else:
                print(f"  Skipping agent {agent.name}: visible={agent.visible}, pending_deletion={is_pending_deletion}, pending_entry={is_pending_entry}")

        print(f"  Waiting for {len(tasks)} agents to decide their actions...")
        # Wait for all actions
        actions = await asyncio.gather(*tasks) if tasks else []

        # Process actions and build new context
        for agent, action in zip(visible_agents, actions):
            if action:
                print(f"    Agent {agent.name} action: {action.type.value if hasattr(action.type, 'value') else action.type}")
                # Store action for current turn display
                self.current_turn_actions[agent.id] = GameAction(
                    type=action.type.value if hasattr(action.type, 'value') else action.type,
                    target=action.target,
                    content=action.content
                )
                await self._process_action(agent, action, new_context)
            else:
                print(f"    Agent {agent.name} did not generate an action")

        # Permanently delete agents that have left
        for agent_id in agents_to_delete:
            print(f"  Permanently deleting agent {agent_id}")
            await self.agent_service.permanently_delete_agent(agent_id)

        # Update last context
        self.last_context = new_context

        # Broadcast state update to all WebSocket clients
        await self._broadcast_state_update()

        print(f"=== TURN {self.turn_number} COMPLETE ===\n")
        return new_context

    async def _broadcast_state_update(self):
        """Broadcast state update to all connected WebSocket clients"""
        try:
            from app.routers.websocket import manager
            state = await self.get_game_state()
            await manager.broadcast_state(state.model_dump())
        except Exception as e:
            print(f"[GameService] Failed to broadcast state: {e}")

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
            # Just record the movement, no position tracking needed

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
        print(f"[Turn Loop] Starting automatic turn execution (interval: {settings.GAME_TURN_INTERVAL}s)")
        while self.turn_running:
            try:
                print(f"[Turn Loop] Executing automatic turn...")
                await self.execute_turn()
                print(f"[Turn Loop] Waiting {settings.GAME_TURN_INTERVAL} seconds until next turn...")
                await asyncio.sleep(settings.GAME_TURN_INTERVAL)
            except Exception as e:
                print(f"[Turn Loop] Error: {str(e)}")
                import traceback
                traceback.print_exc()
                await asyncio.sleep(settings.GAME_TURN_INTERVAL)

    def change_map(self, map_id: str, description: str):
        """Change the current map"""
        self.current_map = MapInfo(id=map_id, description=description)
        # Clear context when map changes
        self.last_context = TurnContext()