const mapConfig = require('../shared/mapConfig.json');
const GameLogic = require('./GameLogic');

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.gameLogic = new GameLogic();
  }

  // 创建新房间
  createRoom(roomId) {
    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId);
    }

    const room = {
      id: roomId,
      players: new Map(),
      gamePhase: 'waiting', // waiting, countdown, playing, ended
      killCount: [0, 0],
      createdAt: Date.now()
    };

    this.rooms.set(roomId, room);
    console.log(`[Room] Created room: ${roomId}`);
    return room;
  }

  // 加入房间
  joinRoom(roomId, playerId, playerName) {
    let room = this.rooms.get(roomId);
    
    if (!room) {
      room = this.createRoom(roomId);
    }

    if (room.players.size >= 2) {
      return { success: false, reason: 'room_full' };
    }

    if (room.gamePhase === 'playing' || room.gamePhase === 'countdown') {
      return { success: false, reason: 'game_in_progress' };
    }

    // 添加玩家
    const teamIndex = room.players.size;
    const spawnPoint = mapConfig.spawnPoints[teamIndex] || mapConfig.spawnPoints[0];
    
    const player = {
      id: playerId,
      name: playerName || `Player${teamIndex + 1}`,
      team: spawnPoint.team,
      position: { ...spawnPoint },
      rotation: { x: 0, y: teamIndex === 0 ? 0 : Math.PI, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      health: 100,
      kills: 0,
      deaths: 0,
      alive: true,
      invincible: false,
      weapon: 'pistol',
      ammo: { pistol: 8, smg: 30, grenades: 2 },
      lastShot: 0,
      state: 'idle'
    };

    room.players.set(playerId, player);
    console.log(`[Room] Player ${playerName} joined room ${roomId} (${room.players.size}/2)`);

    return { success: true, room, player, teamIndex };
  }

  // 设置游戏阶段为倒计时
  startCountdown(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.gamePhase = 'countdown';
  }

  // 游戏正式开始
  startGame(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.gamePhase = 'playing';
    console.log(`[Room] Game started in room ${roomId}`);

    // 设置初始无敌
    room.players.forEach(player => {
      player.invincible = true;
      setTimeout(() => {
        if (room.players.get(player.id)) {
          player.invincible = false;
        }
      }, mapConfig.gameSettings.spawnProtection);
    });
  }

  // 离开房间
  leaveRoom(playerId) {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.players.has(playerId)) {
        room.players.delete(playerId);
        console.log(`[Room] Player ${playerId} left room ${roomId}`);
        
        // 如果房间空了，删除房间
        if (room.players.size === 0) {
          this.rooms.delete(roomId);
          console.log(`[Room] Room ${roomId} destroyed (empty)`);
        }
        return roomId;
      }
    }
    return null;
  }

  // 获取玩家所在的房间
  getPlayerRoom(playerId) {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.players.has(playerId)) {
        return room;
      }
    }
    return null;
  }

  // 更新玩家状态
  updatePlayerState(playerId, state) {
    const room = this.getPlayerRoom(playerId);
    if (!room) return null;

    const player = room.players.get(playerId);
    if (!player) return null;

    // 更新允许的字段
    if (state.position) player.position = { ...state.position };
    if (state.rotation) player.rotation = { ...state.rotation };
    if (state.velocity) player.velocity = { ...state.velocity };
    if (state.weapon) player.weapon = state.weapon;
    if (state.state) player.state = state.state;
    if (typeof state.health === 'number') player.health = state.health;

    return player;
  }

  // 处理射击
  handleShoot(shooterId, shootData) {
    const room = this.getPlayerRoom(shooterId);
    if (!room || room.gamePhase !== 'playing') {
      return { success: false, reason: 'game_not_active' };
    }

    const shooter = room.players.get(shooterId);
    if (!shooter || !shooter.alive) {
      return { success: false, reason: 'player_not_alive' };
    }

    // 检查武器冷却
    const weapon = mapConfig.weapons[shooter.weapon];
    const now = Date.now();
    if (now - shooter.lastShot < weapon.fireRate) {
      return { success: false, reason: 'cooldown' };
    }

    // 检查弹药
    if (shooter.ammo[shooter.weapon] <= 0) {
      return { success: false, reason: 'no_ammo' };
    }

    // 消耗弹药
    shooter.ammo[shooter.weapon]--;
    shooter.lastShot = now;

    // 服务端射线检测
    const hit = this.gameLogic.raycast(
      shootData.origin,
      shootData.direction,
      shootData.maxDistance || 100,
      room
    );

    if (hit) {
      const damage = this.gameLogic.calculateDamage(shooter.weapon, hit.isHeadshot);
      const victim = room.players.get(hit.playerId);

      // 检查无敌
      if (victim.invincible) {
        return { success: true, hit: { ...hit, confirmed: false, reason: 'invincible' } };
      }

      victim.health -= damage;

      const result = {
        success: true,
        hit: {
          ...hit,
          confirmed: true,
          damage,
          shooterId,
          attackerKills: shooter.kills,
          victimHealth: victim.health,
          victimKills: victim.kills,
          victimDeaths: victim.deaths
        }
      };

      // 检查击杀
      if (this.gameLogic.checkPlayerDeath(hit.playerId, room)) {
        const killResult = this.gameLogic.checkKill(shooterId, hit.playerId, room);
        result.kill = killResult;
      }

      return result;
    }

    return { success: true, hit: null };
  }

  // 处理手榴弹
  handleGrenade(throwerId, grenadeData) {
    const room = this.getPlayerRoom(throwerId);
    if (!room || room.gamePhase !== 'playing') {
      return { success: false };
    }

    const thrower = room.players.get(throwerId);
    if (!thrower || thrower.alive === false || thrower.ammo.grenades <= 0) {
      return { success: false };
    }

    thrower.ammo.grenades--;

    // 计算爆炸位置（服务端计算抛物线）
    const result = this.gameLogic.handleGrenadeExplosion(
      grenadeData.position,
      throwerId,
      room
    );

    return { success: true, affected: result, grenade: grenadeData };
  }

  // 获取房间状态
  getRoomState(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const players = [];
    room.players.forEach((player, id) => {
      players.push({
        id,
        name: player.name,
        team: player.team,
        position: player.position,
        rotation: player.rotation,
        health: player.health,
        kills: player.kills,
        deaths: player.deaths,
        alive: player.alive,
        weapon: player.weapon,
        state: player.state
      });
    });

    return {
      id: room.id,
      gamePhase: room.gamePhase,
      players
    };
  }

  // 获取指定玩家的对手信息
  getOpponent(playerId) {
    const room = this.getPlayerRoom(playerId);
    if (!room) return null;

    let opponent = null;
    room.players.forEach((player, id) => {
      if (id !== playerId) {
        opponent = {
          id,
          name: player.name,
          team: player.team,
          position: player.position,
          rotation: player.rotation,
          health: player.health,
          kills: player.kills,
          deaths: player.deaths,
          alive: player.alive,
          weapon: player.weapon,
          state: player.state
        };
      }
    });

    return opponent;
  }

  // 重置游戏
  resetGame(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    room.players.forEach((player, id, index) => {
      const spawnPoint = mapConfig.spawnPoints[index] || mapConfig.spawnPoints[0];
      player.position = { ...spawnPoint };
      player.rotation = { x: 0, y: index === 0 ? 0 : Math.PI, z: 0 };
      player.health = 100;
      player.kills = 0;
      player.deaths = 0;
      player.alive = true;
      player.invincible = false;
      player.weapon = 'pistol';
      player.ammo = { pistol: 8, smg: 30, grenades: 2 };
    });

    room.gamePhase = 'waiting';
    return true;
  }

  // 获取所有房间（调试用）
  getAllRooms() {
    const rooms = [];
    this.rooms.forEach((room, id) => {
      rooms.push({
        id,
        playerCount: room.players.size,
        gamePhase: room.gamePhase
      });
    });
    return rooms;
  }
}

module.exports = RoomManager;
