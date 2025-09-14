import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Simple configuration - no Pydantic needed
class Settings:
    # API Settings
    API_PORT = int(os.getenv("API_PORT", "8000"))
    API_HOST = os.getenv("API_HOST", "0.0.0.0")

    # Mistral Settings
    MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "")
    MISTRAL_MODEL = "mistral-medium-latest"
    MISTRAL_TEMPERATURE = 0.7

    # Game Settings
    GAME_TURN_INTERVAL = 10  # seconds between turns
    MAX_AGENTS = 20
    MAX_ACTION_HISTORY = 50  # per agent

    # Paths
    BASE_DIR = Path(__file__).parent.parent
    AGENTS_DIR = BASE_DIR / "agents"
    STATIC_DIR = BASE_DIR / "static"
    TEMPLATES_DIR = BASE_DIR / "templates"

settings = Settings()

# Ensure directories exist
settings.AGENTS_DIR.mkdir(exist_ok=True)