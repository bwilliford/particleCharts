/**
 * Data normalisation.
 *
 * Everything the charts consume is reduced to one shape:
 *
 *   {
 *     labels:  string[],                                  // category axis
 *     xValues: number[] | null,                           // set when x is numeric
 *     series:  [{ name, color, values, sizes?: (number|null)[], xs?: (number|null)[] }]
 *   }
 *
 * `sizes` (the bubble chart's third dimension) and `xs` (a series' own numeric
 * x positions, which the shared `xValues` cannot represent for more than one
 * series) are attached only when the input carried them, so every other shape
 * normalises exactly as it always did.
 *
 * Accepted inputs (all plain JSON):
 *   [4, 8, 15]
 *   [{ label: 'Jan', value: 4 }, ...]
 *   { labels: [...], values: [...] }
 *   { labels: [...], series: [{ name, data, color }, ...] }
 *   [{ name: 'A', data: [...] }, { name: 'B', data: [...] }]
 *   { series: [{ name, data: [{ x: 1, y: 4 }, ...] }] }
 *   { series: [{ name, data: [{ x: 1, y: 4, r: 9 }, ...] }] }   // bubble sizes
 */

import { isNum, isPlainObject } from './utils.js';

const LABEL_KEYS = ['label', 'name', 'x', 'key', 'category', 'date'];
const VALUE_KEYS = ['value', 'y', 'count', 'total', 'amount'];
/** A third dimension, read only by the bubble chart. Absent for every other type. */
const SIZE_KEYS = ['r', 'size', 'z', 'radius', 'weight'];

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
  const sizes = [];
  const xs = [];
  let hasLabels = false;
  let hasSizes = false;
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
      const rawSize = pick(item, SIZE_KEYS);
      if (rawSize !== undefined) hasSizes = true;
      sizes.push(toValue(rawSize !== undefined ? rawSize : null));
    } else if (Array.isArray(item)) {
      hasLabels = true;
      labels.push(String(item[0]));
      const nx = toValue(item[0]);
      if (nx === null) numericX = false;
      else xs.push(nx);
      values.push(toValue(item[1]));
      if (item.length > 2) hasSizes = true;
      sizes.push(toValue(item.length > 2 ? item[2] : null));
    } else {
      labels.push(String(i));
      xs.push(i);
      values.push(toValue(item));
      sizes.push(null);
    }
  });

  return {
    labels,
    values,
    sizes,
    xs,
    hasLabels,
    hasSizes,
    numericX: numericX && xs.length === list.length
  };
}

function seriesFrom(entry, index) {
  const name = entry && entry.name !== undefined ? String(entry.name)
    : entry && entry.label !== undefined ? String(entry.label)
      : 'Series ' + (index + 1);
  const raw = entry && (entry.data || entry.values || entry.points);
  return { name, color: entry && entry.color, raw: Array.isArray(raw) ? raw : [] };
}

export function normalizeData(input) {
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
      series: [
        withExtras({ name: 'Series 1', color: undefined, values: read.values }, {
          sizes: read.hasSizes ? read.sizes : null,
          xs: read.numericX && read.hasLabels ? read.xs : null
        })
      ]
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
      series: parsed.map((s) =>
        withExtras({ name: s.name, color: s.color, values: padTo(s.read.values, width) }, {
          sizes: s.read.hasSizes ? padTo(s.read.sizes, width) : null,
          xs: s.read.numericX && s.read.hasLabels ? padTo(s.read.xs, width) : null
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
      series: [
        withExtras({ name: input.name ? String(input.name) : 'Series 1', color: input.color, values }, {
          sizes: Array.isArray(input.sizes) ? padTo(input.sizes.map(toValue), values.length) : null,
          xs: Array.isArray(input.xValues) ? padTo(input.xValues.map(toValue), values.length) : null
        })
      ]
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

/**
 * `sizes` is the bubble chart's third dimension, and `xs` a series' own numeric
 * x positions. Both are attached only when the input actually carried them, so
 * every other input shape — and every other chart type — sees exactly the
 * object it saw before.
 *
 * The top-level `xValues` can only describe one x per index, which is right for
 * a line chart (series share a category axis) and wrong for a scatter, where
 * two series genuinely sit at different x. Keeping each series' own array
 * alongside lets the bubble chart plot them where they really are.
 */
function withExtras(series, extras) {
  if (extras.sizes) series.sizes = extras.sizes;
  if (extras.xs) series.xs = extras.xs;
  return series;
}

function padTo(values, width) {
  const out = values.slice(0, width);
  while (out.length < width) out.push(null);
  return out;
}

/** Extent across the visible series, honouring stacking and explicit overrides. */
export function valueExtent(series, options) {
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
