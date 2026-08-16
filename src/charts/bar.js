/**
 * Bar chart — grouped, stacked, vertical or horizontal.
 *
 * Bars are filled with particles that thin out toward the growing end, so a bar
 * reads as a column of light anchored to the baseline rather than a hard block.
 */

import { CartesianChart } from './cartesian.js';
import { bandScale } from '../core/scale.js';
import { allocate } from '../core/particles.js';
import { sampleRect } from '../core/sampling.js';
import { axisFont, formatValue } from '../core/axis.js';
import { clamp, createRng, isNum } from '../core/utils.js';

export class BarChart extends CartesianChart {
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
