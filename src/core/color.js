/**
 * Colour parsing + the default categorical palette.
 *
 * The palette below is a validated dark-surface categorical set: fixed slot
 * order, chroma floor, and adjacent-pair colour-vision separation all checked
 * (worst adjacent CVD deltaE 8.4, normal-vision 19.3, contrast >= 3:1 on a
 * near-black surface). Order is the safety mechanism, so slots are assigned in
 * sequence and never shuffled.
 */

import { clamp, warnOnce } from './utils.js';

export const DEFAULT_PALETTE = [
  '#3987e5', // 1 blue
  '#d95926', // 2 orange
  '#199e70', // 3 aqua
  '#c98500', // 4 yellow
  '#d55181', // 5 magenta
  '#008300', // 6 green
  '#9085e9', // 7 violet
  '#e66767' //  8 red
];

const cache = new Map();
let probe = null;

/** Parse any CSS colour string into {r, g, b, a}. Named colours resolve via a 1x1 canvas. */
export function parseColor(input) {
  if (input && typeof input === 'object' && 'r' in input) return input;
  const key = String(input == null ? '#ffffff' : input).trim();
  const hit = cache.get(key);
  if (hit) return hit;

  let out = null;
  const hex = /^#([0-9a-f]{3,8})$/i.exec(key);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    out = {
      r: (n >> 16) & 255,
      g: (n >> 8) & 255,
      b: n & 255,
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    };
  } else {
    const fn = /^rgba?\(([^)]+)\)$/i.exec(key);
    if (fn) {
      const parts = fn[1].split(/[,/\s]+/).filter(Boolean).map(Number);
      out = { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts.length > 3 ? parts[3] : 1 };
    }
  }

  if (!out) out = probeColor(key);
  cache.set(key, out);
  return out;
}

function probeColor(value) {
  if (typeof document === 'undefined') return { r: 255, g: 255, b: 255, a: 1 };
  if (!probe) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    probe = c.getContext('2d', { willReadFrequently: true });
  }
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
}

export function rgba(color, alpha) {
  const c = parseColor(color);
  const a = clamp((alpha == null ? 1 : alpha) * c.a, 0, 1);
  return 'rgba(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ',' + a.toFixed(3) + ')';
}

export function mixColor(a, b, t) {
  const ca = parseColor(a);
  const cb = parseColor(b);
  return {
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
    a: ca.a + (cb.a - ca.a) * t
  };
}

export function toHex(color) {
  const c = parseColor(color);
  const h = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return '#' + h(c.r) + h(c.g) + h(c.b);
}

/**
 * Pick the colour for slot `index`.
 * `spec` may be a single colour, an array of colours, or a function(index, item).
 */
export function colorAt(spec, index, item) {
  if (typeof spec === 'function') return spec(index, item);
  if (Array.isArray(spec) && spec.length) return spec[index % spec.length];
  if (typeof spec === 'string') return spec;
  if (index >= DEFAULT_PALETTE.length) {
    warnOnce(
      'palette-overflow',
      'More than ' + DEFAULT_PALETTE.length + ' colour slots requested. Categorical hues are not safely ' +
        'distinguishable past this point — fold the tail into an "Other" series or use small multiples.'
    );
  }
  return DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];
}
