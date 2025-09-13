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
            color: '#FF6B6B'
        };

        this.offsetX = this.canvas.width / 2;
        this.offsetY = 150;

        this.init();
    }

    init() {
        this.setupControls();
        this.render();
    }

    setupControls() {
        document.getElementById('moveUp').addEventListener('click', () => this.movePlayer(0, -1));
        document.getElementById('moveDown').addEventListener('click', () => this.movePlayer(0, 1));
        document.getElementById('moveLeft').addEventListener('click', () => this.movePlayer(-1, 0));
        document.getElementById('moveRight').addEventListener('click', () => this.movePlayer(1, 0));

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
            }
        });

        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            this.handleCanvasClick(x, y);
        });
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
                        this.player.x = x;
                        this.player.y = y;
                        this.render();
                        return;
                    }
                }
            }
        }
    }

    movePlayer(dx, dy) {
        const newX = this.player.x + dx;
        const newY = this.player.y + dy;

        if (newX >= 0 && newX < this.roomWidth && newY >= 0 && newY < this.roomHeight) {
            this.player.x = newX;
            this.player.y = newY;
            this.render();
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

    drawCharacter(x, y) {
        const pos = this.isoToScreen(x, y);

        const charHeight = 60;
        const charWidth = 20;

        this.ctx.fillStyle = this.player.color;
        this.ctx.strokeStyle = '#333333';
        this.ctx.lineWidth = 2;

        this.ctx.fillStyle = '#333333';
        this.ctx.beginPath();
        this.ctx.ellipse(pos.x, pos.y - 5, charWidth/2, 8, 0, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.fillStyle = this.player.color;
        this.ctx.fillRect(pos.x - charWidth/2, pos.y - charHeight, charWidth, charHeight - 10);

        this.ctx.fillStyle = '#FFD4A3';
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

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = '#4A90E2';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.drawWalls();

        for (let y = this.roomHeight - 1; y >= 0; y--) {
            for (let x = this.roomWidth - 1; x >= 0; x--) {
                const tileColor = (x + y) % 2 === 0 ? '#F0F0F0' : '#E0E0E0';
                this.drawTile(x, y, tileColor);

                if (this.player.x === x && this.player.y === y) {
                    this.drawCharacter(x, y);
                }
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new HabboGame();
});