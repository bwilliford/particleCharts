#!/usr/bin/env node
/**
 * Test suite. Runs in plain Node against a minimal DOM + canvas stub, which is
 * enough to exercise every code path the browser takes: layout, target
 * generation, the physics step, hover hit-testing and teardown.
 *
 *   node scripts/test.js
 */

import { installDomStub } from './dom-stub.js';

installDomStub();

const { ParticleChart, LineChart, BarChart, PieChart, defaults, palette } = await import('../src/index.js');
const { normalizeData, valueExtent } = await import('../src/core/data.js');
const { niceTicks, linearScale, bandScale, pointScale, thinTicks } = await import('../src/core/scale.js');
const { monotoneCurve, samplePath, sampleRect, sampleSector, sampleUnderPath } = await import('../src/core/sampling.js');
const { resolveOptions } = await import('../src/core/options.js');
const { parseColor, colorAt } = await import('../src/core/color.js');
const { formatNumber } = await import('../src/core/utils.js');
const { allocate } = await import('../src/core/particles.js');

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push({ name, err });
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message || 'assertion failed');
}

function eq(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error((message || 'not equal') + `\n  actual:   ${a}\n  expected: ${b}`);
}

function makeHost(w = 640, h = 360) {
  const el = document.createElement('div');
  el.__rect = { width: w, height: h, left: 0, top: 0 };
  return el;
}

function stepFrames(chart, n = 12) {
  for (let i = 0; i < n; i++) global.__flushFrame(16.7 * (i + 1));
  return chart;
}

// ------------------------------------------------------------------- data ----

test('normalizeData: array of numbers', () => {
  const d = normalizeData([4, 8, 15]);
  eq(d.labels, ['0', '1', '2']);
  eq(d.series.length, 1);
  eq(d.series[0].values, [4, 8, 15]);
});

test('normalizeData: label/value objects', () => {
  const d = normalizeData([{ label: 'Jan', value: 10 }, { label: 'Feb', value: 20 }]);
  eq(d.labels, ['Jan', 'Feb']);
  eq(d.series[0].values, [10, 20]);
});

test('normalizeData: labels + values', () => {
  const d = normalizeData({ labels: ['a', 'b'], values: [1, 2] });
  eq(d.labels, ['a', 'b']);
  eq(d.series[0].values, [1, 2]);
});

test('normalizeData: multi-series', () => {
  const d = normalizeData({
    labels: ['Q1', 'Q2', 'Q3'],
    series: [
      { name: 'A', data: [1, 2, 3], color: '#f00' },
      { name: 'B', data: [4, 5] }
    ]
  });
  eq(d.labels, ['Q1', 'Q2', 'Q3']);
  eq(d.series[0].color, '#f00');
  eq(d.series[1].values, [4, 5, null], 'short series is padded with nulls');
});

test('normalizeData: bare array of series objects', () => {
  const d = normalizeData([{ name: 'A', data: [1, 2] }, { name: 'B', data: [3, 4] }]);
  eq(d.series.map((s) => s.name), ['A', 'B']);
});

test('normalizeData: {x, y} points detect a numeric x axis', () => {
  const d = normalizeData({ series: [{ name: 'A', data: [{ x: 10, y: 1 }, { x: 40, y: 2 }] }] });
  eq(d.xValues, [10, 40]);
});

test('normalizeData: plain record', () => {
  const d = normalizeData({ Chrome: 62, Safari: 19 });
  eq(d.labels, ['Chrome', 'Safari']);
  eq(d.series[0].values, [62, 19]);
});

test('normalizeData: nulls and junk become null, not NaN', () => {
  const d = normalizeData([1, null, 'nope', undefined, '5']);
  eq(d.series[0].values, [1, null, null, null, 5]);
});

test('normalizeData: empty input is safe', () => {
  eq(normalizeData(null).series, []);
  eq(normalizeData([]).series, []);
  eq(normalizeData({}).series, []);
});

test('valueExtent: stacked sums by sign', () => {
  const series = [{ values: [1, -2] }, { values: [3, -4] }];
  eq(valueExtent(series, { stacked: true }), [-6, 4]);
  eq(valueExtent(series, { stacked: false }), [-4, 3]);
});

test('valueExtent: baseline zero pulls the domain to zero', () => {
  eq(valueExtent([{ values: [5, 9] }], { baseline: 'zero' }), [0, 9]);
});

// ----------------------------------------------------------------- scales ----

test('niceTicks: round steps that cover the domain', () => {
  const t = niceTicks(0, 97, 5);
  assert(t.min <= 0 && t.max >= 97, 'domain covered');
  eq(t.ticks[0], t.min);
  eq(t.ticks[t.ticks.length - 1], t.max);
  assert(t.ticks.every((v) => Number.isFinite(v)), 'all ticks finite');
});

test('niceTicks: no float drift in the labels', () => {
  eq(niceTicks(0, 1, 5).ticks, [0, 0.2, 0.4, 0.6, 0.8, 1]);
});

test('niceTicks: flat data still yields a usable axis', () => {
  const t = niceTicks(7, 7, 5);
  assert(t.max > t.min, 'domain expanded');
});

test('linearScale: maps and inverts', () => {
  const s = linearScale([0, 10], [100, 0]);
  eq(s(0), 100);
  eq(s(10), 0);
  eq(Math.round(s.invert(50)), 5);
});

test('linearScale: degenerate domain does not divide by zero', () => {
  const s = linearScale([5, 5], [0, 100]);
  assert(Number.isFinite(s(5)), 'finite output');
});

test('bandScale: bands sit inside the range', () => {
  const b = bandScale(4, [0, 400], 0.2);
  eq(b.at(0), 50);
  eq(b.at(3), 350);
  assert(b.start(0) >= 0, 'first band inside range');
  eq(b.indexAt(120), 1);
  eq(b.indexAt(-99), 0, 'clamps below');
  eq(b.indexAt(9999), 3, 'clamps above');
});

test('pointScale: endpoints are flush', () => {
  const p = pointScale(5, [0, 400]);
  eq(p.at(0), 0);
  eq(p.at(4), 400);
  eq(p.indexAt(210), 2);
});

test('pointScale: single point centres', () => {
  eq(pointScale(1, [0, 400]).at(0), 200);
});

test('thinTicks: keeps the last entry', () => {
  const out = thinTicks([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 100, 40);
  assert(out.length < 10, 'thinned');
  eq(out[out.length - 1], 9);
});

// --------------------------------------------------------------- sampling ----

function rngStub() {
  let i = 0;
  return () => ((i = (i + 0.37) % 1), i);
}

test('monotoneCurve: never overshoots the data', () => {
  const pts = [{ x: 0, y: 100 }, { x: 10, y: 0 }, { x: 20, y: 100 }];
  const curve = monotoneCurve(pts, 10);
  assert(curve.length > pts.length, 'densified');
  const min = Math.min(...curve.map((p) => p.y));
  const max = Math.max(...curve.map((p) => p.y));
  assert(min >= -0.001 && max <= 100.001, `stayed in [0,100], got [${min}, ${max}]`);
  assert(curve.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), 'finite');
});

test('monotoneCurve: monotone input stays monotone', () => {
  const curve = monotoneCurve([{ x: 0, y: 0 }, { x: 1, y: 5 }, { x: 2, y: 10 }], 8);
  for (let i = 1; i < curve.length; i++) assert(curve[i].y >= curve[i - 1].y - 1e-9, 'non-decreasing');
});

test('samplePath: emits exactly `count` points on the path', () => {
  const out = [];
  samplePath([{ x: 0, y: 0 }, { x: 100, y: 0 }], 50, 4, rngStub(), (x, y) => out.push([x, y]));
  eq(out.length, 50);
  assert(out.every(([x, y]) => x >= -1 && x <= 101 && Math.abs(y) <= 2.1), 'inside the band');
});

test('samplePath: zero-length path does not hang', () => {
  const out = [];
  samplePath([{ x: 5, y: 5 }, { x: 5, y: 5 }], 10, 2, rngStub(), (x, y) => out.push([x, y]));
  eq(out.length, 10);
});

test('sampleUnderPath: stays between the line and the baseline', () => {
  const path = [{ x: 0, y: 20 }, { x: 100, y: 60 }];
  const out = [];
  sampleUnderPath(path, 100, 200, rngStub(), 0.8, (x, y) => out.push([x, y]));
  eq(out.length, 200);
  assert(out.every(([x, y]) => x >= 0 && x <= 100 && y >= 19 && y <= 100.001), 'inside the area');
});

test('sampleRect: fills the rectangle and nothing else', () => {
  const out = [];
  sampleRect(10, 20, 30, 40, 300, rngStub(), 0.5, 'up', (x, y) => out.push([x, y]));
  eq(out.length, 300);
  assert(out.every(([x, y]) => x >= 10 && x <= 40.001 && y >= 20 && y <= 60.001), 'inside the rect');
});

test('sampleSector: stays inside the annulus', () => {
  const out = [];
  sampleSector(0, 0, 40, 80, 0, Math.PI / 2, 250, rngStub(), 0.3, (x, y) => out.push([x, y]));
  eq(out.length, 250);
  assert(
    out.every(([x, y]) => {
      const r = Math.hypot(x, y);
      return r >= 39.9 && r <= 80.1 && x >= -0.1 && y >= -0.1;
    }),
    'inside the quadrant annulus'
  );
});

test('allocate: respects the budget and the minimum', () => {
  const out = allocate([100, 1, 1], 300, 10);
  assert(out.reduce((a, b) => a + b, 0) <= 300, 'within budget');
  assert(out[1] > 0 && out[2] > 0, 'tiny elements still get particles');
});

test('allocate: zero weight gets zero particles', () => {
  eq(allocate([1, 0], 100, 5)[1], 0);
});

// ---------------------------------------------------------------- options ----

test('resolveOptions: flat aliases reach their nested homes', () => {
  const o = resolveOptions({ particleBloom: 0.2, innerRadius: 0.4, curve: 'linear', legendPosition: 'bottom' });
  eq(o.particle.bloom, 0.2);
  eq(o.pie.innerRadius, 0.4);
  eq(o.line.curve, 'linear');
  eq(o.legend.position, 'bottom');
});

test('resolveOptions: nested groups win over aliases', () => {
  eq(resolveOptions({ particleSize: 9, particle: { size: 3 } }).particle.size, 3);
});

test('resolveOptions: donut gets an inner radius, pie does not', () => {
  assert(resolveOptions({ type: 'donut' }).pie.innerRadius > 0.5, 'donut hollowed');
  eq(resolveOptions({ type: 'pie' }).pie.innerRadius, 0);
  eq(resolveOptions({ type: 'donut', innerRadius: 0.1 }).pie.innerRadius, 0.1, 'explicit value respected');
});

test('resolveOptions: defaults are not mutated', () => {
  resolveOptions({ particle: { size: 99 } });
  eq(defaults.particle.size, 0.5);
});

// ----------------------------------------------------------------- colour ----

test('parseColor: hex, shorthand, rgba', () => {
  eq(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  eq(parseColor('#3987e5'), { r: 57, g: 135, b: 229, a: 1 });
  eq(parseColor('rgba(1, 2, 3, 0.5)'), { r: 1, g: 2, b: 3, a: 0.5 });
});

test('colorAt: palette order is fixed, overrides win', () => {
  eq(colorAt(null, 0), palette[0]);
  eq(colorAt(null, 1), palette[1]);
  eq(colorAt('#fff', 5), '#fff');
  eq(colorAt(['#a', '#b'], 3), '#b');
  eq(colorAt((i) => 'c' + i, 2), 'c2');
});

test('formatNumber: compact and clean', () => {
  eq(formatNumber(1500), '1.5k');
  eq(formatNumber(2400000), '2.4M');
  eq(formatNumber(0), '0');
  eq(formatNumber(42), '42');
  eq(formatNumber(3.14159), '3.1');
  eq(formatNumber(1000), '1k');
  eq(formatNumber(7, (v) => v + '%'), '7%');
});

// ------------------------------------------------------------ integration ----

const SERIES_DATA = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  series: [
    { name: 'Revenue', data: [12, 19, 15, 27, 24, 33] },
    { name: 'Costs', data: [8, 11, 13, 14, 18, 17] }
  ]
};

for (const type of ['line', 'area', 'bar', 'pie', 'donut']) {
  test(`${type}: builds, animates and settles`, () => {
    const host = makeHost();
    const chart = new ParticleChart(host, { type, data: SERIES_DATA });
    assert(chart.field.count > 100, `expected particles, got ${chart.field.count}`);
    stepFrames(chart, 30);
    const bad = chart.field.particles.filter((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y));
    eq(bad.length, 0, 'all particle positions finite');
    chart.destroy();
  });

  test(`${type}: particles land inside the canvas`, () => {
    const host = makeHost(500, 300);
    const chart = new ParticleChart(host, { type, data: SERIES_DATA, animate: false, particleJitter: 0 });
    const slack = 24; // glow sprites legitimately overhang the plot edge
    const out = chart.field.particles
      .slice(0, chart.field.count)
      .filter((p) => p.tx < -slack || p.tx > 500 + slack || p.ty < -slack || p.ty > 300 + slack);
    eq(out.length, 0, `${out.length} targets outside the canvas`);
    chart.destroy();
  });

  test(`${type}: update() morphs to new data`, () => {
    const host = makeHost();
    const chart = new ParticleChart(host, { type, data: SERIES_DATA });
    stepFrames(chart, 10);
    chart.update({ labels: ['A', 'B', 'C'], values: [5, 1, 9] });
    eq(chart.data.labels, ['A', 'B', 'C']);
    assert(chart.field.count > 50, 'still has particles');
    stepFrames(chart, 20);
    chart.destroy();
  });

  test(`${type}: hover produces a tooltip`, () => {
    const host = makeHost();
    const chart = new ParticleChart(host, { type, data: SERIES_DATA, animate: false });
    // Radial types have nothing at the centre — aim at the middle of the ring.
    const radial = type === 'pie' || type === 'donut';
    const hx = radial ? chart.centre.x + (chart.inner + chart.outer) / 2 : chart.plot.x + chart.plot.w * 0.5;
    const hy = radial ? chart.centre.y : chart.plot.y + chart.plot.h * 0.5;
    chart.handleHover(hx, hy);
    assert(chart.tooltip.visible, 'tooltip shown over the data');
    assert(chart.tooltip.el.innerHTML.length > 0, 'tooltip has content');
    chart.destroy();
  });

  test(`${type}: destroy() removes the DOM and stops the loop`, () => {
    const host = makeHost();
    const chart = new ParticleChart(host, { type, data: SERIES_DATA });
    chart.destroy();
    eq(host.childNodes.length, 0, 'root removed');
    eq(chart.frame, 0, 'raf cancelled');
    chart.destroy(); // idempotent
  });

  test(`${type}: renders a screen-reader table`, () => {
    const host = makeHost();
    const chart = new ParticleChart(host, { type, data: SERIES_DATA });
    assert(chart.table.innerHTML.includes('<table'), 'table present');
    assert(chart.table.innerHTML.includes('Jan'), 'categories listed');
    chart.destroy();
  });
}

test('type dispatch picks the right class', () => {
  const h = () => makeHost();
  assert(new ParticleChart(h(), { type: 'line', data: [1, 2] }) instanceof LineChart);
  assert(new ParticleChart(h(), { type: 'bar', data: [1, 2] }) instanceof BarChart);
  assert(new ParticleChart(h(), { type: 'donut', data: [1, 2] }) instanceof PieChart);
});

test('unknown type throws a helpful error', () => {
  let message = '';
  try {
    new ParticleChart(makeHost(), { type: 'radar', data: [1] });
  } catch (err) {
    message = err.message;
  }
  assert(message.includes('Unknown chart type'), message);
});

test('legend toggling drops the series and never empties the chart', () => {
  const chart = new ParticleChart(makeHost(), { type: 'bar', data: SERIES_DATA, animate: false });
  eq(chart.rects.filter((r) => r.series === 1).length, 6, 'both series drawn to start');
  chart.toggleSeries(chart.data.series[1].key);
  eq(chart.visibleSeries().length, 1);
  eq(chart.rects.filter((r) => r.series === 1).length, 0, 'muted series is gone from the plot');
  assert(chart.field.count > 0, 'the surviving series still has particles');
  chart.toggleSeries(chart.data.series[0].key);
  eq(chart.visibleSeries().length, 1, 'last visible series cannot be hidden');
  chart.destroy();
});

test('pie legend keys categories, not series', () => {
  const chart = new ParticleChart(makeHost(), { type: 'donut', data: { labels: ['a', 'b', 'c'], values: [1, 2, 3] } });
  eq(chart.legendEntries().length, 3);
  chart.toggleSeries(chart.sliceKeys[0]);
  eq(chart.visibleSlices().length, 2);
  chart.destroy();
});

test('negative and null values survive every type', () => {
  for (const type of ['line', 'bar']) {
    const chart = new ParticleChart(makeHost(), {
      type,
      data: { labels: ['a', 'b', 'c', 'd'], series: [{ name: 'S', data: [-5, null, 7, 0] }] },
      animate: false
    });
    assert(chart.field.count > 0, `${type} produced particles`);
    assert(chart.valueAxis.min <= -5 && chart.valueAxis.max >= 7, `${type} domain covers the data`);
    stepFrames(chart, 5);
    chart.destroy();
  }
});

test('single data point does not crash any type', () => {
  for (const type of ['line', 'bar', 'pie', 'donut']) {
    const chart = new ParticleChart(makeHost(), { type, data: [42], animate: false });
    assert(chart.field.count > 0, type);
    chart.destroy();
  }
});

test('empty data renders an empty chart instead of throwing', () => {
  for (const type of ['line', 'bar', 'pie', 'donut']) {
    const chart = new ParticleChart(makeHost(), { type, data: [] });
    eq(chart.field.count, 0, type);
    stepFrames(chart, 3);
    chart.destroy();
  }
});

test('density scales the particle budget', () => {
  const low = new ParticleChart(makeHost(), { type: 'bar', data: SERIES_DATA, particleDensity: 0.25 });
  const high = new ParticleChart(makeHost(), { type: 'bar', data: SERIES_DATA, particleDensity: 2 });
  assert(high.field.count > low.field.count * 2, `${low.field.count} -> ${high.field.count}`);
  low.destroy();
  high.destroy();
});

test('particle max is a hard ceiling', () => {
  const chart = new ParticleChart(makeHost(), { type: 'bar', data: SERIES_DATA, particleDensity: 50, particleCount: 500 });
  assert(chart.field.count <= 500, `got ${chart.field.count}`);
  chart.destroy();
});

test('showAxis / showLegend / showTooltip off', () => {
  const chart = new ParticleChart(makeHost(), {
    type: 'line',
    data: SERIES_DATA,
    showAxis: false,
    showGrid: false,
    showLegend: false,
    showTooltip: false
  });
  eq(chart.legend.el.style.display, 'none');
  assert(!chart.onPointerMove, 'no pointer listener bound');
  stepFrames(chart, 4);
  chart.destroy();
});

test('a single series shows no legend box', () => {
  const chart = new ParticleChart(makeHost(), { type: 'line', data: [1, 2, 3] });
  eq(chart.legend.el.style.display, 'none', 'one series needs no legend');
  chart.destroy();
});

test('stacked and horizontal bars stay inside the plot', () => {
  for (const opts of [{ stacked: true }, { horizontal: true }, { stacked: true, horizontal: true }]) {
    const chart = new ParticleChart(makeHost(), { type: 'bar', data: SERIES_DATA, animate: false, ...opts });
    for (const r of chart.rects) {
      assert(r.w >= 0 && r.h >= 0, 'positive rect');
      assert(Number.isFinite(r.x) && Number.isFinite(r.y), 'finite rect');
    }
    assert(chart.field.count > 0, JSON.stringify(opts));
    chart.destroy();
  }
});

test('resize relayouts without losing particles', () => {
  const host = makeHost(640, 360);
  const chart = new ParticleChart(host, { type: 'line', data: SERIES_DATA });
  stepFrames(chart, 20);
  host.__rect = { width: 320, height: 200, left: 0, top: 0 };
  chart.resize();
  eq(chart.renderer.width, 320);
  assert(chart.field.count > 0, 'still populated');
  const out = chart.field.particles.slice(0, chart.field.count).filter((p) => p.tx > 360);
  eq(out.length, 0, 'targets moved into the new box');
  chart.destroy();
});

test('setOptions swaps looks without touching data', () => {
  const chart = new ParticleChart(makeHost(), { type: 'bar', data: SERIES_DATA });
  chart.setOptions({ particleBloom: 0, particleTrail: 0.5, legendPosition: 'bottom' });
  eq(chart.options.particle.bloom, 0);
  eq(chart.root.dataset.legend, 'bottom');
  eq(chart.data.labels.length, 6, 'data untouched');
  stepFrames(chart, 5);
  chart.destroy();
});

test('shorthand helpers work', async () => {
  const api = await import('../src/index.js');
  const chart = api.donut(makeHost(), { labels: ['a', 'b'], values: [1, 3] }, { showLegend: false });
  eq(chart.options.type, 'donut');
  assert(chart.inner > 0, 'donut is hollow');
  chart.destroy();
});

test('the version in src matches package.json', async () => {
  const fs = await import('node:fs');
  const url = await import('node:url');
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const api = await import('../src/index.js');
  eq(api.version, pkg.version, 'run `npm version` rather than editing either by hand');
});

test('toDataURL returns something PNG-shaped', () => {
  const chart = new ParticleChart(makeHost(), { type: 'line', data: [1, 2, 3] });
  assert(chart.toDataURL().startsWith('data:image/png'), 'png data url');
  chart.destroy();
});

// ------------------------------------------------------------------ report ---

const total = passed + failures.length;
if (failures.length) {
  console.error(`\n${failures.length} of ${total} tests FAILED\n`);
  for (const f of failures) {
    console.error(`  ✗ ${f.name}\n    ${String(f.err.message).split('\n').join('\n    ')}\n`);
  }
  process.exit(1);
}
console.log(`✓ ${passed} tests passed`);
