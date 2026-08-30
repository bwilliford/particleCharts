/**
 * Shared behaviour for the two axis-based chart types: value scale, category
 * scale, axis drawing and hover hit-testing.
 */

import { Chart } from '../core/chart.js';
import { bandScale, linearScale, niceTicks, thinTicks } from '../core/scale.js';
import { valueExtent } from '../core/data.js';
import { axisFont, drawAxis, drawHoverGuide, formatValue } from '../core/axis.js';
import { clamp, isNum } from '../core/utils.js';

export class CartesianChart extends Chart {
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

    // The axis spec is a pure function of the geometry just computed, so it is
    // rebuilt here and nowhere else. See `drawBackdrop`.
    this.spec = null;
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

  /**
   * The spec is cached across frames. Building it formats every tick label and
   * measures every category string against the canvas font — `measureText` is
   * one of the slower Canvas2D calls, and none of its inputs change between
   * layouts. This used to run eight measurements a frame, sixty times a second,
   * for a result that was identical every time.
   */
  drawBackdrop(ctx) {
    if (!this.options.showAxis && !this.options.showGrid) return;
    if (!this.spec) this.spec = this.axisSpec();
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
