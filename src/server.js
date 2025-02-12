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
const players = new Map();
const powerUps = new Set();

function getColorByScore(score) {
    if (score >= 100) return ['#FF0000', '#FFA500', '#FFFF00', '#008000', '#0000FF', '#4B0082', '#9400D3'];
    if (score >= 90) return '#FFD700';
    if (score >= 80) return '#C0C0C0';
    if (score >= 70) return '#9400D3';
    if (score >= 60) return '#4B0082';
    if (score >= 50) return '#0000FF';
    if (score >= 40) return '#008000';
    if (score >= 30) return '#FFFF00';
    if (score >= 20) return '#FFA500';
    return '#FF0000';
}

setInterval(() => {
    if (powerUps.size < 5) {
        powerUps.add({
            id: Date.now(),
            x: Math.random() * 800,
            y: Math.random() * 600,
            type: ['speed', 'double', 'invisible'][Math.floor(Math.random() * 3)]
        });
        io.emit('powerUpSpawn', Array.from(powerUps));
    }
}, 10000);

io.on('connection', (socket) => {
    socket.on('playerJoin', (data) => {
        players.set(socket.id, {
            id: socket.id,
            name: data.name,
            breed: data.breed,
            x: Math.random() * 800,
            y: Math.random() * 600,
            size: FIXED_SIZE,
            score: 0,
            color: '#FF0000',
            powerUps: {}
        });
        io.emit('gameState', Array.from(players.values()));
    });

    socket.on('update', (data) => {
        const player = players.get(socket.id);
        if (player) {
            player.x = data.x;
            player.y = data.y;
            io.emit('gameState', Array.from(players.values()));
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
            
            attacker.score = Math.min(MAX_LEVEL, attacker.score + points);
            attacker.color = getColorByScore(attacker.score);
            
            if (attacker.powerUps.double) points *= 2;
            
            io.emit('gameState', Array.from(players.values()));
        }
    });

    socket.on('disconnect', () => {
        players.delete(socket.id);
        io.emit('gameState', Array.from(players.values()));
    });
});

http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
