/**
 * Cartesian axis + grid rendering.
 *
 * Grid and axis lines are deliberately recessive — they exist to be read
 * through, never with. The particles carry the data; this layer only carries
 * the reference frame.
 */

import { formatNumber } from './utils.js';

const TICK_GAP = 8;
const TITLE_GAP = 14;

export function axisFont(axis, weight) {
  return (weight ? weight + ' ' : '') + axis.fontSize + 'px ' + axis.fontFamily;
}

/**
 * How much room the axis furniture needs, measured against the real text.
 * Returns a padding box in CSS pixels.
 */
export function measureAxisPadding(ctx, spec, options) {
  const axis = options.axis;
  const pad = { top: 12, right: 14, bottom: 10, left: 12 };

  // A radial chart draws no axis furniture at all, so it needs nothing more
  // than a hairline of breathing room — and it reserves space for its own
  // labels inside `computeGeometry`, by measuring them against the radius.
  // Handing it the cartesian box (plus the showValues bump) just shrank the
  // ring to make room for ticks that are never drawn.
  if (options.type === 'pie' || options.type === 'donut') {
    return { top: 6, right: 6, bottom: 6, left: 6 };
  }
  if (!options.showAxis) return pad;

  ctx.save();
  ctx.font = axisFont(axis);

  if (axis.yLabels && spec.valueLabels && spec.valueLabels.length) {
    let widest = 0;
    for (const label of spec.valueLabels) widest = Math.max(widest, ctx.measureText(label).width);
    pad.left = Math.ceil(widest) + TICK_GAP + 6;
    pad.right = Math.max(pad.right, 16);
  }
  if (axis.xLabels && spec.categoryLabels && spec.categoryLabels.length) {
    pad.bottom = axis.fontSize + TICK_GAP + 8;
    // Half of the first/last label can overhang the plot edge.
    const first = ctx.measureText(spec.categoryLabels[0] || '').width / 2;
    const last = ctx.measureText(spec.categoryLabels[spec.categoryLabels.length - 1] || '').width / 2;
    pad.left = Math.max(pad.left, Math.ceil(first) + 4);
    pad.right = Math.max(pad.right, Math.ceil(last) + 4);
  }
  if (axis.xTitle) pad.bottom += axis.fontSize + TITLE_GAP;
  if (axis.yTitle) pad.left += axis.fontSize + TITLE_GAP;
  if (options.showValues) pad.top += axis.fontSize + 6;

  ctx.restore();
  return pad;
}

/**
 * @param {Object} spec
 *   plot        {x, y, w, h}
 *   valueTicks  [{ value, label, pos }]  pos = pixel on the value axis
 *   categoryTicks [{ label, pos }]       pos = pixel on the category axis
 *   horizontal  swap the roles of the two axes
 *   zeroPos     pixel position of the zero line, if inside the plot
 */
export function drawAxis(ctx, spec, options) {
  const axis = options.axis;
  const { plot } = spec;
  const horizontal = !!spec.horizontal;

  ctx.save();
  ctx.font = axisFont(axis);
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;

  // ---- grid --------------------------------------------------------------
  if (options.showGrid) {
    ctx.strokeStyle = axis.gridColor;
    ctx.beginPath();
    if (axis.grid && spec.valueTicks) {
      for (const t of spec.valueTicks) {
        if (horizontal) {
          const x = snap(t.pos);
          ctx.moveTo(x, plot.y);
          ctx.lineTo(x, plot.y + plot.h);
        } else {
          const y = snap(t.pos);
          ctx.moveTo(plot.x, y);
          ctx.lineTo(plot.x + plot.w, y);
        }
      }
    }
    if (axis.xGrid && spec.categoryTicks) {
      for (const t of spec.categoryTicks) {
        if (horizontal) {
          const y = snap(t.pos);
          ctx.moveTo(plot.x, y);
          ctx.lineTo(plot.x + plot.w, y);
        } else {
          const x = snap(t.pos);
          ctx.moveTo(x, plot.y);
          ctx.lineTo(x, plot.y + plot.h);
        }
      }
    }
    ctx.stroke();
  }

  // Everything past this point is axis furniture, not grid. `showGrid` and
  // `showAxis` are independent switches: with the axis off, the grid alone
  // still has to draw — and the baseline, ticks and titles must not, or the
  // padding measured for a chart without labels gets labels drawn into it.
  if (!options.showAxis) {
    ctx.restore();
    return;
  }

  // ---- baseline ----------------------------------------------------------
  ctx.strokeStyle = axis.color;
  ctx.beginPath();
  if (horizontal) {
    const x = snap(spec.zeroPos != null ? spec.zeroPos : plot.x);
    ctx.moveTo(x, plot.y);
    ctx.lineTo(x, plot.y + plot.h);
  } else {
    const y = snap(spec.zeroPos != null ? spec.zeroPos : plot.y + plot.h);
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
  }
  ctx.stroke();

  // ---- labels ------------------------------------------------------------
  ctx.fillStyle = axis.textColor;

  if (axis.yLabels && spec.valueTicks) {
    if (horizontal) {
      ctx.textAlign = 'center';
      for (const t of spec.valueTicks) {
        ctx.fillText(t.label, t.pos, plot.y + plot.h + TICK_GAP + axis.fontSize * 0.5);
      }
    } else {
      ctx.textAlign = 'right';
      for (const t of spec.valueTicks) {
        ctx.fillText(t.label, plot.x - TICK_GAP, t.pos);
      }
    }
  }

  if (axis.xLabels && spec.categoryTicks) {
    if (horizontal) {
      ctx.textAlign = 'right';
      for (const t of spec.categoryTicks) ctx.fillText(t.label, plot.x - TICK_GAP, t.pos);
    } else {
      ctx.textAlign = 'center';
      const y = plot.y + plot.h + TICK_GAP + axis.fontSize * 0.5;
      for (const t of spec.categoryTicks) ctx.fillText(t.label, t.pos, y);
    }
  }

  // ---- titles ------------------------------------------------------------
  if (axis.xTitle) {
    ctx.textAlign = 'center';
    ctx.fillStyle = axis.textColor;
    ctx.fillText(axis.xTitle, plot.x + plot.w / 2, plot.y + plot.h + spec.padding.bottom - axis.fontSize * 0.4);
  }
  if (axis.yTitle) {
    ctx.save();
    ctx.translate(plot.x - spec.padding.left + axis.fontSize * 0.9, plot.y + plot.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(axis.yTitle, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

/** Vertical hover guide behind the tooltip. */
export function drawHoverGuide(ctx, spec, pos, options) {
  ctx.save();
  ctx.strokeStyle = options.axis.crosshairColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  if (spec.horizontal) {
    ctx.moveTo(spec.plot.x, snap(pos));
    ctx.lineTo(spec.plot.x + spec.plot.w, snap(pos));
  } else {
    ctx.moveTo(snap(pos), spec.plot.y);
    ctx.lineTo(snap(pos), spec.plot.y + spec.plot.h);
  }
  ctx.stroke();
  ctx.restore();
}

export function formatValue(value, options) {
  return formatNumber(value, options.axis.format);
}

function snap(v) {
  return Math.round(v) + 0.5;
}
