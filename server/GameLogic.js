const mapConfig = require('../shared/mapConfig.json');

class GameLogic {
  constructor() {
    this.weapons = mapConfig.weapons;
    this.killLimit = mapConfig.gameSettings.killLimit;
    this.spawnProtection = mapConfig.gameSettings.spawnProtection;
  }

  calculateDamage(weaponType, isHeadshot) {
    const weapon = this.weapons[weaponType] || this.weapons.pistol;
    let damage = weapon.damage;
    if (isHeadshot) {
      damage *= weapon.headshotMultiplier;
    }
    return Math.round(damage);
  }

  checkKill(attackerId, victimId, room) {
    const victim = room.players.get(victimId);
    if (!victim) return { killed: false };
    
    if (victim.invincible) {
      return { killed: false, reason: 'invincible' };
    }

    const attacker = room.players.get(attackerId);
    if (attacker) {
      attacker.kills++;
      
      if (attacker.kills >= this.killLimit) {
        room.gamePhase = 'ended';
        return { 
          killed: true, 
          winner: attackerId,
          gameOver: true
        };
      }
    }

    victim.deaths++;
    victim.alive = false;
    
    setTimeout(() => {
      this.respawnPlayer(victimId, room);
    }, mapConfig.gameSettings.respawnTime);

    return { killed: true, gameOver: false };
  }

  respawnPlayer(playerId, room) {
    const player = room.players.get(playerId);
    if (!player || room.gamePhase !== 'playing') return;

    const teamIndex = [...room.players.keys()].indexOf(playerId);
    const spawnPoint = mapConfig.spawnPoints[teamIndex] || mapConfig.spawnPoints[0];

    player.position = { ...spawnPoint };
    player.alive = true;
    player.health = 100;
    player.invincible = true;
    
    setTimeout(() => {
      if (room.players.get(playerId)) {
        room.players.get(playerId).invincible = false;
      }
    }, this.spawnProtection);
  }

  validateMovement(playerId, newPosition, oldPosition, deltaTime, room) {
    const player = room.players.get(playerId);
    if (!player) return false;

    const dx = newPosition.x - oldPosition.x;
    const dz = newPosition.z - oldPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    const maxSpeed = player.isSprinting ? 12 : 8;
    const maxDistance = maxSpeed * deltaTime * 1.5;

    return distance <= maxDistance;
  }

  handleGrenadeExplosion(grenadePosition, throwerId, room) {
    const grenade = this.weapons.grenade;
    const affected = [];

    room.players.forEach((player, playerId) => {
      if (playerId === throwerId || !player.alive) return;

      const dx = player.position.x - grenadePosition.x;
      const dz = player.position.z - grenadePosition.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance <= grenade.radius) {
        const falloff = 1 - (distance / grenade.radius);
        const damage = Math.round(grenade.damage * falloff);
        player.health -= damage;
        affected.push({ playerId, damage, distance });
        
        if (player.health <= 0) {
          this.checkKill(throwerId, playerId, room);
        }
      }
    });

    return affected;
  }

  checkPlayerDeath(playerId, room) {
    const player = room.players.get(playerId);
    if (player && player.health <= 0 && player.alive) {
      player.alive = false;
      return true;
    }
    return false;
  }

  // 改进的射线检测 - 检测对手玩家
  raycast(origin, direction, maxDistance, room, shooterId) {
    let closestHit = null;
    let closestDistance = maxDistance;

    room.players.forEach((player, playerId) => {
      if (playerId === shooterId || !player.alive) return;

      // 玩家碰撞箱
      const pos = player.position;
      
      // 身体碰撞箱 (从脚到头)
      const hit = this.checkPlayerHit(origin, direction, maxDistance, pos);
      
      if (hit && hit.distance < closestDistance) {
        closestDistance = hit.distance;
        closestHit = {
          playerId,
          point: hit.point,
          isHeadshot: hit.isHeadshot,
          distance: hit.distance
        };
      }
    });

    return closestHit;
  }

  // 检测射线是否击中玩家
  checkPlayerHit(origin, direction, maxDist, playerPos) {
    // 玩家高度
    const feetY = playerPos.y;
    const headY = playerPos.y + 1.8; // 身高约1.8米
    const bodyMid = (feetY + headY) / 2;
    
    // 玩家宽度
    const halfWidth = 0.3;
    
    // 计算射线与玩家所在平面的交点
    // 简化：只在玩家高度范围内检测
    
    // t 值求解
    // origin + direction * t = (playerPos.x, ?, playerPos.z)
    
    // XZ平面检测
    if (Math.abs(direction.x) < 0.001 && Math.abs(direction.z) < 0.001) {
      return null; // 射线不朝XZ平面移动
    }
    
    // 计算射线到达玩家X坐标的t
    let tX = null, tZ = null;
    let hitY = null;
    let isHeadshot = false;
    
    // 检测X平面
    if (Math.abs(direction.x) > 0.001) {
      tX = (playerPos.x - origin.x) / direction.x;
      if (tX > 0 && tX < maxDist) {
        const hitYAtX = origin.y + direction.y * tX;
        const hitZAtX = origin.z + direction.z * tX;
        
        // 检查Z是否在范围内
        if (Math.abs(hitZAtX - playerPos.z) <= halfWidth) {
          // 检查Y是否在身体范围内
          if (hitYAtX >= feetY && hitYAtX <= headY) {
            isHeadshot = hitYAtX > headY - 0.4; // 头部区域
            hitY = hitYAtX;
          }
        }
      }
    }
    
    // 检测Z平面
    if (Math.abs(direction.z) > 0.001) {
      tZ = (playerPos.z - origin.z) / direction.z;
      if (tZ > 0 && tZ < maxDist) {
        const hitYAtZ = origin.y + direction.y * tZ;
        const hitXAtZ = origin.x + direction.x * tZ;
        
        // 检查X是否在范围内
        if (Math.abs(hitXAtZ - playerPos.x) <= halfWidth) {
          // 检查Y是否在身体范围内
          if (hitYAtZ >= feetY && hitYAtZ <= headY) {
            const isHeadshotZ = hitYAtZ > headY - 0.4;
            // 选择更近的命中
            if (!closestHit || 
                (tX !== null && tX < tZ && !isHeadshot && isHeadshotZ) ||
                (tX !== null && tX >= tZ && closestHit?.isHeadshot && !isHeadshotZ)) {
              // 重新检查
            }
            if ((closestHit?.distance || maxDist) > tZ) {
              isHeadshot = isHeadshotZ;
              hitY = hitYAtZ;
              closestHit = { distance: tZ };
            }
          }
        }
      }
    }
    
    // 综合判断
    if (tX !== null && tX < maxDist) {
      const hitYAtX = origin.y + direction.y * tX;
      const hitZAtX = origin.z + direction.z * tX;
      
      if (Math.abs(hitZAtX - playerPos.z) <= halfWidth) {
        if (hitYAtX >= feetY && hitYAtX <= headY) {
          if (!closestHit || tX < closestHit.distance) {
            isHeadshot = hitYAtX > headY - 0.4;
            return {
              distance: tX,
              point: { x: playerPos.x, y: hitYAtX, z: hitZAtX },
              isHeadshot
            };
          }
        }
      }
    }
    
    if (tZ !== null && tZ < maxDist) {
      const hitYAtZ = origin.y + direction.y * tZ;
      const hitXAtZ = origin.x + direction.x * tZ;
      
      if (Math.abs(hitXAtZ - playerPos.x) <= halfWidth) {
        if (hitYAtZ >= feetY && hitYAtZ <= headY) {
          if (!closestHit || tZ < closestHit.distance) {
            isHeadshot = hitYAtZ > headY - 0.4;
            return {
              distance: tZ,
              point: { x: hitXAtZ, y: hitYAtZ, z: playerPos.z },
              isHeadshot
            };
          }
        }
      }
    }
    
    return null;
  }
}

module.exports = GameLogic;
