// Player controller module
class PlayerController {
  constructor(game) {
    this.game = game;
    
    this.position = { x: 0, y: 1.6, z: 0 };
    this.rotation = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.health = 100;
    this.kills = 0;
    this.deaths = 0;
    this.alive = true;
    
    this.state = 'idle';
    this.isSprinting = false;
    this.isCrouching = false;
    this.isProning = false;
    
    this.currentWeapon = 'pistol';
    this.ammo = { pistol: 8, smg: 30, grenades: 2 };
    this.maxAmmo = { pistol: 8, smg: 30, grenades: 2 };
    this.lastShot = 0;
    this.isReloading = false;
    this.reloadDuration = 1500;
    
    this.keys = {
      forward: false, backward: false, left: false, right: false,
      jump: false, sprint: false, crouch: false, prone: false
    };
    this.mouseMovement = { x: 0, y: 0 };
    this.mouseDown = false;
    
    this.viewMode = 'fps';
    this.tpsDistance = 4;
    this.tpsHeight = 1.5;
    
    this.moveSpeed = 6;
    this.lookSensitivity = 0.0015;  // 降低灵敏度，更平稳
    this.jumpForce = 8;
    this.gravity = 20;
    
    this.isGrounded = true;
    this.currentHeight = 1.6;
    this.standingHeight = 1.6;
    this.crouchHeight = 1.0;
    this.proneHeight = 0.5;
    
    this.isThrowingGrenade = false;
    this.grenadeTrajectory = null;
  }

  init() {
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => this.onKeyUp(e));
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('mousedown', (e) => this.onMouseDown(e));
    document.addEventListener('mouseup', (e) => this.onMouseUp(e));
    document.addEventListener('pointerlockchange', () => {
      this.game.isPointerLocked = document.pointerLockElement === this.game.canvas;
    });
  }

  onKeyDown(e) {
    if (!this.game.isPlaying) return;
    
    switch(e.code) {
      case 'KeyW': this.keys.forward = true; break;
      case 'KeyS': this.keys.backward = true; break;
      case 'KeyA': this.keys.left = true; break;
      case 'KeyD': this.keys.right = true; break;
      case 'Space': 
        if (this.isGrounded && !this.isCrouching && !this.isProning) {
          this.velocity.y = this.jumpForce;
          this.isGrounded = false;
        }
        break;
      case 'ShiftLeft': this.keys.sprint = true; break;
      case 'ControlLeft': this.keys.crouch = true; break;
      case 'KeyC': this.keys.crouch = !this.keys.crouch; break;
      case 'KeyZ': this.keys.prone = !this.keys.prone; break;
      case 'Digit1': this.switchWeapon('pistol'); break;
      case 'Digit2': this.switchWeapon('smg'); break;
      case 'KeyR': this.reload(); break;
      case 'KeyG': this.throwGrenade(); break;
      case 'KeyV': this.toggleView(); break;
    }
  }

  onKeyUp(e) {
    switch(e.code) {
      case 'KeyW': this.keys.forward = false; break;
      case 'KeyS': this.keys.backward = false; break;
      case 'KeyA': this.keys.left = false; break;
      case 'KeyD': this.keys.right = false; break;
      case 'ShiftLeft': this.keys.sprint = false; break;
      case 'ControlLeft': this.keys.crouch = false; break;
      case 'KeyZ': this.keys.prone = false; break;
    }
  }

  onMouseMove(e) {
    if (!this.game.isPointerLocked) return;
    this.mouseMovement.x = e.movementX;
    this.mouseMovement.y = e.movementY;
  }

  onMouseDown(e) {
    if (e.button === 0) this.mouseDown = true;
  }

  onMouseUp(e) {
    if (e.button === 0) this.mouseDown = false;
  }

  switchWeapon(weapon) {
    if (this.isReloading) this.cancelReload();
    this.currentWeapon = weapon;
    this.game.updateHUD();
  }

  async reload() {
    if (this.isReloading) return;
    if (this.ammo[this.currentWeapon] >= this.maxAmmo[this.currentWeapon]) return;
    
    this.isReloading = true;
    this.state = 'reloading';
    
    await new Promise(resolve => setTimeout(resolve, this.reloadDuration));
    
    if (this.isReloading) {
      this.ammo[this.currentWeapon] = this.maxAmmo[this.currentWeapon];
      this.isReloading = false;
      this.state = 'idle';
      this.game.updateHUD();
      network.reload();
    }
  }

  cancelReload() {
    this.isReloading = false;
    this.state = 'idle';
  }

  throwGrenade() {
    if (this.ammo.grenades <= 0 || this.isThrowingGrenade) return;
    
    this.ammo.grenades--;
    this.isThrowingGrenade = true;
    
    setTimeout(() => {
      network.throwGrenade(this.position, null);
      this.isThrowingGrenade = false;
    }, 300);
    
    this.game.updateHUD();
  }

  toggleView() {
    this.viewMode = this.viewMode === 'fps' ? 'tps' : 'fps';
  }

  update(deltaTime) {
    if (!this.alive) return;
    
    // Process mouse look
    this.rotation.y -= this.mouseMovement.x * this.lookSensitivity;
    this.rotation.x -= this.mouseMovement.y * this.lookSensitivity;
    this.rotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.rotation.x));
    this.mouseMovement.x = 0;
    this.mouseMovement.y = 0;
    
    // Movement - 相对于视角的方向
    let moveX = 0, moveZ = 0;
    if (this.keys.forward) moveZ -= 1;
    if (this.keys.backward) moveZ += 1;
    if (this.keys.left) moveX -= 1;
    if (this.keys.right) moveX += 1;
    
    if (moveX !== 0 && moveZ !== 0) {
      const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
      moveX /= len;
      moveZ /= len;
    }
    
    // 根据视角方向计算世界坐标移动
    // camera forward is -Z, right is +X
    const forward = new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(1, 0, 0);
    
    forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation.y);
    right.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation.y);
    
    const worldMoveX = right.x * moveX + forward.x * moveZ;
    const worldMoveZ = right.z * moveX + forward.z * moveZ;
    
    // Speed
    let speed = this.moveSpeed;
    this.isSprinting = this.keys.sprint && moveZ < 0;
    
    if (this.keys.crouch && !this.keys.prone) {
      speed = this.moveSpeed * 0.6;
      this.isCrouching = true;
      this.currentHeight = this.crouchHeight;
    } else if (this.keys.prone) {
      speed = this.moveSpeed * 0.3;
      this.isProning = true;
      this.currentHeight = this.proneHeight;
    } else {
      this.isCrouching = false;
      this.isProning = false;
      this.currentHeight = this.standingHeight;
    }
    
    if (this.isSprinting && !this.isCrouching && !this.isProning) {
      speed *= 1.5;
    }
    
    // Apply movement
    this.velocity.x = worldMoveX * speed;
    this.velocity.z = worldMoveZ * speed;
    
    // Gravity
    if (!this.isGrounded) {
      this.velocity.y -= this.gravity * deltaTime;
    }
    
    // Update position
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;
    this.position.z += this.velocity.z * deltaTime;
    
    // Ground collision
    if (this.position.y < this.currentHeight) {
      this.position.y = this.currentHeight;
      this.velocity.y = 0;
      this.isGrounded = true;
    }
    
    // Obstacle collision (simple)
    this.handleObstacleCollision();
    
    // Boundary
    const boundary = 45;
    this.position.x = Math.max(-boundary, Math.min(boundary, this.position.x));
    this.position.z = Math.max(-boundary, Math.min(boundary, this.position.z));
    
    // State
    if (this.velocity.y > 0) {
      this.state = 'jumping';
    } else if (moveX !== 0 || moveZ !== 0) {
      this.state = this.isSprinting ? 'running' : 'walking';
    } else {
      this.state = 'idle';
    }
    
    if (this.isCrouching) this.state = 'crouching';
    if (this.isProning) this.state = 'prone';
    
    // Shooting
    if (this.mouseDown && !this.isReloading) {
      this.shoot();
    }
    
    this.updateCamera();
  }

  handleObstacleCollision() {
    const playerRadius = 0.4;
    
    for (const obs of this.game.obstacles) {
      const bounds = obs.userData.bounds;
      if (!bounds) continue;
      
      const dx = this.position.x - obs.position.x;
      const dz = this.position.z - obs.position.z;
      
      const halfW = bounds.w / 2 + playerRadius;
      const halfD = bounds.d / 2 + playerRadius;
      
      if (Math.abs(dx) < halfW && Math.abs(dz) < halfD) {
        const overlapX = halfW - Math.abs(dx);
        const overlapZ = halfD - Math.abs(dz);
        
        if (overlapX < overlapZ) {
          this.position.x += Math.sign(dx) * overlapX;
          this.velocity.x = 0;
        } else {
          this.position.z += Math.sign(dz) * overlapZ;
          this.velocity.z = 0;
        }
      }
    }
  }

  shoot() {
    const now = Date.now();
    const weapon = this.game.mapConfig.weapons[this.currentWeapon];
    const fireRate = weapon.fireRate;
    
    if (now - this.lastShot < fireRate) return;
    if (this.ammo[this.currentWeapon] <= 0) {
      this.reload();
      return;
    }
    
    this.lastShot = now;
    this.ammo[this.currentWeapon]--;
    
    // Get shoot direction from camera
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyEuler(new THREE.Euler(this.rotation.x, this.rotation.y, this.rotation.z, 'YXZ'));
    
    const origin = this.game.camera.position.clone();
    
    // Local hit detection
    const raycaster = new THREE.Raycaster(origin, direction, 0, 200);
    const targets = this.game.getHitTargets();
    const intersects = raycaster.intersectObjects(targets, true);
    
    // Send to server for authoritative hit detection
    network.sendShoot(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: direction.x, y: direction.y, z: direction.z },
      this.currentWeapon,
      200
    ).then(response => {
      if (response.success && response.hit) {
        if (response.hit.confirmed) {
          this.game.showHitMarker(response.hit.isHeadshot);
        }
      }
    });
    
    // Local feedback
    if (intersects.length > 0) {
      const hit = intersects[0];
      this.game.showHitMarker(hit.object.name === 'head');
      this.game.createHitEffect(hit.point);
    }
    
    // Recoil
    this.rotation.x += 0.015;
    
    // Muzzle flash
    this.game.showMuzzleFlash();
    
    this.game.updateHUD();
  }

  updateCamera() {
    const camera = this.game.camera;
    
    if (this.viewMode === 'fps') {
      // FPS 模式 - 直接跟随玩家位置和旋转
      camera.position.set(this.position.x, this.position.y, this.position.z);
      // 使用欧拉角，设置正确的旋转顺序
      camera.rotation.set(this.rotation.x, this.rotation.y, 0, 'YXZ');
    }
    // TPS 模式在 game.js 中处理
  }

  applyServerState(state) {
    this.health = state.health;
    this.kills = state.kills;
    this.deaths = state.deaths;
    this.alive = state.alive;
    this.currentWeapon = state.weapon;
    this.state = state.state;
  }

  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) this.die();
  }

  die() {
    this.alive = false;
    this.state = 'dead';
    this.health = 0;
    document.exitPointerLock();
  }

  respawn(position) {
    this.position = { ...position, y: this.currentHeight };
    this.health = 100;
    this.alive = true;
    this.state = 'idle';
    this.velocity = { x: 0, y: 0, z: 0 };
  }

  getNetworkState() {
    return {
      position: this.position,
      rotation: this.rotation,
      velocity: this.velocity,
      state: this.state,
      alive: this.alive
    };
  }
}

// Remote player - improved rendering and sync
class RemotePlayer {
  constructor(game, id) {
    this.game = game;
    this.id = id;
    
    this.position = { x: 0, y: 1.6, z: 0 };
    this.rotation = { x: 0, y: 0, z: 0 };
    this.targetPosition = { x: 0, y: 1.6, z: 0 };
    this.targetRotation = { x: 0, y: 0, z: 0 };
    this.targetState = 'idle';
    this.spawnPosition = { x: 0, y: 1.6, z: 0 };
    
    this.health = 100;
    this.kills = 0;
    this.deaths = 0;
    this.alive = true;
    this.weapon = 'pistol';
    this.state = 'idle';
    
    this.lerpFactor = 0.15;
    
    this.createMesh();
  }

  createMesh() {
    this.group = new THREE.Group();
    
    // 身体 - 更圆润
    const bodyGeo = new THREE.CapsuleGeometry(0.25, 0.8, 8, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ 
      color: 0x2980b9,
      roughness: 0.7,
      metalness: 0.1
    });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.body.position.y = 0.9;
    this.body.castShadow = true;
    this.group.add(this.body);
    
    // 头
    const headGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ 
      color: 0xf5cba7,
      roughness: 0.8
    });
    this.head = new THREE.Mesh(headGeo, headMat);
    this.head.position.y = 1.6;
    this.head.name = 'head';
    this.head.castShadow = true;
    this.group.add(this.head);
    
    // 眼睛
    const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.07, 1.65, -0.15);
    this.group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.07, 1.65, -0.15);
    this.group.add(rightEye);
    
    // 武器
    this.weaponGroup = new THREE.Group();
    const weaponGeo = new THREE.BoxGeometry(0.08, 0.08, 0.5);
    const weaponMat = new THREE.MeshStandardMaterial({ 
      color: 0x333333,
      roughness: 0.3,
      metalness: 0.8
    });
    this.weaponMesh = new THREE.Mesh(weaponGeo, weaponMat);
    this.weaponGroup.add(this.weaponMesh);
    this.weaponGroup.position.set(0.25, 1.0, -0.3);
    this.group.add(this.weaponGroup);
    
    // 腿
    const legGeo = new THREE.CapsuleGeometry(0.1, 0.5, 4, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1a252f });
    this.leftLeg = new THREE.Mesh(legGeo, legMat);
    this.leftLeg.position.set(-0.12, 0.3, 0);
    this.leftLeg.castShadow = true;
    this.group.add(this.leftLeg);
    this.rightLeg = new THREE.Mesh(legGeo, legMat);
    this.rightLeg.position.set(0.12, 0.3, 0);
    this.rightLeg.castShadow = true;
    this.group.add(this.rightLeg);
    
    // 手臂
    const armGeo = new THREE.CapsuleGeometry(0.08, 0.4, 4, 8);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x2980b9 });
    this.leftArm = new THREE.Mesh(armGeo, armMat);
    this.leftArm.position.set(-0.35, 1.0, 0);
    this.leftArm.rotation.z = 0.3;
    this.group.add(this.leftArm);
    this.rightArm = new THREE.Mesh(armGeo, armMat);
    this.rightArm.position.set(0.35, 1.0, 0);
    this.rightArm.rotation.z = -0.3;
    this.group.add(this.rightArm);
    
    this.game.scene.add(this.group);
  }

  setTargetPosition(pos, rot, state) {
    this.targetPosition = { ...pos };
    if (rot) this.targetRotation = { ...rot };
    if (state) this.targetState = state;
  }

  update(deltaTime) {
    if (!this.alive) {
      this.group.visible = false;
      return;
    }
    
    this.group.visible = true;
    
    // Smooth interpolation - 使用更高的系数让移动更及时
    const factor = 0.25;
    this.position.x += (this.targetPosition.x - this.position.x) * factor;
    this.position.y += (this.targetPosition.y - this.position.y) * factor;
    this.position.z += (this.targetPosition.z - this.position.z) * factor;
    
    // 直接使用目标旋转，让转向更及时
    this.rotation.x += (this.targetRotation.x - this.rotation.x) * 0.3;
    this.rotation.y += (this.targetRotation.y - this.rotation.y) * 0.3;
    
    // Apply to mesh
    this.group.position.set(this.position.x, 0, this.position.z);
    this.group.rotation.y = this.rotation.y;
    
    // Head look
    this.head.rotation.x = this.rotation.x;
    
    // 动画状态
    this.updateAnimation();
  }

  updateAnimation() {
    const t = Date.now() * 0.001;
    
    if (this.targetState === 'running' || this.targetState === 'walking') {
      // 跑步/走路动画
      const speed = this.targetState === 'running' ? 12 : 6;
      const bob = Math.sin(t * speed) * 0.05;
      
      this.leftLeg.rotation.x = Math.sin(t * speed) * 0.5;
      this.rightLeg.rotation.x = Math.sin(t * speed + Math.PI) * 0.5;
      this.leftArm.rotation.x = Math.sin(t * speed + Math.PI) * 0.3;
      this.rightArm.rotation.x = Math.sin(t * speed) * 0.3;
      
      this.group.position.y = bob;
    } else if (this.targetState === 'idle') {
      // 待机动画
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      this.leftArm.rotation.x = 0;
      this.rightArm.rotation.x = 0;
      this.group.position.y = Math.sin(t * 2) * 0.01;
    }
    
    // 呼吸效果
    this.body.scale.y = 1 + Math.sin(t * 2) * 0.02;
  }

  showMuzzleFlash() {
    const flash = new THREE.PointLight(0xffff00, 2, 3);
    flash.position.copy(this.weaponGroup.position);
    this.weaponGroup.add(flash);
    setTimeout(() => flash.remove(), 50);
  }

  applyState(state) {
    this.targetPosition = { ...state.position };
    if (state.rotation) this.targetRotation = { ...state.rotation };
    this.health = state.health;
    this.kills = state.kills;
    this.deaths = state.deaths;
    this.alive = state.alive;
    this.weapon = state.weapon;
    this.state = state.state;
    this.targetState = state.state;
  }

  setAlive(alive) {
    this.alive = alive;
    this.group.visible = alive;
  }

  respawn(position) {
    this.targetPosition = { ...position };
    this.position = { ...position };
    this.health = 100;
    this.alive = true;
    this.group.visible = true;
  }

  destroy() {
    this.game.scene.remove(this.group);
  }
}
