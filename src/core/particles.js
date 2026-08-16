/**
 * The particle field.
 *
 * Charts never draw geometry directly — they emit a list of *targets*
 * (`{x, y, color, size, group}`) and this field flies particles to them.
 * Because targets are generated in a stable order, index-to-index assignment
 * across a data change reads as a smooth morph rather than a reshuffle.
 */

import { clamp, createRng, TAU } from './utils.js';

export class ParticleField {
  constructor() {
    this.particles = [];
    this.count = 0;
    this.rng = createRng(0x1f2e3d);
    this.time = 0;
    this.settled = false;
  }

  /**
   * @param {Array} targets  flat list of target descriptors
   * @param {Object} opts    { spawn: {x, y, radius}, animate, duration, stagger, immediate }
   */
  setTargets(targets, opts) {
    const o = opts || {};
    const pool = this.particles;
    const n = targets.length;
    const rng = this.rng;
    const spawn = o.spawn || { x: 0, y: 0, radius: 120 };
    const stagger = clamp(o.stagger == null ? 0.5 : o.stagger, 0, 1);
    const duration = o.animate === false ? 0 : Math.max(0, o.duration || 0);

    for (let i = 0; i < n; i++) {
      const t = targets[i];
      let p = pool[i];
      if (!p) {
        p = pool[i] = makeParticle();
        p.fresh = true;
      }

      p.tx = t.x;
      p.ty = t.y;
      p.color = t.color;
      p.size = t.size;
      p.group = t.group === undefined ? 0 : t.group;
      p.index = t.index === undefined ? -1 : t.index;
      p.targetAlpha = t.alpha === undefined ? 1 : t.alpha;
      p.active = true;

      if (p.fresh) {
        // Condense inward: start on a ring around the target and fly in.
        const a = rng() * TAU;
        const r = spawn.radius * (0.35 + rng() * 0.9);
        p.x = t.x + Math.cos(a) * r;
        p.y = t.y + Math.sin(a) * r;
        p.vx = 0;
        p.vy = 0;
        p.alpha = 0;
        p.phase = rng() * TAU;
        p.wob = 0.55 + rng() * 0.9;
        p.sizeScale = 1;
        p.delay = duration * stagger * rng();
        p.life = 0;
        p.fresh = false;
        if (o.immediate || duration === 0) {
          p.x = t.x;
          p.y = t.y;
          p.alpha = p.targetAlpha;
          p.delay = 0;
        }
      } else if (o.immediate) {
        p.x = t.x;
        p.y = t.y;
        p.alpha = p.targetAlpha;
      }
    }

    // Surplus particles fade out in place and are recycled on the next growth.
    for (let i = n; i < pool.length; i++) {
      pool[i].targetAlpha = 0;
      pool[i].active = false;
    }

    this.count = n;
    this.settled = false;
  }

  /** Advance the simulation. `dt` is in milliseconds. */
  update(dt, cfg) {
    const step = clamp(dt / 16.667, 0.2, 3);
    this.time += dt;
    const k = cfg.speed;
    const damp = Math.pow(cfg.damping, step);
    const pool = this.particles;
    const len = pool.length;
    let moving = false;

    for (let i = 0; i < len; i++) {
      const p = pool[i];
      if (p.alpha <= 0.002 && !p.active) continue;

      if (p.delay > 0) {
        p.delay -= dt;
        moving = true;
        continue;
      }

      p.life = Math.min(1, p.life + dt / 400);

      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      p.vx = (p.vx + dx * k * step) * damp;
      p.vy = (p.vy + dy * k * step) * damp;
      p.x += p.vx * step;
      p.y += p.vy * step;

      const target = p.active ? p.targetAlpha : 0;
      if (p.alpha !== target) {
        const rate = (p.active ? 0.06 : 0.09) * step;
        p.alpha += clamp(target - p.alpha, -rate, rate);
        if (Math.abs(target - p.alpha) < 0.004) p.alpha = target;
        moving = true;
      }

      if (!moving && (Math.abs(dx) > 0.15 || Math.abs(dy) > 0.15)) moving = true;
    }

    this.settled = !moving;
  }

  clear() {
    this.particles.length = 0;
    this.count = 0;
  }
}

function makeParticle() {
  return {
    x: 0, y: 0, vx: 0, vy: 0,
    tx: 0, ty: 0,
    size: 1,
    sizeScale: 1,
    color: '#fff',
    alpha: 0,
    targetAlpha: 1,
    phase: 0,
    wob: 1,
    delay: 0,
    life: 0,
    group: 0,
    index: -1,
    active: true,
    fresh: true
  };
}

/**
 * Split a particle budget across weighted elements, guaranteeing every
 * non-empty element gets at least `minEach` particles.
 */
export function allocate(weights, budget, minEach) {
  const min = minEach == null ? 6 : minEach;
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  const out = new Array(weights.length).fill(0);
  if (total <= 0 || budget <= 0) return out;

  let used = 0;
  const live = [];
  for (let i = 0; i < weights.length; i++) {
    const w = Math.max(0, weights[i]);
    if (w <= 0) continue;
    out[i] = Math.max(min, Math.round((w / total) * budget));
    used += out[i];
    live.push(i);
  }

  // The per-element minimum can push the total over budget; take the excess
  // back from the largest allocations first, round-robin, never below 1.
  if (used > budget) {
    live.sort((a, b) => out[b] - out[a]);
    let excess = used - budget;
    while (excess > 0) {
      let moved = false;
      for (const i of live) {
        if (excess <= 0) break;
        if (out[i] > 1) {
          out[i]--;
          excess--;
          moved = true;
        }
      }
      if (!moved) break; // everything is already down to one particle
    }
  }
  return out;
}
