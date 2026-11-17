// The game's rules and state, with no drawing and no browser in it: the pilot ship, the
// waves of rogue drones, bullets, pickups, particles, score and combo. step() advances one
// fixed step and returns what happened as bit flags, so the caller can react (sound, shake)
// without the world knowing about screens or audio. Nothing here allocates after
// createWorld returns: every pool is filled once, at boot.

import {
  BULLET, COMBO, ENEMY, FIELD, ORB, PICKUP, PLAYER, POOL, WAVE,
} from './config.js';

export const KIND_DRIFTER = 0;
export const KIND_SPINNER = 1;
export const KIND_SPLITTER = 2;
export const KIND_MINI = 3;

export const PICKUP_CORE = 'core';
export const PICKUP_SHIELD = 'shield';
export const PICKUP_RAPID = 'rapid';
export const PICKUP_SPREAD = 'spread';
export const PICKUP_REPAIR = 'repair';

export const EVENT_SHOOT = 1;
export const EVENT_EXPLODE = 2;
export const EVENT_HIT = 4;
export const EVENT_PICKUP = 8;
export const EVENT_CORE = 16;
export const EVENT_WAVE = 32;
export const EVENT_CLEAR = 64;
export const EVENT_OVER = 128;

const KIND_STATS = [ENEMY.drifter, ENEMY.spinner, ENEMY.splitter, ENEMY.mini];

function distanceSquared(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0, angle: -Math.PI / 2,
    hearts: PLAYER.hearts, invulnerable: 0, shield: 0, rapid: 0, spread: 0, fireTimer: 0,
  };
  const bullets = [];
  for (let i = 0; i < POOL.bullets; i += 1) bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0 });
  const orbs = [];
  for (let i = 0; i < POOL.orbs; i += 1) orbs.push({ active: false, x: 0, y: 0, vx: 0, vy: 0 });
  const enemies = [];
  for (let i = 0; i < POOL.enemies; i += 1) {
    enemies.push({ active: false, kind: KIND_DRIFTER, x: 0, y: 0, vx: 0, vy: 0, hp: 1, radius: 16, fireTimer: 0, spin: 0 });
  }
  const particles = [];
  for (let i = 0; i < POOL.particles; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#fff' });
  }
  const pickups = [];
  for (let i = 0; i < POOL.pickups; i += 1) {
    pickups.push({ active: false, kind: PICKUP_CORE, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  }
  const floaters = [];
  for (let i = 0; i < POOL.floaters; i += 1) {
    floaters.push({ active: false, x: 0, y: 0, text: '', life: 0, maxLife: 1 });
  }
  const spawnQueue = [];
  const state = {
    player, bullets, orbs, enemies, particles, pickups, floaters,
    score: 0, kills: 0, shards: 0, wave: 1, waveState: 'breather', waveTimer: 1.2,
    combo: 1, comboTimer: 0, shake: 0, flash: 0, harmless: false, backdropTimer: 0,
    banner: { text: '', timer: 0 },
  };

  function free(pool) {
    for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
    return null;
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const p = free(particles);
      if (!p) return;
      const angle = random() * Math.PI * 2;
      const power = speed * (0.3 + random() * 0.7);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * power;
      p.vy = Math.sin(angle) * power;
      p.maxLife = 0.4 + random() * 0.5;
      p.life = p.maxLife;
      p.size = 2 + random() * 3;
      p.color = color;
    }
  }

  function floater(x, y, text) {
    const f = free(floaters);
    if (!f) return;
    f.active = true;
    f.x = x;
    f.y = y;
    f.text = text;
    f.maxLife = 0.9;
    f.life = f.maxLife;
  }

  function dropPickup(x, y, kind) {
    const p = free(pickups);
    if (!p) return;
    p.active = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    const angle = random() * Math.PI * 2;
    p.vx = Math.cos(angle) * 40;
    p.vy = Math.sin(angle) * 40;
    p.life = PICKUP.life;
  }

  function edgePoint() {
    for (let tries = 0; tries < 8; tries += 1) {
      const side = Math.floor(random() * 4);
      let x = 0;
      let y = 0;
      if (side === 0) { x = random() * FIELD.width; y = -24; }
      else if (side === 1) { x = random() * FIELD.width; y = FIELD.height + 24; }
      else if (side === 2) { x = -24; y = random() * FIELD.height; }
      else { x = FIELD.width + 24; y = random() * FIELD.height; }
      if (distanceSquared(x, y, player.x, player.y) > 200 * 200) return { x, y };
    }
    return { x: FIELD.width / 2, y: -24 };
  }

  function spawnEnemy(kind) {
    const e = free(enemies);
    if (!e) return;
    const stats = KIND_STATS[kind];
    const at = edgePoint();
    e.active = true;
    e.kind = kind;
    e.x = at.x;
    e.y = at.y;
    e.vx = 0;
    e.vy = 0;
    e.hp = stats.hp;
    e.radius = stats.radius;
    e.fireTimer = 1 + random() * 1.5;
    e.spin = random() * Math.PI * 2;
    if (state.harmless) {
      // A backdrop drone drifts straight across the field instead of hunting.
      const tx = random() * FIELD.width;
      const ty = random() * FIELD.height;
      const d = Math.hypot(tx - at.x, ty - at.y) || 1;
      const speed = 50 + random() * 50;
      e.vx = ((tx - at.x) / d) * speed;
      e.vy = ((ty - at.y) / d) * speed;
    }
  }

  function buildWave(wave) {
    spawnQueue.length = 0;
    const drifters = WAVE.baseDrifters + WAVE.driftersPerWave * wave;
    const spinners = wave >= WAVE.spinnerFromWave ? (wave - WAVE.spinnerFromWave + 1) * WAVE.spinnersPerWave : 0;
    const splitters = wave >= WAVE.splitterFromWave ? (wave - WAVE.splitterFromWave + 1) * WAVE.splittersPerWave : 0;
    for (let i = 0; i < drifters; i += 1) spawnQueue.push(KIND_DRIFTER);
    for (let i = 0; i < spinners; i += 1) spawnQueue.push(KIND_SPINNER);
    for (let i = 0; i < splitters; i += 1) spawnQueue.push(KIND_SPLITTER);
    for (let i = spawnQueue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const tmp = spawnQueue[i];
      spawnQueue[i] = spawnQueue[j];
      spawnQueue[j] = tmp;
    }
  }

  function startWave() {
    buildWave(state.wave);
    state.waveState = 'active';
    state.banner.text = `WAVE ${state.wave}`;
    state.banner.timer = 1.6;
    return EVENT_WAVE;
  }

  function clearWave() {
    const bonus = WAVE.clearBonus * state.wave;
    state.score += bonus;
    floater(player.x, player.y - 40, `WAVE BONUS +${bonus}`);
    const gift = player.hearts < PLAYER.hearts
      ? PICKUP_REPAIR
      : [PICKUP_SHIELD, PICKUP_RAPID, PICKUP_SPREAD][Math.floor(random() * 3)];
    dropPickup(FIELD.width / 2 + (random() - 0.5) * 200, FIELD.height / 2, gift);
    state.waveState = 'breather';
    state.waveTimer = WAVE.breather;
    state.wave += 1;
    state.banner.text = 'WAVE CLEARED';
    state.banner.timer = 1.6;
    return EVENT_CLEAR;
  }

  function killEnemy(e, events) {
    e.active = false;
    state.kills += 1;
    state.combo = Math.min(COMBO.max, state.combo + (state.comboTimer > 0 ? 1 : 0));
    state.comboTimer = COMBO.window;
    const stats = KIND_STATS[e.kind];
    const points = stats.score * state.combo;
    state.score += points;
    floater(e.x, e.y, `+${points}`);
    const colors = ['#ff4d5e', '#b06bff', '#ff9f2e', '#ffc93c'];
    burst(e.x, e.y, colors[e.kind], e.kind === KIND_SPLITTER ? 22 : 14, 260);
    burst(e.x, e.y, '#ffffff', 6, 160);
    state.shake = Math.max(state.shake, 5);
    if (e.kind === KIND_SPLITTER) {
      for (let i = 0; i < 2; i += 1) {
        const mini = free(enemies);
        if (!mini) break;
        mini.active = true;
        mini.kind = KIND_MINI;
        mini.x = e.x + (i === 0 ? -14 : 14);
        mini.y = e.y;
        mini.vx = (i === 0 ? -120 : 120);
        mini.vy = -60;
        mini.hp = ENEMY.mini.hp;
        mini.radius = ENEMY.mini.radius;
        mini.fireTimer = 0;
        mini.spin = random() * Math.PI * 2;
      }
    } else if (random() < PICKUP.coreDropChance) {
      dropPickup(e.x, e.y, PICKUP_CORE);
    }
    return events | EVENT_EXPLODE;
  }

  function hurtPlayer(events) {
    if (player.invulnerable > 0) return events;
    if (player.shield > 0) {
      player.shield = Math.max(0, player.shield - 1);
      player.invulnerable = 0.6;
      state.shake = Math.max(state.shake, 8);
      burst(player.x, player.y, '#5ea8ff', 10, 200);
      return events | EVENT_HIT;
    }
    player.hearts -= 1;
    player.invulnerable = PLAYER.invulnerable;
    state.flash = 0.35;
    state.shake = Math.max(state.shake, 12);
    burst(player.x, player.y, '#ff4d5e', 18, 300);
    if (player.hearts <= 0) return events | EVENT_HIT | EVENT_OVER;
    return events | EVENT_HIT;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.vx = 0;
    player.vy = 0;
    player.angle = -Math.PI / 2;
    player.hearts = PLAYER.hearts;
    player.invulnerable = 0;
    player.shield = 0;
    player.rapid = 0;
    player.spread = 0;
    player.fireTimer = 0;
    for (const pool of [bullets, orbs, enemies, particles, pickups, floaters]) {
      for (const item of pool) item.active = false;
    }
    spawnQueue.length = 0;
    state.score = 0;
    state.kills = 0;
    state.shards = 0;
    state.wave = 1;
    state.waveState = 'breather';
    state.waveTimer = 1.2;
    state.combo = 1;
    state.comboTimer = 0;
    state.shake = 0;
    state.flash = 0;
    state.harmless = false;
    state.backdropTimer = 0;
    state.banner.text = '';
    state.banner.timer = 0;
  }

  /**
   * One fixed step. `control` is {mx, my, aimX, aimY, firing} in field coordinates.
   * With `harmless` set (the title screen's backdrop) drones drift in but nothing
   * touches the player and nothing scores.
   */
  function step(dt, control, harmless) {
    let events = 0;
    state.harmless = harmless;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 28);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);
    if (state.banner.timer > 0) state.banner.timer -= dt;
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 1;
    }

    // The pilot: accelerate toward the held direction, aim at the pointer.
    const targetVx = control.mx * PLAYER.speed;
    const targetVy = control.my * PLAYER.speed;
    const blend = 1 - Math.exp(-12 * dt);
    player.vx += (targetVx - player.vx) * blend;
    player.vy += (targetVy - player.vy) * blend;
    player.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + player.vx * dt));
    player.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, player.y + player.vy * dt));
    player.angle = Math.atan2(control.aimY - player.y, control.aimX - player.x);
    if (player.invulnerable > 0) player.invulnerable -= dt;
    if (player.shield > 0) player.shield -= dt;
    if (player.rapid > 0) player.rapid -= dt;
    if (player.spread > 0) player.spread -= dt;

    // Firing: one bullet (or a three-way spread) from the nose, toward the aim.
    player.fireTimer -= dt;
    if (control.firing && player.fireTimer <= 0 && !harmless) {
      player.fireTimer = player.rapid > 0 ? PLAYER.fireInterval / 2 : PLAYER.fireInterval;
      const noseX = player.x + Math.cos(player.angle) * (PLAYER.radius + 6);
      const noseY = player.y + Math.sin(player.angle) * (PLAYER.radius + 6);
      const angles = player.spread > 0 ? [-0.16, 0, 0.16] : [0];
      for (const offset of angles) {
        const b = free(bullets);
        if (!b) break;
        const a = player.angle + offset;
        b.active = true;
        b.x = noseX;
        b.y = noseY;
        b.vx = Math.cos(a) * PLAYER.bulletSpeed;
        b.vy = Math.sin(a) * PLAYER.bulletSpeed;
      }
      events |= EVENT_SHOOT;
    }

    // Waves: a breather, then a queue of drones trickling in from the edges. On the
    // title screen's backdrop, a few drones just drift across instead.
    if (harmless) {
      state.backdropTimer -= dt;
      if (state.backdropTimer <= 0) {
        let active = 0;
        for (const e of enemies) if (e.active) active += 1;
        if (active < 5) spawnEnemy(KIND_DRIFTER);
        state.backdropTimer = 0.8;
      }
    } else if (state.waveState === 'breather') {
        state.waveTimer -= dt;
        if (state.waveTimer <= 0) events |= startWave();
      } else if (state.waveState === 'active') {
        if (spawnQueue.length > 0) {
          state.waveTimer -= dt;
          if (state.waveTimer <= 0) {
            spawnEnemy(spawnQueue.shift());
            state.waveTimer = WAVE.spawnGap;
          }
        } else {
          let any = false;
          for (const e of enemies) if (e.active) { any = true; break; }
          if (!any) events |= clearWave();
        }
      }

    // Bullets fly straight and die past the field.
    for (const b of bullets) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) b.active = false;
    }
    for (const o of orbs) {
      if (!o.active) continue;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (o.x < -20 || o.x > FIELD.width + 20 || o.y < -20 || o.y > FIELD.height + 20) o.active = false;
    }

    // Drones: each kind flies its own way; spinners shoot back. Backdrop drones on the
    // title screen keep the straight drift they spawned with.
    for (const e of enemies) {
      if (!e.active) continue;
      const stats = KIND_STATS[e.kind];
      const speed = stats.speed + stats.speedPerWave * (state.wave - 1);
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (harmless) {
        // Keep the spawned drift; drift off the far edge and go quiet there.
        if (e.x < -60 || e.x > FIELD.width + 60 || e.y < -60 || e.y > FIELD.height + 60) e.active = false;
      } else if (e.kind === KIND_SPINNER) {
        const want = dist > 300 ? 1 : dist < 220 ? -1 : 0;
        const tx = (dx / dist) * speed * want;
        const ty = (dy / dist) * speed * want;
        e.vx += (tx - e.vx) * (1 - Math.exp(-3 * dt));
        e.vy += (ty - e.vy) * (1 - Math.exp(-3 * dt));
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && !harmless && dist < 560) {
          e.fireTimer = ENEMY.spinner.fireInterval;
          const o = free(orbs);
          if (o) {
            o.active = true;
            o.x = e.x;
            o.y = e.y;
            o.vx = (dx / dist) * ENEMY.spinner.orbSpeed;
            o.vy = (dy / dist) * ENEMY.spinner.orbSpeed;
          }
        }
      } else {
        e.vx += ((dx / dist) * speed - e.vx) * (1 - Math.exp(-2.5 * dt));
        e.vy += ((dy / dist) * speed - e.vy) * (1 - Math.exp(-2.5 * dt));
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.spin += dt * 2;
    }

    // Drones keep a little room between each other.
    for (let i = 0; i < enemies.length; i += 1) {
      const a = enemies[i];
      if (!a.active) continue;
      for (let j = i + 1; j < enemies.length; j += 1) {
        const b = enemies[j];
        if (!b.active) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = ((min - d) / d) * 0.5;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }

    // Bullets meet drones.
    for (const b of bullets) {
      if (!b.active) continue;
      for (const e of enemies) {
        if (!e.active) continue;
        const rr = e.radius + BULLET.radius;
        if (distanceSquared(b.x, b.y, e.x, e.y) < rr * rr) {
          b.active = false;
          e.hp -= BULLET.damage;
          burst(b.x, b.y, '#ffe9a3', 3, 120);
          if (e.hp <= 0) events = killEnemy(e, events);
          break;
        }
      }
    }

    // Orbs and drones meet the pilot.
    if (!harmless) {
      for (const o of orbs) {
        if (!o.active) continue;
        const rr = PLAYER.radius + ORB.radius;
        if (distanceSquared(o.x, o.y, player.x, player.y) < rr * rr) {
          o.active = false;
          events = hurtPlayer(events);
          if (events & EVENT_OVER) return events;
        }
      }
      for (const e of enemies) {
        if (!e.active) continue;
        const rr = e.radius + PLAYER.radius - 2;
        if (distanceSquared(e.x, e.y, player.x, player.y) < rr * rr) {
          if (player.shield > 0 || player.invulnerable > 0) {
            if (player.shield > 0) {
              e.hp -= 1;
              if (e.hp <= 0) events = killEnemy(e, events);
            }
            continue;
          }
          if (e.kind === KIND_SPINNER || e.kind === KIND_SPLITTER) {
            e.hp -= 1;
            if (e.hp <= 0) events = killEnemy(e, events);
          } else {
            events = killEnemy(e, events);
          }
          events = hurtPlayer(events);
          if (events & EVENT_OVER) return events;
        }
      }
    }

    // Pickups drift, magnet toward the pilot when close, and are collected on touch.
    for (const p of pickups) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      const dx = player.x - p.x;
      const dy = player.y - p.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < PICKUP.magnetRadius) {
        const pull = 420 * (1 - dist / PICKUP.magnetRadius);
        p.vx += (dx / dist) * pull * dt;
        p.vy += (dy / dist) * pull * dt;
      }
      p.vx *= 1 - Math.min(1, 2 * dt);
      p.vy *= 1 - Math.min(1, 2 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (dist < PICKUP.collectRadius && !harmless) {
        p.active = false;
        if (p.kind === PICKUP_CORE) {
          state.score += PICKUP.coreScore;
          state.shards += 1;
          floater(p.x, p.y, `+${PICKUP.coreScore}`);
          events |= EVENT_CORE;
        } else {
          if (p.kind === PICKUP_SHIELD) player.shield = PICKUP.shieldSeconds;
          else if (p.kind === PICKUP_RAPID) player.rapid = PICKUP.rapidSeconds;
          else if (p.kind === PICKUP_SPREAD) player.spread = PICKUP.spreadSeconds;
          else if (p.kind === PICKUP_REPAIR) player.hearts = Math.min(PLAYER.hearts, player.hearts + 1);
          floater(p.x, p.y, p.kind === PICKUP_REPAIR ? '+1 HULL' : p.kind.toUpperCase());
          events |= EVENT_PICKUP;
        }
      }
    }

    // Particles fade and floaters rise.
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - Math.min(1, 2.5 * dt);
      p.vy *= 1 - Math.min(1, 2.5 * dt);
    }
    for (const f of floaters) {
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) { f.active = false; continue; }
      f.y -= 42 * dt;
    }
    return events;
  }

  reset();
  return { state, reset, step };
}
