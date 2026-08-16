/**
 * Line / area chart.
 *
 * Each series becomes three particle populations: a band along the stroke, an
 * optional fill under it that fades toward the baseline, and a tight cluster at
 * every data point so the actual measurements stay legible inside the cloud.
 */

import { CartesianChart } from './cartesian.js';
import { pointScale, valueCategoryScale } from '../core/scale.js';
import { allocate } from '../core/particles.js';
import { monotoneCurve, sampleDisc, samplePath, sampleUnderPath, stepCurve } from '../core/sampling.js';
import { axisFont, formatValue } from '../core/axis.js';
import { clamp, createRng, isNum, TAU } from '../core/utils.js';

/** How many particles may cover any one pixel of a stroke before hues clip. */
const STROKE_OVERLAP = 1.2;
/** Draw diameter of a small particle as a multiple of `particle.size` (matches the renderer). */
const DRAW_SPREAD = 2;

function pathLength(runs) {
  let len = 0;
  for (const run of runs) {
    for (let i = 1; i < run.path.length; i++) {
      len += Math.hypot(run.path[i].x - run.path[i - 1].x, run.path[i].y - run.path[i - 1].y);
    }
  }
  return len;
}

function strokeCapacity(length, width, size) {
  const particleArea = Math.max(1, Math.pow(size * DRAW_SPREAD, 2));
  return Math.max(24, Math.ceil((length * width * STROKE_OVERLAP) / particleArea));
}

export class LineChart extends CartesianChart {
  createCategoryScale(count, range) {
    const xs = this.data.xValues;
    if (xs && xs.length === count && count > 1) return valueCategoryScale(xs, range);
    return pointScale(count, range);
  }

  /** Split a series into runs of consecutive non-null points, then smooth each. */
  buildPaths(series) {
    const curve = this.options.line.curve;
    const runs = [];
    let current = [];

    series.values.forEach((v, i) => {
      if (!isNum(v)) {
        if (current.length) runs.push(current);
        current = [];
        return;
      }
      current.push({ x: this.catScale.at(i), y: this.vScale(v), i });
    });
    if (current.length) runs.push(current);

    return runs.map((pts) => {
      if (pts.length < 2) return { anchors: pts, path: pts };
      if (curve === 'step') return { anchors: pts, path: stepCurve(pts) };
      if (curve === 'smooth') return { anchors: pts, path: monotoneCurve(pts, 14) };
      return { anchors: pts, path: pts };
    });
  }

  buildTargets(budget) {
    const opts = this.options;
    const cfg = opts.line;
    const series = this.visibleSeries();
    const targets = [];
    if (!series.length || !this.data.labels.length) return targets;

    const rng = createRng(0xa11ce5);
    const baseline = clamp(this.zeroPos, this.plot.y, this.plot.y + this.plot.h);
    const geometry = series.map((s) => this.buildPaths(s));

    // Weight each series by how much ink it actually needs.
    const weights = geometry.map((runs) => {
      let w = 0;
      for (const run of runs) {
        for (let i = 1; i < run.path.length; i++) {
          w += Math.hypot(run.path[i].x - run.path[i - 1].x, run.path[i].y - run.path[i - 1].y) * cfg.width;
        }
        if (cfg.area) {
          for (let i = 1; i < run.path.length; i++) {
            const dx = run.path[i].x - run.path[i - 1].x;
            w += Math.abs(dx * (baseline - (run.path[i].y + run.path[i - 1].y) / 2)) * 0.55;
          }
        }
      }
      return Math.max(w, 1);
    });

    const counts = allocate(weights, budget, 60);
    const p = opts.particle;

    series.forEach((s, si) => {
      const runs = geometry[si];
      const total = counts[si];
      if (!total) return;

      const anchorCount = runs.reduce((n, r) => n + r.anchors.length, 0);
      const pointBudget = cfg.points ? Math.min(Math.round(total * 0.16), anchorCount * 26) : 0;
      const rest = total - pointBudget;
      let areaCount = cfg.area ? Math.round(rest * clamp(cfg.areaAmount, 0, 0.95)) : 0;
      let strokeCount = rest - areaCount;

      /**
       * A stroke is a thin band, so a large budget piles particles many deep
       * inside it. Because particles composite additively, past a few layers
       * every channel clips and the series loses its colour to white. Cap the
       * stroke at the count its own area can carry, and hand any surplus to the
       * area fill — a plain line simply uses fewer particles, which is correct.
       */
      const strokeCap = strokeCapacity(pathLength(runs), cfg.width, p.size);
      if (strokeCount > strokeCap) {
        const spare = strokeCount - strokeCap;
        strokeCount = strokeCap;
        if (cfg.area) areaCount += spare;
      }

      // Longer runs get proportionally more particles.
      const runWeights = runs.map((r) => Math.max(1, r.path.length));
      const strokeSplit = allocate(runWeights, strokeCount, 8);
      const areaSplit = allocate(runWeights, areaCount, 0);

      runs.forEach((run, ri) => {
        if (run.path.length < 2) {
          // A lone point still deserves a mark.
          sampleDisc(run.path[0].x, run.path[0].y, cfg.pointRadius, 24, rng, (x, y) =>
            targets.push(this.target(x, y, s.color, rng, 1.05, 1, si, run.anchors[0].i))
          );
          return;
        }

        if (areaSplit[ri] > 0) {
          sampleUnderPath(run.path, baseline, areaSplit[ri], rng, cfg.areaFade, (x, y, d) =>
            targets.push(this.target(x, y, s.color, rng, 0.82, 0.62 * (1 - d * 0.55), si, -1))
          );
        }

        samplePath(run.path, strokeSplit[ri], cfg.width, rng, (x, y, edge) =>
          targets.push(this.target(x, y, s.color, rng, 1 - edge * 0.25, 1 - edge * 0.3, si, -1))
        );
      });

      if (pointBudget > 0 && anchorCount > 0) {
        const per = Math.max(6, Math.floor(pointBudget / anchorCount));
        for (const run of runs) {
          for (const a of run.anchors) {
            sampleDisc(a.x, a.y, cfg.pointRadius, per, rng, (x, y, d) =>
              targets.push(this.target(x, y, s.color, rng, 1.1 - d * 0.3, 1, si, a.i))
            );
          }
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

  drawForeground(ctx) {
    super.drawForeground(ctx);
    if (!this.hover) return;

    const i = this.hover.index;
    ctx.save();
    for (const s of this.visibleSeries()) {
      const v = s.values[i];
      if (!isNum(v)) continue;
      const x = this.catScale.at(i);
      const y = this.vScale(v);
      ctx.beginPath();
      ctx.arc(x, y, this.options.line.pointRadius + 3.5, 0, TAU);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.9;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawValueLabels(ctx) {
    const axis = this.options.axis;
    ctx.save();
    ctx.font = axisFont(axis, '600');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = axis.textColor;
    for (const s of this.visibleSeries()) {
      s.values.forEach((v, i) => {
        if (!isNum(v)) return;
        ctx.fillText(formatValue(v, this.options), this.catScale.at(i), this.vScale(v) - 10);
      });
    }
    ctx.restore();
  }
}
