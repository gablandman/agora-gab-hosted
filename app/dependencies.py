from functools import lru_cache
from app.services.storage_service import StorageService
from app.services.mistral_service import MistralService
from app.services.agent_service import AgentService
from app.services.game_service import GameService
from app.config import settings

@lru_cache()
def get_storage_service() -> StorageService:
    return StorageService(settings.AGENTS_DIR)

@lru_cache()
def get_mistral_service() -> MistralService:
    return MistralService()

@lru_cache()
def get_agent_service() -> AgentService:
    return AgentService(
        storage_service=get_storage_service(),
        mistral_service=get_mistral_service()
    )

@lru_cache()
def get_game_service() -> GameService:
    return GameService(agent_service=get_agent_service())