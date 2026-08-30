# Particle Charts

<p align="center">
  <img src="https://raw.githubusercontent.com/bwilliford/particleCharts/main/assets/demo.gif"
       alt="A particle area chart morphing through three datasets, then reforming as a bar, donut and pie chart"
       width="640">
</p>

Data visualisation made of particles. Line, area, bar, pie and donut charts
rendered as living clouds of light on a `<canvas>`, driven by plain JSON.

Zero runtime dependencies. One file — **20 kB minified + gzipped**. Responsive,
accessible and typed.

```js
new ParticleChart('#chart', {
  type: 'line',
  data: [12, 19, 15, 27, 24, 33]
});
```

**[Live demo →](https://bwilliford.github.io/particleCharts/)** · or open
`index.html` from a clone, or `npm start` to serve it on
<http://localhost:4173>.

---

## Install

**CDN** — nothing to configure, no build step, works over `file://` too:

```html
<script src="https://cdn.jsdelivr.net/npm/particle-charts@1/dist/particle-charts.min.js"></script>

<div id="chart" style="height: 320px"></div>
<script>
  new ParticleCharts.ParticleChart('#chart', {
    type: 'bar',
    data: { labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [42, 58, 51, 73] }
  });
</script>
```

unpkg works the same way: `https://unpkg.com/particle-charts@1/dist/particle-charts.min.js`.
Drop the `.min` for the readable build. Pin an exact version (`@1.0.0`) in
production rather than a range.

**npm** — ES module source is shipped as-is, with TypeScript declarations:

```bash
npm install particle-charts
```

```js
import { ParticleChart, donut } from 'particle-charts';

const chart = new ParticleChart(element, { type: 'donut', data });
donut(element, { Direct: 4820, Search: 3140 }); // shorthand
```

CommonJS resolves to the UMD build, so `require` works too:

```js
const { ParticleChart } = require('particle-charts');
```

| File | Use |
|---|---|
| `dist/particle-charts.min.js` | CDN / `<script>` — 20 kB gzipped |
| `dist/particle-charts.js` | same, unminified, for debugging |
| `dist/particle-charts.cjs` | `require()` |
| `src/index.js` | `import` — what bundlers get |
| `index.d.ts` | TypeScript |

The container needs a height. The chart fills it and re-lays out whenever it
changes.

---

## Data

Everything is normalised into `{ labels, series }`, so all of these work:

```js
data: [4, 8, 15, 16, 23, 42]                              // bare numbers
data: [{ label: 'Jan', value: 4 }, { label: 'Feb', value: 8 }]
data: { labels: ['Jan', 'Feb'], values: [4, 8] }
data: { Chrome: 62, Safari: 19, Firefox: 11 }             // a plain record
data: {                                                    // multi-series
  labels: ['Q1', 'Q2', 'Q3', 'Q4'],
  series: [
    { name: 'Revenue', data: [42, 58, 51, 73], color: '#3987e5' },
    { name: 'Costs',   data: [30, 33, 36, 41] }
  ]
}
data: { series: [{ name: 'Load', data: [{ x: 0, y: 12 }, { x: 5, y: 19 }] }] }
data: { series: [{ name: 'Teams', data: [{ x: 12, y: 34, r: 18 }] }] }  // bubble
```

`null`, `undefined` and unparseable values become gaps: a line breaks at them,
a bar is simply not drawn, and a radar polygon skips the spoke rather than
pinning it to the centre.

When every x value is numeric, line and bubble charts switch to a continuous x
axis automatically. Otherwise the labels are treated as categories.

### The third value

The bubble chart reads a size from a third slot — `r`, `size`, `z`, `radius` or
`weight` on a point object, the third element of a tuple, or a parallel `sizes`
array. Every other chart type ignores it.

```js
data: [{ x: 12, y: 34, r: 18 }, { x: 26, y: 52, r: 44 }]   // point objects
data: [['Jan', 34, 18], ['Feb', 52, 44]]                   // tuples
data: { labels: ['Jan', 'Feb'], values: [34, 52], sizes: [18, 44] }
```

Bubble series keep their own x positions, so two series can sit at genuinely
different x rather than being forced onto a shared set of categories. The x axis
becomes continuous with round ticks of its own — the marks fall between them,
where their values put them.

Sizes map to radius **by area**: a value twice as large covers twice the ink.
Scaling the radius directly instead — the usual bubble-chart mistake — would
draw it four times as large. Without any size data the chart still works; every
mark takes the mid radius and you get a plain scatter.

---

## Chart types

| `type` | Notes |
|---|---|
| `line` | Monotone-cubic smoothing by default; never overshoots the data. |
| `area` | The same chart with the fill under the curve turned on. |
| `bar` | Grouped by default; `stacked: true` and `horizontal: true` available. |
| `bubble` | Scatter with a third value in the mark size. Aliased as `scatter`. |
| `radar` | One spoke per label, one closed polygon per series. Aliased as `spider`. |
| `pie` | Reads the first series; each category gets its own colour slot. |
| `donut` | `pie` with `innerRadius: 0.62` and a running total in the hole. |

---

## Options

Nested groups (`particle`, `axis`, `legend`, `line`, `bar`, `bubble`, `radar`,
`pie`) can be set
either way — `{ particleBloom: 0.8 }` and `{ particle: { bloom: 0.8 } }` are the
same thing, and the nested form wins if you write both.

### Core

| Option | Default | Description |
|---|---|---|
| `type` | `'line'` | `line`, `area`, `bar`, `pie`, `donut`. |
| `data` | — | See above. |
| `background` | `'transparent'` | Canvas fill painted behind the particles. |
| `padding` | auto | Number, `[y, x]`, or `{top, right, bottom, left}`. Left alone, it is measured from the axis labels actually drawn. |
| `responsive` | `true` | Re-layout on container resize. |
| `maxDpr` | `2` | Cap on the HiDPI backing store. |
| `pauseWhenHidden` | `true` | Stop the loop when the tab hides or the chart scrolls out of view. |
| `animate` | `true` | Entrance flight. |
| `duration` | `1100` | Entrance duration, ms. |
| `stagger` | `0.5` | 0–1, how much of the entrance is spread across particles. |

### Particles

| Option | Default | Description |
|---|---|---|
| `particleColor` | palette | A colour, an array of colours, or `fn(index, series)`. |
| `particleSize` | `0.8` | Particle radius in CSS pixels. At or below 1.6 particles are drawn as pixel-snapped rects — crisp, and much cheaper than sprites. |
| `particleSizeJitter` | `0` | 0–1 random size spread. `0` keeps every particle identical. |
| `particleDensity` | `15` | Multiplier on the auto-computed budget. |
| `particleCount` | `50000` | Hard ceiling, whatever the density. |
| `particleBloom` | `0.8` | Additive glow strength, 0–1. |
| `particleOpacity` | `0.7` | Global particle alpha. Kept under 1 so additive stacking does not clip hues to white. |
| `particleJitter` | `1` | Idle drift amplitude in pixels. |
| `particleSpeed` | `0.085` | Spring stiffness toward the target. |
| `particleShape` | `'soft'` | Particles are circles; `soft` adds a glow sprite once they are large enough for the halo to read. `square` forces rectangles. |

The particle count is derived from the plot area, the density and the size —
smaller particles are issued in greater numbers. `particleCount` is the ceiling,
not the target.

### A note on additive blending

Particles composite with `lighter`, so overlapping ones brighten each other.
That is what produces the glow, but stack enough of them and every channel
clips at 255 and the colour turns white. Two things follow:

- **`particleOpacity` defaults to 0.7**, not 1, to leave headroom.
- **Line strokes are capped by area.** A stroke is a 3px band, so a large
  budget would pile particles a dozen deep inside it and the series would lose
  its colour. Each stroke takes only the particles its own area can carry; on an
  area chart the surplus goes to the fill, and on a plain line chart it is
  simply not spent.

If you pick your own colours, prefer ones with **at least one channel well below
255** (`#2ff0d6` keeps its red at 47, so it stays cyan under stacking). A colour
whose channels are all high — a pastel or a light violet — will wash out to
white wherever the chart is dense.

### Axis, legend, tooltip

| Option | Default | Description |
|---|---|---|
| `showAxis` | `true` | Axis lines and tick labels. |
| `showGrid` | `true` | Grid lines. |
| `showLegend` | `true` | Rendered only when there is more than one series or slice. |
| `showTooltip` | `true` | Hover tooltip and crosshair. |
| `showValues` | `false` | Print values next to the marks. |
| `legendPosition` | type-driven | `top`, `bottom`, `left`, `right`. Defaults to `bottom` where colour keys a series (line, area, bar, bubble, radar) and `top` for pie and donut. |
| `legendAlign` | type-driven | `start`, `center`, `end`. Follows `legendPosition`: `center` under the plot, `start` otherwise. |
| `min` / `max` | auto | Pin the value axis. |
| `beginAtZero` | `true` | Pull the value domain to include zero. |
| `ticks` | `5` | Approximate tick count; nice-number rounding picks the real one. |
| `valueFormat` | compact | `fn(value) → string` for ticks, labels and tooltips. |
| `xTitle` / `yTitle` | `''` | Axis titles. |
| `theme` | `'dark'` | `dark` or `light`. Sets the chrome colours below in one go; anything you set explicitly still wins. |
| `axisColor` | `rgba(255,255,255,0.2)` | Colour of the axis lines. |
| `gridColor` | `rgba(255,255,255,0.1)` | Colour of the grid lines behind the plot. |
| `textColor` | `rgba(255,255,255,0.6)` | Colour of the tick labels and axis titles. |
| `crosshairColor` | `rgba(255,255,255,0.22)` | Colour of the hover crosshair. |
| `fontFamily` / `fontSize` | system sans / `11` | Typeface and size for axis labels. |
| `tooltip.format` | — | `fn({ title, entries }) → HTML string`. |

#### Light mode

The chrome — axis, grid, labels, crosshair, legend and tooltip — defaults to a
dark ground. `theme: 'light'` swaps it for dark grey on white:

```js
new ParticleChart('#chart', { data, theme: 'light' });

// or follow the reader's OS setting, and keep following it
const media = matchMedia('(prefers-color-scheme: light)');
const sync = () => chart.setOptions({ theme: media.matches ? 'light' : 'dark' });
media.addEventListener('change', sync);
sync();
```

Particle colours are never themed — the default palette is chosen to hold up on
either ground. If you pass your own neons, they will want darkening for a white
page. Any chrome colour you set explicitly outranks the theme, and survives
later `setOptions` calls; switching theme is the one thing that repaints them.
The exact values are exported as `themes.dark` and `themes.light`.

Bloom is additive, and additive light on a white page only washes the hue out.
On a light ground, trade it for opacity: `particleBloom: 0.15, particleOpacity: 0.9`.

### Per type

| Option | Default | Applies to |
|---|---|---|
| `curve` | `'smooth'` | line — `smooth`, `linear`, `step`. |
| `fillArea` | `false` | line — `type: 'area'` turns it on. |
| `lineWidth` | `3.2` | line — thickness of the particle band forming the stroke. |
| `line.areaAmount` | `0.55` | line — share of particles spent on the fill, plus whatever the stroke cap frees up. |
| `showPoints` | `true` | line — particle clusters at each data point. |
| `stacked` | `false` | bar |
| `horizontal` | `false` | bar |
| `barPadding` | `0.3` | bar — gap between categories, 0–1 of the band. |
| `bar.fade` | `0.45` | bar — how much the fill thins toward the growing end. |
| `bar.radius` | `4` | bar — rounded cap radius. |
| `minRadius` | `5` | bubble — smallest bubble radius in pixels. |
| `maxRadius` | `30` | bubble — largest bubble radius. Values map between the two by **area**. |
| `bubble.edgeFade` | `0.35` | bubble — feathering of the rim, 0–1. |
| `bubble.outline` | `false` | bubble — ring every bubble behind its cloud. The hovered one is ringed either way. |
| `bubble.minValue` / `maxValue` | auto | bubble — pin the size domain instead of taking it from the data. |
| `levels` | `4` | radar — web rings between the centre and the edge. |
| `webShape` | `'polygon'` | radar — `polygon` follows the spokes, `circle` draws true rings. |
| `radar.width` | `2.6` | radar — thickness of each series' outline band. |
| `radar.fill` | `true` | radar — fill the enclosed area with particles. |
| `radar.fillAmount` | `0.55` | radar — share of particles spent on the fill. |
| `radar.startAngle` | `-90` | radar — degrees; `-90` puts the first spoke straight up. |
| `innerRadius` | `0` / `0.62` | pie / donut — hole size as a fraction of the outer radius. |
| `startAngle` | `-90` | pie — degrees; 0 is 3 o'clock. |
| `padAngle` | `1.2` | pie — gap between slices, in degrees. |
| `pie.labels` | `'percent'` | pie — `percent`, `value`, `label`, `none`. Shown when `showValues` is on. |
| `pie.center` | `'auto'` | pie — `total` in the donut hole, or `none`. |

---

## Methods

```js
chart.update(data, options);   // swap the data; particles morph to the new shape
chart.setOptions(options);     // restyle without touching the data
chart.resize();                // force a re-layout
chart.stop();                  // pause the render loop (e.g. during a scroll)
chart.start();                 // resume it
chart.toggleSeries(key);       // mute/unmute — the same thing the legend does
chart.toDataURL();             // PNG snapshot of the current frame
chart.destroy();               // stop the loop, drop listeners, remove the DOM
```

`update()` reuses the existing particles wherever it can, so a data change reads
as a morph rather than a redraw.

---

## Colour

The default palette is a validated categorical set for dark surfaces — fixed
slot order, chroma floor, and adjacent-pair colour-vision separation all checked
(worst adjacent CVD ΔE 8.4, normal-vision 19.3, contrast ≥ 3:1):

```
#3987e5  #d95926  #199e70  #c98500  #d55181  #008300  #9085e9  #e66767
```

Slots are assigned in order and never shuffled, because the ordering *is* the
safety mechanism. Past eight categories, colour stops being a reliable way to
tell series apart — fold the tail into an "Other" series or use small multiples.
The library warns once if you go past it.

The demo page deliberately overrides this with a neon teal (`#2ff0d6`), one
violet (`#9085e9`) for second series, and a single-hue teal ramp for
part-to-whole charts. That is a house style for that page, not a
recommendation — a neon sits well above the lightness band a categorical set
normally holds to. The pair still clears colour-vision separation (worst ΔE
23.7) and contrast (≥ 3:1), the pie slices are sorted by size so the ramp
encodes magnitude, and every chart there also carries a legend, direct labels,
or both.

---

## Accessibility

- Every chart renders a visually hidden data table for screen readers, and the
  canvas carries a descriptive `aria-label`.
- A legend is always present for two or more series, so identity is never
  carried by colour alone. Legend entries are real buttons — focusable, with
  `aria-pressed` — and clicking one mutes that series.
- `prefers-reduced-motion: reduce` disables the entrance flight and the idle
  drift. The chart still draws; it just stops moving.
- Charts pause when the tab is hidden or they scroll out of view.

---

## Development

```bash
npm install       # devDependencies only — esbuild (minify) and typescript
npm run build     # bundle src/ -> dist/ (.js, .cjs, .min.js, .esm.js)
npm test          # 82 tests, headless, no browser required
npm run typecheck # index.d.ts under --strict
npm start         # build + serve the demo on :4173
```

`dist/` is committed so the demo and the CDN work straight from a clone; CI
fails the build if it drifts from `src/`. Releases go out by tag —
`npm version minor && git push --follow-tags` — which runs the tests and
publishes with npm provenance.

`scripts/build.js` is a ~140-line bundler: it concatenates the ES modules in
dependency order and wraps them in a UMD shell. It enforces the two rules that
make that safe — single-line named imports only, and no duplicate top-level
names across modules — and fails the build if either is broken.

The test suite runs against a DOM and Canvas2D stub (`scripts/dom-stub.js`), so
it exercises layout, particle target generation, the physics step, hover
hit-testing and teardown without a browser.

## Performance notes

Particles are drawn one `arc` + `fill` each, snapped to the device pixel grid.
Measured at 30k particles a frame: **9.0ms** for circles, 8.1ms for bare
rectangles, 82ms for `drawImage` of a pre-rendered sprite (even unscaled — the
per-call overhead is about ten times a fill), and 23ms for the whole field
batched into one `Path2D`. Circles cost about 11% over squares, so particles are
circles. Idle drift comes from a sine lookup table rather than `Math.sin`, which
matters at tens of thousands of particles a frame.

A chart stops scheduling frames entirely once its particles arrive, provided
`particleJitter` is `0` — so a static chart costs nothing.

With drift enabled it keeps animating by design, but not at full rate: once the
particles have settled the only motion left is a slow sine wobble, so it is
repainted at ~30fps rather than at the display's rate. On a 120Hz screen that is
a quarter of the work, for a difference nobody can see. Frames in flight — the
entrance, a data change, a resize — are never throttled.

Two other things happen for you. Charts pause completely when the tab is hidden
or when they scroll out of view (`pauseWhenHidden`, on by default, via
`IntersectionObserver`). And the axis spec — every tick label formatted and
measured against the canvas font — is rebuilt on layout, not on every frame;
`measureText` is one of the slower Canvas2D calls and none of its inputs change
between layouts.

If you have several charts on a long page, pausing them while the user scrolls
is still worth it, since scrolling is when the main thread is busiest:

```js
let t = null;
addEventListener('scroll', () => {
  if (t === null) charts.forEach((c) => c.stop());
  else clearTimeout(t);
  t = setTimeout(() => { t = null; charts.forEach((c) => c.start()); }, 140);
}, { passive: true });
```

If a chart feels sparse or heavy, `particleDensity` is the one knob to turn — it
scales the particle budget linearly, and the particle count is what the frame
cost is made of. At the default of `15` a 600x320 plot is worth roughly 16k
particles; at `5` it is roughly 6k, which still reads as a solid shape.

## Browser support

Any browser with `ResizeObserver` and Canvas2D — Chrome/Edge 64+, Firefox 69+,
Safari 13.1+. `IntersectionObserver` and `ctx.filter` are used when present and
degraded gracefully when not (no offscreen pausing, single-pass bloom).

## Showcase

Built with Particle Charts:

- **[DrawDojo](https://drawdojo.com)** — gamified app for learning perspective
  drawing.

Want your project listed? Email **<blake@destinedstudio.com>**.

## Support

Enjoying the library? Please consider
[buying me a coffee](https://ko-fi.com/E1E6N4Q86) ☕

## Licence

MIT © [Blake Williford](https://blakewilliford.com) of
[Destined Studio](https://destinedstudio.com).
