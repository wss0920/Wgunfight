// Main game module
class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.scene = null;
    this.camera = null;
    this.cameraTarget = null;
    this.renderer = null;
    this.clock = new THREE.Clock();
    
    this.mapConfig = null;
    this.player = null;
    this.opponent = null;
    this.obstacles = [];
    this.hitTargets = [];
    this.effects = [];
    
    this.isPlaying = false;
    this.isPointerLocked = false;
    this.gamePhase = 'menu';
    
    // UI elements
    this.ui = {
      menu: document.getElementById('menu'),
      lobby: document.getElementById('lobby'),
      countdown: document.getElementById('countdown'),
      game: document.getElementById('game'),
      clickPrompt: document.getElementById('clickPrompt'),
      hud: document.getElementById('hud'),
      deathScreen: document.getElementById('deathScreen'),
      gameOver: document.getElementById('gameOver'),
      crosshair: document.getElementById('crosshair'),
      healthFill: document.getElementById('healthFill'),
      healthText: document.getElementById('healthText'),
      killCount: document.getElementById('killCount'),
      ammoCount: document.getElementById('ammoCount'),
      weaponName: document.getElementById('weaponName'),
      opponentName: document.getElementById('opponentName'),
      opponentHealth: document.getElementById('opponentHealth'),
      countdownNumber: document.getElementById('countdownNumber'),
      lobbyRoomCode: document.getElementById('lobbyRoomCode'),
      player1Slot: document.getElementById('player1Slot'),
      player2Slot: document.getElementById('player2Slot'),
      menuStatus: document.getElementById('menuStatus'),
      gameOverTitle: document.getElementById('gameOverTitle'),
      gameOverResult: document.getElementById('gameOverResult')
    };
    
    this.currentRoomCode = null;
  }

  async init() {
    this.setupRenderer();
    this.setupScene();
    this.setupLighting();
    this.setupUI();
    
    // Connect to server
    try {
      await network.connect();
      console.log('[Game] Network connected');
    } catch (err) {
      this.showMenuStatus('无法连接到服务器', 'error');
    }
    
    // Setup network callbacks
    this.setupNetworkCallbacks();
    
    // Setup pointer lock
    this.canvas.addEventListener('click', () => {
      if (this.isPlaying && !this.isPointerLocked) {
        this.canvas.requestPointerLock();
      }
    });
    
    // Start render loop
    this.animate();
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 50, 150);
    
    // Camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    
    // Camera target for smooth following
    this.cameraTarget = new THREE.Object3D();
    this.scene.add(this.cameraTarget);
    
    // Ground
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x3d5c3d });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    
    // Grid helper (optional visual aid)
    const gridHelper = new THREE.GridHelper(200, 50, 0x2d4a2d, 0x2d4a2d);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);
  }

  setupLighting() {
    // Ambient light
    const ambient = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambient);
    
    // Directional light (sun)
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(50, 100, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 500;
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
    this.scene.add(sun);
    
    // Hemisphere light for sky/ground color
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3d5c3d, 0.3);
    this.scene.add(hemi);
  }

  setupUI() {
    // Menu buttons
    document.getElementById('joinBtn').addEventListener('click', () => this.handleJoin());
    document.getElementById('createBtn').addEventListener('click', () => this.handleCreate());
    document.getElementById('leaveLobbyBtn').addEventListener('click', () => this.handleLeaveLobby());
    document.getElementById('playAgainBtn').addEventListener('click', () => this.handlePlayAgain());
    
    // Enter key in inputs
    document.getElementById('roomCode').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleJoin();
    });
    document.getElementById('playerName').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleJoin();
    });
  }

  setupNetworkCallbacks() {
    network.onConnected = () => {
      this.showMenuStatus('已连接，等待中...', 'success');
    };

    network.onDisconnected = () => {
      this.showMenuStatus('连接断开', 'error');
      this.returnToMenu();
    };

    network.onCountdown = (data) => {
      this.showCountdown(data.countdown);
    };

    network.onGameStart = (data) => {
      this.startGame(data);
    };

    network.onGameEnd = (data) => {
      this.endGame(data);
    };

    network.onPlayerLeft = (data) => {
      console.log('[Game] Opponent left:', data);
    };

    network.onOpponentMoved = (data) => {
      if (this.opponent) {
        this.opponent.applyState({
          position: data.position,
          rotation: data.rotation,
          state: data.state
        });
      }
    };

    network.onOpponentHit = (data) => {
      if (this.opponent && data.playerId === network.playerId) {
        // We got hit
        if (this.player) {
          this.player.health = data.health;
          this.updateHUD();
          this.showDamageFlash();
        }
      } else if (this.opponent) {
        // Opponent got hit - show blood effect
        this.showBloodEffect(this.opponent.position);
      }
    };

    network.onOpponentShooted = (data) => {
      // Show opponent muzzle flash
    };

    network.onOpponentKilled = (data) => {
      if (data.victimId === network.playerId) {
        // We died
        if (this.player) this.player.die();
        this.showDeathScreen();
      } else if (this.opponent) {
        // Opponent killed someone
        this.opponent.applyState({ alive: false });
        this.showKillFeed(data.killerId, data.victimId);
      }
    };

    network.onStateSync = (data) => {
      this.updateFromRoomState(data);
    };

    network.onOpponentWeaponChanged = (data) => {
      if (this.opponent) {
        this.opponent.weapon = data.weapon;
      }
    };

    network.onGrenadeExploded = (data) => {
      this.createExplosionEffect(data.position);
    };
  }

  async handleJoin() {
    const playerName = document.getElementById('playerName').value.trim() || 'Player';
    let roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
    
    if (!roomCode) {
      this.showMenuStatus('请输入房间号', 'error');
      return;
    }
    
    try {
      await network.joinRoom(roomCode, playerName);
      this.currentRoomCode = roomCode;
      this.showLobby();
    } catch (err) {
      this.showMenuStatus('加入失败: ' + err.message, 'error');
    }
  }

  async handleCreate() {
    const playerName = document.getElementById('playerName').value.trim() || 'Player';
    const roomCode = this.generateRoomCode();
    
    try {
      await network.joinRoom(roomCode, playerName);
      this.currentRoomCode = roomCode;
      this.showLobby();
      this.showMenuStatus('房间已创建，代码: ' + roomCode, 'success');
    } catch (err) {
      this.showMenuStatus('创建失败: ' + err.message, 'error');
    }
  }

  async handleLeaveLobby() {
    await network.leaveRoom();
    this.returnToMenu();
  }

  async handlePlayAgain() {
    this.ui.gameOver.classList.add('hidden');
    await network.leaveRoom();
    
    // Rejoin same room
    const playerName = document.getElementById('playerName').value.trim() || 'Player';
    try {
      await network.joinRoom(this.currentRoomCode, playerName);
    } catch (err) {
      this.returnToMenu();
    }
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  showMenuStatus(message, type) {
    this.ui.menuStatus.textContent = message;
    this.ui.menuStatus.className = 'status ' + type;
  }

  showLobby() {
    this.ui.menu.classList.add('hidden');
    this.ui.lobby.classList.remove('hidden');
    this.ui.lobbyRoomCode.textContent = this.currentRoomCode;
    this.updateLobbySlots();
  }

  updateLobbySlots() {
    const room = network.room;
    if (!room) return;
    
    const players = room.players;
    let html1 = '<div class="slot-empty">等待玩家 1...</div>';
    let html2 = '<div class="slot-empty">等待玩家 2...</div>';
    
    players.forEach((player, index) => {
      const isMe = player.id === network.playerId;
      const html = `
        <div class="slot-filled">
          <div class="name">${player.name}${isMe ? ' (你)' : ''}</div>
          <div class="team">队伍 ${player.team}</div>
        </div>
      `;
      if (index === 0) html1 = html;
      else html2 = html;
    });
    
    this.ui.player1Slot.innerHTML = html1;
    this.ui.player2Slot.innerHTML = html2;
  }

  showCountdown(count) {
    this.ui.lobby.classList.add('hidden');
    this.ui.countdown.classList.remove('hidden');
    this.ui.countdownNumber.textContent = count;
    
    if (count === 0) {
      this.ui.countdownNumber.textContent = '开始!';
      // 隐藏倒计时，准备显示游戏
      setTimeout(() => {
        this.ui.countdown.classList.add('hidden');
      }, 500);
    }
  }

  startGame(data) {
    this.ui.countdown.classList.add('hidden');
    this.ui.lobby.classList.add('hidden');
    this.ui.game.classList.remove('hidden');
    this.ui.clickPrompt.classList.remove('hidden');
    
    this.isPlaying = true;
    this.gamePhase = 'playing';
    this.mapConfig = network.mapConfig;
    
    // Update room state if provided
    if (data && data.room) {
      network.room = data.room;
    }
    
    // Setup map
    this.setupMap(this.mapConfig);
    
    // Create player
    this.player = new PlayerController(this);
    this.player.init();
    
    // Find spawn point based on player in room
    const room = network.room;
    const playerIndex = room ? [...room.players.keys()].indexOf(network.playerId) : 0;
    const spawnPoint = this.mapConfig.spawnPoints[playerIndex] || this.mapConfig.spawnPoints[0];
    this.player.position = { ...spawnPoint };
    this.player.position.y = 1.6;
    
    // Create opponent
    this.opponent = new RemotePlayer(this, 'opponent');
    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const opponentSpawn = this.mapConfig.spawnPoints[opponentIndex] || this.mapConfig.spawnPoints[1];
    this.opponent.position = { ...opponentSpawn };
    this.opponent.targetPosition = { ...opponentSpawn };
    
    this.updateHUD();
    
    // Request pointer lock on click
    this.ui.clickPrompt.addEventListener('click', () => {
      this.canvas.requestPointerLock();
    });
    
    // Auto request pointer lock after short delay
    setTimeout(() => {
      if (this.isPlaying) {
        this.canvas.requestPointerLock();
      }
    }, 500);
  }

  setupMap(config) {
    // Clear existing obstacles
    this.obstacles.forEach(obj => this.scene.remove(obj));
    this.obstacles = [];
    this.hitTargets = [];
    
    // Create obstacles from config
    config.obstacles.forEach(obs => {
      let geometry;
      const size = { x: obs.w || 2, y: obs.h || 2, z: obs.d || 2 };
      
      switch(obs.type) {
        case 'box':
        case 'crate':
          geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
          break;
        case 'wall':
          geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
          break;
        case 'pillar':
          geometry = new THREE.CylinderGeometry(size.x/2, size.x/2, size.y, 8);
          break;
        default:
          geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
      }
      
      let material;
      switch(obs.type) {
        case 'box':
        case 'wall':
          material = new THREE.MeshLambertMaterial({ color: 0x8b7355 });
          break;
        case 'crate':
          material = new THREE.MeshLambertMaterial({ color: 0xa0522d });
          break;
        case 'pillar':
          material = new THREE.MeshLambertMaterial({ color: 0x696969 });
          break;
        default:
          material = new THREE.MeshLambertMaterial({ color: 0x888888 });
      }
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(obs.x, obs.y + size.y/2, obs.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      
      // Add hit target
      mesh.name = 'obstacle';
      mesh.userData.obstacle = true;
      
      this.scene.add(mesh);
      this.obstacles.push(mesh);
      this.hitTargets.push(mesh);
    });
    
    // Add spawn point markers
    config.spawnPoints.forEach((spawn, index) => {
      const markerGeo = new THREE.RingGeometry(1, 1.5, 32);
      const markerMat = new THREE.MeshBasicMaterial({ 
        color: index === 0 ? 0x3498db : 0xe74c3c,
        side: THREE.DoubleSide
      });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(spawn.x, 0.1, spawn.z);
      this.scene.add(marker);
    });
  }

  updateFromRoomState(state) {
    // Update player from room state
    if (state.players) {
      state.players.forEach(p => {
        if (p.id === network.playerId && this.player) {
          this.player.applyServerState(p);
        } else if (this.opponent) {
          this.opponent.applyState(p);
        }
      });
    }
    
    this.updateHUD();
  }

  endGame(data) {
    this.isPlaying = false;
    this.gamePhase = 'ended';
    document.exitPointerLock();
    
    const winner = data.winner;
    const isWinner = winner === network.playerId;
    
    this.ui.gameOver.classList.remove('hidden', 'victory', 'defeat');
    this.ui.gameOver.classList.add(isWinner ? 'victory' : 'defeat');
    
    this.ui.gameOverTitle.textContent = isWinner ? '胜利!' : '失败';
    this.ui.gameOverResult.textContent = isWinner ? '恭喜你赢得了比赛!' : '下次再接再厉!';
  }

  returnToMenu() {
    this.ui.menu.classList.remove('hidden');
    this.ui.lobby.classList.add('hidden');
    this.ui.countdown.classList.add('hidden');
    this.ui.game.classList.add('hidden');
    this.ui.clickPrompt.classList.add('hidden');
    this.ui.gameOver.classList.add('hidden');
    
    this.isPlaying = false;
    this.gamePhase = 'menu';
    this.currentRoomCode = null;
    
    // Cleanup
    if (this.player) {
      this.player = null;
    }
    if (this.opponent) {
      this.opponent.destroy();
      this.opponent = null;
    }
  }

  updateHUD() {
    if (!this.player) return;
    
    // Health
    const healthPercent = Math.max(0, this.player.health);
    this.ui.healthFill.style.width = healthPercent + '%';
    this.ui.healthText.textContent = Math.round(healthPercent);
    
    // Update health bar color
    if (healthPercent < 30) {
      this.ui.healthFill.style.background = '#e74c3c';
    } else if (healthPercent < 60) {
      this.ui.healthFill.style.background = 'linear-gradient(90deg, #e74c3c, #f39c12)';
    } else {
      this.ui.healthFill.style.background = 'linear-gradient(90deg, #e74c3c, #2ecc71)';
    }
    
    // Kills
    this.ui.killCount.textContent = this.player.kills;
    
    // Ammo
    this.ui.ammoCount.textContent = this.player.ammo[this.player.currentWeapon];
    
    // Weapon name
    const weaponNames = { pistol: '手枪', smg: '冲锋枪', grenade: '手雷' };
    this.ui.weaponName.textContent = weaponNames[this.player.currentWeapon] || this.player.currentWeapon;
    
    // Opponent
    if (this.opponent) {
      this.ui.opponentName.textContent = this.opponent.alive ? '存活' : '已击杀';
      this.ui.opponentHealth.textContent = this.opponent.alive ? `${Math.round(this.opponent.health)} HP` : '💀';
    }
  }

  showDeathScreen() {
    this.ui.deathScreen.classList.remove('hidden');
    
    // Auto hide after respawn
    setTimeout(() => {
      this.ui.deathScreen.classList.add('hidden');
    }, 2000);
  }

  showHitMarker(isHeadshot) {
    const marker = document.createElement('div');
    marker.className = 'hit-marker' + (isHeadshot ? ' headshot' : '');
    document.body.appendChild(marker);
    
    setTimeout(() => marker.remove(), 200);
  }

  showDamageFlash() {
    const flash = document.createElement('div');
    flash.className = 'damage-flash';
    document.body.appendChild(flash);
    
    setTimeout(() => flash.remove(), 300);
  }

  showBloodEffect(position) {
    // Create blood splatter effect at position
    if (!position) return;
    
    const bloodGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const bloodMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const blood = new THREE.Mesh(bloodGeo, bloodMat);
    blood.position.set(position.x, position.y, position.z);
    this.scene.add(blood);
    
    // Fade out and remove
    setTimeout(() => this.scene.remove(blood), 500);
  }

  createHitEffect(point) {
    // Spark effect at hit point
    const sparkGeo = new THREE.SphereGeometry(0.05, 4, 4);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const spark = new THREE.Mesh(sparkGeo, sparkMat);
    spark.position.copy(point);
    this.scene.add(spark);
    
    setTimeout(() => this.scene.remove(spark), 100);
  }

  showMuzzleFlash() {
    // Simple muzzle flash - could be enhanced with particles
    const flashGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    
    // Position at camera
    const offset = new THREE.Vector3(0.3, -0.2, -1);
    offset.applyEuler(this.camera.rotation);
    flash.position.copy(this.camera.position).add(offset);
    
    this.scene.add(flash);
    setTimeout(() => this.scene.remove(flash), 50);
  }

  createExplosionEffect(position) {
    // Create explosion particles
    const particles = [];
    for (let i = 0; i < 20; i++) {
      const geo = new THREE.SphereGeometry(0.1, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
      const particle = new THREE.Mesh(geo, mat);
      particle.position.set(position.x, position.y, position.z);
      
      // Random velocity
      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        Math.random() * 10,
        (Math.random() - 0.5) * 10
      );
      
      this.scene.add(particle);
      particles.push(particle);
    }
    
    // Animate and remove
    let frame = 0;
    const animate = () => {
      frame++;
      particles.forEach(p => {
        p.position.add(p.userData.velocity.clone().multiplyScalar(0.1));
        p.userData.velocity.y -= 0.5;
        p.scale.multiplyScalar(0.95);
      });
      
      if (frame < 30) {
        requestAnimationFrame(animate);
      } else {
        particles.forEach(p => this.scene.remove(p));
      }
    };
    animate();
  }

  showKillFeed(killerId, victimId) {
    const feed = document.querySelector('.kill-feed') || this.createKillFeed();
    
    const entry = document.createElement('div');
    entry.className = 'kill-entry';
    
    const killer = killerId === network.playerId ? '你' : '对手';
    const victim = victimId === network.playerId ? '你' : '对手';
    
    entry.innerHTML = `<span class="killer">${killer}</span> 击杀 <span class="victim">${victim}</span>`;
    feed.appendChild(entry);
    
    setTimeout(() => entry.remove(), 3000);
  }

  createKillFeed() {
    const feed = document.createElement('div');
    feed.className = 'kill-feed';
    document.body.appendChild(feed);
    return feed;
  }

  getHitTargets() {
    const targets = [...this.obstacles];
    if (this.opponent && this.opponent.alive) {
      targets.push(this.opponent.head, this.opponent.body);
    }
    return targets;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    
    const deltaTime = Math.min(this.clock.getDelta(), 0.1);
    
    if (this.isPlaying && this.player) {
      // Update player
      this.player.update(deltaTime);
      
      // Send position to server
      const state = this.player.getNetworkState();
      network.sendMove(
        state.position,
        state.rotation,
        state.velocity,
        state.state,
        deltaTime
      );
      
      // Update camera
      this.camera.position.lerp(this.cameraTarget.position, 0.3);
      this.camera.rotation.copy(this.cameraTarget.rotation);
    }
    
    // Update opponent
    if (this.opponent) {
      this.opponent.update(deltaTime);
    }
    
    // Update effects
    this.updateEffects();
    
    // Render
    this.renderer.render(this.scene, this.camera);
  }

  updateEffects() {
    // Update grenade trajectory
    if (this.player && this.player.grenadeTrajectory) {
      this.player.grenadeTrajectory.time += 0.016;
    }
  }
}

// Initialize game
const game = new Game();
game.init();
