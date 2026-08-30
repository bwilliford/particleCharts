/**
 * Radar / spider chart.
 *
 * A radial cousin of the line chart: every label becomes a spoke, every series
 * becomes a closed polygon whose vertices sit at that series' value along each
 * spoke. It extends `Chart` rather than `CartesianChart` because none of the
 * cartesian furniture applies — there is no baseline, no band scale, and the
 * axis is drawn as a web rather than as two edges.
 *
 * Colour identifies a *series* here (unlike pie, where it identifies a
 * category), so the base legend and mute behaviour are exactly right.
 */

import { Chart } from '../core/chart.js';
import { niceTicks } from '../core/scale.js';
import { valueExtent } from '../core/data.js';
import { allocate } from '../core/particles.js';
import { samplePath, samplePolygonFan, sampleDisc } from '../core/sampling.js';
import { axisFont, formatValue } from '../core/axis.js';
import { clamp, createRng, DEG, isNum, TAU } from '../core/utils.js';

/** Clearance between the outer ring and its spoke labels, in pixels. */
const SPOKE_GAP = 12;

export class RadarChart extends Chart {
  /** The web is drawn inside the plot box, so no axis padding is measured. */
  labelSpec() {
    return { valueLabels: [], categoryLabels: [] };
  }

  /** Radial domain. Starts at zero unless told otherwise — a radar of ratios. */
  computeValueAxis() {
    const opts = this.options;
    let [min, max] = valueExtent(this.visibleSeries(), {
      baseline: opts.axis.beginAtZero ? 'zero' : null
    });
    if (isNum(opts.axis.min)) min = opts.axis.min;
    if (isNum(opts.axis.max)) max = opts.axis.max;

    const nice = niceTicks(min, max, this.options.radar.levels);
    const lo = isNum(opts.axis.min) ? opts.axis.min : Math.min(0, nice.min);
    const hi = isNum(opts.axis.max) ? opts.axis.max : nice.max;
    const ticks = nice.ticks.filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9);
    this.valueAxis = { min: lo, max: hi, ticks: ticks.length ? ticks : [lo, hi] };
    return this.valueAxis;
  }

  computeGeometry() {
    const cfg = this.options.radar;
    const plot = this.plot;
    const va = this.computeValueAxis();
    this.centre = { x: plot.x + plot.w / 2, y: plot.y + plot.h / 2 };

    const count = this.data.labels.length;
    const step = count > 0 ? TAU / count : TAU;
    const start = cfg.startAngle * DEG;
    this.angles = this.data.labels.map((_, i) => start + i * step);

    // Spoke labels sit outside the web, so the web gives up the room they need.
    let room = { x: 0, y: 0 };
    if (this.options.showAxis && count) {
      const axis = this.options.axis;
      const ctx = this.renderer.ctx;
      ctx.save();
      ctx.font = axisFont(axis, '500');
      let widest = 0;
      for (const l of this.data.labels) widest = Math.max(widest, ctx.measureText(l).width);
      ctx.restore();
      // Only the labels either side of the web claim horizontal room, and they
      // hang outward from their spoke — so roughly 60% of the widest string.
      // Capped, because one long category name must cost the web some radius,
      // never all of it: past this the label is left to overhang instead.
      room = {
        x: Math.min(plot.w * 0.3, SPOKE_GAP + Math.ceil(widest * 0.6)),
        y: Math.min(plot.h * 0.22, SPOKE_GAP + axis.fontSize)
      };
    }

    this.radius = Math.max(10, Math.min(plot.w / 2 - room.x, plot.h / 2 - room.y));
    this.span = va.max - va.min || 1;
  }

  /** Pixel distance from the centre for a data value. */
  radiusFor(value) {
    const va = this.valueAxis;
    return clamp((value - va.min) / this.span, 0, 1) * this.radius;
  }

  pointAt(index, value) {
    const a = this.angles[index];
    const r = this.radiusFor(value);
    return { x: this.centre.x + Math.cos(a) * r, y: this.centre.y + Math.sin(a) * r };
  }

  /**
   * A series' polygon. Nulls are skipped rather than treated as zero — a gap
   * in a radar is missing data, and pinning it to the centre would invent a
   * reading of nothing.
   */
  polygonFor(series) {
    const pts = [];
    series.values.forEach((v, i) => {
      if (!isNum(v)) return;
      const p = this.pointAt(i, v);
      p.index = i;
      p.value = v;
      pts.push(p);
    });
    return pts;
  }

  /** Budget from the web's disc, not the plot box — same reasoning as pie. */
  particleBudget() {
    const disc = Math.PI * this.radius * this.radius;
    return Math.min(this.options.particle.max, Math.round(this.budgetForArea(disc) * 1.15));
  }

  buildTargets(budget) {
    const cfg = this.options.radar;
    const p = this.options.particle;
    const series = this.visibleSeries();
    const targets = [];
    if (!series.length || this.data.labels.length < 3) return targets;

    const rng = createRng(0x4ada7);
    const polys = (this.polygons = series.map((s) => this.polygonFor(s)));

    // Weight by perimeter, so a series hugging the centre does not claim the
    // same ink as one out at the rim.
    const weights = polys.map((pts) => {
      if (pts.length < 2) return 1;
      let per = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        per += Math.hypot(b.x - a.x, b.y - a.y);
      }
      return Math.max(per, 1);
    });
    const counts = allocate(weights, budget, 40);

    series.forEach((s, si) => {
      const pts = polys[si];
      const total = counts[si];
      if (!total || !pts.length) return;

      if (pts.length < 3) {
        // Too few readings to enclose anything — mark what there is.
        for (const pt of pts) {
          sampleDisc(pt.x, pt.y, cfg.pointRadius, Math.max(8, Math.floor(total / pts.length)), rng, (x, y, d) =>
            targets.push(this.target(x, y, s.color, rng, 1.1 - d * 0.3, 1, si, pt.index))
          );
        }
        return;
      }

      const vertexBudget = cfg.points ? Math.min(Math.round(total * 0.14), pts.length * 24) : 0;
      const rest = total - vertexBudget;
      const fillCount = cfg.fill ? Math.round(rest * clamp(cfg.fillAmount, 0, 0.95)) : 0;
      const strokeCount = rest - fillCount;

      if (fillCount > 0) {
        samplePolygonFan(this.centre, pts, fillCount, rng, cfg.fillFade, (x, y, t) =>
          targets.push(this.target(x, y, s.color, rng, 0.8, 0.34 + t * 0.3, si, -1))
        );
      }

      // Close the ring by repeating the first vertex, so the last edge is
      // sampled like every other one.
      const ring = pts.concat([pts[0]]);
      samplePath(ring, strokeCount, cfg.width, rng, (x, y, edge) =>
        targets.push(this.target(x, y, s.color, rng, 1 - edge * 0.25, 1 - edge * 0.3, si, -1))
      );

      if (vertexBudget > 0) {
        const per = Math.max(5, Math.floor(vertexBudget / pts.length));
        for (const pt of pts) {
          sampleDisc(pt.x, pt.y, cfg.pointRadius, per, rng, (x, y, d) =>
            targets.push(this.target(x, y, s.color, rng, 1.1 - d * 0.3, 1, si, pt.index))
          );
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

  // ---------------------------------------------------------------- web ----

  drawBackdrop(ctx) {
    const opts = this.options;
    if (!opts.showGrid && !opts.showAxis) return;
    const axis = opts.axis;
    const cfg = opts.radar;
    const count = this.data.labels.length;
    if (count < 3) return;

    ctx.save();
    ctx.lineWidth = 1;

    if (opts.showGrid) {
      ctx.strokeStyle = axis.gridColor;
      for (const t of this.valueAxis.ticks) {
        const r = this.radiusFor(t);
        if (r <= 0.5) continue;
        ctx.beginPath();
        if (cfg.shape === 'circle') {
          ctx.arc(this.centre.x, this.centre.y, r, 0, TAU);
        } else {
          this.angles.forEach((a, i) => {
            const x = this.centre.x + Math.cos(a) * r;
            const y = this.centre.y + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.closePath();
        }
        ctx.stroke();
      }
    }

    if (opts.showAxis) {
      // Spokes.
      ctx.strokeStyle = axis.color;
      ctx.beginPath();
      for (const a of this.angles) {
        ctx.moveTo(this.centre.x, this.centre.y);
        ctx.lineTo(this.centre.x + Math.cos(a) * this.radius, this.centre.y + Math.sin(a) * this.radius);
      }
      ctx.stroke();

      ctx.fillStyle = axis.textColor;
      ctx.font = axisFont(axis);
      ctx.textBaseline = 'middle';

      // Value ticks, stacked up the first spoke only — repeating them on every
      // spoke turns the web into noise.
      if (axis.yLabels) {
        ctx.textAlign = 'right';
        const a = this.angles[0];
        for (const t of this.valueAxis.ticks) {
          const r = this.radiusFor(t);
          if (r <= 0.5) continue;
          ctx.fillText(
            formatValue(t, this.options),
            this.centre.x + Math.cos(a) * r - 5,
            this.centre.y + Math.sin(a) * r
          );
        }
      }

      if (axis.xLabels) this.drawSpokeLabels(ctx, axis);
    }

    ctx.restore();
  }

  /**
   * Spoke labels ride just outside the web on their own bearing. Alignment
   * follows the bearing so a label never overhangs the chart: labels on the
   * right hang right, on the left hang left, and the ones pointing straight up
   * or down centre over their spoke.
   */
  drawSpokeLabels(ctx, axis) {
    const r = this.radius + SPOKE_GAP;
    ctx.font = axisFont(axis, '500');
    this.data.labels.forEach((label, i) => {
      const a = this.angles[i];
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const upright = Math.abs(cos) < 0.25;
      ctx.textAlign = upright ? 'center' : cos > 0 ? 'left' : 'right';
      ctx.textBaseline = upright ? (sin > 0 ? 'top' : 'alphabetic') : 'middle';
      ctx.fillText(label, this.centre.x + cos * r, this.centre.y + sin * r);
    });
  }

  drawForeground(ctx) {
    if (this.hover) {
      const i = this.hover.index;
      const a = this.angles[i];
      ctx.save();
      ctx.strokeStyle = this.options.axis.crosshairColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(this.centre.x, this.centre.y);
      ctx.lineTo(this.centre.x + Math.cos(a) * this.radius, this.centre.y + Math.sin(a) * this.radius);
      ctx.stroke();
      ctx.setLineDash([]);

      for (const s of this.visibleSeries()) {
        const v = s.values[i];
        if (!isNum(v)) continue;
        const pt = this.pointAt(i, v);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, this.options.radar.pointRadius + 3.5, 0, TAU);
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    if (this.options.showValues) this.drawValueLabels(ctx);
  }

  drawValueLabels(ctx) {
    const axis = this.options.axis;
    ctx.save();
    ctx.font = axisFont(axis, '600');
    ctx.fillStyle = axis.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of this.visibleSeries()) {
      s.values.forEach((v, i) => {
        if (!isNum(v)) return;
        const pt = this.pointAt(i, v);
        // Nudge outward along the spoke so the label clears its own vertex.
        const a = this.angles[i];
        ctx.fillText(formatValue(v, this.options), pt.x + Math.cos(a) * 12, pt.y + Math.sin(a) * 12);
      });
    }
    ctx.restore();
  }

  // -------------------------------------------------------------- hover ----

  /** Nearest spoke by bearing; the tooltip then lists every series on it. */
  handleHover(x, y) {
    const count = this.data.labels.length;
    if (!count || !this.angles) return;

    const dx = x - this.centre.x;
    const dy = y - this.centre.y;
    if (Math.hypot(dx, dy) > this.radius * 1.12) {
      this.hover = null;
      this.tooltip.hide();
      return;
    }

    const start = this.options.radar.startAngle * DEG;
    const step = TAU / count;
    let k = Math.round((Math.atan2(dy, dx) - start) / step) % count;
    if (k < 0) k += count;

    const entries = [];
    for (const s of this.visibleSeries()) {
      const v = s.values[k];
      if (!isNum(v)) continue;
      entries.push({ name: s.name, value: formatValue(v, this.options), color: s.color });
    }

    if (!entries.length) {
      this.hover = null;
      this.tooltip.hide();
      return;
    }

    this.hover = { index: k };
    const a = this.angles[k];
    this.tooltip.show(
      {
        title: this.data.labels[k],
        entries,
        x: this.centre.x + Math.cos(a) * this.radius * 0.8,
        y: this.centre.y + Math.sin(a) * this.radius * 0.8
      },
      { width: this.renderer.width, height: this.renderer.height },
      this.options
    );
  }
}
