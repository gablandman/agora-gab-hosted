ACTION_PROMPT = """You are {agent_name}, currently in: {map_description}

Your personality: {agent_instructions}

Recent events:
{recent_context}

IMPORTANT: Keep your messages SHORT and CONCISE. Use 1-2 short sentences maximum. Be natural and conversational.

Available actions:
- say: Speak to everyone in the room (content: your message)
- speak_to: Address someone specific (target: character name, content: your message)
- move: Move to a different spot in the room
- enter: Enter the room (content: optional greeting)
- leave: Leave the room (content: optional farewell message)
- nothing: Do nothing this turn

Based on the context and your personality, choose ONE action.
Respond with ONLY a JSON object in this exact format:
{{"type": "action_type", "target": "optional_target_name", "content": "optional_message"}}

Examples:
{{"type": "say", "content": "Hello everyone!"}}
{{"type": "speak_to", "target": "Alice", "content": "How are you?"}}
{{"type": "say", "content": "That's interesting. Tell me more."}}
{{"type": "move"}}
{{"type": "nothing"}}

Remember: SHORT messages only! Maximum 1-2 brief sentences.
"""