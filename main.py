"""
MCP Server for Mistral Agent Manager - Simple Version
"""

import os
import asyncio
from typing import List, Optional, Any, Dict
from mcp.server.fastmcp import FastMCP
from pydantic import Field
import httpx
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Backend HTTP server configuration
BACKEND_URL = 'https://agoragents.dev/'

# Initialize FastMCP server
mcp = FastMCP("Mistral Agent Manager", port=3000, stateless_http=True, debug=True)

@mcp.tool(
    title="Create Mistral Agent",
    description="Create a new Mistral agent",
)
def create_agent(
    name: str = Field(description="Name of the agent"),
    description: str = Field(description="Description of the agent", default=""),
    instructions: str = Field(description="Instructions for the agent", default=""),
    model: str = Field(description="Model to use", default="mistral-medium-2505"),
    appearance: str = Field(description="Physical appearance description of the agent", default=""),
    temperature: float = Field(description="Temperature for response generation", default=0.7, ge=0.0, le=2.0)
) -> str:
    """Create a new Mistral agent"""
    try:
        import httpx
        
        # Combiner appearance dans instructions pour la génération de sprite
        enhanced_instructions = instructions
        if appearance:
            enhanced_instructions = f"{instructions}\n\nPhysical appearance: {appearance}"
        
        data = {
            "name": name,
            "instructions": enhanced_instructions,
            "model": model,
            "temperature": temperature
        }
        
        with httpx.Client(follow_redirects=True) as client:
            response = client.post(f"{BACKEND_URL.rstrip('/')}/api/agents", json=data)
        
        if response.status_code == 200:
            agent_data = response.json()
            return f"""✅ Agent créé avec succès !
📝 Nom: {agent_data.get('name', name)}
🆔 ID: {agent_data.get('id', 'N/A')}
📄 Description: {description}
🧠 Modèle: {agent_data.get('model', model)}
👤 Apparence: {appearance}
🌡️ Température: {agent_data.get('temperature', temperature)}"""
        else:
            return f"❌ Erreur: {response.status_code} - {response.text}"
    
    except Exception as e:
        return f"❌ Erreur: {str(e)}"

@mcp.tool(
    title="List Mistral Agents",
    description="List all available Mistral agents",
)
def list_agents() -> str:
    """List all Mistral agents"""
    try:
        import httpx
        
        with httpx.Client(follow_redirects=True) as client:
            response = client.get(f"{BACKEND_URL.rstrip('/')}/api/agents")
        
        if response.status_code == 200:
            agents = response.json()
            
            if not agents:
                return "📊 Aucun agent trouvé."
            
            result = f"📊 Nombre d'agents: {len(agents)}\n\n"
            for i, agent in enumerate(agents, 1):
                result += f"{i}. **{agent.get('name', 'N/A')}**\n"
                result += f"   🆔 ID: `{agent.get('id', 'N/A')}`\n"
                result += f"   📄 Description: {agent.get('description', 'N/A')}\n\n"
            
            return result
        else:
            return f"❌ Erreur: {response.status_code} - {response.text}"
    
    except Exception as e:
        return f"❌ Erreur: {str(e)}"

@mcp.tool(
    title="Delete Mistral Agent",
    description="Delete a Mistral agent by ID",
)
def delete_agent(
    agent_id: str = Field(description="ID of the agent to delete")
) -> str:
    """Delete a Mistral agent"""
    try:
        import httpx
        
        with httpx.Client(follow_redirects=True) as client:
            response = client.delete(f"{BACKEND_URL.rstrip('/')}/api/agents/{agent_id}")
        
        if response.status_code in [200, 204]:
            return f"✅ Agent '{agent_id}' supprimé avec succès !"
        else:
            return f"❌ Erreur: {response.status_code} - {response.text}"
    
    except Exception as e:
        return f"❌ Erreur: {str(e)}"

@mcp.tool(
    title="Search Agent by Name",
    description="Search for an agent by name",
)
def search_agent(
    agent_name: str = Field(description="Name of the agent to search for")
) -> str:
    """Search for an agent by name"""
    try:
        import httpx
        
        with httpx.Client(follow_redirects=True) as client:
            response = client.get(f"{BACKEND_URL.rstrip('/')}/api/agents")
        
        if response.status_code == 200:
            agents = response.json()
            
            for agent in agents:
                if agent.get("name", "").lower() == agent_name.lower():
                    return f"""✅ **Agent trouvé !**

📝 **Nom**: {agent.get('name', 'N/A')}
🆔 **ID**: `{agent.get('id', 'N/A')}`
📄 **Description**: {agent.get('description', 'N/A')}
🧠 **Modèle**: {agent.get('model', 'N/A')}"""
            
            return f"❌ Aucun agent trouvé avec le nom '{agent_name}'"
        else:
            return f"❌ Erreur: {response.status_code} - {response.text}"
    
    except Exception as e:
        return f"❌ Erreur: {str(e)}"

if __name__ == "__main__":
    mcp.run(transport="streamable-http")