/**
 * Bubble chart — a scatter plot with a third dimension in the mark size.
 *
 * Position comes from the same two scales the line chart uses, so a bubble
 * field shares its axis, its ticks and its padding. The size dimension is read
 * from `sizes` on the series, which `normalizeData` attaches only when the
 * input actually carried one (`{x, y, r}` points, `[x, y, r]` tuples, or a
 * parallel `sizes` array). Without it every bubble takes the mid radius, and
 * the chart degrades to a plain scatter rather than failing.
 */

import { CartesianChart } from './cartesian.js';
import { linearScale, niceTicks, pointScale, thinTicks, valueCategoryScale } from '../core/scale.js';
import { allocate } from '../core/particles.js';
import { sampleDisc } from '../core/sampling.js';
import { axisFont, formatValue } from '../core/axis.js';
import { clamp, createRng, isNum, TAU } from '../core/utils.js';

/** Minimum particles a bubble gets before it stops reading as a disc. */
const MIN_PER_BUBBLE = 10;

export class BubbleChart extends CartesianChart {
  /**
   * The x axis of a scatter is continuous, not categorical. Where the line
   * chart is happy to put one tick under each reading, a bubble field wants
   * round intervals of its own — 10, 20, 30 — with the marks falling wherever
   * their values put them, which is the whole point of plotting them in two
   * dimensions. Rounding the domain out to those bounds also stops the extreme
   * bubbles from sitting half outside the plot.
   *
   * Non-numeric x keeps the categorical treatment; there is nothing to round.
   */
  /**
   * Each series' own x positions when it has them, falling back to the shared
   * `xValues`. Two scatter series genuinely sit at different x, and the shared
   * array can only hold one value per index.
   */
  xsFor(series) {
    if (series && series.xs) return series.xs;
    return this.data.xValues;
  }

  xAxis() {
    const series = this.visibleSeries();
    if (this.data.labels.length < 2) return null;
    const finite = [];
    for (const s of series) {
      const xs = this.xsFor(s);
      if (!xs) continue;
      for (const v of xs) if (isNum(v)) finite.push(v);
    }
    if (finite.length < 2) return null;
    const nice = niceTicks(
      Math.min.apply(null, finite),
      Math.max.apply(null, finite),
      this.options.axis.ticks
    );
    return { ticks: nice.ticks, domain: [nice.min, nice.max] };
  }

  createCategoryScale(count, range) {
    const xs = this.data.xValues;
    if (this.xa && xs && xs.length === count && count > 1) {
      return valueCategoryScale(xs, range, this.xa.domain);
    }
    if (xs && xs.length === count && count > 1) return valueCategoryScale(xs, range);
    return pointScale(count, range);
  }

  /** Ticks at the round values, not at the data. */
  categoryTicks() {
    if (!this.xa) return super.categoryTicks();
    const axis = this.options.axis;
    const scale = linearScale(this.xa.domain, [this.plot.x, this.plot.x + this.plot.w]);
    const labels = this.xa.ticks.map((v) => formatValue(v, this.options));

    const ctx = this.renderer.ctx;
    ctx.save();
    ctx.font = axisFont(axis);
    let widest = 0;
    for (const l of labels) widest = Math.max(widest, ctx.measureText(l).width);
    ctx.restore();

    const kept = thinTicks(this.xa.ticks, this.plot.w, widest + 20);
    return kept.map((v) => ({ label: formatValue(v, this.options), pos: scale(v) }));
  }

  /** Padding is measured against the tick labels actually drawn. */
  labelSpec() {
    const spec = super.labelSpec();
    const xa = this.xAxis();
    if (xa) spec.categoryLabels = xa.ticks.map((v) => formatValue(v, this.options));
    return spec;
  }

  /**
   * The size domain, across every visible series. Held separate from the value
   * axis because it is a third dimension, not a second one.
   */
  sizeExtent() {
    const cfg = this.options.bubble;
    let min = Infinity;
    let max = -Infinity;
    for (const s of this.visibleSeries()) {
      if (!s.sizes) continue;
      for (const v of s.sizes) {
        if (!isNum(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (min === Infinity) return null; // no size data at all
    if (isNum(cfg.minValue)) min = cfg.minValue;
    if (isNum(cfg.maxValue)) max = cfg.maxValue;
    // A size scale is a ratio scale: it has to start at zero or the smallest
    // bubble silently claims a value it does not have.
    return [Math.min(0, min), max];
  }

  /**
   * Map a datum to a radius by area. `r = sqrt(lerp(minR², maxR², t))` is what
   * makes a doubled value cover doubled ink; interpolating the radius directly
   * would exaggerate it to roughly the square.
   */
  radiusFor(value, extent) {
    const cfg = this.options.bubble;
    const lo = Math.max(0.5, cfg.minRadius);
    const hi = Math.max(lo, cfg.maxRadius);
    if (!extent || !isNum(value)) return (lo + hi) / 2;
    const [d0, d1] = extent;
    const t = d1 === d0 ? 1 : clamp((value - d0) / (d1 - d0), 0, 1);
    return Math.sqrt(lo * lo + t * (hi * hi - lo * lo));
  }

  /** Every bubble currently on screen, in pixel space. */
  bubbles() {
    const extent = (this.sizeDomain = this.sizeExtent());
    const out = [];
    this.visibleSeries().forEach((s, si) => {
      const xs = this.xScale ? this.xsFor(s) : null;
      s.values.forEach((v, i) => {
        if (!isNum(v)) return;
        const size = s.sizes ? s.sizes[i] : null;
        const x = xs && isNum(xs[i]) ? this.xScale(xs[i]) : this.catScale.at(i);
        out.push({
          x,
          y: this.vScale(v),
          r: this.radiusFor(size, extent),
          value: v,
          size,
          color: s.color,
          name: s.name,
          series: si,
          index: i
        });
      });
    });
    return out;
  }

  computeGeometry() {
    // Resolved before the base builds the scales — `createCategoryScale` needs it.
    this.xa = this.xAxis();
    super.computeGeometry();
    this.xScale = this.xa
      ? linearScale(this.xa.domain, [this.plot.x, this.plot.x + this.plot.w])
      : null;
    this.marks = this.bubbles();
  }

  /**
   * Bubbles cover far less of the plot than a bar or an area fill does, so the
   * plot-area budget would pack each one solid. Budget from the ink actually
   * being drawn instead.
   */
  particleBudget() {
    const marks = this.marks || [];
    const ink = marks.reduce((a, b) => a + Math.PI * b.r * b.r, 0);
    if (!ink) return super.particleBudget();
    return Math.min(this.options.particle.max, Math.round(this.budgetForArea(ink) * 1.6));
  }

  buildTargets(budget) {
    const marks = this.marks || (this.marks = this.bubbles());
    const targets = [];
    if (!marks.length) return targets;

    const cfg = this.options.bubble;
    const p = this.options.particle;
    const rng = createRng(0xb0bb1e);
    const j = p.sizeJitter;
    const fade = clamp(cfg.edgeFade, 0, 1);
    const counts = allocate(marks.map((b) => b.r * b.r), budget, MIN_PER_BUBBLE);

    marks.forEach((b, bi) => {
      const n = counts[bi];
      if (!n) return;
      const lifted = this.hover && this.hover.index === b.index;

      sampleDisc(b.x, b.y, b.r, n, rng, (x, y, d) => {
        targets.push({
          x,
          y,
          color: b.color,
          size: p.size * (1 - d * 0.15) * (1 - j * 0.5 + rng() * j),
          // Thin the rim so bubbles read as soft bodies, and lift the hovered
          // one out of the field with alpha rather than by moving it — moving
          // a bubble would misreport its position, which is the whole encoding.
          alpha: clamp((1 - Math.max(0, d - (1 - fade)) * 1.5) * (lifted ? 1 : 0.88), 0.08, 1),
          group: b.series,
          index: b.index
        });
      });
    });

    if (targets.length > p.max) targets.length = p.max;
    return targets;
  }

  /**
   * The base draws its crosshair through a category, which a scatter does not
   * have — with per-series x, one index is two different positions. Track the
   * hovered bubble instead.
   */
  drawForeground(ctx) {
    const hovered = this.hover ? (this.marks || []).find((b) => b.index === this.hover.index) : null;
    if (hovered) {
      ctx.save();
      ctx.strokeStyle = this.options.axis.crosshairColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(Math.round(hovered.x) + 0.5, this.plot.y);
      ctx.lineTo(Math.round(hovered.x) + 0.5, this.plot.y + this.plot.h);
      ctx.stroke();
      ctx.restore();
    }
    if (this.options.showValues) this.drawValueLabels(ctx);
    if (!this.options.bubble.outline && !this.hover) return;

    ctx.save();
    for (const b of this.marks || []) {
      const hovered = this.hover && this.hover.index === b.index;
      if (!hovered && !this.options.bubble.outline) continue;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + (hovered ? 3 : 0), 0, TAU);
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = hovered ? 0.85 : 0.28;
      ctx.lineWidth = hovered ? 1.5 : 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Nearest bubble wins, not nearest category: a bubble field is read in two
   * dimensions, so a column-shaped hit test would pick the wrong mark whenever
   * two series overlap in x. Falls back to the category hit test outside any
   * bubble, which keeps the crosshair and the axis in agreement.
   */
  handleHover(x, y) {
    const marks = this.marks || [];
    let best = null;
    let bestDist = Infinity;
    for (const b of marks) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d <= b.r + 4 && d < bestDist) {
        bestDist = d;
        best = b;
      }
    }

    if (!best) {
      if (this.hover) {
        this.hover = null;
        this.retarget();
      }
      this.tooltip.hide();
      return;
    }

    if (!this.hover || this.hover.index !== best.index) {
      this.hover = { index: best.index };
      this.retarget(); // the hovered bubble brightens
    }

    const entries = [];
    for (const b of marks) {
      if (b.index !== best.index) continue;
      entries.push({
        name: b.name,
        value: formatValue(b.value, this.options) + (isNum(b.size) ? ' · ' + formatValue(b.size, this.options) : ''),
        color: b.color
      });
    }

    this.tooltip.show(
      { title: this.data.labels[best.index], entries, x: best.x, y: best.y - best.r },
      { width: this.renderer.width, height: this.renderer.height },
      this.options
    );
  }

  hoverAnchor(index) {
    let top = null;
    for (const b of this.marks || []) {
      if (b.index !== index) continue;
      if (!top || b.y - b.r < top.y) top = { x: b.x, y: b.y - b.r };
    }
    return top || super.hoverAnchor(index);
  }

  drawValueLabels(ctx) {
    const axis = this.options.axis;
    ctx.save();
    ctx.font = axisFont(axis, '600');
    ctx.fillStyle = axis.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const b of this.marks || []) {
      ctx.fillText(formatValue(isNum(b.size) ? b.size : b.value, this.options), b.x, b.y - b.r - 6);
    }
    ctx.restore();
  }
}
