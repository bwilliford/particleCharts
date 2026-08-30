/**
 * Scales + tick generation. Just enough to place points in pixel space.
 */

import { isNum } from './utils.js';

/** Continuous domain -> pixel range. */
export function linearScale(domain, range) {
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
export function bandScale(count, range, padding) {
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
export function pointScale(count, range) {
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

/**
 * Continuous x positions (numeric x axis) exposed through the same interface.
 *
 * `domain` overrides the data extent — a scatter wants its axis rounded out to
 * nice tick bounds, so the outermost marks sit inside the plot instead of flush
 * against its edges. Omitted, the domain is the extent, as it always was.
 */
export function valueCategoryScale(values, range, domain) {
  const min = domain ? domain[0] : Math.min.apply(null, values);
  const max = domain ? domain[1] : Math.max.apply(null, values);
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
export function niceTicks(min, max, count) {
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
export function thinTicks(values, available, perLabel) {
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
