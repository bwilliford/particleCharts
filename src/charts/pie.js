/**
 * Pie / donut chart.
 *
 * `type: 'donut'` is this chart with a non-zero inner radius — the only
 * difference is where the annulus starts, so they share every code path.
 *
 * Unlike the cartesian charts, colour here identifies a *category*, so the
 * legend, the mute state and the palette slots are all keyed by category.
 */

import { Chart } from '../core/chart.js';
import { allocate } from '../core/particles.js';
import { sampleSector } from '../core/sampling.js';
import { axisFont, formatValue } from '../core/axis.js';
import { colorAt } from '../core/color.js';
import { clamp, createRng, DEG, isNum, TAU } from '../core/utils.js';

/** How far the hovered wedge slides out of the ring, in pixels. */
const LIFT = 6;
/** Clearance between the ring's outer edge and its labels, in pixels. */
const LABEL_GAP = 12;

export class PieChart extends Chart {
  syncColors() {
    const spec = this.options.particle.color;
    this.sliceColors = this.data.labels.map((label, i) => colorAt(spec, i, label));
    this.sliceKeys = this.data.labels.map((label, i) => label + '#' + i);
  }

  /** Pie reads a single series; extra series are ignored (with the first winning). */
  values() {
    const s = this.data.series[0];
    return s ? s.values : [];
  }

  visibleSlices() {
    const values = this.values();
    const out = [];
    this.data.labels.forEach((label, i) => {
      const v = values[i];
      if (!isNum(v) || v <= 0) return;
      if (this.hidden.has(this.sliceKeys[i])) return;
      out.push({ index: i, label, value: v, color: this.sliceColors[i] });
    });
    return out;
  }

  legendEntries() {
    const values = this.values();
    return this.data.labels
      .map((label, i) => ({
        key: this.sliceKeys[i],
        label,
        color: this.sliceColors[i],
        muted: this.hidden.has(this.sliceKeys[i]),
        value: values[i]
      }))
      .filter((e) => isNum(e.value) && e.value > 0);
  }

  toggleSeries(key) {
    if (this.hidden.has(key)) this.hidden.delete(key);
    else if (this.visibleSlices().length > 1) this.hidden.add(key);
    else return;
    this.layout({ soft: true });
  }

  labelSpec() {
    return { valueLabels: [], categoryLabels: [] };
  }

  computeGeometry() {
    const cfg = this.options.pie;
    const plot = this.plot;
    this.centre = { x: plot.x + plot.w / 2, y: plot.y + plot.h / 2 };

    const slices = this.visibleSlices();
    const total = slices.reduce((a, s) => a + s.value, 0);
    this.total = total;

    // Angles first: they depend only on the values, never on the radius.
    const pad = slices.length > 1 ? clamp(cfg.padAngle, 0, 20) * DEG : 0;
    const available = Math.max(0.01, TAU - pad * slices.length);
    let angle = cfg.startAngle * DEG + pad / 2;

    this.slices = slices.map((s) => {
      const span = total > 0 ? (s.value / total) * available : 0;
      const out = { ...s, a0: angle, a1: angle + span, share: total > 0 ? s.value / total : 0 };
      out.mid = (out.a0 + out.a1) / 2;
      angle += span + pad;
      return out;
    });

    // Labels sit outside the ring, so the ring has to give up the room they
    // need — measured against the real strings rather than guessed at.
    let room = { x: 0, y: 0 };
    if (this.labelsVisible()) {
      const axis = this.options.axis;
      const ctx = this.renderer.ctx;
      ctx.save();
      ctx.font = axisFont(axis, '500');
      let widest = 0;
      for (const s of this.slices) widest = Math.max(widest, ctx.measureText(this.sliceLabel(s)).width);
      ctx.restore();
      room = { x: LABEL_GAP + Math.ceil(widest), y: LABEL_GAP + axis.fontSize };
    }

    const fits = Math.min(plot.w / 2 - room.x, plot.h / 2 - room.y);
    this.outer = Math.max(12, fits * clamp(cfg.radius, 0.2, 1));
    this.inner = this.outer * clamp(cfg.innerRadius, 0, 0.95);
  }

  labelsVisible() {
    return this.options.showValues && this.options.pie.labels !== 'none';
  }

  sliceLabel(slice) {
    const mode = this.options.pie.labels;
    if (mode === 'value') return formatValue(slice.value, this.options);
    if (mode === 'label') return slice.label;
    return Math.round(slice.share * 100) + '%';
  }

  /**
   * Budget from the annulus, not the bounding box — a wide card around a small
   * ring would otherwise pack the slices until additive blending blows every
   * colour out to white. The ring is a solid fill rather than a sparse cloud,
   * so it earns roughly twice the particles per unit area that a plot does.
   */
  particleBudget() {
    const ring = Math.PI * (this.outer * this.outer - this.inner * this.inner);
    return Math.min(this.options.particle.max, Math.round(this.budgetForArea(ring) * 2));
  }

  buildTargets(budget) {
    const targets = [];
    if (!this.slices || !this.slices.length) return targets;

    const cfg = this.options.pie;
    const p = this.options.particle;
    const rng = createRng(0x9123);
    const j = p.sizeJitter;
    const areas = this.slices.map((s) => (s.a1 - s.a0) * (this.outer * this.outer - this.inner * this.inner));
    const counts = allocate(areas, budget, 20);

    this.slices.forEach((s, si) => {
      const n = counts[si];
      if (!n) return;
      const lift = this.hover && this.hover.index === s.index ? LIFT : 0;
      const cx = this.centre.x + Math.cos(s.mid) * lift;
      const cy = this.centre.y + Math.sin(s.mid) * lift;

      sampleSector(cx, cy, this.inner, this.outer, s.a0, s.a1, n, rng, cfg.edgeFade, (x, y, u) => {
        targets.push({
          x,
          y,
          color: s.color,
          size: p.size * (1 - u * 0.12) * (1 - j * 0.5 + rng() * j),
          alpha: 1 - Math.max(0, u - 0.78) * 1.6 * clamp(cfg.edgeFade, 0, 1),
          group: si,
          index: s.index
        });
      });
    });

    if (targets.length > p.max) targets.length = p.max;
    return targets;
  }

  drawBackdrop() {}

  drawForeground(ctx) {
    const axis = this.options.axis;

    // Hover outline: a thin arc, so the highlight does not compete with the cloud.
    if (this.hover) {
      const s = this.slices.find((sl) => sl.index === this.hover.index);
      if (s) {
        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        // Follow the slice out: buildTargets lifts the hovered wedge by LIFT px.
        ctx.arc(
          this.centre.x + Math.cos(s.mid) * LIFT,
          this.centre.y + Math.sin(s.mid) * LIFT,
          this.outer + 4,
          s.a0,
          s.a1
        );
        ctx.stroke();
        ctx.restore();
      }
    }

    if (this.labelsVisible()) this.drawSliceLabels(ctx);
    if (this.centreMode() !== 'none') this.drawCentre(ctx, axis);
  }

  centreMode() {
    const cfg = this.options.pie;
    if (cfg.center === 'none') return 'none';
    if (cfg.center === 'auto' || cfg.center == null) {
      return clamp(cfg.innerRadius, 0, 1) >= 0.35 ? 'total' : 'none';
    }
    return cfg.center;
  }

  drawCentre(ctx, axis) {
    const hovered = this.hover ? this.slices.find((s) => s.index === this.hover.index) : null;
    const caption = hovered ? hovered.label : this.centreMode() === 'total' ? 'Total' : String(this.centreMode());
    const value = hovered ? hovered.value : this.total;
    const size = Math.max(16, Math.min(this.inner * 0.46, 40));

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.font = '600 ' + size.toFixed(0) + 'px ' + axis.fontFamily;
    ctx.fillText(formatValue(value, this.options), this.centre.x, this.centre.y + size * 0.16);
    ctx.font = axisFont(axis);
    ctx.fillStyle = axis.textColor;
    ctx.fillText(truncate(ctx, caption, this.inner * 1.6), this.centre.x, this.centre.y + size * 0.95);
    ctx.restore();
  }

  /**
   * Labels sit just outside the ring, on the slice's own bearing, in the same
   * muted ink as the axis so they stay behind the data.
   *
   * Slices are walked in angular order, which means the y of each label moves
   * monotonically down the right-hand side and back up the left. That makes
   * collision handling a single comparison against the last label placed on the
   * same side: anything that would land on top of its neighbour is dropped, and
   * the legend and tooltip carry it instead.
   */
  drawSliceLabels(ctx) {
    const axis = this.options.axis;
    const radius = this.outer + LABEL_GAP;

    ctx.save();
    ctx.font = axisFont(axis, '500');
    ctx.textBaseline = 'middle';
    ctx.fillStyle = axis.textColor;

    const minGap = axis.fontSize * 1.1;
    let lastRight = -Infinity;
    let lastLeft = -Infinity;

    for (const s of this.slices) {
      const cos = Math.cos(s.mid);
      const y = this.centre.y + Math.sin(s.mid) * radius;
      const toRight = cos >= 0;

      // A slice pointing straight up or down gets a centred label sitting over
      // its tip. Flinging those out to a side would stack them against their
      // neighbours for no reason.
      const upright = Math.abs(cos) < 0.3;
      if (!upright) {
        if (Math.abs(y - (toRight ? lastRight : lastLeft)) < minGap) continue;
        if (toRight) lastRight = y;
        else lastLeft = y;
      }

      ctx.textAlign = upright ? 'center' : toRight ? 'left' : 'right';
      ctx.fillText(this.sliceLabel(s), this.centre.x + cos * radius, y);
    }
    ctx.restore();
  }

  handleHover(x, y) {
    if (!this.slices || !this.slices.length) return;
    const dx = x - this.centre.x;
    const dy = y - this.centre.y;
    const dist = Math.hypot(dx, dy);

    if (dist < this.inner * 0.92 || dist > this.outer * 1.08) {
      if (this.hover) {
        this.hover = null;
        this.retarget();
      }
      this.tooltip.hide();
      return;
    }

    let angle = Math.atan2(dy, dx);
    const found = this.slices.find((s) => {
      let a = angle;
      while (a < s.a0) a += TAU;
      while (a > s.a0 + TAU) a -= TAU;
      return a >= s.a0 && a <= s.a1;
    });

    if (!found) {
      this.tooltip.hide();
      return;
    }

    if (!this.hover || this.hover.index !== found.index) {
      this.hover = { index: found.index };
      this.retarget(); // the hovered slice lifts out of the ring
    }

    this.tooltip.show(
      {
        title: found.label,
        entries: [
          {
            name: formatValue(found.value, this.options),
            value: (found.share * 100).toFixed(found.share < 0.1 ? 1 : 0) + '%',
            color: found.color
          }
        ],
        x,
        y
      },
      { width: this.renderer.width, height: this.renderer.height },
      this.options
    );
  }

  /** Pie's a11y table needs percentages, not just raw values. */
  renderTable() {
    const rows = this.legendEntries();
    if (!rows.length) {
      this.table.innerHTML = '';
      return;
    }
    const total = rows.reduce((a, r) => a + r.value, 0) || 1;
    let html = '<table><caption>Chart data</caption><thead><tr>' +
      '<th scope="col">Category</th><th scope="col">Value</th><th scope="col">Share</th></tr></thead><tbody>';
    for (const r of rows) {
      html += '<tr><th scope="row">' + escHtml(r.label) + '</th><td>' +
        escHtml(formatValue(r.value, this.options)) + '</td><td>' +
        ((r.value / total) * 100).toFixed(1) + '%</td></tr>';
    }
    this.table.innerHTML = html + '</tbody></table>';
  }
}

function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) out = out.slice(0, -1);
  return out + '…';
}

function escHtml(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
