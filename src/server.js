<!DOCTYPE html>
<html>
<head>
    <title>Mauling Simulator</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.5.1/socket.io.js"></script>
    <style>
        body {
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: #f0f0f0;
            font-family: Arial, sans-serif;
        }
        
        canvas {
            border: 3px solid #333;
            border-radius: 10px;
            background: white;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        
        #gameOver {
            display: none;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 32px;
            color: #ff3333;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            background: rgba(255,255,255,0.9);
            padding: 20px 40px;
            border-radius: 10px;
            cursor: pointer;
        }
        
        #score {
            position: absolute;
            top: 20px;
            right: 20px;
            font-size: 24px;
            color: #333;
        }
        
        #instructions {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            color: #666;
            text-align: center;
        }
    </style>
</head>
<body>
    <div id="score">Score: 0</div>
    <canvas id="gameCanvas"></canvas>
    <div id="gameOver">Game Over! Click to respawn</div>
    <div id="instructions">Use arrow keys to move | Maul smaller dogs to grow</div>

    <script>
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        const gameOverDiv = document.getElementById('gameOver');
        const scoreDiv = document.getElementById('score');

        canvas.width = 800;
        canvas.height = 600;

        const socket = io('http://localhost:3000');

        let player = {
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: 20,
            score: 0,
            color: `hsl(${Math.random() * 360}, 70%, 50%)`
        };

        let players = [];
        let gameOver = false;

        function drawDog(x, y, size, color) {
            // Body
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
            
            // Ears
            ctx.fillStyle = `hsl(${color.match(/\d+/)[0]}, 70%, 40%)`;
            ctx.beginPath();
            ctx.arc(x - size/2, y - size/2, size/3, 0, Math.PI * 2);
            ctx.arc(x + size/2, y - size/2, size/3, 0, Math.PI * 2);
            ctx.fill();
            
            // Eyes
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(x - size/3, y - size/6, size/6, 0, Math.PI * 2);
            ctx.arc(x + size/3, y - size/6, size/6, 0, Math.PI * 2);
            ctx.fill();
            
            // Pupils
            ctx.fillStyle = 'black';
            ctx.beginPath();
            ctx.arc(x - size/3, y - size/6, size/12, 0, Math.PI * 2);
            ctx.arc(x + size/3, y - size/6, size/12, 0, Math.PI * 2);
            ctx.fill();
            
            // Nose
            ctx.fillStyle = 'black';
            ctx.beginPath();
            ctx.arc(x, y + size/4, size/6, 0, Math.PI * 2);
            ctx.fill();
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw grid
            ctx.strokeStyle = '#eee';
            for(let i = 0; i < canvas.width; i += 50) {
                ctx.beginPath();
                ctx.moveTo(i, 0);
                ctx.lineTo(i, canvas.height);
                ctx.stroke();
            }
            for(let i = 0; i < canvas.height; i += 50) {
                ctx.beginPath();
                ctx.moveTo(0, i);
                ctx.lineTo(canvas.width, i);
                ctx.stroke();
            }
            
            players.forEach(p => {
                drawDog(p.x, p.y, p.size, p.color || '#8B4513');
                
                ctx.fillStyle = 'black';
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`Score: ${p.score}`, p.x, p.y + p.size + 20);
            });
        }

        function update() {
            if (!gameOver) {
                const speed = 5;
                if (keys.ArrowLeft) player.x -= speed;
                if (keys.ArrowRight) player.x += speed;
                if (keys.ArrowUp) player.y -= speed;
                if (keys.ArrowDown) player.y += speed;
                
                player.x = Math.max(player.size, Math.min(canvas.width - player.size, player.x));
                player.y = Math.max(player.size, Math.min(canvas.height - player.size, player.y));
                
                socket.emit('update', player);
                scoreDiv.textContent = `Score: ${player.score}`;
            }
        }

        const keys = {};
        window.addEventListener('keydown', e => keys[e.key] = true);
        window.addEventListener('keyup', e => keys[e.key] = false);

        socket.on('gameState', (state) => {
            players = state;
            const currentPlayer = players.find(p => p.id === socket.id);
            if (currentPlayer) {
                player.size = currentPlayer.size;
                player.score = currentPlayer.score;
            }
        });

        socket.on('mauled', () => {
            gameOver = true;
            gameOverDiv.style.display = 'block';
        });

        canvas.addEventListener('click', () => {
            if (gameOver) {
                gameOver = false;
                gameOverDiv.style.display = 'none';
                player = {
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    size: 20,
                    score: 0,
                    color: `hsl(${Math.random() * 360}, 70%, 50%)`
                };
            }
        });

        function gameLoop() {
            update();
            draw();
            requestAnimationFrame(gameLoop);
        }

        // Add visual feedback on hover
        gameOverDiv.addEventListener('mouseover', () => {
            gameOverDiv.style.transform = 'translate(-50%, -50%) scale(1.1)';
        });
        
        gameOverDiv.addEventListener('mouseout', () => {
            gameOverDiv.style.transform = 'translate(-50%, -50%) scale(1)';
        });

        gameLoop();
    </script>
</body>
</html>
