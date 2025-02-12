const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;
app.use(express.static('public'));

const FIXED_SIZE = 30;
const MAX_LEVEL = 100;
const POWER_UP_DURATION = 5000;
const players = new Map();
const powerUps = new Set();
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

// Power-up types and their colors
const POWER_UP_TYPES = {
    speed: { color: '#00FF00', multiplier: 1.5 },
    double: { color: '#FFD700', multiplier: 2 },
    invisible: { color: '#4B0082', alpha: 0.5 }
};

function getColorByScore(score) {
    if (score >= 100) return {
        type: 'rainbow',
        colors: ['#FF0000', '#FFA500', '#FFFF00', '#008000', '#0000FF', '#4B0082', '#9400D3']
    };
    if (score >= 90) return { type: 'solid', color: '#FFD700' };
    if (score >= 80) return { type: 'solid', color: '#C0C0C0' };
    if (score >= 70) return { type: 'solid', color: '#9400D3' };
    if (score >= 60) return { type: 'solid', color: '#4B0082' };
    if (score >= 50) return { type: 'solid', color: '#0000FF' };
    if (score >= 40) return { type: 'solid', color: '#008000' };
    if (score >= 30) return { type: 'solid', color: '#FFFF00' };
    if (score >= 20) return { type: 'solid', color: '#FFA500' };
    return { type: 'solid', color: '#FF0000' };
}

// Spawn power-ups every 10 seconds
setInterval(() => {
    if (powerUps.size < 5) {
        const powerUp = {
            id: Date.now(),
            x: Math.random() * (GAME_WIDTH - 40) + 20,
            y: Math.random() * (GAME_HEIGHT - 40) + 20,
            type: Object.keys(POWER_UP_TYPES)[Math.floor(Math.random() * 3)]
        };
        powerUps.add(powerUp);
        io.emit('powerUpSpawn', Array.from(powerUps));
    }
}, 10000);

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('playerJoin', (data) => {
        const spawnX = Math.random() * (GAME_WIDTH - 100) + 50;
        const spawnY = Math.random() * (GAME_HEIGHT - 100) + 50;

        players.set(socket.id, {
            id: socket.id,
            name: data.name,
            breed: data.breed,
            x: spawnX,
            y: spawnY,
            size: FIXED_SIZE,
            score: 0,
            color: getColorByScore(0),
            powerUps: {},
            lastUpdate: Date.now()
        });
        io.emit('gameState', Array.from(players.values()));
    });

    socket.on('update', (data) => {
        const player = players.get(socket.id);
        if (player) {
            const now = Date.now();
            const deltaTime = now - player.lastUpdate;
            
            // Smooth movement with delta time
            player.x = data.x;
            player.y = data.y;
            player.lastUpdate = now;

            // Check power-up collection
            powerUps.forEach(powerUp => {
                const dx = player.x - powerUp.x;
                const dy = player.y - powerUp.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < player.size + 10) {
                    player.powerUps[powerUp.type] = true;
                    powerUps.delete(powerUp);
                    
                    setTimeout(() => {
                        player.powerUps[powerUp.type] = false;
                        io.to(socket.id).emit('powerUpExpired', powerUp.type);
                    }, POWER_UP_DURATION);

                    io.emit('powerUpCollected', {
                        playerId: socket.id,
                        powerUpId: powerUp.id,
                        type: powerUp.type
                    });
                }
            });

            io.emit('gameState', Array.from(players.values()));
            io.emit('powerUpSpawn', Array.from(powerUps));
        }
    });

    socket.on('maulAttempt', (targetId) => {
        const attacker = players.get(socket.id);
        const target = players.get(targetId);
        
        if (attacker && target) {
            const scoreDiff = Math.abs(attacker.score - target.score);
            const requiredClicks = Math.max(10, Math.min(30, 20 + scoreDiff));
            
            io.to(socket.id).emit('startMaulMinigame', {
                attackerId: socket.id,
                targetId: targetId,
                requiredClicks: requiredClicks
            });
        }
    });

    socket.on('maulComplete', (data) => {
        const attacker = players.get(socket.id);
        const target = players.get(data.targetId);
        
        if (attacker && target) {
            let points = 1;
            if (attacker.score === target.score) points = 2;
            if (attacker.score < target.score) points = 3;
            
            if (attacker.powerUps.double) points *= 2;
            
            attacker.score = Math.min(MAX_LEVEL, attacker.score + points);
            attacker.color = getColorByScore(attacker.score);
            
            io.emit('gameState', Array.from(players.values()));
            io.to(data.targetId).emit('mauled', { attackerId: socket.id });
        }
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        players.delete(socket.id);
        io.emit('gameState', Array.from(players.values()));
    });
});

http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
