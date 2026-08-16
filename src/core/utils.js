/**
 * Small shared helpers. Deliberately dependency-free.
 */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Deterministic PRNG (mulberry32). Particle layouts are regenerated on every
 * resize and data change; a seeded generator keeps a chart visually stable
 * instead of reshuffling every frame the container changes size.
 */
export function createRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

export function easeOutQuint(t) {
  const u = 1 - t;
  return 1 - u * u * u * u * u;
}

/** Recursive merge that never mutates its inputs. Arrays are replaced, not merged. */
export function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return patch === undefined ? base : patch;
  const out = isPlainObject(base) ? { ...base } : {};
  for (const key of Object.keys(patch)) {
    const next = patch[key];
    if (next === undefined) continue;
    out[key] = isPlainObject(next) && isPlainObject(out[key]) ? deepMerge(out[key], next) : next;
  }
  return out;
}

/** Normalise `12`, `[y, x]`, or `{top, right, bottom, left}` into a full box. */
export function resolveBox(value, fallback) {
  const base = { ...fallback };
  if (value == null) return base;
  if (isNum(value)) return { top: value, right: value, bottom: value, left: value };
  if (Array.isArray(value)) {
    const [t, r = t, b = t, l = r] = value;
    return { top: t, right: r, bottom: b, left: l };
  }
  if (isPlainObject(value)) {
    return {
      top: isNum(value.top) ? value.top : base.top,
      right: isNum(value.right) ? value.right : base.right,
      bottom: isNum(value.bottom) ? value.bottom : base.bottom,
      left: isNum(value.left) ? value.left : base.left
    };
  }
  return base;
}

const SI = [
  { v: 1e12, s: 'T' },
  { v: 1e9, s: 'B' },
  { v: 1e6, s: 'M' },
  { v: 1e3, s: 'k' }
];

/**
 * Compact, locale-free number formatting suited to tick labels.
 * Pass `format` as a function to take full control.
 */
export function formatNumber(value, format) {
  if (typeof format === 'function') return String(format(value));
  if (!isNum(value)) return '';
  const abs = Math.abs(value);
  if (abs >= 1000) {
    for (const { v, s } of SI) {
      if (abs >= v) {
        const scaled = value / v;
        const digits = Math.abs(scaled) < 10 ? 1 : 0;
        return trimZero(scaled.toFixed(digits)) + s;
      }
    }
  }
  if (abs === 0) return '0';
  if (abs < 0.01) return trimZero(value.toPrecision(2));
  if (Number.isInteger(value)) return String(value);
  return trimZero(value.toFixed(abs < 1 ? 2 : 1));
}

function trimZero(str) {
  return str.indexOf('.') === -1 ? str : str.replace(/\.?0+$/, '');
}

/** Devicepixel ratio, capped — a 3x buffer costs 2.25x the fill rate for no visible gain. */
export function getDpr(max) {
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  return clamp(dpr, 1, max || 2);
}

export function resolveElement(target) {
  if (!target) throw new Error('[ParticleCharts] A container element or selector is required.');
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el || !el.appendChild) {
    throw new Error('[ParticleCharts] Container not found: ' + String(target));
  }
  return el;
}

let warned = {};
export function warnOnce(key, message) {
  if (warned[key]) return;
  warned[key] = true;
  if (typeof console !== 'undefined') console.warn('[ParticleCharts] ' + message);
}
