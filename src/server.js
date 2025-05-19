const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

// Create the Express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve the game HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Game state
const players = {};
const foodItems = {};
const battles = {};

// Game constants
const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;
const FOOD_COUNT = 20;
const PLAYER_SPEED = 5;
const BATTLE_THRESHOLD = 0.5; // Position change per space bar press

// Initialize food items
function initializeFood() {
  for (let i = 0; i < FOOD_COUNT; i++) {
    spawnFood();
  }
}

// Spawn a food item
function spawnFood() {
  const foodId = 'food-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  foodItems[foodId] = {
    id: foodId,
    x: Math.floor(Math.random() * (WORLD_WIDTH - 50) + 25),
    y: Math.floor(Math.random() * (WORLD_HEIGHT - 50) + 25)
  };
}

// Check if player can collect food
function checkFoodCollection(player) {
  const playerSize = 30 + (player.level * 5);
  const collectRange = playerSize / 2;
  
  for (let foodId in foodItems) {
    const food = foodItems[foodId];
    const dx = player.x - food.x;
    const dy = player.y - food.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < collectRange) {
      // Food collected
      delete foodItems[foodId];
      io.emit('foodCollected', { playerId: player.id, foodId });
      spawnFood(); // Spawn new food to maintain food count
      return true;
    }
  }
  return false;
}

// Check if players can battle
function checkPlayerBattle(playerId) {
  const player = players[playerId];
  if (!player) return false;
  
  const playerSize = 30 + (player.level * 5);
  const attackRange = playerSize;
  
  for (let id in players) {
    if (id !== playerId) {
      const otherPlayer = players[id];
      const dx = player.x - otherPlayer.x;
      const dy = player.y - otherPlayer.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Only start a battle if players are close and not currently in battle
      if (distance < attackRange && !player.inBattle && !otherPlayer.inBattle) {
        startBattle(playerId, id);
        return true;
      }
    }
  }
  return false;
}

// Start a battle between two players
function startBattle(player1Id, player2Id) {
  const battleId = `battle-${Date.now()}`;
  
  // Set players as in battle
  players[player1Id].inBattle = true;
  players[player2Id].inBattle = true;
  
  // Create battle object
  battles[battleId] = {
    id: battleId,
    player1: player1Id,
    player2: player2Id,
    position: 50, // Start in the middle
    player1Input: 0,
    player2Input: 0,
    startTime: Date.now(),
    timer: setTimeout(() => endBattle(battleId), 15000) // Battle timeout of 15 seconds
  };
  
  // Notify players of battle start
  io.to(player1Id).emit('battleStart', { battleId, opponent: players[player2Id].level });
  io.to(player2Id).emit('battleStart', { battleId, opponent: players[player1Id].level });
}

// Process battle input
function processBattleInput(battleId, playerId, inputCount) {
  const battle = battles[battleId];
  if (!battle) return;
  
  // Update player input
  if (playerId === battle.player1) {
    battle.player1Input = inputCount;
  } else if (playerId === battle.player2) {
    battle.player2Input = inputCount;
  }
  
  // Calculate new position based on level-weighted inputs
  const player1 = players[battle.player1];
  const player2 = players[battle.player2];
  
  const player1Force = battle.player1Input * (player1.level / 3);
  const player2Force = battle.player2Input * (player2.level / 3);
  
  const totalForce = player1Force + player2Force;
  if (totalForce > 0) {
    const newPosition = 50 + ((player1Force - player2Force) / totalForce) * 30;
    battle.position = Math.max(10, Math.min(90, newPosition));
  }
  
  // Broadcast battle update
  io.to(battle.player1).emit('battleUpdate', { battleId, position: battle.position });
  io.to(battle.player2).emit('battleUpdate', { battleId, position: battle.position });
  
  // Check if battle is won
  if (battle.position <= 10) {
    // Player 2 wins
    clearTimeout(battle.timer);
    endBattle(battleId, battle.player2);
  } else if (battle.position >= 90) {
    // Player 1 wins
    clearTimeout(battle.timer);
    endBattle(battleId, battle.player1);
  }
}

// End a battle
function endBattle(battleId, winnerId = null) {
  const battle = battles[battleId];
  if (!battle) return;
  
  // If no winner was determined by position, determine by input count
  if (!winnerId) {
    const player1Force = battle.player1Input * players[battle.player1].level;
    const player2Force = battle.player2Input * players[battle.player2].level;
    winnerId = player1Force > player2Force ? battle.player1 : battle.player2;
  }
  
  // Release players from battle
  players[battle.player1].inBattle = false;
  players[battle.player2].inBattle = false;
  
  // Notify players of battle result
  io.to(battle.player1).emit('battleEnd', { battleId, winner: winnerId });
  io.to(battle.player2).emit('battleEnd', { battleId, winner: winnerId });
  
  // Clean up battle
  delete battles[battleId];
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  // Handle player spawn
  socket.on('spawn', (data) => {
    players[socket.id] = {
      id: socket.id,
      x: data.x,
      y: data.y,
      level: data.level || 1,
      inBattle: false
    };
    
    // Send initial game state
    socket.emit('gameState', { players, foodItems });
    
    // Broadcast new player to others
    socket.broadcast.emit('gameState', { players, foodItems });
  });
  
  // Handle player movement
  socket.on('playerMove', (movement) => {
    const player = players[socket.id];
    if (!player || player.inBattle) return;
    
    // Adjust movement speed based on level (bigger dogs move slower)
    const speed = PLAYER_SPEED * (1 - (player.level - 1) * 0.05);
    
    // Update player position
    if (movement.up) player.y = Math.max(20, player.y - speed);
    if (movement.down) player.y = Math.min(WORLD_HEIGHT - 20, player.y + speed);
    if (movement.left) player.x = Math.max(20, player.x - speed);
    if (movement.right) player.x = Math.min(WORLD_WIDTH - 20, player.x + speed);
    
    // Check for food collection
    checkFoodCollection(player);
    
    // Broadcast updated game state
    io.emit('gameState', { players, foodItems });
  });
  
  // Handle level up
  socket.on('levelUp', (data) => {
    if (players[socket.id]) {
      players[socket.id].level = data.level;
      io.emit('gameState', { players, foodItems });
    }
  });
  
  // Handle attack attempt
  socket.on('tryAttack', () => {
    checkPlayerBattle(socket.id);
  });
  
  // Handle battle input
  socket.on('battleInput', (data) => {
    processBattleInput(data.battleId, socket.id, data.count);
  });
  
  // Handle player disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Clean up any active battles
    for (let battleId in battles) {
      const battle = battles[battleId];
      if (battle.player1 === socket.id || battle.player2 === socket.id) {
        const winnerId = battle.player1 === socket.id ? battle.player2 : battle.player1;
        endBattle(battleId, winnerId);
      }
    }
    
    // Remove player
    delete players[socket.id];
    
    // Broadcast player removal
    io.emit('gameState', { players, foodItems });
  });
});

// Initialize food
initializeFood();

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
