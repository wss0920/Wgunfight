const mapConfig = require('../shared/mapConfig.json');

class GameLogic {
  constructor() {
    this.weapons = mapConfig.weapons;
    this.killLimit = mapConfig.gameSettings.killLimit;
    this.spawnProtection = mapConfig.gameSettings.spawnProtection;
  }

  // 计算射击伤害
  calculateDamage(weaponType, isHeadshot) {
    const weapon = this.weapons[weaponType] || this.weapons.pistol;
    let damage = weapon.damage;
    if (isHeadshot) {
      damage *= weapon.headshotMultiplier;
    }
    return Math.round(damage);
  }

  // 检查击杀
  checkKill(attackerId, victimId, room) {
    const victim = room.players.get(victimId);
    
    // 检查是否在无敌状态
    if (victim && victim.invincible) {
      return { killed: false, reason: 'invincible' };
    }

    // 更新击杀数
    const attacker = room.players.get(attackerId);
    if (attacker) {
      attacker.kills++;
      
      // 检查是否达到胜利条件
      if (attacker.kills >= this.killLimit) {
        room.gamePhase = 'ended';
        return { 
          killed: true, 
          winner: attackerId,
          gameOver: true
        };
      }
    }

    // 处理死亡和重生
    if (victim) {
      victim.deaths++;
      victim.alive = false;
      
      // 设置重生计时器
      setTimeout(() => {
        this.respawnPlayer(victimId, room);
      }, mapConfig.gameSettings.respawnTime);
    }

    return { killed: true, gameOver: false };
  }

  // 重生玩家
  respawnPlayer(playerId, room) {
    const player = room.players.get(playerId);
    if (!player || room.gamePhase !== 'playing') return;

    // 找到出生点
    const teamIndex = [...room.players.keys()].indexOf(playerId);
    const spawnPoint = mapConfig.spawnPoints[teamIndex] || mapConfig.spawnPoints[0];

    player.position = { ...spawnPoint };
    player.alive = true;
    player.health = 100;

    // 设置无敌时间
    player.invincible = true;
    setTimeout(() => {
      if (room.players.get(playerId)) {
        room.players.get(playerId).invincible = false;
      }
    }, this.spawnProtection);
  }

  // 验证移动速度（防作弊）
  validateMovement(playerId, newPosition, oldPosition, deltaTime, room) {
    const player = room.players.get(playerId);
    if (!player) return false;

    // 计算移动距离
    const dx = newPosition.x - oldPosition.x;
    const dz = newPosition.z - oldPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    // 最大移动速度 (单位/秒) - 考虑冲刺
    const maxSpeed = player.isSprinting ? 12 : 8;
    const maxDistance = maxSpeed * deltaTime;

    return distance <= maxDistance;
  }

  // 处理手榴弹爆炸
  handleGrenadeExplosion(grenadePosition, throwerId, room) {
    const grenade = this.weapons.grenade;
    const affected = [];

    room.players.forEach((player, playerId) => {
      if (playerId === throwerId || !player.alive) return;

      const dx = player.position.x - grenadePosition.x;
      const dz = player.position.z - grenadePosition.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance <= grenade.radius) {
        // 距离越近伤害越高
        const falloff = 1 - (distance / grenade.radius);
        const damage = Math.round(grenade.damage * falloff);
        player.health -= damage;
        affected.push({ playerId, damage, distance });
      }
    });

    return affected;
  }

  // 检查玩家是否死亡
  checkPlayerDeath(playerId, room) {
    const player = room.players.get(playerId);
    if (player && player.health <= 0 && player.alive) {
      player.alive = false;
      player.deaths++;
      return true;
    }
    return false;
  }

  // 射线投射检测（服务端验证）
  raycast(origin, direction, maxDistance, room) {
    // 简化的服务端射线检测
    // 检查是否击中其他玩家
    let closestHit = null;
    let closestDistance = maxDistance;

    room.players.forEach((player, playerId) => {
      if (!player.alive) return;

      // 简单的碰撞箱检测
      const hit = this.checkBoxIntersection(
        origin, direction, maxDistance,
        player.position, { x: 1, y: 2, z: 1 }
      );

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

  // 碰撞箱检测
  checkBoxIntersection(origin, direction, maxDist, boxPos, boxSize) {
    // 简化版本：只检测身体部分
    const headHeight = 1.7;
    const bodyHeight = 0.8;

    // 检测身体
    const bodyHit = this.rayIntersectsBox(
      origin, direction, maxDist,
      { x: boxPos.x - boxSize.x/2, y: boxPos.y, z: boxPos.z - boxSize.z/2 },
      { x: boxPos.x + boxSize.x/2, y: boxPos.y + bodyHeight, z: boxPos.z + boxSize.z/2 }
    );

    // 检测头部
    const headHit = this.rayIntersectsBox(
      origin, direction, maxDist,
      { x: boxPos.x - 0.3, y: boxPos.y + bodyHeight, z: boxPos.z - 0.3 },
      { x: boxPos.x + 0.3, y: boxPos.y + headHeight, z: boxPos.z + 0.3 }
    );

    if (bodyHit && headHit) {
      return headHit.distance < bodyHit.distance 
        ? { ...headHit, isHeadshot: true }
        : { ...bodyHit, isHeadshot: false };
    }
    return bodyHit || headHit;
  }

  // 射线与盒子相交检测
  rayIntersectsBox(origin, direction, maxDist, min, max) {
    const invDir = {
      x: direction.x !== 0 ? 1 / direction.x : Infinity,
      y: direction.y !== 0 ? 1 / direction.y : Infinity,
      z: direction.z !== 0 ? 1 / direction.z : Infinity
    };

    const t1 = (min.x - origin.x) * invDir.x;
    const t2 = (max.x - origin.x) * invDir.x;
    const t3 = (min.y - origin.y) * invDir.y;
    const t4 = (max.y - origin.y) * invDir.y;
    const t5 = (min.z - origin.z) * invDir.z;
    const t6 = (max.z - origin.z) * invDir.z;

    const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4), Math.min(t5, t6));
    const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4), Math.max(t5, t6));

    if (tmax < 0 || tmin > tmax || tmin > maxDist) {
      return null;
    }

    const t = tmin > 0 ? tmin : tmax;
    return {
      distance: t,
      point: {
        x: origin.x + direction.x * t,
        y: origin.y + direction.y * t,
        z: origin.z + direction.z * t
      }
    };
  }
}

module.exports = GameLogic;
