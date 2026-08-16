/**
 * Default options + ergonomic aliases.
 *
 * Every visual knob lives here so `Object.keys(DEFAULTS)` doubles as the
 * documented surface area of the library.
 */

import { deepMerge, isPlainObject } from './utils.js';

export const DEFAULTS = {
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
    bloom: 0.3,
    /** Blur radius of the bloom pass, in CSS pixels. */
    bloomRadius: 14,
    /**
     * Per-particle alpha. Kept well under 1 because particles composite
     * additively: stack enough of them at full alpha and every hue clips to
     * white, which is how a palette loses its identity in a dense chart.
     */
    opacity: 0.7,
    /** Idle drift amplitude in pixels — the "alive" wobble. */
    jitter: 0.5,
    /** Idle drift speed. */
    jitterSpeed: 1,
    /** Spring stiffness pulling a particle to its target (0..1). */
    speed: 0.085,
    damping: 0.78,
    /** 0 = clear each frame. Up to ~0.9 leaves comet trails. */
    trail: 0,
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
  particleTrail: ['particle', 'trail'],
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

export function resolveOptions(config, previous) {
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
