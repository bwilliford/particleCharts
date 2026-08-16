/**
 * Canvas plumbing: HiDPI sizing, the particle sprite cache, the trail buffer
 * and the bloom pass.
 *
 * Particles are drawn into an offscreen *scene* layer with additive blending so
 * overlapping particles brighten each other, then that layer is composited onto
 * the main canvas. Bloom is a cheap two-step: downscale the scene (a free box
 * blur), then draw it back up through a `filter: blur()` at additive alpha.
 */

import { clamp, getDpr, TAU } from './utils.js';
import { parseColor } from './color.js';

const SPRITE_PX = 64;
/**
 * Sprite draw *diameter* as a multiple of `particle.size`. The sprite is mostly
 * halo, so this is deliberately larger than the visible core: at size 1.6 the
 * solid centre lands around 2px with the glow reaching ~3px beyond it.
 */
const GLOW_SPREAD = 4;
/** Particle radius, in CSS pixels, at or below which particles are drawn flat (a plain disc) rather than as a glow sprite. */
const FLAT_MAX_SIZE = 1.6;

/**
 * Sine lookup, indexed in radians. The idle drift needs two waves per particle
 * per frame and nothing needs more precision than this.
 */
const WAVE_STEPS = 2048;
const WAVE_MASK = WAVE_STEPS - 1;
const WAVE_SCALE = WAVE_STEPS / TAU;
const QUARTER_TURN = Math.PI / 2;
const WAVE = new Float32Array(WAVE_STEPS);
for (let i = 0; i < WAVE_STEPS; i++) WAVE[i] = Math.sin((i / WAVE_STEPS) * TAU);

function wave(radians) {
  return WAVE[(radians * WAVE_SCALE) & WAVE_MASK];
}

const spriteCache = new Map();

function sprite(color, shape) {
  const key = shape + '|' + color;
  let c = spriteCache.get(key);
  if (c) return c;

  c = document.createElement('canvas');
  c.width = c.height = SPRITE_PX;
  const ctx = c.getContext('2d');
  const { r, g, b } = parseColor(color);
  const half = SPRITE_PX / 2;

  if (shape === 'square') {
    ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
    const s = SPRITE_PX * 0.34;
    ctx.fillRect(half - s / 2, half - s / 2, s, s);
  } else if (shape === 'dot') {
    ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
    ctx.beginPath();
    ctx.arc(half, half, SPRITE_PX * 0.2, 0, TAU);
    ctx.fill();
  } else {
    const grd = ctx.createRadialGradient(half, half, 0, half, half, half);
    grd.addColorStop(0.0, 'rgba(' + r + ',' + g + ',' + b + ',1)');
    grd.addColorStop(0.26, 'rgba(' + r + ',' + g + ',' + b + ',1)');
    grd.addColorStop(0.42, 'rgba(' + r + ',' + g + ',' + b + ',0.55)');
    grd.addColorStop(0.66, 'rgba(' + r + ',' + g + ',' + b + ',0.16)');
    grd.addColorStop(1.0, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
  }

  spriteCache.set(key, c);
  return c;
}

export class Renderer {
  constructor(host, options) {
    this.host = host;
    this.maxDpr = (options && options.maxDpr) || 2;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pchart-canvas';
    this.ctx = this.canvas.getContext('2d');
    host.appendChild(this.canvas);

    this.scene = document.createElement('canvas');
    this.sceneCtx = this.scene.getContext('2d');

    this.glow = document.createElement('canvas');
    this.glowCtx = this.glow.getContext('2d');

    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.supportsFilter = typeof this.ctx.filter === 'string';
  }

  resize(width, height) {
    const dpr = getDpr(this.maxDpr);
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === this.width && h === this.height && dpr === this.dpr) return false;

    this.width = w;
    this.height = h;
    this.dpr = dpr;

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';

    /**
     * The particle layer is full resolution but keeps an *identity* transform:
     * `paintScene` works in device pixels so it can snap every particle to the
     * pixel grid. A rect on exact integer bounds is rasterised with no
     * antialiasing — which is what makes a 2px dot read as a crisp point rather
     * than a grey smudge spread over four pixels.
     */
    this.scene.width = this.canvas.width;
    this.scene.height = this.canvas.height;
    this.sceneCtx.setTransform(1, 0, 0, 1, 0, 0);

    const gw = Math.max(1, Math.round(w * 0.3));
    const gh = Math.max(1, Math.round(h * 0.3));
    this.glow.width = gw;
    this.glow.height = gh;
    return true;
  }

  /** Clear the main canvas and paint the background. */
  beginFrame(background) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    if (background && background !== 'transparent' && background !== 'none') {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  /** Draw the particle field into the scene layer. Coordinates are device pixels. */
  paintScene(particles, cfg, time) {
    const ctx = this.sceneCtx;
    const dpr = this.dpr;
    const dw = this.scene.width;
    const dh = this.scene.height;
    const trail = clamp(cfg.trail || 0, 0, 0.92);

    if (trail < 0.02) {
      ctx.clearRect(0, 0, dw, dh);
    } else {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,' + Math.max(0.05, 1 - trail).toFixed(3) + ')';
      ctx.fillRect(0, 0, dw, dh);
      ctx.restore();
    }

    ctx.globalCompositeOperation = 'lighter';
    const shape = cfg.shape || 'soft';
    const jitter = (cfg.jitter || 0) * dpr;
    const t = time * 0.001 * (cfg.jitterSpeed == null ? 1 : cfg.jitterSpeed);
    const baseOpacity = cfg.opacity == null ? 1 : cfg.opacity;

    /**
     * Three ways to put a particle on screen, picked once per frame rather than
     * per particle so the canvas draw state is not thrashed:
     *
     *  DISC   `arc` + `fill`. The default. Benchmarked at 30k particles a frame:
     *         9.0ms, against 8.1ms for a bare `fillRect` and 82ms for
     *         `drawImage` of a pre-rendered sprite — even unscaled, blitting an
     *         image carries about ten times the per-call overhead. A circle is
     *         therefore essentially free, so particles are circles.
     *  SPRITE A soft glow bitmap, for particles big enough for the halo to read.
     *  SQUARE Only when the caller explicitly asks for `shape: 'square'`.
     *
     * `size` is a radius in every mode: a disc is drawn 2x size across, and a
     * sprite 4x, since a sprite is mostly transparent halo around a core about
     * half its radius.
     */
    const square = shape === 'square';
    const flat = square || cfg.size <= FLAT_MAX_SIZE;
    const spread = flat ? 2 : GLOW_SPREAD;

    let lastColor = null;
    let img = null;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.alpha <= 0.004) continue;

      if (p.color !== lastColor) {
        lastColor = p.color;
        if (flat) ctx.fillStyle = lastColor;
        else img = sprite(lastColor, shape);
      }

      let x = p.x * dpr;
      let y = p.y * dpr;
      if (jitter > 0) {
        // Table lookup rather than Math.sin/cos: at 16k particles a frame, the
        // two trig calls per particle were costing more than the drawing did.
        x += wave(t * p.wob + p.phase) * jitter;
        y += wave(t * p.wob * 0.86 + p.phase * 1.7 + QUARTER_TURN) * jitter;
      }

      ctx.globalAlpha = p.alpha * baseOpacity;

      if (flat) {
        // Snap the bounding box to the pixel grid, then centre the mark in it,
        // so every particle rasterises identically instead of smearing across
        // neighbouring pixels by a different sub-pixel offset each time.
        const d = Math.max(1, (p.size * p.sizeScale * spread * dpr + 0.5) | 0);
        const left = ((x - d * 0.5) + 0.5) | 0;
        const top = ((y - d * 0.5) + 0.5) | 0;
        if (square) {
          ctx.fillRect(left, top, d, d);
        } else {
          const radius = d * 0.5;
          ctx.beginPath();
          ctx.arc(left + radius, top + radius, radius, 0, TAU);
          ctx.fill();
        }
      } else {
        const d = p.size * p.sizeScale * spread * dpr;
        ctx.drawImage(img, x - d * 0.5, y - d * 0.5, d, d);
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Composite the scene onto the main canvas, adding the bloom pass. */
  composite(cfg) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.drawImage(this.scene, 0, 0, w, h);

    const bloom = clamp(cfg.bloom || 0, 0, 1);
    if (bloom <= 0.01) return;

    const g = this.glowCtx;
    g.clearRect(0, 0, this.glow.width, this.glow.height);
    g.drawImage(this.scene, 0, 0, this.glow.width, this.glow.height);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = bloom;
    if (this.supportsFilter) {
      ctx.filter = 'blur(' + Math.max(1, (cfg.bloomRadius || 12) * 0.5).toFixed(1) + 'px)';
    }
    ctx.drawImage(this.glow, 0, 0, w, h);
    // A second, wider and dimmer pass gives the halo a soft falloff.
    if (this.supportsFilter) {
      ctx.filter = 'blur(' + Math.max(2, (cfg.bloomRadius || 12) * 1.4).toFixed(1) + 'px)';
      ctx.globalAlpha = bloom * 0.55;
      ctx.drawImage(this.glow, 0, 0, w, h);
      ctx.filter = 'none';
    }
    ctx.restore();
  }

  destroy() {
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.scene.width = this.scene.height = 0;
    this.glow.width = this.glow.height = 0;
  }
}
