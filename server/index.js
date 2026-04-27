const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const RoomManager = require('./RoomManager');
const mapConfig = require('../shared/mapConfig.json');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

const roomManager = new RoomManager();

// 静态文件服务
app.use(express.static(path.join(__dirname, '../client')));

// REST API
app.get('/api/map-config', (req, res) => {
  res.json(mapConfig);
});

app.get('/api/rooms', (req, res) => {
  res.json(roomManager.getAllRooms());
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Socket.io 事件处理
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  
  let currentRoomId = null;
  let currentPlayerId = socket.id;

  // 加入房间
  socket.on('room:join', (data, callback) => {
    const { roomId, playerName } = data;
    
    if (!roomId) {
      callback({ success: false, error: 'Room ID required' });
      return;
    }

    const result = roomManager.joinRoom(roomId, currentPlayerId, playerName);
    
    if (result.success) {
      currentRoomId = roomId;
      socket.join(roomId);
      
      // 发送房间状态给加入的玩家
      callback({
        success: true,
        playerId: currentPlayerId,
        room: roomManager.getRoomState(roomId),
        mapConfig: mapConfig
      });

      // 如果房间满了，开始倒计时
      if (result.room.players.size === 2) {
        roomManager.startCountdown(roomId);
        
        let count = 3;
        
        // 发送初始倒计时
        io.to(roomId).emit('game:countdown', { countdown: count });
        
        // 每秒更新倒计时
        const countdownInterval = setInterval(() => {
          count--;
          if (count > 0) {
            io.to(roomId).emit('game:countdown', { countdown: count });
          } else {
            clearInterval(countdownInterval);
            // 倒计时结束，开始游戏
            roomManager.startGame(roomId);
            io.to(roomId).emit('game:start', {
              room: roomManager.getRoomState(roomId)
            });
          }
        }, 1000);
      }
    } else {
      callback({ success: false, error: result.reason });
    }
  });

  // 离开房间
  socket.on('room:leave', (callback) => {
    if (currentRoomId) {
      roomManager.leaveRoom(currentPlayerId);
      socket.leave(currentRoomId);
      
      // 通知房间内的其他玩家
      socket.to(currentRoomId).emit('player:left', {
        playerId: currentPlayerId
      });
      
      io.to(currentRoomId).emit('game:end', {
        reason: 'player_left',
        winner: null
      });
      
      currentRoomId = null;
    }
    callback && callback({ success: true });
  });

  // 游戏开始事件
  socket.on('game:start', (callback) => {
    const room = roomManager.getPlayerRoom(currentPlayerId);
    if (room && room.gamePhase === 'waiting') {
      roomManager.startCountdown(room.id);
      callback({ success: true });
    } else {
      callback({ success: false, error: 'Cannot start game' });
    }
  });

  // 玩家移动
  socket.on('player:move', (data, callback) => {
    const room = roomManager.getPlayerRoom(currentPlayerId);
    if (!room || room.gamePhase !== 'playing') {
      callback && callback({ accepted: false });
      return;
    }

    const player = room.players.get(currentPlayerId);
    if (!player) {
      callback && callback({ accepted: false });
      return;
    }

    // 验证移动
    const validated = roomManager.gameLogic.validateMovement(
      currentPlayerId,
      data.position,
      player.position,
      data.deltaTime || 0.016,
      room
    );

    if (validated) {
      roomManager.updatePlayerState(currentPlayerId, {
        position: data.position,
        rotation: data.rotation,
        velocity: data.velocity,
        state: data.state
      });

      // 广播给对手
      socket.to(currentRoomId).emit('player:moved', {
        playerId: currentPlayerId,
        position: data.position,
        rotation: data.rotation,
        state: data.state
      });

      callback && callback({ accepted: true });
    } else {
      callback && callback({ accepted: false, reason: 'speed_hack' });
    }
  });

  // 射击
  socket.on('player:shoot', (data, callback) => {
    const result = roomManager.handleShoot(currentPlayerId, data);
    callback(result);

    if (result.success && result.hit) {
      if (result.hit.confirmed) {
        // 广播给对手（被击中）
        io.to(currentRoomId).emit('player:hit', {
          playerId: result.hit.playerId,
          damage: result.hit.damage,
          health: result.hit.victimHealth,
          kills: result.hit.attackerKills,
          isHeadshot: result.hit.isHeadshot
        });

        // 如果有击杀
        if (result.kill && result.kill.killed) {
          io.to(currentRoomId).emit('player:killed', {
            killerId: currentPlayerId,
            victimId: result.hit.playerId,
            gameOver: result.kill.gameOver,
            winner: result.kill.winner
          });

          if (result.kill.gameOver) {
            io.to(currentRoomId).emit('game:over', {
              winner: result.kill.winner,
              room: roomManager.getRoomState(currentRoomId)
            });
          }
        }
      }

      // 广播射击事件（让对手看到枪口火焰等）
      socket.to(currentRoomId).emit('player:shooted', {
        playerId: currentPlayerId,
        weapon: data.weapon,
        position: data.origin
      });
    }
  });

  // 换武器
  socket.on('player:switchWeapon', (data, callback) => {
    const room = roomManager.getPlayerRoom(currentPlayerId);
    if (!room) {
      callback && callback({ success: false });
      return;
    }

    const player = room.players.get(currentPlayerId);
    if (player && mapConfig.weapons[data.weapon]) {
      player.weapon = data.weapon;
      
      // 广播给对手
      socket.to(currentRoomId).emit('opponent:weaponChanged', {
        playerId: currentPlayerId,
        weapon: data.weapon
      });
      
      callback && callback({ success: true, weapon: data.weapon });
    } else {
      callback && callback({ success: false });
    }
  });

  // 重新装填
  socket.on('player:reload', (data, callback) => {
    const room = roomManager.getPlayerRoom(currentPlayerId);
    if (!room) {
      callback && callback({ success: false });
      return;
    }

    const player = room.players.get(currentPlayerId);
    if (player) {
      const weapon = mapConfig.weapons[player.weapon];
      player.ammo[player.weapon] = weapon.magSize;
      
      socket.to(currentRoomId).emit('opponent:reloaded', {
        playerId: currentPlayerId,
        weapon: player.weapon
      });
      
      callback && callback({ success: true, ammo: player.ammo });
    } else {
      callback && callback({ success: false });
    }
  });

  // 投掷手榴弹
  socket.on('player:throwGrenade', (data, callback) => {
    const result = roomManager.handleGrenade(currentPlayerId, data);
    callback(result);

    if (result.success) {
      // 广播给对手
      io.to(currentRoomId).emit('grenade:thrown', {
        playerId: currentPlayerId,
        position: data.position,
        trajectory: data.trajectory
      });

      // 爆炸效果延迟
      setTimeout(() => {
        io.to(currentRoomId).emit('grenade:exploded', {
          position: data.position,
          affected: result.affected
        });
      }, 2000);
    }
  });

  // 请求对手状态
  socket.on('player:getOpponent', (callback) => {
    const opponent = roomManager.getOpponent(currentPlayerId);
    callback(opponent);
  });

  // 复活确认
  socket.on('player:respawn', (callback) => {
    const room = roomManager.getPlayerRoom(currentPlayerId);
    if (!room) {
      callback && callback({ success: false });
      return;
    }

    const player = room.players.get(currentPlayerId);
    if (player && !player.alive) {
      roomManager.gameLogic.respawnPlayer(currentPlayerId, room);
      callback({ success: true, player });
    } else {
      callback && callback({ success: false });
    }
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
    
    if (currentRoomId) {
      const room = roomManager.leaveRoom(currentPlayerId);
      if (room) {
        // 通知房间内的其他玩家
        io.to(currentRoomId).emit('player:left', {
          playerId: currentPlayerId
        });
        
        // 如果游戏正在进行，结束游戏
        if (room.gamePhase === 'playing') {
          io.to(currentRoomId).emit('game:end', {
            reason: 'opponent_disconnected',
            winner: null
          });
        }
      }
    }
  });
});

// 定期同步状态
setInterval(() => {
  roomManager.rooms.forEach((room, roomId) => {
    if (room.gamePhase === 'playing') {
      const state = roomManager.getRoomState(roomId);
      io.to(roomId).emit('state:sync', state);
    }
  });
}, 100); // 每100ms同步一次游戏状态

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Server] FPS Game server running on port ${PORT}`);
  console.log(`[Server] Open http://localhost:${PORT} to play`);
});
