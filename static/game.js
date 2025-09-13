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
            direction: 4, // 0=SW, 1=NW, 2=NE, 3=SE(front), 4=SE(front-alt), 5=E, 6=NE(back), 7=N(back)
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

        this.speechBubble = {
            text: '',
            timer: null,
            duration: 5000 // 5 seconds
        };

        this.obstacles = []; // Array to store obstacles if needed
        this.animationFrame = null;

        this.init();
    }

    init() {
        this.loadSprite();
        this.setupControls();
        this.startGameLoop();
        this.render();
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

    setupControls() {
        document.getElementById('moveUp').addEventListener('click', () => this.movePlayer(0, -1));
        document.getElementById('moveDown').addEventListener('click', () => this.movePlayer(0, 1));
        document.getElementById('moveLeft').addEventListener('click', () => this.movePlayer(-1, 0));
        document.getElementById('moveRight').addEventListener('click', () => this.movePlayer(1, 0));

        document.getElementById('dirNW').addEventListener('click', () => this.setDirection(1));
        document.getElementById('dirNE').addEventListener('click', () => this.setDirection(2));
        document.getElementById('dirSE').addEventListener('click', () => this.setDirection(4));
        document.getElementById('dirSW').addEventListener('click', () => this.setDirection(0));

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
        this.player.direction = dir;
        document.getElementById('currentDirection').textContent = `Current: ${this.directionNames[dir]}`;
        this.render();
    }

    cycleDirection(delta) {
        this.player.direction = (this.player.direction + delta + 8) % 8;
        document.getElementById('currentDirection').textContent = `Current: ${this.directionNames[this.player.direction]}`;
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

        // Update direction based on movement
        const dx = nextTile.x - this.player.x;
        const dy = nextTile.y - this.player.y;

        if (dx > 0 && dy === 0) {
            this.setDirection(4); // SE
        } else if (dx < 0 && dy === 0) {
            this.setDirection(1); // NW
        } else if (dx === 0 && dy > 0) {
            this.setDirection(0); // SW
        } else if (dx === 0 && dy < 0) {
            this.setDirection(2); // NE
        } else if (dx > 0 && dy > 0) {
            this.setDirection(4); // SE
        } else if (dx < 0 && dy < 0) {
            this.setDirection(2); // NE
        } else if (dx > 0 && dy < 0) {
            this.setDirection(4); // SE
        } else if (dx < 0 && dy > 0) {
            this.setDirection(0); // SW
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

    drawWalls() {
        this.ctx.fillStyle = '#D4D4D4';
        this.ctx.strokeStyle = '#AAAAAA';
        this.ctx.lineWidth = 1;

        const wallHeight = 80;

        for (let x = 0; x < this.roomWidth; x++) {
            const pos = this.isoToScreen(x, 0);

            this.ctx.beginPath();
            this.ctx.moveTo(pos.x - this.tileWidth/2, pos.y + this.tileHeight/2);
            this.ctx.lineTo(pos.x, pos.y);
            this.ctx.lineTo(pos.x, pos.y - wallHeight);
            this.ctx.lineTo(pos.x - this.tileWidth/2, pos.y - wallHeight + this.tileHeight/2);
            this.ctx.closePath();

            this.ctx.fill();
            this.ctx.stroke();
        }

        this.ctx.fillStyle = '#C8C8C8';

        for (let y = 0; y < this.roomHeight; y++) {
            const pos = this.isoToScreen(0, y);

            this.ctx.beginPath();
            this.ctx.moveTo(pos.x - this.tileWidth/2, pos.y + this.tileHeight/2);
            this.ctx.lineTo(pos.x, pos.y + this.tileHeight);
            this.ctx.lineTo(pos.x, pos.y + this.tileHeight - wallHeight);
            this.ctx.lineTo(pos.x - this.tileWidth/2, pos.y + this.tileHeight/2 - wallHeight);
            this.ctx.closePath();

            this.ctx.fill();
            this.ctx.stroke();
        }
    }

    say(message) {
        this.speechBubble.text = message;

        // Clear existing timer
        if (this.speechBubble.timer) {
            clearTimeout(this.speechBubble.timer);
        }

        // Set timer to clear bubble after duration
        this.speechBubble.timer = setTimeout(() => {
            this.speechBubble.text = '';
            this.render();
        }, this.speechBubble.duration);

        this.render();
    }

    drawSpeechBubble(x, y) {
        if (!this.speechBubble.text) return;

        const pos = this.isoToScreen(x, y);
        const bubbleY = pos.y - 120; // Position above character
        const padding = 10;
        const maxWidth = 200;

        // Set font and measure text
        this.ctx.font = '14px Arial';
        const words = this.speechBubble.text.split(' ');
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
        const lineHeight = 18;
        const bubbleHeight = lines.length * lineHeight + padding * 2;
        let bubbleWidth = 0;

        for (const line of lines) {
            const metrics = this.ctx.measureText(line);
            bubbleWidth = Math.max(bubbleWidth, metrics.width);
        }
        bubbleWidth += padding * 2;

        // Draw bubble background
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 2;

        // Bubble with rounded corners
        const radius = 10;
        const bubbleX = pos.x - bubbleWidth / 2;

        this.ctx.beginPath();
        this.ctx.moveTo(bubbleX + radius, bubbleY);
        this.ctx.lineTo(bubbleX + bubbleWidth - radius, bubbleY);
        this.ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY, bubbleX + bubbleWidth, bubbleY + radius);
        this.ctx.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight - radius);
        this.ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight, bubbleX + bubbleWidth - radius, bubbleY + bubbleHeight);

        // Tail pointing to character
        this.ctx.lineTo(pos.x + 10, bubbleY + bubbleHeight);
        this.ctx.lineTo(pos.x, bubbleY + bubbleHeight + 10);
        this.ctx.lineTo(pos.x - 10, bubbleY + bubbleHeight);

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
        lines.forEach((line, index) => {
            const textX = pos.x - this.ctx.measureText(line).width / 2;
            const textY = bubbleY + padding + (index + 1) * lineHeight - 2;
            this.ctx.fillText(line, textX, textY);
        });
    }

    drawCharacter(x, y) {
        const pos = this.isoToScreen(x, y);

        if (this.spriteReady) {
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

        this.drawWalls();

        // Draw floor tiles
        for (let y = this.roomHeight - 1; y >= 0; y--) {
            for (let x = this.roomWidth - 1; x >= 0; x--) {
                const tileColor = (x + y) % 2 === 0 ? '#F0F0F0' : '#E0E0E0';
                this.drawTile(x, y, tileColor);
            }
        }

        // Draw character at interpolated position
        const playerPos = this.getInterpolatedPosition();
        this.drawCharacter(playerPos.x, playerPos.y);
        this.drawSpeechBubble(playerPos.x, playerPos.y);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new HabboGame();
});