// Player controller module
class PlayerController {
  constructor(game) {
    this.game = game;
    
    // Local player state
    this.position = { x: 0, y: 1.6, z: 0 };
    this.rotation = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.health = 100;
    this.kills = 0;
    this.deaths = 0;
    this.alive = true;
    
    // Movement state
    this.state = 'idle'; // idle, running, crouching, prone, jumping, aiming
    this.isSprinting = false;
    this.isCrouching = false;
    this.isProning = false;
    this.isAiming = false;
    
    // Weapon
    this.currentWeapon = 'pistol';
    this.ammo = { pistol: 8, smg: 30, grenades: 2 };
    this.maxAmmo = { pistol: 8, smg: 30, grenades: 2 };
    this.lastShot = 0;
    this.isReloading = false;
    this.reloadStartTime = 0;
    this.reloadDuration = 2000; // 2 seconds
    
    // Controls state
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sprint: false,
      crouch: false,
      prone: false
    };
    this.mouseMovement = { x: 0, y: 0 };
    this.mouseDown = false;
    
    // View mode
    this.viewMode = 'fps'; // fps or tps
    this.fpsOffset = { x: 0, y: 0 }; // ADS offset
    this.tpsDistance = 5;
    this.tpsHeight = 2;
    
    // Constants
    this.moveSpeed = 8;
    this.sprintMultiplier = 1.5;
    this.lookSensitivity = 0.002;
    this.jumpForce = 8;
    this.gravity = 20;
    this.crouchSpeed = 4;
    this.proneSpeed = 2;
    
    // Ground check
    this.isGrounded = true;
    this.crouchHeight = 1.0;
    this.proneHeight = 0.5;
    this.standingHeight = 1.6;
    this.currentHeight = this.standingHeight;
    
    // Grenades
    this.grenadeTrajectory = null;
    this.isThrowingGrenade = false;
  }

  init() {
    // Keyboard events
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => this.onKeyUp(e));
    
    // Mouse events
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('mousedown', (e) => this.onMouseDown(e));
    document.addEventListener('mouseup', (e) => this.onMouseUp(e));
    
    // Pointer lock
    document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
  }

  onKeyDown(e) {
    if (!this.game.isPlaying) return;
    
    switch(e.code) {
      case 'KeyW': this.keys.forward = true; break;
      case 'KeyS': this.keys.backward = true; break;
      case 'KeyA': this.keys.left = true; break;
      case 'KeyD': this.keys.right = true; break;
      case 'Space': 
        if (this.isGrounded) {
          this.velocity.y = this.jumpForce;
          this.isGrounded = false;
        }
        break;
      case 'ShiftLeft': this.keys.sprint = true; break;
      case 'ControlLeft': this.keys.crouch = true; break;
      case 'KeyC': 
        if (!this.keys.crouch) this.keys.crouch = true;
        break;
      case 'KeyZ': this.keys.prone = true; break;
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
      case 'KeyC': this.keys.crouch = false; break;
      case 'KeyZ': this.keys.prone = false; break;
    }
  }

  onMouseMove(e) {
    if (!this.game.isPointerLocked) return;
    
    this.mouseMovement.x = e.movementX;
    this.mouseMovement.y = e.movementY;
  }

  onMouseDown(e) {
    if (e.button === 0) { // Left click
      this.mouseDown = true;
      if (this.isAiming) {
        this.fpsOffset = { x: 0, y: 0 };
      }
    }
  }

  onMouseUp(e) {
    if (e.button === 0) {
      this.mouseDown = false;
    }
  }

  onPointerLockChange() {
    this.game.isPointerLocked = document.pointerLockElement === this.game.canvas;
  }

  switchWeapon(weapon) {
    if (this.isReloading) {
      this.cancelReload();
    }
    this.currentWeapon = weapon;
    this.game.updateHUD();
  }

  async reload() {
    if (this.isReloading) return;
    if (this.ammo[this.currentWeapon] >= this.maxAmmo[this.currentWeapon]) return;
    
    this.isReloading = true;
    this.reloadStartTime = Date.now();
    this.state = 'reloading';
    
    await new Promise(resolve => setTimeout(resolve, this.reloadDuration));
    
    if (this.isReloading) {
      this.ammo[this.currentWeapon] = this.maxAmmo[this.currentWeapon];
      this.isReloading = false;
      this.state = 'idle';
      this.game.updateHUD();
      
      // Send reload to server
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
    
    // Calculate trajectory
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyEuler(new THREE.Euler(this.rotation.x, this.rotation.y, this.rotation.z, 'YXZ'));
    
    this.grenadeTrajectory = {
      start: { ...this.position },
      direction: direction,
      time: 0
    };
    
    // Send to server after delay (throw animation)
    setTimeout(() => {
      if (this.grenadeTrajectory) {
        network.throwGrenade(this.position, this.grenadeTrajectory);
        this.isThrowingGrenade = false;
      }
    }, 500);
    
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
    this.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotation.x));
    this.mouseMovement.x = 0;
    this.mouseMovement.y = 0;
    
    // Calculate movement direction
    let moveX = 0, moveZ = 0;
    
    if (this.keys.forward) moveZ -= 1;
    if (this.keys.backward) moveZ += 1;
    if (this.keys.left) moveX -= 1;
    if (this.keys.right) moveX += 1;
    
    // Normalize diagonal movement
    if (moveX !== 0 && moveZ !== 0) {
      const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
      moveX /= len;
      moveZ /= len;
    }
    
    // Apply rotation to movement
    const sin = Math.sin(this.rotation.y);
    const cos = Math.cos(this.rotation.y);
    const worldMoveX = moveX * cos - moveZ * sin;
    const worldMoveZ = moveX * sin + moveZ * cos;
    
    // Calculate speed
    let speed = this.moveSpeed;
    this.isSprinting = this.keys.sprint && moveZ < 0;
    
    if (this.keys.crouch && !this.keys.prone) {
      speed = this.crouchSpeed;
      this.isCrouching = true;
      this.currentHeight = this.crouchHeight;
    } else if (this.keys.prone) {
      speed = this.proneSpeed;
      this.isProning = true;
      this.currentHeight = this.proneHeight;
    } else {
      this.isCrouching = false;
      this.isProning = false;
      this.currentHeight = this.standingHeight;
    }
    
    if (this.isSprinting && !this.isCrouching && !this.isProning) {
      speed *= this.sprintMultiplier;
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
    
    // Ground collision (simple floor at y=0)
    if (this.position.y < this.currentHeight) {
      this.position.y = this.currentHeight;
      this.velocity.y = 0;
      this.isGrounded = true;
    }
    
    // Boundary check
    const boundary = 50;
    this.position.x = Math.max(-boundary, Math.min(boundary, this.position.x));
    this.position.z = Math.max(-boundary, Math.min(boundary, this.position.z));
    
    // Update state
    if (this.velocity.y > 0) {
      this.state = 'jumping';
    } else if (moveX !== 0 || moveZ !== 0) {
      this.state = this.isSprinting ? 'running' : 'walking';
    } else {
      this.state = 'idle';
    }
    
    if (this.isCrouching) this.state = 'crouching';
    if (this.isProning) this.state = 'prone';
    
    // Handle shooting
    if (this.mouseDown && !this.isReloading) {
      this.shoot();
    }
    
    // Update camera position based on view mode
    this.updateCamera();
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
    
    // Get camera direction
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyEuler(new THREE.Euler(this.rotation.x, this.rotation.y, this.rotation.z, 'YXZ'));
    
    // Camera position
    const origin = this.game.camera.position.clone();
    
    // Raycast for hit detection
    const raycaster = new THREE.Raycaster(origin, direction, 0, 100);
    const hitTargets = this.game.getHitTargets();
    const intersects = raycaster.intersectObjects(hitTargets, true);
    
    // Send shoot to server
    network.sendShoot(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: direction.x, y: direction.y, z: direction.z },
      this.currentWeapon
    ).then(response => {
      if (response.hit && response.hit.confirmed) {
        this.game.showHitMarker(response.hit.isHeadshot);
      }
    });
    
    // Local hit detection for immediate feedback
    if (intersects.length > 0) {
      const hit = intersects[0];
      const isHeadshot = hit.object.name === 'head';
      this.game.showHitMarker(isHeadshot);
      
      // Show hit effect at hit point
      this.game.createHitEffect(hit.point);
    }
    
    // Weapon recoil
    this.rotation.x += 0.02;
    
    // Muzzle flash
    this.game.showMuzzleFlash();
    
    this.game.updateHUD();
  }

  updateCamera() {
    const target = this.game.cameraTarget;
    
    if (this.viewMode === 'fps') {
      // First person view
      target.position.set(
        this.position.x,
        this.position.y,
        this.position.z
      );
      target.rotation.set(
        this.rotation.x,
        this.rotation.y,
        this.rotation.z
      );
    } else {
      // Third person view
      const offset = new THREE.Vector3(0, this.tpsHeight, this.tpsDistance);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation.y);
      
      target.position.set(
        this.position.x + offset.x,
        this.position.y + offset.y,
        this.position.z + offset.z
      );
      
      // Look at player
      target.lookAt(
        this.position.x,
        this.position.y + 0.5,
        this.position.z
      );
    }
  }

  // Apply state from server
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
    if (this.health <= 0) {
      this.die();
    }
  }

  die() {
    this.alive = false;
    this.state = 'dead';
    this.health = 0;
    document.exitPointerLock();
  }

  respawn(position) {
    this.position = { ...position };
    this.position.y = this.game.mapConfig.standingHeight || 1.6;
    this.health = 100;
    this.alive = true;
    this.state = 'idle';
    this.velocity = { x: 0, y: 0, z: 0 };
  }

  // Get serializable state for network
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

// Remote player for opponent
class RemotePlayer {
  constructor(game, id) {
    this.game = game;
    this.id = id;
    
    this.position = { x: 0, y: 1.6, z: 0 };
    this.rotation = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.health = 100;
    this.kills = 0;
    this.deaths = 0;
    this.alive = true;
    this.weapon = 'pistol';
    this.state = 'idle';
    
    // Interpolation
    this.targetPosition = { x: 0, y: 1.6, z: 0 };
    this.targetRotation = { x: 0, y: 0, z: 0 };
    this.lerpFactor = 0.2;
    
    this.createMesh();
  }

  createMesh() {
    // Simple humanoid representation
    this.group = new THREE.Group();
    
    // Body
    const bodyGeo = new THREE.BoxGeometry(0.6, 1.2, 0.4);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3498db });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.body.position.y = 0.8;
    this.group.add(this.body);
    
    // Head
    const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xf5cba7 });
    this.head = new THREE.Mesh(headGeo, headMat);
    this.head.position.y = 1.6;
    this.head.name = 'head';
    this.group.add(this.head);
    
    // Weapon placeholder
    const weaponGeo = new THREE.BoxGeometry(0.1, 0.1, 0.6);
    const weaponMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    this.weapon = new THREE.Mesh(weaponGeo, weaponMat);
    this.weapon.position.set(0.3, 1.0, -0.4);
    this.group.add(this.weapon);
    
    this.game.scene.add(this.group);
  }

  update(deltaTime) {
    if (!this.alive) {
      this.group.visible = false;
      return;
    }
    
    this.group.visible = true;
    
    // Interpolate position
    this.position.x += (this.targetPosition.x - this.position.x) * this.lerpFactor;
    this.position.y += (this.targetPosition.y - this.position.y) * this.lerpFactor;
    this.position.z += (this.targetPosition.z - this.position.z) * this.lerpFactor;
    
    // Interpolate rotation
    this.rotation.x += (this.targetRotation.x - this.rotation.x) * this.lerpFactor;
    this.rotation.y += (this.targetRotation.y - this.rotation.y) * this.lerpFactor;
    
    // Apply to mesh
    this.group.position.set(this.position.x, this.position.y - 0.8, this.position.z);
    this.group.rotation.y = this.rotation.y;
    
    // Update head rotation for aiming
    this.head.rotation.x = this.rotation.x;
    
    // Update weapon based on state
    if (this.state === 'running') {
      this.weapon.rotation.x = Math.sin(Date.now() * 0.01) * 0.1;
    }
  }

  applyState(state) {
    this.targetPosition = { ...state.position };
    this.targetRotation = { ...state.rotation };
    this.health = state.health;
    this.kills = state.kills;
    this.deaths = state.deaths;
    this.alive = state.alive;
    this.weapon = state.weapon;
    this.state = state.state;
  }

  die() {
    this.alive = false;
    this.group.visible = false;
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
