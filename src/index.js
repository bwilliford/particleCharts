/**
 * Particle Charts — public entry point.
 */

import { Chart } from './core/chart.js';
import { LineChart } from './charts/line.js';
import { BarChart } from './charts/bar.js';
import { PieChart } from './charts/pie.js';
import { BubbleChart } from './charts/bubble.js';
import { RadarChart } from './charts/radar.js';
import { DEFAULTS, THEMES } from './core/options.js';
import { DEFAULT_PALETTE } from './core/color.js';

export const version = '1.0.0';

const TYPES = {
  line: LineChart,
  area: LineChart,
  bar: BarChart,
  column: BarChart,
  bubble: BubbleChart,
  scatter: BubbleChart,
  pie: PieChart,
  donut: PieChart,
  radar: RadarChart,
  spider: RadarChart
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
export function ParticleChart(target, config) {
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

export const line = shorthand('line');
export const area = shorthand('area');
export const bar = shorthand('bar');
export const bubble = shorthand('bubble');
export const pie = shorthand('pie');
export const donut = shorthand('donut');
export const radar = shorthand('radar');

/* Kept on one line: the bundler strips re-exports with a single-line match. */
export { Chart, LineChart, BarChart, BubbleChart, PieChart, RadarChart, DEFAULTS as defaults, DEFAULT_PALETTE as palette, THEMES as themes };
