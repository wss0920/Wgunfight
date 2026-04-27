// Network module - Socket.io client
class NetworkManager {
  constructor() {
    this.socket = null;
    this.playerId = null;
    this.roomId = null;
    this.isConnected = false;
    this.mapConfig = null;
    this.room = null;
    
    // Callbacks
    this.onConnected = null;
    this.onDisconnected = null;
    this.onPlayerJoined = null;
    this.onPlayerLeft = null;
    this.onGameStart = null;
    this.onGameEnd = null;
    this.onCountdown = null;
    this.onOpponentMoved = null;
    this.onOpponentHit = null;
    this.onOpponentShooted = null;
    this.onOpponentKilled = null;
    this.onStateSync = null;
    this.onGrenadeThrown = null;
    this.onGrenadeExploded = null;
    this.onOpponentWeaponChanged = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host || 'localhost:3000';
      const url = `${protocol}//${host}`;
      
      this.socket = io(url, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });

      this.socket.on('connect', () => {
        console.log('[Network] Connected:', this.socket.id);
        this.isConnected = true;
        this.playerId = this.socket.id;
        if (this.onConnected) this.onConnected();
        resolve();
      });

      this.socket.on('disconnect', () => {
        console.log('[Network] Disconnected');
        this.isConnected = false;
        if (this.onDisconnected) this.onDisconnected();
      });

      this.socket.on('connect_error', (err) => {
        console.error('[Network] Connection error:', err);
        reject(err);
      });

      this.socket.on('game:countdown', (data) => {
        if (this.onCountdown) this.onCountdown(data);
      });

      this.socket.on('game:start', (data) => {
        this.room = data.room;
        if (this.onGameStart) this.onGameStart(data);
      });

      this.socket.on('game:end', (data) => {
        if (this.onGameEnd) this.onGameEnd(data);
      });

      this.socket.on('game:over', (data) => {
        if (this.onGameEnd) this.onGameEnd(data);
      });

      this.socket.on('player:left', (data) => {
        if (this.onPlayerLeft) this.onPlayerLeft(data);
      });

      this.socket.on('player:moved', (data) => {
        if (this.onOpponentMoved) this.onOpponentMoved(data);
      });

      this.socket.on('player:hit', (data) => {
        if (this.onOpponentHit) this.onOpponentHit(data);
      });

      this.socket.on('player:shooted', (data) => {
        if (this.onOpponentShooted) this.onOpponentShooted(data);
      });

      this.socket.on('player:killed', (data) => {
        if (this.onOpponentKilled) this.onOpponentKilled(data);
      });

      this.socket.on('state:sync', (data) => {
        this.room = data;
        if (this.onStateSync) this.onStateSync(data);
      });

      this.socket.on('grenade:thrown', (data) => {
        if (this.onGrenadeThrown) this.onGrenadeThrown(data);
      });

      this.socket.on('grenade:exploded', (data) => {
        if (this.onGrenadeExploded) this.onGrenadeExploded(data);
      });

      this.socket.on('opponent:weaponChanged', (data) => {
        if (this.onOpponentWeaponChanged) this.onOpponentWeaponChanged(data);
      });
    });
  }

  joinRoom(roomId, playerName) {
    return new Promise((resolve, reject) => {
      this.socket.emit('room:join', { roomId, playerName }, (response) => {
        if (response.success) {
          this.roomId = roomId;
          this.room = response.room;
          this.mapConfig = response.mapConfig;
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  leaveRoom() {
    return new Promise((resolve) => {
      this.socket.emit('room:leave', (response) => {
        this.roomId = null;
        this.room = null;
        resolve(response);
      });
    });
  }

  sendMove(position, rotation, velocity, state, deltaTime) {
    this.socket.emit('player:move', { position, rotation, velocity, state, deltaTime }, (response) => {
      if (!response.accepted) {
        console.warn('[Network] Move rejected:', response.reason);
      }
    });
  }

  sendShoot(origin, direction, weapon, maxDistance = 100) {
    return new Promise((resolve) => {
      this.socket.emit('player:shoot', { origin, direction, weapon, maxDistance }, (response) => {
        resolve(response);
      });
    });
  }

  switchWeapon(weapon) {
    return new Promise((resolve) => {
      this.socket.emit('player:switchWeapon', { weapon }, (response) => {
        resolve(response);
      });
    });
  }

  reload() {
    return new Promise((resolve) => {
      this.socket.emit('player:reload', {}, (response) => {
        resolve(response);
      });
    });
  }

  throwGrenade(position, trajectory) {
    return new Promise((resolve) => {
      this.socket.emit('player:throwGrenade', { position, trajectory }, (response) => {
        resolve(response);
      });
    });
  }

  getOpponent() {
    return new Promise((resolve) => {
      this.socket.emit('player:getOpponent', (response) => {
        resolve(response);
      });
    });
  }

  respawn() {
    return new Promise((resolve) => {
      this.socket.emit('player:respawn', {}, (response) => {
        resolve(response);
      });
    });
  }
}

const network = new NetworkManager();
