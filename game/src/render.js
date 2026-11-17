// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. The nebula and static stars are painted once into an offscreen canvas at boot;
// two star layers drift past them for parallax. Flat shapes with bright rims, canvas text
// for the HUD and the panels — everything big enough to read when the screenshot shrinks.

import { FIELD, FONT, PALETTE, PLAYER } from './config.js';
import {
  KIND_DRIFTER, KIND_MINI, KIND_SPINNER, KIND_SPLITTER,
  PICKUP_CORE, PICKUP_RAPID, PICKUP_REPAIR, PICKUP_SHIELD, PICKUP_SPREAD,
} from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const PANEL = { width: 640, top: 150, line: 34, bottom: 76 };
const ENEMY_COLORS = ['#ff4d5e', '#b06bff', '#ff9f2e', '#ffc93c'];

function heartPath(context, x, y, size) {
  context.beginPath();
  context.moveTo(x, y + size * 0.9);
  context.bezierCurveTo(x - size * 1.2, y, x - size * 0.6, y - size * 0.9, x, y - size * 0.25);
  context.bezierCurveTo(x + size * 0.6, y - size * 0.9, x + size * 1.2, y, x, y + size * 0.9);
  context.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  // The space behind everything, painted once: gradient, three nebula clouds, static stars.
  const backdrop = document.createElement('canvas');
  backdrop.width = FIELD.width;
  backdrop.height = FIELD.height;
  {
    const b = backdrop.getContext('2d');
    const gradient = b.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, PALETTE.space);
    gradient.addColorStop(1, PALETTE.backdrop);
    b.fillStyle = gradient;
    b.fillRect(0, 0, FIELD.width, FIELD.height);
    const clouds = [
      [260, 170, 320, PALETTE.nebulaTeal], [1020, 130, 300, PALETTE.nebulaViolet],
      [880, 560, 340, PALETTE.nebulaRose], [180, 580, 260, PALETTE.nebulaViolet],
    ];
    for (const [x, y, r, color] of clouds) {
      const glow = b.createRadialGradient(x, y, 0, x, y, r);
      glow.addColorStop(0, color);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      b.fillStyle = glow;
      b.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 190; i += 1) {
      const x = Math.random() * FIELD.width;
      const y = Math.random() * FIELD.height;
      const size = Math.random() < 0.85 ? 1 : 2;
      b.fillStyle = Math.random() < 0.2 ? '#9fd8ff' : '#ffffff';
      b.globalAlpha = 0.25 + Math.random() * 0.6;
      b.fillRect(x, y, size, size);
    }
    b.globalAlpha = 1;
  }

  // Two drifting star layers for parallax; they wrap around the field edges.
  const layers = [];
  for (let layer = 0; layer < 2; layer += 1) {
    const stars = [];
    for (let i = 0; i < (layer === 0 ? 42 : 26); i += 1) {
      stars.push({
        x: Math.random() * FIELD.width, y: Math.random() * FIELD.height,
        speed: layer === 0 ? 9 : 22, size: layer === 0 ? 1.5 : 2.5,
        phase: Math.random() * Math.PI * 2,
      });
    }
    layers.push(stars);
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight = 400) {
    const key = `${weight}:${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function panelRect(x, y, width, height) {
    context.fillStyle = PALETTE.panel;
    if (typeof context.roundRect === 'function') {
      context.beginPath();
      context.roundRect(x, y, width, height, 18);
      context.fill();
    } else {
      context.fillRect(x, y, width, height);
    }
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    if (typeof context.roundRect === 'function') {
      context.beginPath();
      context.roundRect(x, y, width, height, 18);
      context.stroke();
    } else {
      context.strokeRect(x, y, width, height);
    }
  }

  function drawShip(state, time) {
    const p = state.player;
    const moving = Math.hypot(p.vx, p.vy) > 40;
    context.save();
    context.translate(p.x, p.y);
    context.rotate(p.angle + Math.PI / 2);
    if (moving) {
      const flicker = 10 + Math.sin(time * 40) * 4;
      context.fillStyle = '#ff9f2e';
      context.beginPath();
      context.moveTo(-6, 12);
      context.lineTo(0, 12 + flicker + 8);
      context.lineTo(6, 12);
      context.closePath();
      context.fill();
    }
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.moveTo(0, -18);
    context.lineTo(12, 12);
    context.lineTo(0, 6);
    context.lineTo(-12, 12);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.playerCore;
    context.beginPath();
    context.moveTo(0, -10);
    context.lineTo(5, 8);
    context.lineTo(0, 4);
    context.lineTo(-5, 8);
    context.closePath();
    context.fill();
    context.restore();
    if (p.shield > 0) {
      context.strokeStyle = 'rgba(94,168,255,0.85)';
      context.lineWidth = 2.5;
      context.beginPath();
      context.arc(p.x, p.y, PLAYER.radius + 10 + Math.sin(time * 6) * 2, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawEnemy(e) {
    const color = ENEMY_COLORS[e.kind];
    context.save();
    context.translate(e.x, e.y);
    if (e.kind === KIND_DRIFTER) {
      context.rotate(e.spin * 0.4);
      context.fillStyle = color;
      context.beginPath();
      context.moveTo(0, -e.radius);
      context.lineTo(e.radius, 0);
      context.lineTo(0, e.radius);
      context.lineTo(-e.radius, 0);
      context.closePath();
      context.fill();
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.beginPath();
      context.moveTo(0, -e.radius * 0.45);
      context.lineTo(e.radius * 0.45, 0);
      context.lineTo(0, e.radius * 0.45);
      context.lineTo(-e.radius * 0.45, 0);
      context.closePath();
      context.fill();
    } else if (e.kind === KIND_SPINNER) {
      context.rotate(e.spin * 0.6);
      context.strokeStyle = color;
      context.lineWidth = 3;
      for (let i = 0; i < 3; i += 1) {
        const a = (i * Math.PI) / 3;
        context.beginPath();
        context.moveTo(Math.cos(a) * e.radius, Math.sin(a) * e.radius);
        context.lineTo(Math.cos(a + Math.PI) * e.radius, Math.sin(a + Math.PI) * e.radius);
        context.stroke();
      }
      context.fillStyle = color;
      context.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i * Math.PI) / 3;
        const px = Math.cos(a) * e.radius * 0.62;
        const py = Math.sin(a) * e.radius * 0.62;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(0, 0, 3.5, 0, Math.PI * 2);
      context.fill();
    } else if (e.kind === KIND_SPLITTER) {
      context.rotate(e.spin * 0.35);
      context.fillStyle = color;
      context.fillRect(-e.radius * 0.8, -e.radius * 0.8, e.radius * 1.6, e.radius * 1.6);
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.fillRect(-e.radius * 0.4, -e.radius * 0.4, e.radius * 0.8, e.radius * 0.8);
    } else {
      context.rotate(Math.atan2(e.vy, e.vx) + Math.PI / 2);
      context.fillStyle = color;
      context.beginPath();
      context.moveTo(0, -e.radius);
      context.lineTo(e.radius, e.radius);
      context.lineTo(-e.radius, e.radius);
      context.closePath();
      context.fill();
    }
    context.restore();
  }

  function drawPickup(p, time) {
    const pulse = 1 + Math.sin(time * 5 + p.x) * 0.12;
    const r = 13 * pulse;
    context.save();
    context.translate(p.x, p.y);
    if (p.kind === PICKUP_CORE) {
      context.fillStyle = PALETTE.core;
      context.beginPath();
      context.moveTo(0, -r);
      context.lineTo(r * 0.7, 0);
      context.lineTo(0, r);
      context.lineTo(-r * 0.7, 0);
      context.closePath();
      context.fill();
      context.fillStyle = '#fff6c9';
      context.beginPath();
      context.arc(0, 0, 3, 0, Math.PI * 2);
      context.fill();
    } else {
      const colors = { shield: PALETTE.shield, rapid: PALETTE.rapid, spread: PALETTE.spread, repair: PALETTE.repair };
      context.strokeStyle = colors[p.kind] || '#ffffff';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(0, 0, r, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = colors[p.kind] || '#ffffff';
      if (p.kind === PICKUP_SHIELD) {
        context.beginPath();
        context.arc(0, 0, r * 0.45, 0, Math.PI * 2);
        context.fill();
      } else if (p.kind === PICKUP_RAPID) {
        context.beginPath();
        context.moveTo(2, -r * 0.6);
        context.lineTo(-5, 1);
        context.lineTo(0, 1);
        context.lineTo(-2, r * 0.6);
        context.lineTo(5, -1);
        context.lineTo(0, -1);
        context.closePath();
        context.fill();
      } else if (p.kind === PICKUP_SPREAD) {
        for (const dx of [-6, 0, 6]) {
          context.beginPath();
          context.arc(dx, -2, 2.6, 0, Math.PI * 2);
          context.fill();
        }
      } else if (p.kind === PICKUP_REPAIR) {
        heartPath(context, 0, 1, 7);
        context.fill();
      }
    }
    context.restore();
  }

  function drawHud(state, best) {
    context.textBaseline = 'top';
    text(`SCORE ${state.score}`, 26, 18, 30, PALETTE.text, 'left', 700);
    text(`BEST ${Math.max(best, state.score)}`, 26, 54, 18, PALETTE.muted, 'left');
    text(`WAVE ${state.wave}`, FIELD.width / 2, 18, 30, PALETTE.text, 'center', 700);
    let remaining = 0;
    for (const e of state.enemies) if (e.active) remaining += 1;
    text(state.waveState === 'breather' ? 'GET READY' : `${remaining} DRONES LEFT`, FIELD.width / 2, 54, 18, PALETTE.muted, 'center');
    const heartSize = 13;
    const gap = 10;
    const total = PLAYER.hearts * (heartSize * 2 + gap) - gap;
    let hx = FIELD.width - 26 - total;
    text('HULL', hx - 14, 20, 22, PALETTE.text, 'right', 700);
    for (let i = 0; i < PLAYER.hearts; i += 1) {
      context.fillStyle = i < state.player.hearts ? PALETTE.repair : 'rgba(147,163,192,0.35)';
      heartPath(context, hx + heartSize, 30, heartSize);
      context.fill();
      hx += heartSize * 2 + gap;
    }
    if (state.combo > 1) {
      text(`COMBO x${state.combo}`, FIELD.width - 26, 56, 22, PALETTE.gold, 'right', 700);
      const barWidth = 110;
      context.fillStyle = 'rgba(147,163,192,0.35)';
      context.fillRect(FIELD.width - 26 - barWidth, 84, barWidth, 6);
      context.fillStyle = PALETTE.gold;
      context.fillRect(FIELD.width - 26 - barWidth, 84, barWidth * Math.max(0, state.comboTimer / 2.5), 6);
    }
    const p = state.player;
    let wy = 100;
    const timers = [];
    if (p.shield > 0) timers.push(['SHIELD', p.shield, PALETTE.shield]);
    if (p.rapid > 0) timers.push(['RAPID', p.rapid, PALETTE.rapid]);
    if (p.spread > 0) timers.push(['SPREAD', p.spread, PALETTE.spread]);
    for (const [label, seconds, color] of timers) {
      text(`${label} ${Math.ceil(seconds)}`, FIELD.width - 26, wy, 18, color, 'right', 700);
      wy += 24;
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    panelRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 82, 52, PALETTE.text, 'center', 800);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + PANEL.top + i * PANEL.line, 22, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 24, PALETTE.gold, 'center', 700);
  }

  const TITLE_LINES = [
    'Salvage the star shards. Blast the rogue drones.',
    'Fly with WASD or arrows. Aim with the mouse, fire with click or Space.',
    'Chain kills for a combo. Grab shields, rapid fire and spread shot.',
    '',
  ];
  const PAUSED_LINES = ['The drones will wait for you.', 'M toggles sound.'];

  /** Paint one frame: space, the field, then the HUD or a panel for the screen. */
  function draw(state, screen, best, time) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    context.drawImage(backdrop, 0, 0);
    for (let layer = 0; layer < layers.length; layer += 1) {
      for (const star of layers[layer]) {
        const alpha = 0.35 + 0.35 * Math.sin(time * 1.5 + star.phase);
        const sx = (((star.x - time * star.speed) % FIELD.width) + FIELD.width) % FIELD.width;
        context.globalAlpha = alpha;
        context.fillStyle = '#cfe6ff';
        context.fillRect(sx, star.y, star.size, star.size);
      }
    }
    context.globalAlpha = 1;

    for (const p of state.pickups) if (p.active) drawPickup(p, time);
    for (const e of state.enemies) if (e.active) drawEnemy(e);
    for (const o of state.orbs) {
      if (!o.active) continue;
      context.fillStyle = PALETTE.orb;
      context.beginPath();
      context.arc(o.x, o.y, 6 + Math.sin(time * 10 + o.x) * 1.5, 0, Math.PI * 2);
      context.fill();
    }
    for (const b of state.bullets) {
      if (!b.active) continue;
      context.strokeStyle = PALETTE.bullet;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    context.globalAlpha = 1;

    const player = state.player;
    if (player.invulnerable === 0 || Math.floor(player.invulnerable * 10) % 2 === 1) {
      drawShip(state, time);
    }
    for (const f of state.floaters) {
      if (!f.active) continue;
      context.globalAlpha = Math.max(0, f.life / f.maxLife);
      text(f.text, f.x, f.y, 20, PALETTE.gold, 'center', 700);
    }
    context.globalAlpha = 1;

    if (state.flash > 0) {
      context.fillStyle = `rgba(255,60,70,${(state.flash * 0.45).toFixed(3)})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }

    if (screen === SCREEN_TITLE) {
      TITLE_LINES[3] = `BEST ${best}`;
      drawPanel('STARSHARD', TITLE_LINES, 'Click or press Space to launch');
      return;
    }
    drawHud(state, best);
    if (state.banner.timer > 0) {
      const alpha = Math.min(1, state.banner.timer / 0.5);
      context.globalAlpha = alpha;
      text(state.banner.text, FIELD.width / 2, 150, 44, PALETTE.gold, 'center', 800);
      context.globalAlpha = 1;
    }
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      const lines = [
        `SCORE ${state.score}`,
        `BEST ${Math.max(best, state.score)}`,
        `Reached wave ${state.wave}  ·  ${state.kills} drones down  ·  ${state.shards} shards`,
        '',
      ];
      drawPanel('SHIP LOST', lines, 'Press R or click to fly again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
