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
    const requestLock = () => {
      if (this.isPlaying && !this.isPointerLocked) {
        this.canvas.requestPointerLock();
        this.ui.clickPrompt.classList.add('hidden');
      }
    };
    
    document.addEventListener('click', requestLock);
    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.canvas;
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    
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
    this.camera.rotation.order = 'YXZ';  // 设置旋转顺序
    
    // Camera target for smooth following
    this.cameraTarget = new THREE.Object3D();
    this.scene.add(this.cameraTarget);
    
    // Sky gradient
    const skyGeo = new THREE.SphereGeometry(400, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x0077ff) },
        bottomColor: { value: new THREE.Color(0x87ceeb) },
        offset: { value: 20 },
        exponent: { value: 0.6 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);
    
    // Ground - 更真实的草地纹理
    const groundGeo = new THREE.PlaneGeometry(200, 200, 100, 100);
    // 添加地形起伏
    const vertices = groundGeo.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
      vertices[i + 2] += Math.sin(vertices[i] * 0.1) * Math.cos(vertices[i + 1] * 0.1) * 0.5;
    }
    groundGeo.computeVertexNormals();
    
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x3d6b35,
      roughness: 0.9,
      metalness: 0.0,
      flatShading: false
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  setupLighting() {
    // Ambient light - 更柔和
    const ambient = new THREE.AmbientLight(0x6688cc, 0.4);
    this.scene.add(ambient);
    
    // Main sun light
    const sun = new THREE.DirectionalLight(0xffffee, 1.2);
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
    sun.shadow.bias = -0.0001;
    this.scene.add(sun);
    
    // Fill light
    const fillLight = new THREE.DirectionalLight(0x8899ff, 0.3);
    fillLight.position.set(-50, 50, -50);
    this.scene.add(fillLight);
    
    // Hemisphere light
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3d5c3d, 0.4);
    this.scene.add(hemi);
  }

  setupUI() {
    document.getElementById('joinBtn').addEventListener('click', () => this.handleJoin());
    document.getElementById('createBtn').addEventListener('click', () => this.handleCreate());
    document.getElementById('leaveLobbyBtn').addEventListener('click', () => this.handleLeaveLobby());
    document.getElementById('playAgainBtn').addEventListener('click', () => this.handlePlayAgain());
    
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
        this.opponent.setTargetPosition(data.position, data.rotation, data.state);
      }
    };

    network.onOpponentHit = (data) => {
      if (data.playerId === network.playerId && this.player) {
        this.player.health = data.health;
        this.updateHUD();
        this.showDamageFlash();
      }
    };

    network.onOpponentShooted = (data) => {
      if (this.opponent) {
        this.opponent.showMuzzleFlash();
      }
    };

    network.onOpponentKilled = (data) => {
      if (data.victimId === network.playerId) {
        if (this.player) this.player.die();
        this.showDeathScreen();
      } else if (this.opponent) {
        this.opponent.setAlive(false);
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
    
    if (data && data.room) {
      network.room = data.room;
    }
    
    this.setupMap(this.mapConfig);
    
    this.player = new PlayerController(this);
    this.player.init();
    
    const room = network.room;
    const playerIndex = room ? [...room.players.keys()].indexOf(network.playerId) : 0;
    const spawnPoint = this.mapConfig.spawnPoints[playerIndex] || this.mapConfig.spawnPoints[0];
    this.player.position = { ...spawnPoint };
    this.player.position.y = 1.6;
    
    this.opponent = new RemotePlayer(this, 'opponent');
    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const opponentSpawn = this.mapConfig.spawnPoints[opponentIndex] || this.mapConfig.spawnPoints[1];
    this.opponent.spawnPosition = { ...opponentSpawn };
    this.opponent.targetPosition = { ...opponentSpawn };
    this.opponent.position = { ...opponentSpawn };
    
    this.updateHUD();
    
    this.ui.clickPrompt.addEventListener('click', () => {
      this.canvas.requestPointerLock();
    });
    
    setTimeout(() => {
      if (this.isPlaying) {
        this.canvas.requestPointerLock();
      }
    }, 500);
  }

  setupMap(config) {
    this.obstacles.forEach(obj => this.scene.remove(obj));
    this.obstacles = [];
    this.hitTargets = [];
    
    config.obstacles.forEach(obs => {
      let geometry;
      const w = obs.w || 2, h = obs.h || 2, d = obs.d || 2;
      
      switch(obs.type) {
        case 'pillar':
          geometry = new THREE.CylinderGeometry(w/2, w/2, h, 16);
          break;
        default:
          geometry = new THREE.BoxGeometry(w, h, d);
      }
      
      let material;
      switch(obs.type) {
        case 'wall':
          material = new THREE.MeshStandardMaterial({ 
            color: 0x8b7355, 
            roughness: 0.8,
            metalness: 0.1
          });
          break;
        case 'crate':
          material = new THREE.MeshStandardMaterial({ 
            color: 0xa0522d, 
            roughness: 0.9,
            metalness: 0.0
          });
          break;
        case 'pillar':
          material = new THREE.MeshStandardMaterial({ 
            color: 0x696969, 
            roughness: 0.6,
            metalness: 0.2
          });
          break;
        default:
          material = new THREE.MeshStandardMaterial({ 
            color: 0x7a7a7a, 
            roughness: 0.7
          });
      }
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(obs.x, obs.y + h/2, obs.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'obstacle';
      mesh.userData.isObstacle = true;
      mesh.userData.bounds = { w, h, d };
      
      this.scene.add(mesh);
      this.obstacles.push(mesh);
      this.hitTargets.push(mesh);
    });
    
    // 出生点标记
    config.spawnPoints.forEach((spawn, index) => {
      const ringGeo = new THREE.RingGeometry(1.5, 2, 32);
      const ringMat = new THREE.MeshBasicMaterial({ 
        color: index === 0 ? 0x3498db : 0xe74c3c,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(spawn.x, 0.05, spawn.z);
      this.scene.add(ring);
    });
  }

  updateFromRoomState(state) {
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
    
    if (this.player) this.player = null;
    if (this.opponent) {
      this.opponent.destroy();
      this.opponent = null;
    }
  }

  updateHUD() {
    if (!this.player) return;
    
    const healthPercent = Math.max(0, this.player.health);
    this.ui.healthFill.style.width = healthPercent + '%';
    this.ui.healthText.textContent = Math.round(healthPercent);
    
    if (healthPercent < 30) {
      this.ui.healthFill.style.background = '#e74c3c';
    } else if (healthPercent < 60) {
      this.ui.healthFill.style.background = 'linear-gradient(90deg, #e74c3c, #f39c12)';
    } else {
      this.ui.healthFill.style.background = 'linear-gradient(90deg, #e74c3c, #2ecc71)';
    }
    
    this.ui.killCount.textContent = this.player.kills;
    this.ui.ammoCount.textContent = this.player.ammo[this.player.currentWeapon];
    
    const weaponNames = { pistol: '手枪', smg: '冲锋枪', grenade: '手雷' };
    this.ui.weaponName.textContent = weaponNames[this.player.currentWeapon] || this.player.currentWeapon;
    
    if (this.opponent) {
      this.ui.opponentName.textContent = this.opponent.alive ? '存活' : '已击杀';
      this.ui.opponentHealth.textContent = this.opponent.alive ? `${Math.round(this.opponent.health)} HP` : '💀';
    }
  }

  showDeathScreen() {
    this.ui.deathScreen.classList.remove('hidden');
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

  createExplosionEffect(position) {
    const particles = [];
    for (let i = 0; i < 30; i++) {
      const geo = new THREE.SphereGeometry(0.15, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ 
        color: Math.random() > 0.5 ? 0xff6600 : 0xffff00 
      });
      const particle = new THREE.Mesh(geo, mat);
      particle.position.set(position.x, position.y, position.z);
      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        Math.random() * 8,
        (Math.random() - 0.5) * 8
      );
      this.scene.add(particle);
      particles.push(particle);
    }
    
    let frame = 0;
    const animate = () => {
      frame++;
      particles.forEach(p => {
        p.position.add(p.userData.velocity.clone().multiplyScalar(0.1));
        p.userData.velocity.y -= 0.3;
        p.scale.multiplyScalar(0.95);
      });
      
      if (frame < 40) {
        requestAnimationFrame(animate);
      } else {
        particles.forEach(p => this.scene.remove(p));
      }
    };
    animate();
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
      this.player.update(deltaTime);
      
      const state = this.player.getNetworkState();
      network.sendMove(
        state.position,
        state.rotation,
        state.velocity,
        state.state,
        deltaTime
      );
      
      // FPS 模式下相机已在 player 中直接设置
      // TPS 模式下需要平滑跟随
      if (this.player.viewMode === 'tps') {
        this.camera.position.lerp(this.cameraTarget.position, 0.2);
        this.camera.rotation.copy(this.cameraTarget.rotation);
      }
    }
    
    if (this.opponent) {
      this.opponent.update(deltaTime);
    }
    
    this.renderer.render(this.scene, this.camera);
  }
}

const game = new Game();
game.init();
