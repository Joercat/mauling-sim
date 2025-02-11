const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const players = new Map();

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    
    players.set(socket.id, {
        id: socket.id,
        x: Math.random() * 800,
        y: Math.random() * 600,
        size: 20,
        score: 0,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`
    });

    socket.on('update', (data) => {
        const player = players.get(socket.id);
        if (player) {
            player.x = data.x;
            player.y = data.y;
            
            players.forEach((otherPlayer, id) => {
                if (id !== socket.id) {
                    const dx = player.x - otherPlayer.x;
                    const dy = player.y - otherPlayer.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < player.size + otherPlayer.size && player.size > otherPlayer.size) {
                        player.size += 2;
                        player.score += 10;
                        players.delete(id);
                        io.to(id).emit('mauled');
                    }
                }
            });
        }
        io.emit('gameState', Array.from(players.values()));
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        players.delete(socket.id);
    });
});

http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
