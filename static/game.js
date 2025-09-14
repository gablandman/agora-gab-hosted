class HabboGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        this.roomWidth = 10;
        this.roomHeight = 10;
        this.baseTileWidth = 64;
        this.baseTileHeight = 32;
        this.tileWidth = this.baseTileWidth;
        this.tileHeight = this.baseTileHeight;
        this.scale = 1;

        this.player = {
            name: 'Player',
            x: 5,
            y: 5,
            targetX: 5,
            targetY: 5,
            moveProgress: 0,
            moveSpeed: 0.15, // Speed of movement animation
            direction: 'bot-left', // Starting direction as string
            path: [],
            isMoving: false
        };


        // Dynamic offset based on canvas size
        this.updateCanvasSize();


        // Character sprites
        this.characterSprites = {
            face: null,
            'top-left': null,
            'top-right': null,
            'bot-left': null,
            'bot-right': null
        };
        this.selectedCharacterId = null;
        this.useCustomCharacter = false;

        this.speechBubbles = []; // Array to store multiple speech bubbles
        this.maxBubbles = 5; // Maximum number of bubbles to display
        this.bubbleDuration = 5000; // 5 seconds per bubble

        this.obstacles = []; // Array to store obstacles if needed
        this.animationFrame = null;

        // NPC system
        this.npcs = {}; // Store NPC characters by ID
        this.statePollingInterval = null;
        this.lastProcessedState = null;
        this.actionDelay = 500; // 0.5 seconds between character actions

        // Visibility settings
        this.hidePlayer = false;
        this.hideAllCharacters = false;

        // Overlay settings
        this.overlayImage = null;
        this.overlayLoaded = false;
        this.showOverlay = true;
        this.overlayOpacity = 1.0;
        this.overlayLayer = 'background'; // 'background' or 'foreground'

        // Display size settings
        this.nameSize = 1.0; // Scale factor for name displays
        this.bubbleSize = 1.0; // Scale factor for speech bubbles
        this.showNameTags = true; // Whether to show name tags

        this.init();
    }

    async init() {
        await this.loadCharacterList();
        await this.loadOverlayList();
        this.setupControls();
        this.setupResizeHandler();
        this.startGameLoop();
        this.startStatePolling();
        this.render();
    }

    updateCanvasSize() {
        // Calculate scale based on canvas size
        const baseWidth = 800; // Base canvas width we designed for
        const baseHeight = 600; // Base canvas height we designed for

        // Use the smaller scale to ensure everything fits
        const scaleX = this.canvas.width / baseWidth;
        const scaleY = this.canvas.height / baseHeight;
        this.scale = Math.min(scaleX, scaleY);

        // Scale tile dimensions
        this.tileWidth = this.baseTileWidth * this.scale;
        this.tileHeight = this.baseTileHeight * this.scale;

        // Update offsets to center the grid
        this.offsetX = this.canvas.width / 2;
        this.offsetY = this.canvas.height / 3; // Place grid in upper third for better view
    }

    setupResizeHandler() {
        // Make canvas responsive with fixed aspect ratio
        const ASPECT_RATIO = 4 / 3; // 4:3 aspect ratio (you can adjust this)
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 900;

        const resizeCanvas = () => {
            const container = this.canvas.parentElement;
            const rect = container.getBoundingClientRect();

            // Calculate available space
            const availableWidth = Math.min(rect.width - 40, MAX_WIDTH);
            const availableHeight = Math.min(window.innerHeight - 200, MAX_HEIGHT);

            // Calculate dimensions while maintaining aspect ratio
            let canvasWidth = availableWidth;
            let canvasHeight = canvasWidth / ASPECT_RATIO;

            // If height is too big, scale based on height instead
            if (canvasHeight > availableHeight) {
                canvasHeight = availableHeight;
                canvasWidth = canvasHeight * ASPECT_RATIO;
            }

            // Set the canvas size
            this.canvas.width = Math.floor(canvasWidth);
            this.canvas.height = Math.floor(canvasHeight);

            this.updateCanvasSize();
            this.render();
        };

        // Initial resize
        resizeCanvas();

        // Add resize listener
        window.addEventListener('resize', resizeCanvas);
    }

    loadOverlayImage(path = '/static/overlay.png') {
        // Load the overlay image if it exists
        const img = new Image();
        img.onload = () => {
            this.overlayImage = img;
            this.overlayLoaded = true;
            console.log('Overlay image loaded:', path);
            this.render();
        };
        img.onerror = () => {
            console.log('No overlay image found or failed to load:', path);
        };
        img.src = path;
    }

    async loadOverlayList() {
        try {
            const response = await fetch('/api/overlays');
            const data = await response.json();

            const select = document.getElementById('overlaySelect');
            if (select && data.overlays) {
                select.innerHTML = '<option value="">None</option>';

                data.overlays.forEach(overlay => {
                    const option = document.createElement('option');
                    option.value = overlay.path;
                    option.textContent = overlay.theme;
                    if (overlay.active) {
                        option.selected = true;
                    }
                    select.appendChild(option);
                });

                // Load the active overlay if there is one
                const activeOverlay = data.overlays.find(o => o.active);
                if (activeOverlay) {
                    this.loadOverlayImage(activeOverlay.path);
                }
            }
        } catch (error) {
            console.error('Failed to load overlay list:', error);
        }
    }

    startStatePolling() {
        // Use WebSocket for real-time updates
        this.connectWebSocket();
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/state`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connected for real-time state updates');
        };

        this.ws.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);

                // Handle ping messages
                if (data.type === 'ping') {
                    // Just a keepalive, ignore
                    return;
                }

                // Update turn number if displayed
                const turnElement = document.getElementById('turnNumber');
                if (turnElement && data.turn !== undefined) {
                    turnElement.textContent = `Turn: ${data.turn}`;
                }

                if (data.characters) {
                    console.log(`Received state update for turn ${data.turn}`);
                    await this.processStateUpdate(data.characters);
                }
            } catch (error) {
                console.error('Failed to process WebSocket message:', error);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected, attempting to reconnect...');
            // Reconnect after 3 seconds
            setTimeout(() => this.connectWebSocket(), 3000);
        };
    }

    async fetchAndProcessState() {
        // Fallback for manual fetch if needed
        try {
            const response = await fetch('/api/game/state');
            const state = await response.json();

            // Update turn number if displayed
            const turnElement = document.getElementById('turnNumber');
            if (turnElement && state.turn !== undefined) {
                turnElement.textContent = `Turn: ${state.turn}`;
            }

            if (state.characters) {
                await this.processStateUpdate(state.characters);
            }
        } catch (error) {
            console.error('Failed to fetch state:', error);
        }
    }

    async processStateUpdate(characters) {
        const actionsToExecute = [];

        // Process each character
        for (const [charId, charData] of Object.entries(characters)) {
            // Create NPC if it doesn't exist (only for visible characters)
            if (!this.npcs[charId] && charData.visible !== false) {
                this.createNPC(charId, charData.name);
            }

            // Get the action (if any)
            if (charData.action) {
                actionsToExecute.push({
                    charId,
                    action: charData.action,
                    name: charData.name
                });
            }
        }

        // Execute actions with delay between them
        for (let i = 0; i < actionsToExecute.length; i++) {
            const { charId, action } = actionsToExecute[i];
            await this.executeAction(charId, action);

            // Add delay before next character's action (except for last one)
            if (i < actionsToExecute.length - 1) {
                await new Promise(resolve => setTimeout(resolve, this.actionDelay));
            }
        }
    }

    createNPC(charId, name) {
        // Pick a random starting position
        const x = Math.floor(Math.random() * this.roomWidth);
        const y = Math.floor(Math.random() * this.roomHeight);

        // Pick a random character skin from available characters
        let characterSkinId = null;
        const select = document.getElementById('characterSelect');
        if (select && select.options.length > 0) {
            const randomIndex = Math.floor(Math.random() * select.options.length);
            characterSkinId = select.options[randomIndex].value;
        }

        this.npcs[charId] = {
            id: charId,
            name: name,
            x: x,
            y: y,
            targetX: x,
            targetY: y,
            moveProgress: 0,
            moveSpeed: 0.15,
            direction: 'bot-left',
            path: [],
            isMoving: false,
            visible: true,
            speechBubbles: [],
            characterSkinId: characterSkinId,
            sprites: {} // Will be loaded
        };

        // Load sprites for this NPC if we have a skin ID
        if (characterSkinId) {
            this.loadNPCSprites(charId, characterSkinId);
        }

        console.log(`Created NPC ${name} at position (${x}, ${y}) with skin ${characterSkinId}`);
    }

    async loadNPCSprites(npcId, characterSkinId) {
        const npc = this.npcs[npcId];
        if (!npc) return;

        // Load all character sprites for this NPC
        const spritePaths = {
            face: `/cache/${characterSkinId}-face.png`,
            'top-left': `/cache/${characterSkinId}-top-left.png`,
            'top-right': `/cache/${characterSkinId}-top-right.png`,
            'bot-left': `/cache/${characterSkinId}-bot-left.png`,
            'bot-right': `/cache/${characterSkinId}-bot-right.png`
        };

        let loadedCount = 0;
        const totalSprites = Object.keys(spritePaths).length;

        for (const [key, path] of Object.entries(spritePaths)) {
            const img = new Image();
            img.onload = () => {
                loadedCount++;
                if (loadedCount === totalSprites) {
                    console.log(`All sprites loaded for NPC ${npc.name}`);
                    this.render();
                }
            };
            img.onerror = () => {
                console.error(`Failed to load NPC sprite: ${path}`);
                loadedCount++;
            };
            img.src = path;
            npc.sprites[key] = img;
        }
    }

    async executeAction(charId, action) {
        const npc = this.npcs[charId];
        if (!npc) return;

        console.log(`Executing action for ${npc.name}: ${action.type}`);

        switch (action.type) {
            case 'say':
                await this.npcSay(charId, action.content);
                break;
            case 'speak_to':
                await this.npcSpeakTo(charId, action.target, action.content);
                break;
            case 'leave':
                await this.npcLeave(charId, action.content);
                break;
            case 'enter':
                await this.npcEnter(charId, action.content);
                break;
            case 'move':
                await this.npcMove(charId);
                break;
            case 'nothing':
                // No operation
                break;
        }
    }

    async npcSay(charId, content) {
        const npc = this.npcs[charId];
        if (!npc || !content) return;

        // Store previous direction and face forward
        const previousDirection = npc.direction;
        npc.direction = 'face';

        // Add speech bubble
        this.addNPCSpeechBubble(charId, content);

        // Wait for speech duration
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Restore previous direction after speaking
        npc.direction = previousDirection;
    }

    async npcSpeakTo(charId, targetId, content) {
        const npc = this.npcs[charId];
        const target = this.npcs[targetId];

        if (!npc || !target) return;

        // Check if NPC is already adjacent to target
        const adjacentTiles = this.getAdjacentTiles(target.x, target.y);
        const isAlreadyAdjacent = adjacentTiles.some(tile =>
            Math.floor(npc.x) === tile.x && Math.floor(npc.y) === tile.y
        );

        if (!isAlreadyAdjacent) {
            // Find adjacent free tile to target and move there
            const freeTile = adjacentTiles.find(tile => this.isTileFree(tile.x, tile.y));

            if (freeTile) {
                // Move to adjacent tile
                await this.moveNPCTo(charId, freeTile.x, freeTile.y);
            }
        }

        // Always face the target (whether we moved or not)
        this.faceTowards(npc, target);

        // Say the content
        if (content) {
            this.addNPCSpeechBubble(charId, content);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    async npcLeave(charId, content) {
        const npc = this.npcs[charId];
        if (!npc) return;

        // Say goodbye message if provided
        if (content) {
            this.addNPCSpeechBubble(charId, content);
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        // Move to door position (near 0, 3 based on door location)
        await this.moveNPCTo(charId, 0, 3);

        // Make character disappear
        npc.visible = false;
        this.render();
    }

    async npcEnter(charId, content) {
        const npc = this.npcs[charId];
        if (!npc) return;

        // Position at door
        npc.x = 0;
        npc.y = 3;
        npc.visible = true;

        // Say entrance message if provided
        if (content) {
            this.addNPCSpeechBubble(charId, content);
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        // Move into room
        await this.npcMove(charId);
    }

    async npcMove(charId) {
        const npc = this.npcs[charId];
        if (!npc) return;

        // Find random free tile
        let attempts = 0;
        let targetX, targetY;

        do {
            targetX = Math.floor(Math.random() * this.roomWidth);
            targetY = Math.floor(Math.random() * this.roomHeight);
            attempts++;
        } while (!this.isTileFree(targetX, targetY) && attempts < 20);

        if (attempts < 20) {
            await this.moveNPCTo(charId, targetX, targetY);
        }
    }

    async moveNPCTo(charId, targetX, targetY) {
        const npc = this.npcs[charId];
        if (!npc) return;

        // Use pathfinding
        const path = this.findPath(
            Math.floor(npc.x),
            Math.floor(npc.y),
            targetX,
            targetY
        );

        if (path && path.length > 0) {
            // Animate movement along path
            for (const tile of path) {
                npc.targetX = tile.x;
                npc.targetY = tile.y;

                // Update direction based on movement
                const dx = tile.x - npc.x;
                const dy = tile.y - npc.y;
                this.updateNPCDirection(npc, dx, dy);

                // Animate to this tile
                await this.animateNPCMovement(charId);

                npc.x = tile.x;
                npc.y = tile.y;
            }
        }
    }

    async animateNPCMovement(charId) {
        const npc = this.npcs[charId];
        if (!npc) return;

        return new Promise(resolve => {
            const animateStep = () => {
                npc.moveProgress += npc.moveSpeed;

                if (npc.moveProgress >= 1) {
                    npc.moveProgress = 0;
                    resolve();
                } else {
                    requestAnimationFrame(animateStep);
                }

                this.render();
            };

            animateStep();
        });
    }

    updateNPCDirection(npc, dx, dy) {
        if (dx > 0 && dy === 0) {
            npc.direction = 'bot-right';
        } else if (dx < 0 && dy === 0) {
            npc.direction = 'top-right';
        } else if (dx === 0 && dy < 0) {
            npc.direction = 'top-left';
        } else if (dx === 0 && dy > 0) {
            npc.direction = 'bot-left';
        }
    }

    faceTowards(npc, target) {
        const dx = target.x - npc.x;
        const dy = target.y - npc.y;

        if (Math.abs(dx) > Math.abs(dy)) {
            npc.direction = dx > 0 ? 'bot-right' : 'top-right';
        } else {
            npc.direction = dy > 0 ? 'bot-left' : 'top-left';
        }
    }

    getAdjacentTiles(x, y) {
        return [
            { x: x - 1, y: y },
            { x: x + 1, y: y },
            { x: x, y: y - 1 },
            { x: x, y: y + 1 }
        ].filter(tile =>
            tile.x >= 0 && tile.x < this.roomWidth &&
            tile.y >= 0 && tile.y < this.roomHeight
        );
    }

    isTileFree(x, y) {
        // Check if tile is occupied by player or other NPCs
        if (Math.floor(this.player.x) === x && Math.floor(this.player.y) === y) {
            return false;
        }

        for (const npc of Object.values(this.npcs)) {
            if (npc.visible && Math.floor(npc.x) === x && Math.floor(npc.y) === y) {
                return false;
            }
        }

        return true;
    }

    addNPCSpeechBubble(charId, text) {
        const npc = this.npcs[charId];
        if (!npc) return;

        const bubble = {
            text: text,
            timestamp: Date.now(),
            opacity: 1
        };

        npc.speechBubbles.unshift(bubble);

        if (npc.speechBubbles.length > this.maxBubbles) {
            npc.speechBubbles = npc.speechBubbles.slice(0, this.maxBubbles);
        }

        setTimeout(() => {
            const index = npc.speechBubbles.indexOf(bubble);
            if (index > -1) {
                npc.speechBubbles.splice(index, 1);
                this.render();
            }
        }, this.bubbleDuration);

        this.render();
    }

    async loadCharacterList() {
        try {
            const response = await fetch('/api/characters');
            const data = await response.json();

            if (data.characters && data.characters.length > 0) {
                // Create character selector UI
                this.createCharacterSelector(data.characters);
            }
        } catch (error) {
            console.error('Failed to load character list:', error);
        }
    }

    createCharacterSelector(characters) {
        const select = document.getElementById('characterSelect');
        if (!select) return;

        // Clear all existing options
        select.innerHTML = '';

        // Add character options
        characters.forEach((characterId, index) => {
            const option = document.createElement('option');
            option.value = characterId;
            option.textContent = `Character ${characterId.substring(0, 8)}...`;
            select.appendChild(option);
        });

        // Set up the load button
        const loadBtn = document.getElementById('loadCharacterBtn');
        if (loadBtn) {
            loadBtn.onclick = () => this.loadSelectedCharacter();
        }

        // Automatically load the first character if available
        if (characters.length > 0) {
            select.value = characters[0];
            this.loadSelectedCharacter();
        }
    }

    async loadSelectedCharacter() {
        const select = document.getElementById('characterSelect');
        const characterId = select.value;

        if (!characterId) {
            // No character selected, don't render anything
            return;
        }

        this.selectedCharacterId = characterId;
        this.useCustomCharacter = true;

        // Load all character sprites
        const spritePaths = {
            face: `/cache/${characterId}-face.png`,
            'top-left': `/cache/${characterId}-top-left.png`,
            'top-right': `/cache/${characterId}-top-right.png`,
            'bot-left': `/cache/${characterId}-bot-left.png`,
            'bot-right': `/cache/${characterId}-bot-right.png`
        };

        let loadedCount = 0;
        const totalSprites = Object.keys(spritePaths).length;

        for (const [key, path] of Object.entries(spritePaths)) {
            const img = new Image();
            img.onload = () => {
                loadedCount++;
                if (loadedCount === totalSprites) {
                    console.log('All character sprites loaded');
                    this.render();
                }
            };
            img.onerror = () => {
                console.error(`Failed to load sprite: ${path}`);
                loadedCount++;
            };
            img.src = path;
            this.characterSprites[key] = img;
        }
    }


    getCharacterSprite(sprites, direction) {
        // Direction should already be a string like 'bot-left', 'top-right', 'face', etc.
        if (typeof direction === 'string') {
            // If it's already a valid sprite name, use it
            if (sprites[direction]) {
                return sprites[direction];
            }
        }

        // Default to bot-left if anything goes wrong
        return sprites['bot-left'];
    }

    getCustomSprite(direction) {
        return this.getCharacterSprite(this.characterSprites, this.player.direction);
    }

    setupControls() {
        // Only keyboard controls for movement
        document.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'ArrowUp':
                    this.movePlayer(0, -1);
                    break;
                case 'ArrowDown':
                    this.movePlayer(0, 1);
                    break;
                case 'ArrowLeft':
                    this.movePlayer(-1, 0);
                    break;
                case 'ArrowRight':
                    this.movePlayer(1, 0);
                    break;
                case '1':
                    this.cycleDirection(-1);
                    break;
                case '2':
                    this.cycleDirection(1);
                    break;
            }
        });

        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            this.handleCanvasClick(x, y);
        });

        // Chat controls
        const chatInput = document.getElementById('chatInput');
        const sayButton = document.getElementById('sayButton');

        const sendMessage = () => {
            const message = chatInput.value.trim();
            if (message) {
                this.say(message);
                chatInput.value = '';
            }
        };

        sayButton.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }

    setDirection(dir) {
        // We only have 5 sprites: face, top-left, top-right, bot-left, bot-right
        // Map any input to one of these 5
        const directionMap = {
            0: 'bot-left',   // SW
            1: 'top-left',   // NW
            2: 'top-right',  // NE
            3: 'bot-right',  // SE
            4: 'face'        // Front facing (for when talking)
        };

        if (typeof dir === 'number') {
            // Map to one of our 5 sprites, wrapping if needed
            const mappedDir = dir % 5;
            this.player.direction = directionMap[mappedDir] || 'bot-left';
        } else {
            this.player.direction = dir;
        }

        // Update UI if the element exists
        const dirElement = document.getElementById('currentDirection');
        if (dirElement) {
            const displayName = typeof dir === 'number' ? this.directionNames[dir] : dir;
            dirElement.textContent = `Current: ${displayName}`;
        }
        this.render();
    }

    cycleDirection(delta) {
        // Cycle through the four directional sprites
        const directions = ['bot-left', 'top-left', 'top-right', 'bot-right'];
        let currentIndex = directions.indexOf(this.player.direction);
        if (currentIndex === -1) currentIndex = 0;

        currentIndex = (currentIndex + delta + 4) % 4;
        this.player.direction = directions[currentIndex];

        const dirElement = document.getElementById('currentDirection');
        if (dirElement) {
            dirElement.textContent = `Current: ${this.player.direction}`;
        }
        this.render();
    }

    handleCanvasClick(clickX, clickY) {
        for (let x = 0; x < this.roomWidth; x++) {
            for (let y = 0; y < this.roomHeight; y++) {
                const screenPos = this.isoToScreen(x, y);
                const tileX = screenPos.x;
                const tileY = screenPos.y;

                const dx = clickX - tileX;
                const dy = clickY - tileY;

                if (Math.abs(dx) < this.tileWidth/2 && Math.abs(dy) < this.tileHeight/2) {
                    const relX = dx + this.tileWidth/2;
                    const relY = dy + this.tileHeight/2;

                    const leftEdge = relY > (this.tileHeight * relX / this.tileWidth);
                    const rightEdge = relY > (this.tileHeight * (this.tileWidth - relX) / this.tileWidth);

                    if (leftEdge && rightEdge) {
                        // Use pathfinding to move to clicked tile
                        this.moveToTile(x, y);
                        return;
                    }
                }
            }
        }
    }

    moveToTile(targetX, targetY) {
        // Find path using A*
        const currentX = Math.floor(this.player.x);
        const currentY = Math.floor(this.player.y);

        const path = this.findPath(currentX, currentY, targetX, targetY);

        if (path && path.length > 1) {
            // Remove current position from path
            path.shift();
            this.player.path = path;
            this.startMoving();
        }
    }

    startMoving() {
        if (this.player.path.length === 0) {
            this.player.isMoving = false;
            return;
        }

        this.player.isMoving = true;
        const nextTile = this.player.path[0];

        // Set target position
        this.player.targetX = nextTile.x;
        this.player.targetY = nextTile.y;
        this.player.moveProgress = 0;

        // Update direction based on movement - using string-based directions
        const dx = nextTile.x - this.player.x;
        const dy = nextTile.y - this.player.y;

        if (dx > 0 && dy === 0) {
            this.player.direction = 'bot-right'; // Moving right
        } else if (dx < 0 && dy === 0) {
            this.player.direction = 'top-right'; // Moving left (swapped)
        } else if (dx === 0 && dy > 0) {
            this.player.direction = 'bot-left'; // Moving down
        } else if (dx === 0 && dy < 0) {
            this.player.direction = 'top-left'; // Moving up (swapped)
        } else if (dx > 0 && dy > 0) {
            this.player.direction = 'bot-right'; // Moving down-right
        } else if (dx < 0 && dy < 0) {
            this.player.direction = 'top-left'; // Moving up-left
        } else if (dx > 0 && dy < 0) {
            this.player.direction = 'top-right'; // Moving up-right
        } else if (dx < 0 && dy > 0) {
            this.player.direction = 'bot-left'; // Moving down-left
        }
    }

    // A* Pathfinding Algorithm
    findPath(startX, startY, endX, endY) {
        const openSet = [];
        const closedSet = [];
        const start = { x: startX, y: startY, g: 0, h: 0, f: 0, parent: null };
        const end = { x: endX, y: endY };

        openSet.push(start);

        while (openSet.length > 0) {
            // Find node with lowest f score
            let current = openSet[0];
            let currentIndex = 0;

            for (let i = 1; i < openSet.length; i++) {
                if (openSet[i].f < current.f) {
                    current = openSet[i];
                    currentIndex = i;
                }
            }

            // Remove current from openSet
            openSet.splice(currentIndex, 1);
            closedSet.push(current);

            // Check if we reached the goal
            if (current.x === end.x && current.y === end.y) {
                const path = [];
                let temp = current;
                while (temp) {
                    path.push({ x: temp.x, y: temp.y });
                    temp = temp.parent;
                }
                return path.reverse();
            }

            // Check all neighbors
            const neighbors = this.getNeighbors(current.x, current.y);

            for (const neighbor of neighbors) {
                // Skip if in closed set
                if (closedSet.find(n => n.x === neighbor.x && n.y === neighbor.y)) {
                    continue;
                }

                const g = current.g + 1;
                const h = Math.abs(neighbor.x - end.x) + Math.abs(neighbor.y - end.y);
                const f = g + h;

                // Check if neighbor is in open set
                const openNode = openSet.find(n => n.x === neighbor.x && n.y === neighbor.y);

                if (!openNode) {
                    openSet.push({
                        x: neighbor.x,
                        y: neighbor.y,
                        g: g,
                        h: h,
                        f: f,
                        parent: current
                    });
                } else if (g < openNode.g) {
                    openNode.g = g;
                    openNode.f = f;
                    openNode.parent = current;
                }
            }
        }

        return null; // No path found
    }

    getNeighbors(x, y) {
        const neighbors = [];
        const directions = [
            { x: 0, y: -1 }, // North
            { x: 1, y: 0 },  // East
            { x: 0, y: 1 },  // South
            { x: -1, y: 0 }  // West
        ];

        for (const dir of directions) {
            const newX = x + dir.x;
            const newY = y + dir.y;

            // Check if tile is within bounds and walkable
            if (newX >= 0 && newX < this.roomWidth &&
                newY >= 0 && newY < this.roomHeight &&
                this.isWalkable(newX, newY)) {
                neighbors.push({ x: newX, y: newY });
            }
        }

        return neighbors;
    }

    isWalkable(x, y) {
        // Check if tile is not an obstacle
        // For now, all tiles are walkable
        return !this.obstacles.find(obs => obs.x === x && obs.y === y);
    }

    startGameLoop() {
        const gameLoop = () => {
            this.update();
            this.render();
            this.animationFrame = requestAnimationFrame(gameLoop);
        };
        gameLoop();
    }

    update() {
        if (this.player.isMoving) {
            this.player.moveProgress += this.player.moveSpeed;

            if (this.player.moveProgress >= 1) {
                // Movement complete
                this.player.x = this.player.targetX;
                this.player.y = this.player.targetY;
                this.player.moveProgress = 0;

                // Remove completed tile from path
                this.player.path.shift();

                // Continue to next tile or stop
                if (this.player.path.length > 0) {
                    this.startMoving();
                } else {
                    this.player.isMoving = false;
                }
            }
        }
    }

    getNPCInterpolatedPosition(npc) {
        if (npc.moveProgress > 0 && npc.moveProgress < 1) {
            const smoothProgress = this.easeInOutQuad(npc.moveProgress);
            const currentX = npc.x + (npc.targetX - npc.x) * smoothProgress;
            const currentY = npc.y + (npc.targetY - npc.y) * smoothProgress;
            return { x: currentX, y: currentY };
        }
        return { x: npc.x, y: npc.y };
    }

    drawNameTag(name, x, y) {
        // Set up text style - larger font for better readability, scaled by nameSize
        const fontSize = Math.max(14, 12 * this.scale) * this.nameSize;
        this.ctx.font = `bold ${fontSize}px Arial`;
        this.ctx.textAlign = 'center';

        // Measure text
        const metrics = this.ctx.measureText(name);
        const textWidth = metrics.width;
        const padding = 6 * this.nameSize;
        const bgWidth = textWidth + padding * 2;
        const bgHeight = fontSize + 8 * this.nameSize;

        // Draw background with rounded corners
        const bgX = x - bgWidth / 2;
        const bgY = y - bgHeight / 2;
        const radius = 3;

        // Background shadow
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        this.ctx.beginPath();
        this.ctx.roundRect(bgX + 1, bgY + 1, bgWidth, bgHeight, radius);
        this.ctx.fill();

        // Background - more opaque for better contrast
        this.ctx.fillStyle = 'rgba(255, 255, 255, 1)';
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.roundRect(bgX, bgY, bgWidth, bgHeight, radius);
        this.ctx.fill();
        this.ctx.stroke();

        // Draw text - darker for better contrast
        this.ctx.fillStyle = '#000000';
        this.ctx.fillText(name, x, y + 4); // Slight offset to center vertically
        this.ctx.textAlign = 'left';
    }

    drawNPC(npc, x, y) {
        const pos = this.isoToScreen(x, y);

        // Check if NPC has loaded sprites
        if (npc.sprites && npc.sprites['bot-left']) {
            // Use the unified character drawing function
            const sprite = this.getCharacterSprite(npc.sprites, npc.direction);
            if (sprite) {
                const spriteScale = 0.08 * this.scale; // Scale with canvas
                const drawWidth = sprite.width * spriteScale;
                const drawHeight = sprite.height * spriteScale;

                this.ctx.drawImage(
                    sprite,
                    pos.x - drawWidth / 2,
                    pos.y - drawHeight + (30 * this.scale),  // Scale offset too
                    drawWidth,
                    drawHeight
                );
            }
        } else {
            // Fallback to simple shape if no sprites loaded
            const offsetY = 30 * this.scale;
            const charHeight = 60 * this.scale;
            const charWidth = 20 * this.scale;

            // Different colors for different NPCs
            const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];
            const colorIndex = Math.abs(npc.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % colors.length;

            // Shadow
            this.ctx.fillStyle = '#333333';
            this.ctx.beginPath();
            this.ctx.ellipse(pos.x, pos.y + offsetY - 5, charWidth/2, 8, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // Body
            this.ctx.fillStyle = colors[colorIndex];
            this.ctx.fillRect(pos.x - charWidth/2, pos.y + offsetY - charHeight, charWidth, charHeight - 10);

            // Head
            this.ctx.fillStyle = '#FFD4A3';
            this.ctx.strokeStyle = '#333333';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y + offsetY - charHeight, 12, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
        }

        // Name tag will be drawn in a separate pass to ensure it's above all characters
    }

    drawNPCSpeechBubbles(npc, x, y) {
        if (npc.speechBubbles.length === 0) return;

        const pos = this.isoToScreen(x, y);
        const padding = 12; // Fixed padding
        const maxWidth = 300; // Increased from 200 to 300
        const fontSize = Math.max(18, 16 * this.scale) * this.bubbleSize; // Only scale font size
        const lineHeight = fontSize * 1.3; // Line height based on font size
        const bubbleSpacing = 5;
        const radius = 10;

        // Similar to player speech bubbles but for NPCs
        let totalHeight = 0;
        const bubblesData = [];

        npc.speechBubbles.forEach((bubble) => {
            this.ctx.font = `${fontSize}px Arial`;
            const words = bubble.text.split(' ');
            const lines = [];
            let currentLine = '';

            for (const word of words) {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                const metrics = this.ctx.measureText(testLine);

                if (metrics.width > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            }
            lines.push(currentLine);

            const bubbleHeight = lines.length * lineHeight + padding * 2;
            let bubbleWidth = 0;

            for (const line of lines) {
                const metrics = this.ctx.measureText(line);
                bubbleWidth = Math.max(bubbleWidth, metrics.width);
            }
            bubbleWidth += padding * 2;

            bubblesData.push({
                bubble: bubble,
                lines: lines,
                width: bubbleWidth,
                height: bubbleHeight
            });

            totalHeight += bubbleHeight + bubbleSpacing;
        });

        let currentY = pos.y - (85 * this.scale) - totalHeight;

        bubblesData.reverse().forEach((data, index) => {
            const { bubble, lines, width: bubbleWidth, height: bubbleHeight } = data;

            const age = Date.now() - bubble.timestamp;
            const fadeStart = this.bubbleDuration - 1000;
            let opacity = 1;
            if (age > fadeStart) {
                opacity = Math.max(0, 1 - ((age - fadeStart) / 1000));
            }

            const bubbleX = pos.x - bubbleWidth / 2;
            const bubbleY = currentY;

            this.ctx.globalAlpha = opacity;

            // Draw bubble background
            this.ctx.fillStyle = 'white';
            this.ctx.strokeStyle = '#333';
            this.ctx.lineWidth = 2;

            this.ctx.beginPath();
            this.ctx.moveTo(bubbleX + radius, bubbleY);
            this.ctx.lineTo(bubbleX + bubbleWidth - radius, bubbleY);
            this.ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY, bubbleX + bubbleWidth, bubbleY + radius);
            this.ctx.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight - radius);
            this.ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight, bubbleX + bubbleWidth - radius, bubbleY + bubbleHeight);

            if (index === bubblesData.length - 1) {
                this.ctx.lineTo(pos.x + 10, bubbleY + bubbleHeight);
                this.ctx.lineTo(pos.x, bubbleY + bubbleHeight + 10);
                this.ctx.lineTo(pos.x - 10, bubbleY + bubbleHeight);
            }

            this.ctx.lineTo(bubbleX + radius, bubbleY + bubbleHeight);
            this.ctx.quadraticCurveTo(bubbleX, bubbleY + bubbleHeight, bubbleX, bubbleY + bubbleHeight - radius);
            this.ctx.lineTo(bubbleX, bubbleY + radius);
            this.ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + radius, bubbleY);
            this.ctx.closePath();

            this.ctx.fill();
            this.ctx.stroke();

            // Draw text - larger and darker for better readability
            this.ctx.fillStyle = '#000';
            this.ctx.font = `${fontSize}px Arial`;
            lines.forEach((line, lineIndex) => {
                const textX = bubbleX + padding;
                // Center text vertically by using proper baseline calculation
                const textY = bubbleY + padding + lineIndex * lineHeight + fontSize * 0.75;
                this.ctx.fillText(line, textX, textY);
            });

            currentY += bubbleHeight + bubbleSpacing;
        });

        this.ctx.globalAlpha = 1;
    }

    getInterpolatedPosition() {
        if (!this.player.isMoving) {
            return { x: this.player.x, y: this.player.y };
        }

        const startX = this.player.x;
        const startY = this.player.y;
        const endX = this.player.targetX;
        const endY = this.player.targetY;
        const progress = this.player.moveProgress;

        // Smooth easing function
        const easeProgress = this.easeInOutQuad(progress);

        return {
            x: startX + (endX - startX) * easeProgress,
            y: startY + (endY - startY) * easeProgress
        };
    }

    easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    movePlayer(dx, dy) {
        const newX = Math.floor(this.player.x) + dx;
        const newY = Math.floor(this.player.y) + dy;

        // Set direction based on movement in isometric view
        // Arrow keys move the character in isometric directions:

        if (dx > 0 && dy === 0) {
            // Right arrow -> character faces bot-right
            this.player.direction = 'bot-right';
        } else if (dx < 0 && dy === 0) {
            // Left arrow -> character faces top-right (swapped with up)
            this.player.direction = 'top-right';
        } else if (dx === 0 && dy < 0) {
            // Up arrow -> character faces top-left (swapped with left)
            this.player.direction = 'top-left';
        } else if (dx === 0 && dy > 0) {
            // Down arrow -> character faces bot-left
            this.player.direction = 'bot-left';
        }

        if (newX >= 0 && newX < this.roomWidth && newY >= 0 && newY < this.roomHeight) {
            this.moveToTile(newX, newY);
        }
    }

    isoToScreen(x, y) {
        const screenX = (x - y) * (this.tileWidth / 2) + this.offsetX;
        const screenY = (x + y) * (this.tileHeight / 2) + this.offsetY;
        return { x: screenX, y: screenY };
    }

    drawTile(x, y, color = '#E8E8E8') {
        const pos = this.isoToScreen(x, y);

        this.ctx.fillStyle = color;
        this.ctx.strokeStyle = '#CCCCCC';
        this.ctx.lineWidth = 1;

        this.ctx.beginPath();
        this.ctx.moveTo(pos.x, pos.y);
        this.ctx.lineTo(pos.x + this.tileWidth/2, pos.y + this.tileHeight/2);
        this.ctx.lineTo(pos.x, pos.y + this.tileHeight);
        this.ctx.lineTo(pos.x - this.tileWidth/2, pos.y + this.tileHeight/2);
        this.ctx.closePath();

        this.ctx.fill();
        this.ctx.stroke();
    }

    drawOverlay() {
        if (!this.showOverlay || !this.overlayLoaded || !this.overlayImage) return;

        // Apply opacity
        this.ctx.save();
        this.ctx.globalAlpha = this.overlayOpacity;

        // Simply draw the overlay covering the entire canvas
        this.ctx.drawImage(
            this.overlayImage,
            0,
            0,
            this.canvas.width,
            this.canvas.height
        );

        this.ctx.restore();
    }

    drawDoor() {
        // Draw a black door in the middle of the left wall (entrance)
        const doorHeight = 70 * this.scale;

        // Position 2 tiles higher (closer to top-left corner)
        const doorY = Math.floor(this.roomHeight / 2) - 2;
        const pos1 = this.isoToScreen(0, doorY);
        const pos2 = this.isoToScreen(0, doorY + 1); // Next tile position for width

        // Draw door on the left wall - exactly one tile wide along the isometric edge
        this.ctx.fillStyle = '#000000';
        this.ctx.strokeStyle = '#333333';
        this.ctx.lineWidth = 2;

        // Door positioned flush with the left edge of the tiles
        this.ctx.beginPath();
        // Bottom left corner (at tile edge)
        this.ctx.moveTo(pos1.x - this.tileWidth/2, pos1.y + this.tileHeight/2);
        // Bottom right corner (one tile down along the wall)
        this.ctx.lineTo(pos2.x - this.tileWidth/2, pos2.y + this.tileHeight/2);
        // Top right corner
        this.ctx.lineTo(pos2.x - this.tileWidth/2, pos2.y + this.tileHeight/2 - doorHeight);
        // Top left corner
        this.ctx.lineTo(pos1.x - this.tileWidth/2, pos1.y + this.tileHeight/2 - doorHeight);
        this.ctx.closePath();

        this.ctx.fill();
        this.ctx.stroke();
    }

    say(message) {
        // Store previous direction and face forward
        const previousDirection = this.player.direction;
        this.player.direction = 'face';

        // Add new message to the array
        const newBubble = {
            text: message,
            timestamp: Date.now(),
            opacity: 1
        };

        this.speechBubbles.unshift(newBubble); // Add to beginning of array

        // Limit the number of bubbles
        if (this.speechBubbles.length > this.maxBubbles) {
            this.speechBubbles = this.speechBubbles.slice(0, this.maxBubbles);
        }

        // Set timer to remove this bubble after duration
        setTimeout(() => {
            const index = this.speechBubbles.indexOf(newBubble);
            if (index > -1) {
                this.speechBubbles.splice(index, 1);
                // Restore previous direction when done speaking
                if (this.speechBubbles.length === 0) {
                    this.player.direction = previousDirection;
                }
                this.render();
            }
        }, this.bubbleDuration);

        this.render();
    }

    drawSpeechBubbles(x, y) {
        if (this.speechBubbles.length === 0) return;

        const pos = this.isoToScreen(x, y);
        const padding = 12; // Fixed padding
        const maxWidth = 300; // Increased from 200 to 300
        const fontSize = Math.max(18, 16 * this.scale) * this.bubbleSize; // Only scale font size
        const lineHeight = fontSize * 1.3; // Line height based on font size
        const bubbleSpacing = 5;
        const radius = 10;

        // Calculate total height and process bubbles
        let totalHeight = 0;
        const bubblesData = [];

        this.speechBubbles.forEach((bubble) => {
            this.ctx.font = `${fontSize}px Arial`;
            const words = bubble.text.split(' ');
            const lines = [];
            let currentLine = '';

            // Word wrap
            for (const word of words) {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                const metrics = this.ctx.measureText(testLine);

                if (metrics.width > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            }
            lines.push(currentLine);

            // Calculate bubble dimensions
            const bubbleHeight = lines.length * lineHeight + padding * 2;
            let bubbleWidth = 0;

            for (const line of lines) {
                const metrics = this.ctx.measureText(line);
                bubbleWidth = Math.max(bubbleWidth, metrics.width);
            }
            bubbleWidth += padding * 2;

            bubblesData.push({
                bubble: bubble,
                lines: lines,
                width: bubbleWidth,
                height: bubbleHeight
            });

            totalHeight += bubbleHeight + bubbleSpacing;
        });

        // Draw bubbles from oldest (top) to newest (bottom)
        let currentY = pos.y - (85 * this.scale) - totalHeight;

        bubblesData.reverse().forEach((data, index) => {
            const { bubble, lines, width: bubbleWidth, height: bubbleHeight } = data;

            // Calculate fade
            const age = Date.now() - bubble.timestamp;
            const fadeStart = this.bubbleDuration - 1000;
            let opacity = 1;
            if (age > fadeStart) {
                opacity = Math.max(0, 1 - ((age - fadeStart) / 1000));
            }

            const bubbleX = pos.x - bubbleWidth / 2;
            const bubbleY = currentY;

            this.ctx.globalAlpha = opacity;

            // Draw bubble background
            this.ctx.fillStyle = 'white';
            this.ctx.strokeStyle = '#333';
            this.ctx.lineWidth = 2;

            // Bubble with rounded corners
            this.ctx.beginPath();
            this.ctx.moveTo(bubbleX + radius, bubbleY);
            this.ctx.lineTo(bubbleX + bubbleWidth - radius, bubbleY);
            this.ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY, bubbleX + bubbleWidth, bubbleY + radius);
            this.ctx.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight - radius);
            this.ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight, bubbleX + bubbleWidth - radius, bubbleY + bubbleHeight);

            // Only draw tail for newest bubble
            if (index === bubblesData.length - 1) {
                this.ctx.lineTo(pos.x + 10, bubbleY + bubbleHeight);
                this.ctx.lineTo(pos.x, bubbleY + bubbleHeight + 10);
                this.ctx.lineTo(pos.x - 10, bubbleY + bubbleHeight);
            }

            this.ctx.lineTo(bubbleX + radius, bubbleY + bubbleHeight);
            this.ctx.quadraticCurveTo(bubbleX, bubbleY + bubbleHeight, bubbleX, bubbleY + bubbleHeight - radius);
            this.ctx.lineTo(bubbleX, bubbleY + radius);
            this.ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + radius, bubbleY);
            this.ctx.closePath();

            this.ctx.fill();
            this.ctx.stroke();

            // Draw text - larger and darker for better readability
            this.ctx.fillStyle = '#000';
            this.ctx.font = `${fontSize}px Arial`;
            lines.forEach((line, lineIndex) => {
                const textX = bubbleX + padding;
                // Center text vertically by using proper baseline calculation
                const textY = bubbleY + padding + lineIndex * lineHeight + fontSize * 0.75;
                this.ctx.fillText(line, textX, textY);
            });

            currentY += bubbleHeight + bubbleSpacing;
        });

        // Reset global alpha
        this.ctx.globalAlpha = 1;
    }

    drawAllSpeechBubbles(allBubbles) {
        if (allBubbles.length === 0) return;

        const padding = 12;
        const maxWidth = 300; // Increased from 200 to 300
        const fontSize = Math.max(18, 16 * this.scale) * this.bubbleSize;
        const lineHeight = fontSize * 1.3;
        const bubbleSpacing = 5;
        const radius = 10;

        // Process all bubbles and calculate their dimensions
        const processedBubbles = [];

        for (const charBubble of allBubbles) {
            const pos = this.isoToScreen(charBubble.x, charBubble.y);

            // Process each bubble for this character
            for (const bubble of charBubble.bubbles) {
                this.ctx.font = `${fontSize}px Arial`;
                const words = bubble.text.split(' ');
                const lines = [];
                let currentLine = '';

                // Word wrap
                for (const word of words) {
                    const testLine = currentLine ? `${currentLine} ${word}` : word;
                    const metrics = this.ctx.measureText(testLine);
                    if (metrics.width > maxWidth && currentLine) {
                        lines.push(currentLine);
                        currentLine = word;
                    } else {
                        currentLine = testLine;
                    }
                }
                lines.push(currentLine);

                // Calculate bubble dimensions
                const bubbleHeight = lines.length * lineHeight + padding * 2;
                let bubbleWidth = 0;
                for (const line of lines) {
                    const metrics = this.ctx.measureText(line);
                    bubbleWidth = Math.max(bubbleWidth, metrics.width);
                }
                bubbleWidth += padding * 2;

                processedBubbles.push({
                    charX: pos.x,
                    charY: pos.y,
                    bubble: bubble,
                    lines: lines,
                    width: bubbleWidth,
                    height: bubbleHeight,
                    isNewest: bubble === charBubble.bubbles[charBubble.bubbles.length - 1]
                });
            }
        }

        // Sort bubbles by character Y position (higher Y = closer to camera = drawn last)
        processedBubbles.sort((a, b) => a.charY - b.charY);

        // Track occupied regions to avoid overlaps
        const occupiedRegions = [];

        // Draw each bubble
        for (const data of processedBubbles) {
            const baseX = data.charX - data.width / 2;
            let baseY = data.charY - (85 * this.scale) - data.height;

            // Check for overlaps and adjust Y position if needed
            let adjusted = true;
            while (adjusted) {
                adjusted = false;
                for (const region of occupiedRegions) {
                    // Check if bubbles overlap horizontally
                    const horizontalOverlap = !(baseX + data.width < region.x || baseX > region.x + region.width);

                    // Check if bubbles overlap vertically
                    const verticalOverlap = !(baseY + data.height < region.y || baseY > region.y + region.height);

                    if (horizontalOverlap && verticalOverlap) {
                        // Move this bubble up above the overlapping one
                        baseY = region.y - data.height - bubbleSpacing;
                        adjusted = true;
                        break;
                    }
                }
            }

            // Record this bubble's position
            occupiedRegions.push({
                x: baseX,
                y: baseY,
                width: data.width,
                height: data.height
            });

            // Calculate fade based on age
            const age = Date.now() - data.bubble.timestamp;
            const fadeStart = this.bubbleDuration - 1000;
            let opacity = 1;
            if (age > fadeStart) {
                opacity = Math.max(0, 1 - ((age - fadeStart) / 1000));
            }

            this.ctx.globalAlpha = opacity;

            // Draw bubble background
            this.ctx.fillStyle = 'white';
            this.ctx.strokeStyle = '#333';
            this.ctx.lineWidth = 2;

            // Draw rounded rectangle bubble
            this.ctx.beginPath();
            this.ctx.moveTo(baseX + radius, baseY);
            this.ctx.lineTo(baseX + data.width - radius, baseY);
            this.ctx.quadraticCurveTo(baseX + data.width, baseY, baseX + data.width, baseY + radius);
            this.ctx.lineTo(baseX + data.width, baseY + data.height - radius);
            this.ctx.quadraticCurveTo(baseX + data.width, baseY + data.height, baseX + data.width - radius, baseY + data.height);

            // Add tail for newest bubble
            if (data.isNewest) {
                this.ctx.lineTo(data.charX + 10, baseY + data.height);
                this.ctx.lineTo(data.charX, baseY + data.height + 10);
                this.ctx.lineTo(data.charX - 10, baseY + data.height);
            }

            this.ctx.lineTo(baseX + radius, baseY + data.height);
            this.ctx.quadraticCurveTo(baseX, baseY + data.height, baseX, baseY + data.height - radius);
            this.ctx.lineTo(baseX, baseY + radius);
            this.ctx.quadraticCurveTo(baseX, baseY, baseX + radius, baseY);
            this.ctx.closePath();

            this.ctx.fill();
            this.ctx.stroke();

            // Draw text
            this.ctx.fillStyle = '#000';
            this.ctx.font = `${fontSize}px Arial`;
            data.lines.forEach((line, lineIndex) => {
                const textX = baseX + padding;
                const textY = baseY + padding + lineIndex * lineHeight + fontSize * 0.75;
                this.ctx.fillText(line, textX, textY);
            });
        }

        // Reset global alpha
        this.ctx.globalAlpha = 1;
    }

    drawCharacter(x, y) {
        const pos = this.isoToScreen(x, y);

        if (this.useCustomCharacter && this.characterSprites.face) {
            // Use custom character sprites
            const sprite = this.getCustomSprite(this.player.direction);
            if (sprite) {
                const spriteScale = 0.08 * this.scale; // Scale with canvas
                const drawWidth = sprite.width * spriteScale;
                const drawHeight = sprite.height * spriteScale;

                this.ctx.drawImage(
                    sprite,
                    pos.x - drawWidth / 2,
                    pos.y - drawHeight + (30 * this.scale),  // Offset down more to touch the tile
                    drawWidth,
                    drawHeight
                );
            }
        } else {
            // Fallback to simple shape if no character selected
            const charHeight = 60 * this.scale;
            const charWidth = 20 * this.scale;
            const offsetY = 8 * this.scale; // Same offset for consistency

            this.ctx.fillStyle = '#333333';
            this.ctx.beginPath();
            this.ctx.ellipse(pos.x, pos.y + offsetY - 5, charWidth/2, 8, 0, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.fillStyle = '#FF6B6B';
            this.ctx.fillRect(pos.x - charWidth/2, pos.y + offsetY - charHeight, charWidth, charHeight - 10);

            this.ctx.fillStyle = '#FFD4A3';
            this.ctx.strokeStyle = '#333333';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y - charHeight, 10, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.fillStyle = '#333333';
            this.ctx.beginPath();
            this.ctx.arc(pos.x - 3, pos.y - charHeight, 1.5, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.arc(pos.x + 3, pos.y - charHeight, 1.5, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Name tag will be drawn in a separate pass to ensure it's above all characters
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = '#4A90E2';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw floor tiles
        for (let y = this.roomHeight - 1; y >= 0; y--) {
            for (let x = this.roomWidth - 1; x >= 0; x--) {
                const tileColor = (x + y) % 2 === 0 ? '#F0F0F0' : '#E0E0E0';
                this.drawTile(x, y, tileColor);
            }
        }

        // Draw the door entrance first
        this.drawDoor();

        // Draw overlay in background layer if set (after door so it covers it)
        if (this.overlayLayer === 'background') {
            this.drawOverlay();
        }

        // Collect all characters with their positions for depth sorting
        const charactersToRender = [];

        // Add player if not hidden
        if (!this.hideAllCharacters && !this.hidePlayer) {
            const playerPos = this.getInterpolatedPosition();
            charactersToRender.push({
                type: 'player',
                x: playerPos.x,
                y: playerPos.y,
                depth: playerPos.x + playerPos.y // Isometric depth calculation
            });
        }

        // Add visible NPCs if not hidden
        if (!this.hideAllCharacters) {
            for (const npc of Object.values(this.npcs)) {
                if (npc.visible) {
                    const npcPos = this.getNPCInterpolatedPosition(npc);
                    charactersToRender.push({
                        type: 'npc',
                        npc: npc,
                        x: npcPos.x,
                        y: npcPos.y,
                        depth: npcPos.x + npcPos.y // Isometric depth calculation
                    });
                }
            }
        }

        // Sort by depth (lower depth = further back, drawn first)
        charactersToRender.sort((a, b) => a.depth - b.depth);

        // Draw characters in sorted order (without speech bubbles)
        for (const char of charactersToRender) {
            if (char.type === 'player') {
                this.drawCharacter(char.x, char.y);
            } else {
                this.drawNPC(char.npc, char.x, char.y);
            }
        }

        // Draw all name tags in a separate pass (ensures they appear above all characters)
        if (this.showNameTags) {
            for (const char of charactersToRender) {
                const pos = this.isoToScreen(char.x, char.y);
                const name = char.type === 'player' ? this.player.name : char.npc.name;
                this.drawNameTag(name, pos.x, pos.y + (35 * this.scale));
            }
        }

        // Collect all speech bubbles with their positions
        const allBubbles = [];
        for (const char of charactersToRender) {
            if (char.type === 'player' && this.speechBubbles.length > 0) {
                allBubbles.push({
                    type: 'player',
                    x: char.x,
                    y: char.y,
                    bubbles: this.speechBubbles
                });
            } else if (char.type === 'npc' && char.npc.speechBubbles.length > 0) {
                allBubbles.push({
                    type: 'npc',
                    x: char.x,
                    y: char.y,
                    npc: char.npc,
                    bubbles: char.npc.speechBubbles
                });
            }
        }

        // Draw all speech bubbles with collision detection (after name tags so they appear on top)
        this.drawAllSpeechBubbles(allBubbles);

        // Draw overlay in foreground layer if set
        if (this.overlayLayer === 'foreground') {
            this.drawOverlay();
        }
    }
}

let gameInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    gameInstance = new HabboGame();
    loadAgentsList();
});

// Test function for buttons
function testNPCAction(actionType) {
    if (!gameInstance) return;

    // Create test NPCs if they don't exist
    if (!gameInstance.npcs['test-npc-1']) {
        gameInstance.createNPC('test-npc-1', 'TestBot1');
    }
    if (!gameInstance.npcs['test-npc-2']) {
        gameInstance.createNPC('test-npc-2', 'TestBot2');
    }

    // Execute action based on type
    switch(actionType) {
        case 'say':
            gameInstance.executeAction('test-npc-1', {
                type: 'say',
                content: 'Hello, I am a test NPC!'
            });
            break;

        case 'speak_to':
            gameInstance.executeAction('test-npc-1', {
                type: 'speak_to',
                target: 'test-npc-2',
                content: 'Hey TestBot2, how are you?'
            });
            break;

        case 'move':
            gameInstance.executeAction('test-npc-1', {
                type: 'move'
            });
            break;

        case 'enter':
            // Hide NPC first if visible
            if (gameInstance.npcs['test-npc-1']) {
                gameInstance.npcs['test-npc-1'].visible = false;
            }
            gameInstance.executeAction('test-npc-1', {
                type: 'enter',
                content: 'Hello everyone, I just arrived!'
            });
            break;

        case 'leave':
            gameInstance.executeAction('test-npc-1', {
                type: 'leave',
                content: 'Goodbye everyone!'
            });
            break;

        case 'nothing':
            gameInstance.executeAction('test-npc-1', {
                type: 'nothing'
            });
            console.log('Nothing action executed (no visible effect)');
            break;
    }
}

// Toggle functions for visibility
function togglePlayerVisibility() {
    if (!gameInstance) return;
    const checkbox = document.getElementById('hidePlayer');
    gameInstance.hidePlayer = checkbox.checked;
    gameInstance.render();
}

function toggleAllCharactersVisibility() {
    if (!gameInstance) return;
    const checkbox = document.getElementById('hideAllCharacters');
    gameInstance.hideAllCharacters = checkbox.checked;

    // If hiding all characters, also check the hide player checkbox
    if (checkbox.checked) {
        document.getElementById('hidePlayer').checked = true;
        document.getElementById('hidePlayer').disabled = true;
    } else {
        document.getElementById('hidePlayer').disabled = false;
    }

    gameInstance.render();
}

// Toggle side panel
function toggleSidePanel() {
    const panel = document.getElementById('sidePanel');
    const body = document.body;
    panel.classList.toggle('collapsed');

    // Toggle body class to adjust canvas position
    if (panel.classList.contains('collapsed')) {
        body.classList.remove('panel-expanded');
    } else {
        body.classList.add('panel-expanded');
    }
}

// Overlay control functions
function toggleOverlay() {
    if (!gameInstance) return;
    const checkbox = document.getElementById('showOverlay');
    gameInstance.showOverlay = checkbox.checked;
    gameInstance.render();
}

function updateOverlayOpacity(value) {
    if (!gameInstance) return;
    gameInstance.overlayOpacity = value / 100;
    document.getElementById('opacityValue').textContent = value + '%';
    gameInstance.render();
}

function updateOverlayLayer(layer) {
    if (!gameInstance) return;
    gameInstance.overlayLayer = layer;
    gameInstance.render();
}

function updateNameSize(value) {
    if (!gameInstance) return;
    gameInstance.nameSize = value / 100;
    document.getElementById('nameSizeValue').textContent = value + '%';
    gameInstance.render();
}

function updateBubbleSize(value) {
    if (!gameInstance) return;
    gameInstance.bubbleSize = value / 100;
    document.getElementById('bubbleSizeValue').textContent = value + '%';
    gameInstance.render();
}

function toggleNameTags() {
    if (!gameInstance) return;
    gameInstance.showNameTags = document.getElementById('showNameTags').checked;
    gameInstance.render();
}

function changeOverlay(overlayPath) {
    if (!gameInstance) return;

    if (overlayPath && overlayPath !== '') {
        // Load the new overlay
        gameInstance.loadOverlayImage(overlayPath);
        gameInstance.showOverlay = true;

        // Update the checkbox to reflect the state
        const checkbox = document.getElementById('showOverlay');
        if (checkbox) checkbox.checked = true;
    } else {
        // No overlay selected, hide it
        gameInstance.showOverlay = false;

        // Update the checkbox to reflect the state
        const checkbox = document.getElementById('showOverlay');
        if (checkbox) checkbox.checked = false;
    }

    gameInstance.render();
}

// Agent Management Functions
async function createAgent() {
    const nameInput = document.getElementById('agentName');
    const instructionsInput = document.getElementById('agentInstructions');

    const name = nameInput.value.trim();
    const instructions = instructionsInput.value.trim();

    if (!name || !instructions) {
        alert('Please provide both name and instructions for the agent');
        return;
    }

    try {
        const response = await fetch('/api/agents', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                instructions: instructions
            })
        });

        if (response.ok) {
            const agent = await response.json();
            console.log('Agent created:', agent);
            nameInput.value = '';
            instructionsInput.value = '';
            loadAgentsList();

            // Refresh game state to show new character
            if (gameInstance) {
                gameInstance.fetchAndProcessState();
            }
        } else {
            const error = await response.json();
            alert(`Failed to create agent: ${error.detail || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error creating agent:', error);
        alert('Failed to create agent');
    }
}

async function deleteAgent(agentId) {
    if (!confirm('Are you sure you want to delete this agent?')) {
        return;
    }

    try {
        const response = await fetch(`/api/agents/${agentId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            console.log('Agent deleted:', agentId);
            loadAgentsList();

            // Refresh game state
            if (gameInstance) {
                gameInstance.fetchAndProcessState();
            }
        } else {
            alert('Failed to delete agent');
        }
    } catch (error) {
        console.error('Error deleting agent:', error);
        alert('Failed to delete agent');
    }
}

async function loadAgentsList() {
    try {
        const response = await fetch('/api/agents');
        const agents = await response.json();

        const agentsList = document.getElementById('agentsList');
        if (!agentsList) return;

        if (agents.length === 0) {
            agentsList.innerHTML = '<div style="color: #666; font-size: 12px;">No agents yet</div>';
            return;
        }

        agentsList.innerHTML = agents.map(agent => `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; padding: 5px; background: #f0f0f0; border-radius: 3px;">
                <span style="font-size: 12px;">${agent.name}</span>
                <button onclick="deleteAgent('${agent.id}')" style="padding: 2px 8px; font-size: 11px; background: #ff6b6b; color: white; border: none; border-radius: 3px; cursor: pointer;">Delete</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading agents:', error);
    }
}

// Game control functions
async function startGame() {
    try {
        const response = await fetch('/api/game/start', { method: 'POST' });
        if (response.ok) {
            console.log('Game started');
        }
    } catch (error) {
        console.error('Error starting game:', error);
    }
}

async function stopGame() {
    try {
        const response = await fetch('/api/game/stop', { method: 'POST' });
        if (response.ok) {
            console.log('Game stopped');
        }
    } catch (error) {
        console.error('Error stopping game:', error);
    }
}

// Track auto-play state
let isAutoPlaying = false;

async function toggleAutoPlay() {
    const button = document.getElementById('toggleAutoPlayBtn');
    const icon = button.querySelector('i');

    if (isAutoPlaying) {
        // Stop the game
        await stopGame();
        isAutoPlaying = false;
        icon.className = 'nf nf-fa-play';
        button.style.background = '#4ECDC4';
    } else {
        // Start the game
        await startGame();
        isAutoPlaying = true;
        icon.className = 'nf nf-fa-pause';
        button.style.background = '#FF6B6B';
    }
}

async function executeTurn() {
    try {
        const response = await fetch('/api/game/turn', { method: 'POST' });
        if (response.ok) {
            const context = await response.json();
            console.log('Turn executed:', context);

            // Refresh game state
            if (gameInstance) {
                gameInstance.fetchAndProcessState();
            }
        }
    } catch (error) {
        console.error('Error executing turn:', error);
    }
}
