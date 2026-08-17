/*!
 * Particle Charts v0.2.0 — data visualisation made of particles.
 * https://bwilliford.github.io/particleCharts/
 * MIT Licence. Built 2026-08-17.
 */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.ParticleCharts = factory();
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
'use strict';

// ---- src/core/utils.js -------------------------------------------------
/**
 * Small shared helpers. Deliberately dependency-free.
 */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Deterministic PRNG (mulberry32). Particle layouts are regenerated on every
 * resize and data change; a seeded generator keeps a chart visually stable
 * instead of reshuffling every frame the container changes size.
 */
function createRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

function easeOutQuint(t) {
  const u = 1 - t;
  return 1 - u * u * u * u * u;
}

/** Recursive merge that never mutates its inputs. Arrays are replaced, not merged. */
function deepMerge(base, patch) {
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
function resolveBox(value, fallback) {
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
function formatNumber(value, format) {
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
function getDpr(max) {
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  return clamp(dpr, 1, max || 2);
}

function resolveElement(target) {
  if (!target) throw new Error('[ParticleCharts] A container element or selector is required.');
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el || !el.appendChild) {
    throw new Error('[ParticleCharts] Container not found: ' + String(target));
  }
  return el;
}

let warned = {};
function warnOnce(key, message) {
  if (warned[key]) return;
  warned[key] = true;
  if (typeof console !== 'undefined') console.warn('[ParticleCharts] ' + message);
}

// ---- src/core/color.js -------------------------------------------------
/**
 * Colour parsing + the default categorical palette.
 *
 * The palette below is a validated dark-surface categorical set: fixed slot
 * order, chroma floor, and adjacent-pair colour-vision separation all checked
 * (worst adjacent CVD deltaE 8.4, normal-vision 19.3, contrast >= 3:1 on a
 * near-black surface). Order is the safety mechanism, so slots are assigned in
 * sequence and never shuffled.
 */


const DEFAULT_PALETTE = [
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
function parseColor(input) {
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

function rgba(color, alpha) {
  const c = parseColor(color);
  const a = clamp((alpha == null ? 1 : alpha) * c.a, 0, 1);
  return 'rgba(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ',' + a.toFixed(3) + ')';
}

function mixColor(a, b, t) {
  const ca = parseColor(a);
  const cb = parseColor(b);
  return {
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
    a: ca.a + (cb.a - ca.a) * t
  };
}

function toHex(color) {
  const c = parseColor(color);
  const h = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return '#' + h(c.r) + h(c.g) + h(c.b);
}

/**
 * Pick the colour for slot `index`.
 * `spec` may be a single colour, an array of colours, or a function(index, item).
 */
function colorAt(spec, index, item) {
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

// ---- src/core/scale.js -------------------------------------------------
/**
 * Scales + tick generation. Just enough to place points in pixel space.
 */


/** Continuous domain -> pixel range. */
function linearScale(domain, range) {
  let [d0, d1] = domain;
  const [r0, r1] = range;
  if (d0 === d1) {
    d0 -= 0.5;
    d1 += 0.5;
  }
  const span = d1 - d0;
  const scale = (v) => r0 + ((v - d0) / span) * (r1 - r0);
  scale.invert = (px) => d0 + ((px - r0) / (r1 - r0)) * span;
  scale.domain = [d0, d1];
  scale.range = [r0, r1];
  return scale;
}

/** Discrete indices -> evenly spaced bands. */
function bandScale(count, range, padding) {
  const [r0, r1] = range;
  const total = r1 - r0;
  const step = count > 0 ? total / count : total;
  const bandwidth = Math.max(1, step * (1 - (padding || 0)));
  const scale = (i) => r0 + step * i + step / 2;
  scale.at = scale; // same interface as pointScale / valueCategoryScale
  scale.start = (i) => scale(i) - bandwidth / 2;
  scale.bandwidth = bandwidth;
  scale.step = step;
  scale.count = count;
  /** Nearest band index for a pixel position — used for hover hit-testing. */
  scale.indexAt = (px) => {
    if (count <= 0) return -1;
    const i = Math.floor((px - r0) / step);
    return i < 0 ? 0 : i >= count ? count - 1 : i;
  };
  return scale;
}

/**
 * Discrete indices -> evenly spaced points, first and last flush with the
 * range ends. This is what a line chart wants; bars want `bandScale`.
 */
function pointScale(count, range) {
  const [r0, r1] = range;
  const step = count > 1 ? (r1 - r0) / (count - 1) : 0;
  const scale = {
    step,
    bandwidth: step || r1 - r0,
    count,
    at: (i) => (count > 1 ? r0 + i * step : (r0 + r1) / 2),
    indexAt: (px) => {
      if (count <= 1) return count - 1;
      const i = Math.round((px - r0) / step);
      return i < 0 ? 0 : i >= count ? count - 1 : i;
    }
  };
  return scale;
}

/** Continuous x positions (numeric x axis) exposed through the same interface. */
function valueCategoryScale(values, range) {
  const min = Math.min.apply(null, values);
  const max = Math.max.apply(null, values);
  const s = linearScale([min, max], range);
  return {
    step: values.length > 1 ? (range[1] - range[0]) / (values.length - 1) : 0,
    bandwidth: values.length > 1 ? (range[1] - range[0]) / (values.length - 1) : range[1] - range[0],
    count: values.length,
    at: (i) => s(values[i]),
    indexAt: (px) => {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < values.length; i++) {
        const d = Math.abs(s(values[i]) - px);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return best;
    }
  };
}

/**
 * Human-friendly tick steps (1, 2, 2.5, 5, 10 x 10^n) covering [min, max].
 * Returns the expanded ("nice") domain alongside the ticks.
 */
function niceTicks(min, max, count) {
  const target = Math.max(2, count || 5);
  if (!isNum(min) || !isNum(max)) return { min: 0, max: 1, ticks: [0, 1], step: 1 };
  if (min === max) {
    const pad = Math.abs(min) > 1 ? Math.abs(min) * 0.1 : 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step = mag;
  if (norm >= 7.5) step = mag * 10;
  else if (norm >= 3.5) step = mag * 5;
  else if (norm >= 2.25) step = mag * 2.5;
  else if (norm >= 1.5) step = mag * 2;

  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  // Accumulate by index rather than by repeated addition to avoid float drift.
  const steps = Math.round((niceMax - niceMin) / step);
  for (let i = 0; i <= steps; i++) ticks.push(round(niceMin + i * step, step));
  return { min: niceMin, max: niceMax, ticks, step };
}

function round(v, step) {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number(v.toFixed(Math.min(12, decimals)));
}

/** Thin a tick list until labels no longer collide in the available space. */
function thinTicks(values, available, perLabel) {
  if (!values.length || available <= 0) return values;
  const max = Math.max(1, Math.floor(available / Math.max(1, perLabel)));
  if (values.length <= max) return values;
  const stride = Math.ceil(values.length / max);
  const out = [];
  for (let i = 0; i < values.length; i += stride) out.push(values[i]);
  // Always keep the final category so the axis reads to its true end.
  if (out[out.length - 1] !== values[values.length - 1]) out.push(values[values.length - 1]);
  return out;
}

// ---- src/core/data.js --------------------------------------------------
/**
 * Data normalisation.
 *
 * Everything the charts consume is reduced to one shape:
 *
 *   {
 *     labels:  string[],                                  // category axis
 *     xValues: number[] | null,                           // set when x is numeric
 *     series:  [{ name, color, values: (number|null)[] }]
 *   }
 *
 * Accepted inputs (all plain JSON):
 *   [4, 8, 15]
 *   [{ label: 'Jan', value: 4 }, ...]
 *   { labels: [...], values: [...] }
 *   { labels: [...], series: [{ name, data, color }, ...] }
 *   [{ name: 'A', data: [...] }, { name: 'B', data: [...] }]
 *   { series: [{ name, data: [{ x: 1, y: 4 }, ...] }] }
 */


const LABEL_KEYS = ['label', 'name', 'x', 'key', 'category', 'date'];
const VALUE_KEYS = ['value', 'y', 'count', 'total', 'amount'];

function pick(obj, keys) {
  for (const k of keys) if (obj[k] !== undefined) return obj[k];
  return undefined;
}

function toValue(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Pull `{labels, values}` out of any single-series list. */
function readPoints(list) {
  const labels = [];
  const values = [];
  const xs = [];
  let hasLabels = false;
  let numericX = true;

  list.forEach((item, i) => {
    if (isPlainObject(item)) {
      const rawLabel = pick(item, LABEL_KEYS);
      const rawValue = pick(item, VALUE_KEYS);
      if (rawLabel !== undefined) {
        hasLabels = true;
        labels.push(String(rawLabel));
        const nx = toValue(rawLabel);
        if (nx === null) numericX = false;
        else xs.push(nx);
      } else {
        labels.push(String(i));
        xs.push(i);
      }
      values.push(toValue(rawValue !== undefined ? rawValue : null));
    } else if (Array.isArray(item)) {
      hasLabels = true;
      labels.push(String(item[0]));
      const nx = toValue(item[0]);
      if (nx === null) numericX = false;
      else xs.push(nx);
      values.push(toValue(item[1]));
    } else {
      labels.push(String(i));
      xs.push(i);
      values.push(toValue(item));
    }
  });

  return { labels, values, xs, hasLabels, numericX: numericX && xs.length === list.length };
}

function seriesFrom(entry, index) {
  const name = entry && entry.name !== undefined ? String(entry.name)
    : entry && entry.label !== undefined ? String(entry.label)
      : 'Series ' + (index + 1);
  const raw = entry && (entry.data || entry.values || entry.points);
  return { name, color: entry && entry.color, raw: Array.isArray(raw) ? raw : [] };
}

function normalizeData(input) {
  const empty = { labels: [], xValues: null, series: [] };
  if (!input) return empty;

  // Array input: either a list of series objects, or a single series of points.
  if (Array.isArray(input)) {
    if (!input.length) return empty;
    const looksLikeSeries =
      input.length > 0 &&
      input.every((d) => isPlainObject(d) && Array.isArray(d.data || d.values || d.points));
    if (looksLikeSeries) return normalizeData({ series: input });
    const read = readPoints(input);
    return {
      labels: read.labels,
      xValues: read.numericX && read.hasLabels ? read.xs : null,
      series: [{ name: 'Series 1', color: undefined, values: read.values }]
    };
  }

  if (!isPlainObject(input)) return empty;

  // Object with an explicit series list.
  const rawSeries = input.series || input.datasets;
  if (Array.isArray(rawSeries) && rawSeries.length) {
    const parsed = rawSeries.map(seriesFrom).map((s) => ({ ...s, read: readPoints(s.raw) }));
    let labels = Array.isArray(input.labels) ? input.labels.map(String) : null;
    let xValues = null;

    if (!labels) {
      // Use the longest series' labels so short series still line up by index.
      const widest = parsed.reduce((a, b) => (b.read.labels.length > a.read.labels.length ? b : a), parsed[0]);
      labels = widest.read.labels;
      if (parsed.every((s) => s.read.numericX && s.read.hasLabels)) xValues = widest.read.xs;
    } else if (Array.isArray(input.xValues)) {
      xValues = input.xValues.map(toValue);
    }

    const width = Math.max(labels.length, ...parsed.map((s) => s.read.values.length));
    while (labels.length < width) labels.push(String(labels.length));

    return {
      labels,
      xValues,
      series: parsed.map((s) => ({
        name: s.name,
        color: s.color,
        values: padTo(s.read.values, width)
      }))
    };
  }

  // Object with parallel labels/values arrays.
  if (Array.isArray(input.values) || Array.isArray(input.data)) {
    const values = (input.values || input.data).map(toValue);
    const labels = Array.isArray(input.labels)
      ? input.labels.map(String)
      : values.map((_, i) => String(i + 1));
    while (labels.length < values.length) labels.push(String(labels.length + 1));
    return {
      labels: labels.slice(0, values.length),
      xValues: Array.isArray(input.xValues) ? input.xValues.map(toValue) : null,
      series: [{ name: input.name ? String(input.name) : 'Series 1', color: input.color, values }]
    };
  }

  // Plain record: { Chrome: 62, Safari: 19, ... }
  const keys = Object.keys(input).filter((k) => isNum(toValue(input[k])));
  if (keys.length) {
    return {
      labels: keys,
      xValues: null,
      series: [{ name: 'Series 1', color: undefined, values: keys.map((k) => toValue(input[k])) }]
    };
  }

  return empty;
}

function padTo(values, width) {
  const out = values.slice(0, width);
  while (out.length < width) out.push(null);
  return out;
}

/** Extent across the visible series, honouring stacking and explicit overrides. */
function valueExtent(series, options) {
  let min = Infinity;
  let max = -Infinity;

  if (options && options.stacked) {
    const width = series.reduce((w, s) => Math.max(w, s.values.length), 0);
    for (let i = 0; i < width; i++) {
      let pos = 0;
      let neg = 0;
      for (const s of series) {
        const v = s.values[i];
        if (!isNum(v)) continue;
        if (v >= 0) pos += v;
        else neg += v;
      }
      min = Math.min(min, neg);
      max = Math.max(max, pos);
    }
  } else {
    for (const s of series) {
      for (const v of s.values) {
        if (!isNum(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }

  if (min === Infinity) {
    min = 0;
    max = 1;
  }
  if (options && options.baseline === 'zero') {
    if (min > 0) min = 0;
    if (max < 0) max = 0;
  }
  return [min, max];
}

// ---- src/core/options.js -----------------------------------------------
/**
 * Default options + ergonomic aliases.
 *
 * Every visual knob lives here so `Object.keys(DEFAULTS)` doubles as the
 * documented surface area of the library.
 */


const DEFAULTS = {
  /** 'line' | 'area' | 'bar' | 'pie' | 'donut' */
  type: 'line',

  // ---- canvas ----------------------------------------------------------
  background: 'transparent',
  padding: null, // null = measured from the axis/labels actually drawn
  responsive: true,
  maxDpr: 2,
  /** Pause the render loop when the chart scrolls out of view / the tab hides. */
  pauseWhenHidden: true,

  // ---- particles -------------------------------------------------------
  particle: {
    /** Colour, array of colours, or fn(index, series) -> colour. Null = palette. */
    color: null,
    /** Base radius in CSS pixels. Fine dust by default. */
    size: 0.5,
    /** 0..1 random size spread. 0 keeps every particle identical. */
    sizeJitter: 0,
    /** Multiplier on the auto-computed particle budget. */
    density: 15,
    /** Hard ceiling; the budget never exceeds this regardless of density. */
    max: 50000,
    /** Additive glow strength, 0..1. */
    bloom: 0.5,
    /** Blur radius of the bloom pass, in CSS pixels. */
    bloomRadius: 14,
    /**
     * Per-particle alpha. Kept well under 1 because particles composite
     * additively: stack enough of them at full alpha and every hue clips to
     * white, which is how a palette loses its identity in a dense chart.
     */
    opacity: 0.7,
    /** Idle drift amplitude in pixels — the "alive" wobble. */
    jitter: 2,
    /** Idle drift speed. */
    jitterSpeed: 1,
    /** Spring stiffness pulling a particle to its target (0..1). */
    speed: 0.085,
    damping: 0.78,
    /** 'soft' (glow sprite at larger sizes) | 'dot' | 'square' */
    shape: 'soft'
  },

  // ---- motion ----------------------------------------------------------
  animate: true,
  /** Entrance flight time, ms. */
  duration: 1100,
  /** 0..1 — how much of the entrance is spread across particles. */
  stagger: 0.5,

  // ---- axis ------------------------------------------------------------
  showAxis: true,
  showGrid: true,
  axis: {
    color: 'rgba(255,255,255,0.16)',
    gridColor: 'rgba(255,255,255,0.06)',
    textColor: 'rgba(255,255,255,0.52)',
    fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 11,
    /** Approximate y tick count; the nice-number algorithm decides the real one. */
    ticks: 5,
    /** Draw the y axis grid lines. */
    grid: true,
    /** Draw the x axis grid lines (off by default — category charts rarely need them). */
    xGrid: false,
    xLabels: true,
    yLabels: true,
    /** Force the value axis to include zero. */
    beginAtZero: true,
    min: null,
    max: null,
    /** fn(value) -> string, applied to value-axis labels and tooltips. */
    format: null,
    xTitle: '',
    yTitle: ''
  },

  // ---- legend ----------------------------------------------------------
  showLegend: true,
  legend: {
    /** 'top' | 'bottom' | 'left' | 'right' */
    position: 'top',
    /** 'start' | 'center' | 'end' */
    align: 'start',
    /** Click a legend entry to mute that series. */
    interactive: true,
    markerSize: 8,
    fontSize: 12,
    color: 'rgba(255,255,255,0.72)'
  },

  // ---- tooltip ---------------------------------------------------------
  showTooltip: true,
  tooltip: {
    /** fn({label, entries, chart}) -> HTML string */
    format: null,
    background: 'rgba(12,14,19,0.94)',
    color: '#e9edf3',
    borderColor: 'rgba(255,255,255,0.12)'
  },

  /** Print values next to the marks (bars, points, slices). */
  showValues: false,

  // ---- per-type --------------------------------------------------------
  line: {
    /** 'smooth' | 'linear' | 'step' */
    curve: 'smooth',
    /** Thickness of the particle band that forms the stroke, in pixels. */
    width: 3.2,
    /**
     * Fill the region under the line with particles. Off for `type: 'line'` —
     * stacked translucent fills hide each other — and on for `type: 'area'`.
     */
    area: false,
    /** Share of a series' particles spent on the area vs the stroke, 0..1. */
    areaAmount: 0.55,
    /** >0 concentrates area particles near the line, fading toward the baseline. */
    areaFade: 0.9,
    /** Extra particle clusters at each data point. */
    points: true,
    pointRadius: 4.5
  },

  bar: {
    /** Gap between categories, 0..1 of the band. */
    padding: 0.3,
    /** Gap between bars inside a group, 0..1 of the slot. */
    groupPadding: 0.16,
    stacked: false,
    horizontal: false,
    /** >0 thins the particles toward the far end of each bar. */
    fade: 0.45,
    /** Rounded particle-bar cap radius, in pixels. */
    radius: 4
  },

  pie: {
    /** 0..0.95 of the outer radius. `type: 'donut'` defaults this to 0.62. */
    innerRadius: 0,
    /** Degrees, 0 = 3 o'clock. */
    startAngle: -90,
    /** Gap between slices, in degrees. */
    padAngle: 1.2,
    /** Shrink factor against the space left once labels are accounted for. */
    radius: 0.95,
    /** Feather the outer edge so slices dissolve outward, 0..1. */
    edgeFade: 0.25,
    /** 'percent' | 'value' | 'label' | 'none' — drawn when showValues is on. */
    labels: 'percent'
  }
};

/** Top-level shortcuts, so `{ innerRadius: 0.5 }` works as well as `{ pie: { ... } }`. */
const ALIASES = {
  particleColor: ['particle', 'color'],
  particleSize: ['particle', 'size'],
  particleDensity: ['particle', 'density'],
  particleBloom: ['particle', 'bloom'],
  particleOpacity: ['particle', 'opacity'],
  particleJitter: ['particle', 'jitter'],
  particleSpeed: ['particle', 'speed'],
  particleShape: ['particle', 'shape'],
  particleCount: ['particle', 'max'],
  colors: ['particle', 'color'],
  curve: ['line', 'curve'],
  fillArea: ['line', 'area'],
  lineWidth: ['line', 'width'],
  showPoints: ['line', 'points'],
  stacked: ['bar', 'stacked'],
  horizontal: ['bar', 'horizontal'],
  barPadding: ['bar', 'padding'],
  innerRadius: ['pie', 'innerRadius'],
  startAngle: ['pie', 'startAngle'],
  padAngle: ['pie', 'padAngle'],
  legendPosition: ['legend', 'position'],
  min: ['axis', 'min'],
  max: ['axis', 'max'],
  beginAtZero: ['axis', 'beginAtZero'],
  valueFormat: ['axis', 'format'],
  format: ['axis', 'format'],
  ticks: ['axis', 'ticks'],
  xTitle: ['axis', 'xTitle'],
  yTitle: ['axis', 'yTitle'],
  fontFamily: ['axis', 'fontFamily'],
  textColor: ['axis', 'textColor'],
  axisColor: ['axis', 'color'],
  gridColor: ['axis', 'gridColor']
};

function expandAliases(config) {
  if (!isPlainObject(config)) return {};
  const out = {};

  // Aliases first, so an explicitly nested group can overwrite them below.
  for (const key of Object.keys(config)) {
    const path = ALIASES[key];
    if (!path) continue;
    const [group, prop] = path;
    out[group] = { ...(out[group] || null), [prop]: config[key] };
  }

  for (const key of Object.keys(config)) {
    if (ALIASES[key]) continue;
    const value = config[key];
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? { ...out[key], ...value } : value;
  }
  return out;
}

function given(config, alias, group, prop) {
  if (!config) return false;
  if (config[alias] !== undefined) return true;
  return isPlainObject(config[group]) && config[group][prop] !== undefined;
}

function resolveOptions(config, previous) {
  const merged = deepMerge(previous || DEFAULTS, expandAliases(config));

  // Type-driven defaults, applied only when the caller has not spoken.
  if (!previous) {
    if (merged.type === 'donut' && !given(config, 'innerRadius', 'pie', 'innerRadius')) {
      merged.pie = { ...merged.pie, innerRadius: 0.62 };
    }
    if (merged.type === 'area' && !given(config, 'fillArea', 'line', 'area')) {
      merged.line = { ...merged.line, area: true, areaAmount: 0.7 };
    }
  }
  return merged;
}

// ---- src/core/particles.js ---------------------------------------------
/**
 * The particle field.
 *
 * Charts never draw geometry directly — they emit a list of *targets*
 * (`{x, y, color, size, group}`) and this field flies particles to them.
 * Because targets are generated in a stable order, index-to-index assignment
 * across a data change reads as a smooth morph rather than a reshuffle.
 */


class ParticleField {
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
function allocate(weights, budget, minEach) {
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

// ---- src/core/renderer.js ----------------------------------------------
/**
 * Canvas plumbing: HiDPI sizing, the particle sprite cache and the bloom pass.
 *
 * Particles are drawn into an offscreen *scene* layer with additive blending so
 * overlapping particles brighten each other, then that layer is composited onto
 * the main canvas. Bloom is a cheap two-step: downscale the scene (a free box
 * blur), then draw it back up through a `filter: blur()` at additive alpha.
 */


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

class Renderer {
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
    ctx.clearRect(0, 0, dw, dh);

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

// ---- src/core/axis.js --------------------------------------------------
/**
 * Cartesian axis + grid rendering.
 *
 * Grid and axis lines are deliberately recessive — they exist to be read
 * through, never with. The particles carry the data; this layer only carries
 * the reference frame.
 */


const TICK_GAP = 8;
const TITLE_GAP = 14;

function axisFont(axis, weight) {
  return (weight ? weight + ' ' : '') + axis.fontSize + 'px ' + axis.fontFamily;
}

/**
 * How much room the axis furniture needs, measured against the real text.
 * Returns a padding box in CSS pixels.
 */
function measureAxisPadding(ctx, spec, options) {
  const axis = options.axis;
  const pad = { top: 12, right: 14, bottom: 10, left: 12 };

  // A radial chart draws no axis furniture at all, so it needs nothing more
  // than a hairline of breathing room — and it reserves space for its own
  // labels inside `computeGeometry`, by measuring them against the radius.
  // Handing it the cartesian box (plus the showValues bump) just shrank the
  // ring to make room for ticks that are never drawn.
  if (options.type === 'pie' || options.type === 'donut') {
    return { top: 6, right: 6, bottom: 6, left: 6 };
  }
  if (!options.showAxis) return pad;

  ctx.save();
  ctx.font = axisFont(axis);

  if (axis.yLabels && spec.valueLabels && spec.valueLabels.length) {
    let widest = 0;
    for (const label of spec.valueLabels) widest = Math.max(widest, ctx.measureText(label).width);
    pad.left = Math.ceil(widest) + TICK_GAP + 6;
    pad.right = Math.max(pad.right, 16);
  }
  if (axis.xLabels && spec.categoryLabels && spec.categoryLabels.length) {
    pad.bottom = axis.fontSize + TICK_GAP + 8;
    // Half of the first/last label can overhang the plot edge.
    const first = ctx.measureText(spec.categoryLabels[0] || '').width / 2;
    const last = ctx.measureText(spec.categoryLabels[spec.categoryLabels.length - 1] || '').width / 2;
    pad.left = Math.max(pad.left, Math.ceil(first) + 4);
    pad.right = Math.max(pad.right, Math.ceil(last) + 4);
  }
  if (axis.xTitle) pad.bottom += axis.fontSize + TITLE_GAP;
  if (axis.yTitle) pad.left += axis.fontSize + TITLE_GAP;
  if (options.showValues) pad.top += axis.fontSize + 6;

  ctx.restore();
  return pad;
}

/**
 * @param {Object} spec
 *   plot        {x, y, w, h}
 *   valueTicks  [{ value, label, pos }]  pos = pixel on the value axis
 *   categoryTicks [{ label, pos }]       pos = pixel on the category axis
 *   horizontal  swap the roles of the two axes
 *   zeroPos     pixel position of the zero line, if inside the plot
 */
function drawAxis(ctx, spec, options) {
  const axis = options.axis;
  const { plot } = spec;
  const horizontal = !!spec.horizontal;

  ctx.save();
  ctx.font = axisFont(axis);
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;

  // ---- grid --------------------------------------------------------------
  if (options.showGrid) {
    ctx.strokeStyle = axis.gridColor;
    ctx.beginPath();
    if (axis.grid && spec.valueTicks) {
      for (const t of spec.valueTicks) {
        if (horizontal) {
          const x = snap(t.pos);
          ctx.moveTo(x, plot.y);
          ctx.lineTo(x, plot.y + plot.h);
        } else {
          const y = snap(t.pos);
          ctx.moveTo(plot.x, y);
          ctx.lineTo(plot.x + plot.w, y);
        }
      }
    }
    if (axis.xGrid && spec.categoryTicks) {
      for (const t of spec.categoryTicks) {
        if (horizontal) {
          const y = snap(t.pos);
          ctx.moveTo(plot.x, y);
          ctx.lineTo(plot.x + plot.w, y);
        } else {
          const x = snap(t.pos);
          ctx.moveTo(x, plot.y);
          ctx.lineTo(x, plot.y + plot.h);
        }
      }
    }
    ctx.stroke();
  }

  // ---- baseline ----------------------------------------------------------
  ctx.strokeStyle = axis.color;
  ctx.beginPath();
  if (horizontal) {
    const x = snap(spec.zeroPos != null ? spec.zeroPos : plot.x);
    ctx.moveTo(x, plot.y);
    ctx.lineTo(x, plot.y + plot.h);
  } else {
    const y = snap(spec.zeroPos != null ? spec.zeroPos : plot.y + plot.h);
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
  }
  ctx.stroke();

  // ---- labels ------------------------------------------------------------
  ctx.fillStyle = axis.textColor;

  if (axis.yLabels && spec.valueTicks) {
    if (horizontal) {
      ctx.textAlign = 'center';
      for (const t of spec.valueTicks) {
        ctx.fillText(t.label, t.pos, plot.y + plot.h + TICK_GAP + axis.fontSize * 0.5);
      }
    } else {
      ctx.textAlign = 'right';
      for (const t of spec.valueTicks) {
        ctx.fillText(t.label, plot.x - TICK_GAP, t.pos);
      }
    }
  }

  if (axis.xLabels && spec.categoryTicks) {
    if (horizontal) {
      ctx.textAlign = 'right';
      for (const t of spec.categoryTicks) ctx.fillText(t.label, plot.x - TICK_GAP, t.pos);
    } else {
      ctx.textAlign = 'center';
      const y = plot.y + plot.h + TICK_GAP + axis.fontSize * 0.5;
      for (const t of spec.categoryTicks) ctx.fillText(t.label, t.pos, y);
    }
  }

  // ---- titles ------------------------------------------------------------
  if (axis.xTitle) {
    ctx.textAlign = 'center';
    ctx.fillStyle = axis.textColor;
    ctx.fillText(axis.xTitle, plot.x + plot.w / 2, plot.y + plot.h + spec.padding.bottom - axis.fontSize * 0.4);
  }
  if (axis.yTitle) {
    ctx.save();
    ctx.translate(plot.x - spec.padding.left + axis.fontSize * 0.9, plot.y + plot.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(axis.yTitle, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

/** Vertical hover guide behind the tooltip. */
function drawHoverGuide(ctx, spec, pos, options) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  if (spec.horizontal) {
    ctx.moveTo(spec.plot.x, snap(pos));
    ctx.lineTo(spec.plot.x + spec.plot.w, snap(pos));
  } else {
    ctx.moveTo(snap(pos), spec.plot.y);
    ctx.lineTo(snap(pos), spec.plot.y + spec.plot.h);
  }
  ctx.stroke();
  ctx.restore();
}

function formatValue(value, options) {
  return formatNumber(value, options.axis.format);
}

function snap(v) {
  return Math.round(v) + 0.5;
}

// ---- src/core/styles.js ------------------------------------------------
/**
 * The library ships its own (tiny) stylesheet for the legend and tooltip so a
 * single `<script>` tag is genuinely all you need. Injected once, on first use.
 */

const STYLE_ID = 'particle-charts-styles';

const CSS = `
.pchart-root{position:relative;display:flex;width:100%;height:100%;min-width:0;min-height:0;
  font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased}
.pchart-root[data-legend="top"]{flex-direction:column}
.pchart-root[data-legend="bottom"]{flex-direction:column-reverse}
.pchart-root[data-legend="left"]{flex-direction:row}
.pchart-root[data-legend="right"]{flex-direction:row-reverse}
.pchart-plot{position:relative;flex:1 1 auto;min-width:0;min-height:0}
.pchart-canvas{display:block;position:absolute;inset:0;width:100%;height:100%}

.pchart-legend{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;flex:0 0 auto;
  padding:2px 0 12px;line-height:1.2;user-select:none}
.pchart-root[data-legend="bottom"] .pchart-legend{padding:12px 0 2px}
.pchart-root[data-legend="left"] .pchart-legend,
.pchart-root[data-legend="right"] .pchart-legend{flex-direction:column;align-items:flex-start;
  /* Centre the stack against the plot rather than letting it pile up in the
     top corner — a side legend should read as a key beside the chart. */
  justify-content:center;padding:0 16px 0 0;max-width:40%}
.pchart-root[data-legend="right"] .pchart-legend{padding:0 0 0 16px}
.pchart-legend[data-align="center"]{justify-content:center}
.pchart-legend[data-align="end"]{justify-content:flex-end}

.pchart-legend-item{display:inline-flex;align-items:center;gap:7px;background:none;border:0;
  padding:2px 0;margin:0;font:inherit;font-size:12px;color:inherit;cursor:default;
  transition:opacity .18s ease}
.pchart-legend[data-interactive="true"] .pchart-legend-item{cursor:pointer}
.pchart-legend-item:focus-visible{outline:1px solid currentColor;outline-offset:3px;border-radius:3px}
.pchart-legend-item.is-muted{opacity:.38}
.pchart-legend-item.is-muted .pchart-legend-label{text-decoration:line-through}
.pchart-legend-marker{flex:0 0 auto;border-radius:50%;box-shadow:0 0 10px 0 currentColor}
.pchart-legend-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.pchart-tooltip{position:absolute;z-index:5;pointer-events:none;opacity:0;
  transform:translate(-50%,-100%);transition:opacity .12s ease;
  padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.12);
  background:rgba(12,14,19,.94);color:#e9edf3;font-size:12px;line-height:1.45;
  box-shadow:0 8px 28px rgba(0,0,0,.45);white-space:nowrap;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.pchart-tooltip.is-visible{opacity:1}
.pchart-tooltip-title{font-weight:600;margin-bottom:4px;opacity:.72;font-size:11px;
  letter-spacing:.02em;text-transform:uppercase}
.pchart-tooltip-row{display:flex;align-items:center;gap:8px}
.pchart-tooltip-row + .pchart-tooltip-row{margin-top:2px}
.pchart-tooltip-swatch{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
.pchart-tooltip-name{opacity:.72;margin-right:auto}
.pchart-tooltip-value{font-variant-numeric:tabular-nums;font-weight:600}

.pchart-a11y{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0 0 0 0);white-space:nowrap;border:0}

@media (prefers-reduced-motion:reduce){
  .pchart-legend-item,.pchart-tooltip{transition:none}
}
`;

function injectStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

// ---- src/core/legend.js ------------------------------------------------
/**
 * DOM legend.
 *
 * A legend is always present for two or more series — colour alone is never the
 * only carrier of identity. It is built from real buttons so keyboard users can
 * toggle series too.
 */

class Legend {
  constructor(root, chart) {
    this.chart = chart;
    this.el = document.createElement('div');
    this.el.className = 'pchart-legend';
    this.el.setAttribute('role', 'list');
    root.appendChild(this.el);
    this.items = [];
  }

  /** @param {Array} entries [{ label, color, muted, key }] */
  render(entries, options) {
    const legend = options.legend;
    const show = options.showLegend && entries.length > 1;
    this.el.style.display = show ? '' : 'none';
    this.el.dataset.align = legend.align;
    this.el.dataset.interactive = String(!!legend.interactive);
    this.el.style.color = legend.color;
    this.el.style.fontSize = legend.fontSize + 'px';
    if (!show) {
      this.el.textContent = '';
      this.items = [];
      return;
    }

    this.el.textContent = '';
    this.items = entries.map((entry) => {
      const item = document.createElement(legend.interactive ? 'button' : 'span');
      item.className = 'pchart-legend-item' + (entry.muted ? ' is-muted' : '');
      item.setAttribute('role', 'listitem');
      if (legend.interactive) {
        item.type = 'button';
        item.setAttribute('aria-pressed', String(!entry.muted));
        item.title = entry.muted ? 'Show ' + entry.label : 'Hide ' + entry.label;
        item.addEventListener('click', () => this.chart.toggleSeries(entry.key));
      }

      const marker = document.createElement('span');
      marker.className = 'pchart-legend-marker';
      marker.style.width = legend.markerSize + 'px';
      marker.style.height = legend.markerSize + 'px';
      marker.style.background = entry.color;
      marker.style.color = entry.color;

      const label = document.createElement('span');
      label.className = 'pchart-legend-label';
      label.textContent = entry.label;

      item.appendChild(marker);
      item.appendChild(label);
      this.el.appendChild(item);
      return item;
    });
  }

  destroy() {
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
  }
}

// ---- src/core/tooltip.js -----------------------------------------------
/**
 * Hover tooltip. An on-screen chart is an interactive chart, so this is on by
 * default for every type except an empty one.
 */

class Tooltip {
  constructor(host, options) {
    this.el = document.createElement('div');
    this.el.className = 'pchart-tooltip';
    this.el.setAttribute('role', 'tooltip');
    host.appendChild(this.el);
    this.visible = false;
    this.applyTheme(options);
  }

  applyTheme(options) {
    const t = options.tooltip;
    this.el.style.background = t.background;
    this.el.style.color = t.color;
    this.el.style.borderColor = t.borderColor;
  }

  /**
   * @param {Object} payload { title, entries: [{name, value, color}], x, y }
   * @param {Object} bounds  { width, height } of the plot area
   */
  show(payload, bounds, options) {
    const format = options.tooltip.format;
    if (typeof format === 'function') {
      this.el.innerHTML = format(payload);
    } else {
      let html = payload.title ? '<div class="pchart-tooltip-title">' + escapeHtml(payload.title) + '</div>' : '';
      for (const e of payload.entries) {
        html +=
          '<div class="pchart-tooltip-row">' +
          '<span class="pchart-tooltip-swatch" style="background:' + escapeHtml(e.color) + '"></span>' +
          (e.name ? '<span class="pchart-tooltip-name">' + escapeHtml(e.name) + '</span>' : '') +
          '<span class="pchart-tooltip-value">' + escapeHtml(e.value) + '</span>' +
          '</div>';
      }
      this.el.innerHTML = html;
    }

    // Measure, then clamp inside the plot so the tooltip never leaves the chart.
    this.el.classList.add('is-visible');
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    let x = payload.x;
    let y = payload.y - 12;
    x = Math.max(w / 2 + 2, Math.min(bounds.width - w / 2 - 2, x));
    if (y - h < 2) y = payload.y + h + 20;
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
    this.visible = true;
  }

  hide() {
    if (!this.visible) return;
    this.el.classList.remove('is-visible');
    this.visible = false;
  }

  destroy() {
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- src/core/sampling.js ----------------------------------------------
/**
 * Turning geometry into particle positions.
 *
 * Every sampler is *stratified* — the i-th particle is drawn from the i-th
 * slice of the domain rather than from the whole of it — which removes the
 * clumping that plain `Math.random()` gives you and makes a cloud of a few
 * hundred particles read as a solid shape.
 */


/**
 * Monotone cubic interpolation (Fritsch-Carlson).
 * Chosen over Catmull-Rom because it cannot overshoot: a smoothed line through
 * non-negative data never dips below the baseline.
 */
function monotoneCurve(points, samplesPerSegment) {
  const n = points.length;
  if (n < 2) return points.slice();
  const per = Math.max(2, samplesPerSegment || 12);

  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i++) {
    const h = points[i + 1].x - points[i].x;
    dx.push(h);
    slope.push(h === 0 ? 0 : (points[i + 1].y - points[i].y) / h);
  }

  const m = new Array(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }

  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i];
    const steps = i === n - 2 ? per : per - 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      out.push({
        x: points[i].x + h * t,
        y: h00 * points[i].y + h10 * h * m[i] + h01 * points[i + 1].y + h11 * h * m[i + 1]
      });
    }
  }
  return out;
}

/** Right-angled staircase through the points. */
function stepCurve(points) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    if (i > 0) out.push({ x: points[i].x, y: points[i - 1].y });
    out.push(points[i]);
  }
  return out;
}

/**
 * Scatter `count` particles along a polyline, spread across a band of
 * `width` pixels centred on the path.
 */
function samplePath(path, count, width, rng, emit) {
  if (path.length < 2 || count <= 0) return;

  const lengths = [0];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    lengths.push(total);
  }
  if (total <= 0) {
    for (let i = 0; i < count; i++) emit(path[0].x, path[0].y, 0);
    return;
  }

  let seg = 1;
  const half = width / 2;
  for (let i = 0; i < count; i++) {
    const target = ((i + rng()) / count) * total;
    while (seg < lengths.length - 1 && lengths[seg] < target) seg++;
    const a = path[seg - 1];
    const b = path[seg];
    const span = lengths[seg] - lengths[seg - 1];
    const t = span > 0 ? (target - lengths[seg - 1]) / span : 0;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;

    // Offset along the segment normal, denser toward the centre of the band.
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const off = (rng() + rng() - 1) * half;
    emit(x + nx * off, y + ny * off, Math.abs(off) / (half || 1));
  }
}

/**
 * Fill the band between a polyline and a baseline.
 * `fade` > 0 thins particles toward the baseline so the fill dissolves.
 */
function sampleUnderPath(path, baseline, count, rng, fade, emit) {
  if (path.length < 2 || count <= 0) return;

  const cols = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const w = path[i].x - path[i - 1].x;
    if (w <= 0) continue;
    const top = (path[i].y + path[i - 1].y) / 2;
    const h = Math.abs(baseline - top);
    const area = w * h;
    if (area <= 0) continue;
    total += area;
    cols.push({ i, acc: total });
  }
  if (!total) return;

  const bias = 1 + clamp(fade, 0, 2) * 1.6;
  let c = 0;
  for (let k = 0; k < count; k++) {
    const target = ((k + rng()) / count) * total;
    while (c < cols.length - 1 && cols[c].acc < target) c++;
    const idx = cols[c].i;
    const a = path[idx - 1];
    const b = path[idx];
    const t = rng();
    const x = a.x + (b.x - a.x) * t;
    const top = a.y + (b.y - a.y) * t;
    const d = Math.pow(rng(), bias); // 0 at the line, 1 at the baseline
    emit(x, lerp(top, baseline, d), d);
  }
}

/**
 * Fill a rectangle. `fade` thins particles toward the "far" end, given by
 * `dir`: 'up' | 'down' | 'left' | 'right' — the direction the bar grows in.
 */
function sampleRect(x, y, w, h, count, rng, fade, dir, emit) {
  if (count <= 0 || w <= 0 || h <= 0) return;
  const bias = 1 - clamp(fade, 0, 0.85) * 0.75; // <1 pushes density toward the root
  const vertical = dir === 'up' || dir === 'down';

  for (let i = 0; i < count; i++) {
    // Stratify along the long axis; jitter freely across the short one.
    const along = (i + rng()) / count;
    const across = rng();
    const biased = Math.pow(along, bias);
    const t = dir === 'up' || dir === 'left' ? 1 - biased : biased;
    if (vertical) emit(x + across * w, y + t * h, biased);
    else emit(x + t * w, y + across * h, biased);
  }
}

/** Fill an annulus sector (a pie or donut slice). */
function sampleSector(cx, cy, r0, r1, a0, a1, count, rng, edgeFade, emit) {
  if (count <= 0 || r1 <= r0 || a1 <= a0) return;
  const inner2 = r0 * r0;
  const outer2 = r1 * r1;
  const fade = clamp(edgeFade, 0, 1);

  for (let i = 0; i < count; i++) {
    const a = a0 + ((i + rng()) / count) * (a1 - a0);
    // sqrt keeps the areal density uniform across the annulus.
    let u = rng();
    if (fade > 0) u = Math.pow(u, 1 - fade * 0.55);
    const r = Math.sqrt(inner2 + u * (outer2 - inner2));
    emit(cx + Math.cos(a) * r, cy + Math.sin(a) * r, u);
  }
}

/** A soft blob of particles, used for data-point markers. */
function sampleDisc(cx, cy, radius, count, rng, emit) {
  for (let i = 0; i < count; i++) {
    const a = ((i + rng()) / count) * TAU;
    const r = radius * Math.sqrt(rng()) * 0.92;
    emit(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r / radius);
  }
}

// ---- src/core/chart.js -------------------------------------------------
/**
 * Base chart: DOM scaffolding, layout, the render loop and interaction.
 *
 * Subclasses supply four things:
 *   labelSpec()            -> the strings the axis needs to measure
 *   computeGeometry()      -> scales / element rects for the current plot box
 *   buildTargets(budget)   -> particle targets
 *   drawBackdrop / drawForeground / hitTest
 */


const REFERENCE_AREA = 640 * 360;
/** Particle size the budget is neutral at; smaller sizes earn proportionally more. */
const REFERENCE_SIZE = 1.6;
/** Particles for a reference-area plot at density 1 and reference size. */
const BASE_BUDGET = 700;

class Chart {
  constructor(target, config) {
    injectStyles();

    this.container = resolveElement(target);
    this.options = resolveOptions(config || {});
    this.rawData = (config && config.data) || null;
    this.data = normalizeData(this.rawData);
    this.hidden = new Set();
    this.hover = null;
    this.destroyed = false;
    this.frame = 0;
    this.lastTime = 0;
    this.startTime = 0;
    this.visible = true;
    this.plot = { x: 0, y: 0, w: 0, h: 0 };
    this.padding = { top: 0, right: 0, bottom: 0, left: 0 };
    this.rng = createRng(0x5eed);
    // Honour the OS motion preference: no entrance flight, no idle drift.
    this.motionOk = !prefersReducedMotion();

    this.buildDom();
    this.field = new ParticleField();

    this.observeResize();
    this.bindPointer();
    this.observeVisibility();

    this.syncColors();
    this.layout({ initial: true });
    this.start();
  }

  // ---------------------------------------------------------------- DOM ----

  buildDom() {
    const root = document.createElement('div');
    root.className = 'pchart-root';
    root.dataset.legend = this.options.legend.position;
    this.root = root;

    this.plotHost = document.createElement('div');
    this.plotHost.className = 'pchart-plot';

    this.legend = new Legend(root, this);
    root.appendChild(this.plotHost);

    this.renderer = new Renderer(this.plotHost, this.options);
    this.renderer.canvas.setAttribute('role', 'img');

    this.tooltip = new Tooltip(this.plotHost, this.options);

    this.table = document.createElement('div');
    this.table.className = 'pchart-a11y';
    root.appendChild(this.table);

    this.container.appendChild(root);
  }

  observeResize() {
    if (!this.options.responsive || typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.destroyed) return;
      this.layout({ resize: true });
    });
    this.resizeObserver.observe(this.plotHost);
  }

  observeVisibility() {
    if (!this.options.pauseWhenHidden) return;
    this.onVisibility = () => {
      this.visible = document.visibilityState !== 'hidden' && this.inViewport !== false;
      if (this.visible) this.start();
    };
    document.addEventListener('visibilitychange', this.onVisibility);

    if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        this.inViewport = entries[0].isIntersecting;
        this.onVisibility();
      }, { rootMargin: '0px' });
      this.intersectionObserver.observe(this.root);
    }
  }

  bindPointer() {
    if (!this.options.showTooltip) return;
    this.onPointerMove = (event) => {
      const rect = this.renderer.canvas.getBoundingClientRect();
      this.handleHover(event.clientX - rect.left, event.clientY - rect.top);
      this.start(); // an idle-stopped chart still has to draw its highlight
    };
    this.onPointerLeave = () => {
      this.hover = null;
      this.tooltip.hide();
      this.start();
    };
    this.plotHost.addEventListener('pointermove', this.onPointerMove);
    this.plotHost.addEventListener('pointerleave', this.onPointerLeave);
  }

  // ------------------------------------------------------------- series ----

  syncColors() {
    this.data.series.forEach((s, i) => {
      s.color = s.color || colorAt(this.options.particle.color, i, s);
      s.key = s.name + '#' + i;
    });
  }

  /** Series the user has not muted via the legend. */
  visibleSeries() {
    return this.data.series.filter((s) => !this.hidden.has(s.key));
  }

  toggleSeries(key) {
    if (this.hidden.has(key)) this.hidden.delete(key);
    else if (this.visibleSeries().length > 1) this.hidden.add(key);
    else return; // never let the last series be hidden
    this.layout({ soft: true });
  }

  legendEntries() {
    return this.data.series.map((s) => ({
      key: s.key,
      label: s.name,
      color: s.color,
      muted: this.hidden.has(s.key)
    }));
  }

  // ------------------------------------------------------------- layout ----

  layout(flags) {
    if (this.destroyed) return;
    const opts = this.options;

    this.legend.render(this.legendEntries(), opts);

    const rect = this.plotHost.getBoundingClientRect();
    const width = rect.width || this.container.clientWidth || 600;
    const height = rect.height || this.container.clientHeight || 320;
    this.renderer.resize(width, height);

    const ctx = this.renderer.ctx;
    this.padding = opts.padding != null
      ? resolveBox(opts.padding, { top: 12, right: 14, bottom: 10, left: 12 })
      : measureAxisPadding(ctx, this.labelSpec(), opts);

    this.plot = {
      x: this.padding.left,
      y: this.padding.top,
      w: Math.max(1, this.renderer.width - this.padding.left - this.padding.right),
      h: Math.max(1, this.renderer.height - this.padding.top - this.padding.bottom)
    };

    this.computeGeometry();
    this.renderTable();
    this.retarget();
    this.updateAriaLabel();
    this.start();
  }

  /**
   * Regenerate particle targets for the current geometry without touching the
   * legend or the a11y table — cheap enough to run on a hover change.
   */
  retarget() {
    const opts = this.options;
    const targets = this.buildTargets(this.particleBudget());
    this.field.setTargets(targets, {
      spawn: {
        x: this.plot.x + this.plot.w / 2,
        y: this.plot.y + this.plot.h / 2,
        radius: Math.min(this.plot.w, this.plot.h) * 0.5
      },
      animate: opts.animate && this.motionOk,
      duration: opts.duration,
      stagger: this.motionOk ? opts.stagger : 0,
      immediate: opts.animate === false
    });
    this.start();
  }

  /**
   * How many particles a region of `area` square pixels is worth. Sub-linear in
   * area so a wide chart does not cost proportionally more to draw, and inverse
   * in particle size so smaller particles are issued in greater numbers.
   *
   * Calibrated so the defaults (size 0.5, density 5) fill a 640x360 plot with a
   * fine, legible dust. `particle.max` is the safety ceiling, not the target.
   */
  budgetForArea(area) {
    const p = this.options.particle;
    const sizeFactor = clamp(REFERENCE_SIZE / Math.max(0.1, p.size), 0.3, 3);
    const scale = Math.pow(Math.max(area, 1) / REFERENCE_AREA, 0.62);
    return Math.round(clamp(BASE_BUDGET * p.density * scale * sizeFactor, 120, p.max));
  }

  particleBudget() {
    return this.budgetForArea(this.plot.w * this.plot.h);
  }

  // --------------------------------------------------------------- loop ----

  start() {
    if (this.destroyed || this.frame || !this.visible) return;
    this.lastTime = 0;
    const tick = (now) => {
      this.frame = 0;
      if (this.destroyed) return;
      const dt = this.lastTime ? Math.min(now - this.lastTime, 64) : 16.7;
      this.lastTime = now;
      this.field.update(dt, this.options.particle);
      this.draw(now);
      // A chart with no idle drift has nothing left to animate once its
      // particles arrive, so stop burning frames until something changes.
      // `start()` is called again by layout, update and hover.
      const cfg = this.options.particle;
      const idle = this.field.settled && (!this.motionOk || !cfg.jitter);
      if (this.visible && !idle) this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  draw(now) {
    const r = this.renderer;
    const opts = this.options;
    r.beginFrame(opts.background);
    const ctx = r.ctx;

    const particleCfg = this.motionOk
      ? opts.particle
      : (this.staticCfg = { ...opts.particle, jitter: 0 });

    this.drawBackdrop(ctx);
    r.paintScene(this.field.particles, particleCfg, now);
    r.composite(particleCfg);
    this.drawForeground(ctx);
  }

  // ---------------------------------------------------------- public API ---

  /** Swap in new data (and optionally new options); particles morph to the new shape. */
  update(data, options) {
    if (data !== undefined && data !== null) {
      this.rawData = data;
      this.data = normalizeData(data);
      this.hidden.clear();
    }
    if (options) this.options = resolveOptions(options, this.options);
    this.syncColors();
    this.applyOptionSideEffects();
    this.layout({});
    return this;
  }

  setOptions(options) {
    return this.update(null, options);
  }

  applyOptionSideEffects() {
    this.root.dataset.legend = this.options.legend.position;
    this.tooltip.applyTheme(this.options);
    this.renderer.maxDpr = this.options.maxDpr;
  }

  resize() {
    this.layout({ resize: true });
    return this;
  }

  /** PNG snapshot of the current frame. */
  toDataURL(type, quality) {
    return this.renderer.canvas.toDataURL(type || 'image/png', quality);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.intersectionObserver) this.intersectionObserver.disconnect();
    if (this.onVisibility) document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.onPointerMove) {
      this.plotHost.removeEventListener('pointermove', this.onPointerMove);
      this.plotHost.removeEventListener('pointerleave', this.onPointerLeave);
    }
    this.tooltip.destroy();
    this.legend.destroy();
    this.renderer.destroy();
    this.field.clear();
    if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
  }

  // ------------------------------------------------------ accessibility ----

  updateAriaLabel() {
    const names = this.data.series.map((s) => s.name).join(', ');
    this.renderer.canvas.setAttribute(
      'aria-label',
      this.options.type + ' chart of ' + (names || 'no data') + ' across ' + this.data.labels.length + ' categories'
    );
  }

  /** Screen-reader table. Colour is never the only way to read this chart. */
  renderTable() {
    const { labels, series } = this.data;
    if (!series.length) {
      this.table.innerHTML = '';
      return;
    }
    let html = '<table><caption>Chart data</caption><thead><tr><th scope="col">Category</th>';
    for (const s of series) html += '<th scope="col">' + esc(s.name) + '</th>';
    html += '</tr></thead><tbody>';
    labels.forEach((label, i) => {
      html += '<tr><th scope="row">' + esc(label) + '</th>';
      for (const s of series) {
        html += '<td>' + (isNum(s.values[i]) ? esc(formatValue(s.values[i], this.options)) : '—') + '</td>';
      }
      html += '</tr>';
    });
    this.table.innerHTML = html + '</tbody></table>';
  }

  // ------------------------------------------------------- subclass hooks --

  labelSpec() {
    return { valueLabels: [], categoryLabels: [] };
  }

  computeGeometry() {}

  buildTargets() {
    return [];
  }

  drawBackdrop() {}

  drawForeground() {}

  handleHover() {}
}

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---- src/charts/cartesian.js -------------------------------------------
/**
 * Shared behaviour for the two axis-based chart types: value scale, category
 * scale, axis drawing and hover hit-testing.
 */


class CartesianChart extends Chart {
  isStacked() {
    return false;
  }

  isHorizontal() {
    return false;
  }

  /** Nice value-axis domain + ticks, honouring explicit min/max overrides. */
  computeValueAxis() {
    const opts = this.options;
    const series = this.visibleSeries();
    let [min, max] = valueExtent(series, {
      stacked: this.isStacked(),
      baseline: opts.axis.beginAtZero ? 'zero' : null
    });

    if (isNum(opts.axis.min)) min = opts.axis.min;
    if (isNum(opts.axis.max)) max = opts.axis.max;

    const nice = niceTicks(min, max, opts.axis.ticks);
    const lo = isNum(opts.axis.min) ? opts.axis.min : nice.min;
    const hi = isNum(opts.axis.max) ? opts.axis.max : nice.max;
    const ticks = nice.ticks.filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9);
    this.valueAxis = { min: lo, max: hi, ticks: ticks.length ? ticks : [lo, hi] };
    return this.valueAxis;
  }

  labelSpec() {
    const va = this.computeValueAxis();
    return {
      valueLabels: va.ticks.map((v) => formatValue(v, this.options)),
      categoryLabels: this.data.labels
    };
  }

  computeGeometry() {
    const va = this.computeValueAxis();
    const plot = this.plot;
    this.horizontal = this.isHorizontal();

    const valueRange = this.horizontal ? [plot.x, plot.x + plot.w] : [plot.y + plot.h, plot.y];
    this.vScale = linearScale([va.min, va.max], valueRange);
    this.zeroPos = this.vScale(clamp(0, va.min, va.max));

    const catRange = this.horizontal ? [plot.y, plot.y + plot.h] : [plot.x, plot.x + plot.w];
    this.catScale = this.createCategoryScale(this.data.labels.length, catRange);
  }

  createCategoryScale(count, range) {
    return bandScale(count, range, 0);
  }

  // --------------------------------------------------------------- axis ----

  categoryTicks() {
    const labels = this.data.labels;
    if (!labels.length) return [];
    const ctx = this.renderer.ctx;
    ctx.save();
    ctx.font = axisFont(this.options.axis);
    let widest = 0;
    for (const l of labels) widest = Math.max(widest, ctx.measureText(l).width);
    ctx.restore();

    const available = this.horizontal ? this.plot.h : this.plot.w;
    const perLabel = this.horizontal ? this.options.axis.fontSize * 2.1 : widest + 20;
    const indices = thinTicks(labels.map((_, i) => i), available, perLabel);
    return indices.map((i) => ({ label: labels[i], pos: this.catScale.at(i) }));
  }

  axisSpec() {
    const va = this.valueAxis;
    return {
      plot: this.plot,
      padding: this.padding,
      horizontal: this.horizontal,
      zeroPos: this.zeroPos,
      valueTicks: va.ticks.map((v) => ({
        value: v,
        label: formatValue(v, this.options),
        pos: this.vScale(v)
      })),
      categoryTicks: this.categoryTicks()
    };
  }

  drawBackdrop(ctx) {
    if (!this.options.showAxis && !this.options.showGrid) return;
    this.spec = this.axisSpec();
    drawAxis(ctx, this.spec, this.options);
  }

  drawForeground(ctx) {
    if (this.hover && this.spec) {
      drawHoverGuide(ctx, this.spec, this.catScale.at(this.hover.index), this.options);
    }
    if (this.options.showValues) this.drawValueLabels(ctx);
  }

  drawValueLabels() {}

  // -------------------------------------------------------------- hover ----

  handleHover(x, y) {
    const plot = this.plot;
    const slack = 12;
    const inside =
      x >= plot.x - slack && x <= plot.x + plot.w + slack &&
      y >= plot.y - slack && y <= plot.y + plot.h + slack;

    if (!inside || !this.data.labels.length) {
      this.hover = null;
      this.tooltip.hide();
      return;
    }

    const index = this.catScale.indexAt(this.horizontal ? y : x);
    const entries = [];
    for (const s of this.visibleSeries()) {
      const v = s.values[index];
      if (!isNum(v)) continue;
      entries.push({ name: s.name, value: formatValue(v, this.options), color: s.color });
    }

    if (!entries.length) {
      this.hover = null;
      this.tooltip.hide();
      return;
    }

    this.hover = { index };
    const anchor = this.hoverAnchor(index);
    this.tooltip.show(
      { title: this.data.labels[index], entries, x: anchor.x, y: anchor.y },
      { width: this.renderer.width, height: this.renderer.height },
      this.options
    );
  }

  /** Where the tooltip points. Defaults to the topmost value at that category. */
  hoverAnchor(index) {
    let best = Infinity;
    for (const s of this.visibleSeries()) {
      const v = s.values[index];
      if (!isNum(v)) continue;
      best = Math.min(best, this.vScale(v));
    }
    if (!Number.isFinite(best)) best = this.plot.y + this.plot.h / 2;
    return this.horizontal
      ? { x: clamp(best, this.plot.x, this.plot.x + this.plot.w), y: this.catScale.at(index) }
      : { x: this.catScale.at(index), y: best };
  }
}

// ---- src/charts/line.js ------------------------------------------------
/**
 * Line / area chart.
 *
 * Each series becomes three particle populations: a band along the stroke, an
 * optional fill under it that fades toward the baseline, and a tight cluster at
 * every data point so the actual measurements stay legible inside the cloud.
 */


/** How many particles may cover any one pixel of a stroke before hues clip. */
const STROKE_OVERLAP = 1.2;
/** Draw diameter of a small particle as a multiple of `particle.size` (matches the renderer). */
const DRAW_SPREAD = 2;

function pathLength(runs) {
  let len = 0;
  for (const run of runs) {
    for (let i = 1; i < run.path.length; i++) {
      len += Math.hypot(run.path[i].x - run.path[i - 1].x, run.path[i].y - run.path[i - 1].y);
    }
  }
  return len;
}

function strokeCapacity(length, width, size) {
  const particleArea = Math.max(1, Math.pow(size * DRAW_SPREAD, 2));
  return Math.max(24, Math.ceil((length * width * STROKE_OVERLAP) / particleArea));
}

class LineChart extends CartesianChart {
  createCategoryScale(count, range) {
    const xs = this.data.xValues;
    if (xs && xs.length === count && count > 1) return valueCategoryScale(xs, range);
    return pointScale(count, range);
  }

  /** Split a series into runs of consecutive non-null points, then smooth each. */
  buildPaths(series) {
    const curve = this.options.line.curve;
    const runs = [];
    let current = [];

    series.values.forEach((v, i) => {
      if (!isNum(v)) {
        if (current.length) runs.push(current);
        current = [];
        return;
      }
      current.push({ x: this.catScale.at(i), y: this.vScale(v), i });
    });
    if (current.length) runs.push(current);

    return runs.map((pts) => {
      if (pts.length < 2) return { anchors: pts, path: pts };
      if (curve === 'step') return { anchors: pts, path: stepCurve(pts) };
      if (curve === 'smooth') return { anchors: pts, path: monotoneCurve(pts, 14) };
      return { anchors: pts, path: pts };
    });
  }

  buildTargets(budget) {
    const opts = this.options;
    const cfg = opts.line;
    const series = this.visibleSeries();
    const targets = [];
    if (!series.length || !this.data.labels.length) return targets;

    const rng = createRng(0xa11ce5);
    const baseline = clamp(this.zeroPos, this.plot.y, this.plot.y + this.plot.h);
    const geometry = series.map((s) => this.buildPaths(s));

    // Weight each series by how much ink it actually needs.
    const weights = geometry.map((runs) => {
      let w = 0;
      for (const run of runs) {
        for (let i = 1; i < run.path.length; i++) {
          w += Math.hypot(run.path[i].x - run.path[i - 1].x, run.path[i].y - run.path[i - 1].y) * cfg.width;
        }
        if (cfg.area) {
          for (let i = 1; i < run.path.length; i++) {
            const dx = run.path[i].x - run.path[i - 1].x;
            w += Math.abs(dx * (baseline - (run.path[i].y + run.path[i - 1].y) / 2)) * 0.55;
          }
        }
      }
      return Math.max(w, 1);
    });

    const counts = allocate(weights, budget, 60);
    const p = opts.particle;

    series.forEach((s, si) => {
      const runs = geometry[si];
      const total = counts[si];
      if (!total) return;

      const anchorCount = runs.reduce((n, r) => n + r.anchors.length, 0);
      const pointBudget = cfg.points ? Math.min(Math.round(total * 0.16), anchorCount * 26) : 0;
      const rest = total - pointBudget;
      let areaCount = cfg.area ? Math.round(rest * clamp(cfg.areaAmount, 0, 0.95)) : 0;
      let strokeCount = rest - areaCount;

      /**
       * A stroke is a thin band, so a large budget piles particles many deep
       * inside it. Because particles composite additively, past a few layers
       * every channel clips and the series loses its colour to white. Cap the
       * stroke at the count its own area can carry, and hand any surplus to the
       * area fill — a plain line simply uses fewer particles, which is correct.
       */
      const strokeCap = strokeCapacity(pathLength(runs), cfg.width, p.size);
      if (strokeCount > strokeCap) {
        const spare = strokeCount - strokeCap;
        strokeCount = strokeCap;
        if (cfg.area) areaCount += spare;
      }

      // Longer runs get proportionally more particles.
      const runWeights = runs.map((r) => Math.max(1, r.path.length));
      const strokeSplit = allocate(runWeights, strokeCount, 8);
      const areaSplit = allocate(runWeights, areaCount, 0);

      runs.forEach((run, ri) => {
        if (run.path.length < 2) {
          // A lone point still deserves a mark.
          sampleDisc(run.path[0].x, run.path[0].y, cfg.pointRadius, 24, rng, (x, y) =>
            targets.push(this.target(x, y, s.color, rng, 1.05, 1, si, run.anchors[0].i))
          );
          return;
        }

        if (areaSplit[ri] > 0) {
          sampleUnderPath(run.path, baseline, areaSplit[ri], rng, cfg.areaFade, (x, y, d) =>
            targets.push(this.target(x, y, s.color, rng, 0.82, 0.62 * (1 - d * 0.55), si, -1))
          );
        }

        samplePath(run.path, strokeSplit[ri], cfg.width, rng, (x, y, edge) =>
          targets.push(this.target(x, y, s.color, rng, 1 - edge * 0.25, 1 - edge * 0.3, si, -1))
        );
      });

      if (pointBudget > 0 && anchorCount > 0) {
        const per = Math.max(6, Math.floor(pointBudget / anchorCount));
        for (const run of runs) {
          for (const a of run.anchors) {
            sampleDisc(a.x, a.y, cfg.pointRadius, per, rng, (x, y, d) =>
              targets.push(this.target(x, y, s.color, rng, 1.1 - d * 0.3, 1, si, a.i))
            );
          }
        }
      }
    });

    if (targets.length > p.max) targets.length = p.max;
    return targets;
  }

  target(x, y, color, rng, sizeScale, alpha, group, index) {
    const p = this.options.particle;
    const j = p.sizeJitter;
    return {
      x,
      y,
      color,
      size: p.size * sizeScale * (1 - j * 0.5 + rng() * j),
      alpha,
      group,
      index
    };
  }

  drawForeground(ctx) {
    super.drawForeground(ctx);
    if (!this.hover) return;

    const i = this.hover.index;
    ctx.save();
    for (const s of this.visibleSeries()) {
      const v = s.values[i];
      if (!isNum(v)) continue;
      const x = this.catScale.at(i);
      const y = this.vScale(v);
      ctx.beginPath();
      ctx.arc(x, y, this.options.line.pointRadius + 3.5, 0, TAU);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.9;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawValueLabels(ctx) {
    const axis = this.options.axis;
    ctx.save();
    ctx.font = axisFont(axis, '600');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = axis.textColor;
    for (const s of this.visibleSeries()) {
      s.values.forEach((v, i) => {
        if (!isNum(v)) return;
        ctx.fillText(formatValue(v, this.options), this.catScale.at(i), this.vScale(v) - 10);
      });
    }
    ctx.restore();
  }
}

// ---- src/charts/bar.js -------------------------------------------------
/**
 * Bar chart — grouped, stacked, vertical or horizontal.
 *
 * Bars are filled with particles that thin out toward the growing end, so a bar
 * reads as a column of light anchored to the baseline rather than a hard block.
 */


class BarChart extends CartesianChart {
  isStacked() {
    return !!this.options.bar.stacked;
  }

  isHorizontal() {
    return !!this.options.bar.horizontal;
  }

  createCategoryScale(count, range) {
    return bandScale(count, range, clamp(this.options.bar.padding, 0, 0.9));
  }

  /** Pixel rectangles for every bar currently on screen. */
  barRects() {
    const cfg = this.options.bar;
    const series = this.visibleSeries();
    const band = this.catScale;
    const horizontal = this.horizontal;
    const rects = [];
    if (!series.length) return rects;

    const stacked = this.isStacked();
    const slots = stacked ? 1 : series.length;
    const slotSize = band.bandwidth / slots;
    const thickness = Math.max(1, slotSize * (1 - clamp(cfg.groupPadding, 0, 0.8)));
    const posAcc = new Array(this.data.labels.length).fill(0);
    const negAcc = new Array(this.data.labels.length).fill(0);

    series.forEach((s, si) => {
      s.values.forEach((v, i) => {
        if (!isNum(v)) return;

        let from = 0;
        let to = v;
        if (stacked) {
          if (v >= 0) {
            from = posAcc[i];
            posAcc[i] += v;
          } else {
            from = negAcc[i];
            negAcc[i] += v;
          }
          to = from + v;
        }

        const p0 = this.vScale(from);
        const p1 = this.vScale(to);
        const start = band.start(i) + (stacked ? 0 : si * slotSize) + (slotSize - thickness) / 2;
        const lo = Math.min(p0, p1);
        const hi = Math.max(p0, p1);

        const rect = horizontal
          ? { x: lo, y: start, w: Math.max(hi - lo, 0.5), h: thickness, dir: v >= 0 ? 'right' : 'left' }
          : { x: start, y: lo, w: thickness, h: Math.max(hi - lo, 0.5), dir: v >= 0 ? 'up' : 'down' };

        rect.series = si;
        rect.index = i;
        rect.value = v;
        rect.color = s.color;
        // The tip of the bar — where the value label and the cap rounding go.
        rect.tip = horizontal
          ? { x: v >= 0 ? rect.x + rect.w : rect.x, y: rect.y + rect.h / 2 }
          : { x: rect.x + rect.w / 2, y: v >= 0 ? rect.y : rect.y + rect.h };
        rects.push(rect);
      });
    });

    return rects;
  }

  buildTargets(budget) {
    const rects = (this.rects = this.barRects());
    const targets = [];
    if (!rects.length) return targets;

    const cfg = this.options.bar;
    const p = this.options.particle;
    const rng = createRng(0xba7);
    const counts = allocate(rects.map((r) => r.w * r.h), budget, 14);
    const j = p.sizeJitter;

    rects.forEach((r, ri) => {
      const n = counts[ri];
      if (!n) return;
      const radius = Math.min(cfg.radius, r.dir === 'up' || r.dir === 'down' ? r.w / 2 : r.h / 2);

      sampleRect(r.x, r.y, r.w, r.h, n, rng, cfg.fade, r.dir, (x, y, t) => {
        if (radius > 0.5) {
          const rounded = roundCap(x, y, r, radius);
          x = rounded.x;
          y = rounded.y;
        }
        targets.push({
          x,
          y,
          color: r.color,
          size: p.size * (1 - t * 0.18) * (1 - j * 0.5 + rng() * j),
          alpha: 1 - t * 0.25,
          group: r.series,
          index: r.index
        });
      });
    });

    if (targets.length > p.max) targets.length = p.max;
    return targets;
  }

  drawForeground(ctx) {
    super.drawForeground(ctx);
    if (!this.hover || !this.rects) return;

    ctx.save();
    ctx.lineWidth = 1;
    for (const r of this.rects) {
      if (r.index !== this.hover.index) continue;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 0.55;
      roundRectPath(ctx, r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3, Math.min(this.options.bar.radius + 1, r.w / 2));
      ctx.stroke();
    }
    ctx.restore();
  }

  hoverAnchor(index) {
    let anchor = null;
    for (const r of this.rects || []) {
      if (r.index !== index) continue;
      if (!anchor || (this.horizontal ? r.tip.x > anchor.x : r.tip.y < anchor.y)) anchor = { ...r.tip };
    }
    return anchor || super.hoverAnchor(index);
  }

  drawValueLabels(ctx) {
    const axis = this.options.axis;
    ctx.save();
    ctx.font = axisFont(axis, '600');
    ctx.fillStyle = axis.textColor;
    ctx.textAlign = this.horizontal ? 'left' : 'center';
    ctx.textBaseline = this.horizontal ? 'middle' : 'bottom';
    for (const r of this.rects || []) {
      const label = formatValue(r.value, this.options);
      if (this.horizontal) ctx.fillText(label, r.tip.x + 8, r.tip.y);
      else ctx.fillText(label, r.tip.x, r.tip.y - 8);
    }
    ctx.restore();
  }
}

/**
 * Pull a sampled point inside the bar's rounded cap, so the tip reads as a
 * radius instead of a square corner. Points outside the arc are squeezed
 * toward the bar's centre line rather than discarded, which keeps the count
 * (and therefore the particle budget) exact.
 */
function roundCap(x, y, rect, radius) {
  const vertical = rect.dir === 'up' || rect.dir === 'down';
  const capAt = vertical
    ? rect.dir === 'up' ? rect.y : rect.y + rect.h
    : rect.dir === 'right' ? rect.x + rect.w : rect.x;

  const along = vertical ? Math.abs(y - capAt) : Math.abs(x - capAt);
  if (along >= radius) return { x, y };

  // Half-width of the rounded profile at this distance from the tip.
  const k = radius - along;
  const half = vertical ? rect.w / 2 : rect.h / 2;
  const allowed = Math.max(0.5, half - radius + Math.sqrt(Math.max(0, radius * radius - k * k)));
  const centre = vertical ? rect.x + half : rect.y + half;
  const squeezed = centre + ((vertical ? x : y) - centre) * (allowed / half);

  return vertical ? { x: squeezed, y } : { x, y: squeezed };
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// ---- src/charts/pie.js -------------------------------------------------
/**
 * Pie / donut chart.
 *
 * `type: 'donut'` is this chart with a non-zero inner radius — the only
 * difference is where the annulus starts, so they share every code path.
 *
 * Unlike the cartesian charts, colour here identifies a *category*, so the
 * legend, the mute state and the palette slots are all keyed by category.
 */


/** How far the hovered wedge slides out of the ring, in pixels. */
const LIFT = 6;
/** Clearance between the ring's outer edge and its labels, in pixels. */
const LABEL_GAP = 12;

class PieChart extends Chart {
  syncColors() {
    const spec = this.options.particle.color;
    this.sliceColors = this.data.labels.map((label, i) => colorAt(spec, i, label));
    this.sliceKeys = this.data.labels.map((label, i) => label + '#' + i);
  }

  /** Pie reads a single series; extra series are ignored (with the first winning). */
  values() {
    const s = this.data.series[0];
    return s ? s.values : [];
  }

  visibleSlices() {
    const values = this.values();
    const out = [];
    this.data.labels.forEach((label, i) => {
      const v = values[i];
      if (!isNum(v) || v <= 0) return;
      if (this.hidden.has(this.sliceKeys[i])) return;
      out.push({ index: i, label, value: v, color: this.sliceColors[i] });
    });
    return out;
  }

  legendEntries() {
    const values = this.values();
    return this.data.labels
      .map((label, i) => ({
        key: this.sliceKeys[i],
        label,
        color: this.sliceColors[i],
        muted: this.hidden.has(this.sliceKeys[i]),
        value: values[i]
      }))
      .filter((e) => isNum(e.value) && e.value > 0);
  }

  toggleSeries(key) {
    if (this.hidden.has(key)) this.hidden.delete(key);
    else if (this.visibleSlices().length > 1) this.hidden.add(key);
    else return;
    this.layout({ soft: true });
  }

  labelSpec() {
    return { valueLabels: [], categoryLabels: [] };
  }

  computeGeometry() {
    const cfg = this.options.pie;
    const plot = this.plot;
    this.centre = { x: plot.x + plot.w / 2, y: plot.y + plot.h / 2 };

    const slices = this.visibleSlices();
    const total = slices.reduce((a, s) => a + s.value, 0);
    this.total = total;

    // Angles first: they depend only on the values, never on the radius.
    const pad = slices.length > 1 ? clamp(cfg.padAngle, 0, 20) * DEG : 0;
    const available = Math.max(0.01, TAU - pad * slices.length);
    let angle = cfg.startAngle * DEG + pad / 2;

    this.slices = slices.map((s) => {
      const span = total > 0 ? (s.value / total) * available : 0;
      const out = { ...s, a0: angle, a1: angle + span, share: total > 0 ? s.value / total : 0 };
      out.mid = (out.a0 + out.a1) / 2;
      angle += span + pad;
      return out;
    });

    // Labels sit outside the ring, so the ring has to give up the room they
    // need — measured against the real strings rather than guessed at.
    let room = { x: 0, y: 0 };
    if (this.labelsVisible()) {
      const axis = this.options.axis;
      const ctx = this.renderer.ctx;
      ctx.save();
      ctx.font = axisFont(axis, '500');
      let widest = 0;
      for (const s of this.slices) widest = Math.max(widest, ctx.measureText(this.sliceLabel(s)).width);
      ctx.restore();
      room = { x: LABEL_GAP + Math.ceil(widest), y: LABEL_GAP + axis.fontSize };
    }

    const fits = Math.min(plot.w / 2 - room.x, plot.h / 2 - room.y);
    this.outer = Math.max(12, fits * clamp(cfg.radius, 0.2, 1));
    this.inner = this.outer * clamp(cfg.innerRadius, 0, 0.95);
  }

  labelsVisible() {
    return this.options.showValues && this.options.pie.labels !== 'none';
  }

  sliceLabel(slice) {
    const mode = this.options.pie.labels;
    if (mode === 'value') return formatValue(slice.value, this.options);
    if (mode === 'label') return slice.label;
    return Math.round(slice.share * 100) + '%';
  }

  /**
   * Budget from the annulus, not the bounding box — a wide card around a small
   * ring would otherwise pack the slices until additive blending blows every
   * colour out to white. The ring is a solid fill rather than a sparse cloud,
   * so it earns roughly twice the particles per unit area that a plot does.
   */
  particleBudget() {
    const ring = Math.PI * (this.outer * this.outer - this.inner * this.inner);
    return Math.min(this.options.particle.max, Math.round(this.budgetForArea(ring) * 2));
  }

  buildTargets(budget) {
    const targets = [];
    if (!this.slices || !this.slices.length) return targets;

    const cfg = this.options.pie;
    const p = this.options.particle;
    const rng = createRng(0x9123);
    const j = p.sizeJitter;
    const areas = this.slices.map((s) => (s.a1 - s.a0) * (this.outer * this.outer - this.inner * this.inner));
    const counts = allocate(areas, budget, 20);

    this.slices.forEach((s, si) => {
      const n = counts[si];
      if (!n) return;
      const lift = this.hover && this.hover.index === s.index ? LIFT : 0;
      const cx = this.centre.x + Math.cos(s.mid) * lift;
      const cy = this.centre.y + Math.sin(s.mid) * lift;

      sampleSector(cx, cy, this.inner, this.outer, s.a0, s.a1, n, rng, cfg.edgeFade, (x, y, u) => {
        targets.push({
          x,
          y,
          color: s.color,
          size: p.size * (1 - u * 0.12) * (1 - j * 0.5 + rng() * j),
          alpha: 1 - Math.max(0, u - 0.78) * 1.6 * clamp(cfg.edgeFade, 0, 1),
          group: si,
          index: s.index
        });
      });
    });

    if (targets.length > p.max) targets.length = p.max;
    return targets;
  }

  drawBackdrop() {}

  drawForeground(ctx) {
    const axis = this.options.axis;

    // Hover outline: a thin arc, so the highlight does not compete with the cloud.
    if (this.hover) {
      const s = this.slices.find((sl) => sl.index === this.hover.index);
      if (s) {
        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        // Follow the slice out: buildTargets lifts the hovered wedge by LIFT px.
        ctx.arc(
          this.centre.x + Math.cos(s.mid) * LIFT,
          this.centre.y + Math.sin(s.mid) * LIFT,
          this.outer + 4,
          s.a0,
          s.a1
        );
        ctx.stroke();
        ctx.restore();
      }
    }

    if (this.labelsVisible()) this.drawSliceLabels(ctx);
    if (this.centreMode() !== 'none') this.drawCentre(ctx, axis);
  }

  centreMode() {
    const cfg = this.options.pie;
    if (cfg.center === 'none') return 'none';
    if (cfg.center === 'auto' || cfg.center == null) {
      return clamp(cfg.innerRadius, 0, 1) >= 0.35 ? 'total' : 'none';
    }
    return cfg.center;
  }

  drawCentre(ctx, axis) {
    const hovered = this.hover ? this.slices.find((s) => s.index === this.hover.index) : null;
    const caption = hovered ? hovered.label : this.centreMode() === 'total' ? 'Total' : String(this.centreMode());
    const value = hovered ? hovered.value : this.total;
    const size = Math.max(16, Math.min(this.inner * 0.46, 40));

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.font = '600 ' + size.toFixed(0) + 'px ' + axis.fontFamily;
    ctx.fillText(formatValue(value, this.options), this.centre.x, this.centre.y + size * 0.16);
    ctx.font = axisFont(axis);
    ctx.fillStyle = axis.textColor;
    ctx.fillText(truncate(ctx, caption, this.inner * 1.6), this.centre.x, this.centre.y + size * 0.95);
    ctx.restore();
  }

  /**
   * Labels sit just outside the ring, on the slice's own bearing, in the same
   * muted ink as the axis so they stay behind the data.
   *
   * Slices are walked in angular order, which means the y of each label moves
   * monotonically down the right-hand side and back up the left. That makes
   * collision handling a single comparison against the last label placed on the
   * same side: anything that would land on top of its neighbour is dropped, and
   * the legend and tooltip carry it instead.
   */
  drawSliceLabels(ctx) {
    const axis = this.options.axis;
    const radius = this.outer + LABEL_GAP;

    ctx.save();
    ctx.font = axisFont(axis, '500');
    ctx.textBaseline = 'middle';
    ctx.fillStyle = axis.textColor;

    const minGap = axis.fontSize * 1.1;
    let lastRight = -Infinity;
    let lastLeft = -Infinity;

    for (const s of this.slices) {
      const cos = Math.cos(s.mid);
      const y = this.centre.y + Math.sin(s.mid) * radius;
      const toRight = cos >= 0;

      // A slice pointing straight up or down gets a centred label sitting over
      // its tip. Flinging those out to a side would stack them against their
      // neighbours for no reason.
      const upright = Math.abs(cos) < 0.3;
      if (!upright) {
        if (Math.abs(y - (toRight ? lastRight : lastLeft)) < minGap) continue;
        if (toRight) lastRight = y;
        else lastLeft = y;
      }

      ctx.textAlign = upright ? 'center' : toRight ? 'left' : 'right';
      ctx.fillText(this.sliceLabel(s), this.centre.x + cos * radius, y);
    }
    ctx.restore();
  }

  handleHover(x, y) {
    if (!this.slices || !this.slices.length) return;
    const dx = x - this.centre.x;
    const dy = y - this.centre.y;
    const dist = Math.hypot(dx, dy);

    if (dist < this.inner * 0.92 || dist > this.outer * 1.08) {
      if (this.hover) {
        this.hover = null;
        this.retarget();
      }
      this.tooltip.hide();
      return;
    }

    let angle = Math.atan2(dy, dx);
    const found = this.slices.find((s) => {
      let a = angle;
      while (a < s.a0) a += TAU;
      while (a > s.a0 + TAU) a -= TAU;
      return a >= s.a0 && a <= s.a1;
    });

    if (!found) {
      this.tooltip.hide();
      return;
    }

    if (!this.hover || this.hover.index !== found.index) {
      this.hover = { index: found.index };
      this.retarget(); // the hovered slice lifts out of the ring
    }

    this.tooltip.show(
      {
        title: found.label,
        entries: [
          {
            name: formatValue(found.value, this.options),
            value: (found.share * 100).toFixed(found.share < 0.1 ? 1 : 0) + '%',
            color: found.color
          }
        ],
        x,
        y
      },
      { width: this.renderer.width, height: this.renderer.height },
      this.options
    );
  }

  /** Pie's a11y table needs percentages, not just raw values. */
  renderTable() {
    const rows = this.legendEntries();
    if (!rows.length) {
      this.table.innerHTML = '';
      return;
    }
    const total = rows.reduce((a, r) => a + r.value, 0) || 1;
    let html = '<table><caption>Chart data</caption><thead><tr>' +
      '<th scope="col">Category</th><th scope="col">Value</th><th scope="col">Share</th></tr></thead><tbody>';
    for (const r of rows) {
      html += '<tr><th scope="row">' + escHtml(r.label) + '</th><td>' +
        escHtml(formatValue(r.value, this.options)) + '</td><td>' +
        ((r.value / total) * 100).toFixed(1) + '%</td></tr>';
    }
    this.table.innerHTML = html + '</tbody></table>';
  }
}

function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) out = out.slice(0, -1);
  return out + '…';
}

function escHtml(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- src/index.js ------------------------------------------------------
/**
 * Particle Charts — public entry point.
 */


const version = '0.2.0';

const TYPES = {
  line: LineChart,
  area: LineChart,
  bar: BarChart,
  column: BarChart,
  pie: PieChart,
  donut: PieChart
};

/**
 * Create a chart. Works with or without `new`.
 *
 *   const chart = new ParticleChart('#el', { type: 'line', data, ...options });
 *
 * @param {Element|string} target  container element or CSS selector
 * @param {Object} config          `{ type, data, ...options }`
 * @returns {Chart}
 */
function ParticleChart(target, config) {
  const cfg = config || {};
  const type = String(cfg.type || 'line').toLowerCase();
  const Ctor = TYPES[type];
  if (!Ctor) {
    throw new Error(
      '[ParticleCharts] Unknown chart type "' + cfg.type + '". Expected one of: ' + Object.keys(TYPES).join(', ')
    );
  }
  return new Ctor(target, cfg);
}

/** `ParticleCharts.line(el, data, options)` and friends. */
function shorthand(type) {
  return (target, data, options) => ParticleChart(target, { ...(options || {}), type, data });
}

const line = shorthand('line');
const area = shorthand('area');
const bar = shorthand('bar');
const pie = shorthand('pie');
const donut = shorthand('donut');

  var api = {
    ParticleChart: ParticleChart,
    Chart: Chart,
    LineChart: LineChart,
    BarChart: BarChart,
    PieChart: PieChart,
    line: line,
    area: area,
    bar: bar,
    pie: pie,
    donut: donut,
    defaults: DEFAULTS,
    palette: DEFAULT_PALETTE,
    version: version
  };
  api.ParticleChart.create = api.ParticleChart;
  return api;
});
