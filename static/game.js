class HabboGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        this.roomWidth = 10;
        this.roomHeight = 10;
        this.tileWidth = 64;
        this.tileHeight = 32;

        this.player = {
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

        this.directions = {
            'SW': 0,
            'NW': 1,
            'NE': 2,
            'SE': 4,
            'E': 5,
            'NE_BACK': 6,
            'N': 7
        };

        this.directionNames = ['SW', 'NW', 'NE', 'SE', 'SE', 'E', 'NE', 'N'];

        this.offsetX = this.canvas.width / 2;
        this.offsetY = 150;

        this.spriteSheet = null;
        this.spriteWidth = 155;
        this.spriteHeight = 310;
        this.spriteReady = false;

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

        this.init();
    }

    async init() {
        await this.loadCharacterList();
        this.loadSprite();
        this.setupControls();
        this.startGameLoop();
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

    loadSprite() {
        this.spriteSheet = new Image();
        this.spriteSheet.onload = () => {
            this.spriteReady = true;
            this.render();
        };
        this.spriteSheet.src = '/static/sprite.png';
    }

    getSprite(direction) {
        if (!this.spriteReady) return null;

        return {
            img: this.spriteSheet,
            sx: direction * this.spriteWidth,
            sy: 0,
            sw: this.spriteWidth,
            sh: this.spriteHeight
        };
    }

    getCustomSprite(direction) {
        // If character is speaking (has active bubbles), show face sprite
        if (this.speechBubbles.length > 0) {
            return this.characterSprites['face'];
        }

        // We only have 5 sprites: face, top-left, top-right, bot-left, bot-right
        // Direction should already be a string like 'bot-left', 'top-right', etc.

        if (typeof direction === 'string') {
            // If it's already a valid sprite name, use it
            if (this.characterSprites[direction]) {
                return this.characterSprites[direction];
            }
        }

        // Default to bot-left if anything goes wrong
        return this.characterSprites['bot-left'];
    }

    setupControls() {
        // Only keyboard controls for movement
        document.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'ArrowUp':
                case 'w':
                    this.movePlayer(0, -1);
                    break;
                case 'ArrowDown':
                case 's':
                    this.movePlayer(0, 1);
                    break;
                case 'ArrowLeft':
                case 'a':
                    this.movePlayer(-1, 0);
                    break;
                case 'ArrowRight':
                case 'd':
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

    drawDoor() {
        // Draw a black door in the middle of the left wall (entrance)
        const doorHeight = 70;

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
                this.render();
            }
        }, this.bubbleDuration);

        this.render();
    }

    drawSpeechBubbles(x, y) {
        if (this.speechBubbles.length === 0) return;

        const pos = this.isoToScreen(x, y);
        const padding = 10;
        const maxWidth = 200;
        const lineHeight = 18;
        const bubbleSpacing = 5;
        const radius = 10;

        // Calculate total height and process bubbles
        let totalHeight = 0;
        const bubblesData = [];

        this.speechBubbles.forEach((bubble) => {
            this.ctx.font = '14px Arial';
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
        let currentY = pos.y - 120 - totalHeight;

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

            // Draw text
            this.ctx.fillStyle = '#333';
            this.ctx.font = '14px Arial';
            lines.forEach((line, lineIndex) => {
                const textX = bubbleX + padding;
                const textY = bubbleY + padding + (lineIndex + 1) * lineHeight - 2;
                this.ctx.fillText(line, textX, textY);
            });

            currentY += bubbleHeight + bubbleSpacing;
        });

        // Reset global alpha
        this.ctx.globalAlpha = 1;
    }

    drawCharacter(x, y) {
        const pos = this.isoToScreen(x, y);

        if (this.useCustomCharacter && this.characterSprites.face) {
            // Use custom character sprites
            const sprite = this.getCustomSprite(this.player.direction);
            if (sprite) {
                const scale = 0.08; // Even smaller scale for custom sprites
                const drawWidth = sprite.width * scale;
                const drawHeight = sprite.height * scale;

                this.ctx.drawImage(
                    sprite,
                    pos.x - drawWidth / 2,
                    pos.y - drawHeight + 20,
                    drawWidth,
                    drawHeight
                );
            }
        } else if (this.spriteReady) {
            // Use default sprite sheet
            const sprite = this.getSprite(this.player.direction);
            if (sprite) {
                const scale = 0.35;
                const drawWidth = sprite.sw * scale;
                const drawHeight = sprite.sh * scale;

                this.ctx.drawImage(
                    sprite.img,
                    sprite.sx, sprite.sy, sprite.sw, sprite.sh,
                    pos.x - drawWidth / 2,
                    pos.y - drawHeight + 20,
                    drawWidth,
                    drawHeight
                );
            }
        } else {
            // Fallback to simple shape
            const charHeight = 60;
            const charWidth = 20;

            this.ctx.fillStyle = '#333333';
            this.ctx.beginPath();
            this.ctx.ellipse(pos.x, pos.y - 5, charWidth/2, 8, 0, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.fillStyle = '#FF6B6B';
            this.ctx.fillRect(pos.x - charWidth/2, pos.y - charHeight, charWidth, charHeight - 10);

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

        // Draw the door entrance
        this.drawDoor();

        // Draw character at interpolated position
        const playerPos = this.getInterpolatedPosition();
        this.drawCharacter(playerPos.x, playerPos.y);
        this.drawSpeechBubbles(playerPos.x, playerPos.y);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new HabboGame();
});