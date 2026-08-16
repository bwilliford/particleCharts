/**
 * Turning geometry into particle positions.
 *
 * Every sampler is *stratified* — the i-th particle is drawn from the i-th
 * slice of the domain rather than from the whole of it — which removes the
 * clumping that plain `Math.random()` gives you and makes a cloud of a few
 * hundred particles read as a solid shape.
 */

import { TAU, clamp, lerp } from './utils.js';

/**
 * Monotone cubic interpolation (Fritsch-Carlson).
 * Chosen over Catmull-Rom because it cannot overshoot: a smoothed line through
 * non-negative data never dips below the baseline.
 */
export function monotoneCurve(points, samplesPerSegment) {
  const n = points.length;
  if (n < 2) return points.slice();
  const per = Math.max(2, samplesPerSegment || 12);

  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i++) {
    const h = points[i + 1].x - points[i].x;
    dx.push(h);
    slope.push(h === 0 ? 0 : (points[i + 1].y - points[i].y) / h);
  }

  const m = new Array(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }

  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i];
    const steps = i === n - 2 ? per : per - 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      out.push({
        x: points[i].x + h * t,
        y: h00 * points[i].y + h10 * h * m[i] + h01 * points[i + 1].y + h11 * h * m[i + 1]
      });
    }
  }
  return out;
}

/** Right-angled staircase through the points. */
export function stepCurve(points) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    if (i > 0) out.push({ x: points[i].x, y: points[i - 1].y });
    out.push(points[i]);
  }
  return out;
}

/**
 * Scatter `count` particles along a polyline, spread across a band of
 * `width` pixels centred on the path.
 */
export function samplePath(path, count, width, rng, emit) {
  if (path.length < 2 || count <= 0) return;

  const lengths = [0];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    lengths.push(total);
  }
  if (total <= 0) {
    for (let i = 0; i < count; i++) emit(path[0].x, path[0].y, 0);
    return;
  }

  let seg = 1;
  const half = width / 2;
  for (let i = 0; i < count; i++) {
    const target = ((i + rng()) / count) * total;
    while (seg < lengths.length - 1 && lengths[seg] < target) seg++;
    const a = path[seg - 1];
    const b = path[seg];
    const span = lengths[seg] - lengths[seg - 1];
    const t = span > 0 ? (target - lengths[seg - 1]) / span : 0;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;

    // Offset along the segment normal, denser toward the centre of the band.
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const off = (rng() + rng() - 1) * half;
    emit(x + nx * off, y + ny * off, Math.abs(off) / (half || 1));
  }
}

/**
 * Fill the band between a polyline and a baseline.
 * `fade` > 0 thins particles toward the baseline so the fill dissolves.
 */
export function sampleUnderPath(path, baseline, count, rng, fade, emit) {
  if (path.length < 2 || count <= 0) return;

  const cols = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const w = path[i].x - path[i - 1].x;
    if (w <= 0) continue;
    const top = (path[i].y + path[i - 1].y) / 2;
    const h = Math.abs(baseline - top);
    const area = w * h;
    if (area <= 0) continue;
    total += area;
    cols.push({ i, acc: total });
  }
  if (!total) return;

  const bias = 1 + clamp(fade, 0, 2) * 1.6;
  let c = 0;
  for (let k = 0; k < count; k++) {
    const target = ((k + rng()) / count) * total;
    while (c < cols.length - 1 && cols[c].acc < target) c++;
    const idx = cols[c].i;
    const a = path[idx - 1];
    const b = path[idx];
    const t = rng();
    const x = a.x + (b.x - a.x) * t;
    const top = a.y + (b.y - a.y) * t;
    const d = Math.pow(rng(), bias); // 0 at the line, 1 at the baseline
    emit(x, lerp(top, baseline, d), d);
  }
}

/**
 * Fill a rectangle. `fade` thins particles toward the "far" end, given by
 * `dir`: 'up' | 'down' | 'left' | 'right' — the direction the bar grows in.
 */
export function sampleRect(x, y, w, h, count, rng, fade, dir, emit) {
  if (count <= 0 || w <= 0 || h <= 0) return;
  const bias = 1 - clamp(fade, 0, 0.85) * 0.75; // <1 pushes density toward the root
  const vertical = dir === 'up' || dir === 'down';

  for (let i = 0; i < count; i++) {
    // Stratify along the long axis; jitter freely across the short one.
    const along = (i + rng()) / count;
    const across = rng();
    const biased = Math.pow(along, bias);
    const t = dir === 'up' || dir === 'left' ? 1 - biased : biased;
    if (vertical) emit(x + across * w, y + t * h, biased);
    else emit(x + t * w, y + across * h, biased);
  }
}

/** Fill an annulus sector (a pie or donut slice). */
export function sampleSector(cx, cy, r0, r1, a0, a1, count, rng, edgeFade, emit) {
  if (count <= 0 || r1 <= r0 || a1 <= a0) return;
  const inner2 = r0 * r0;
  const outer2 = r1 * r1;
  const fade = clamp(edgeFade, 0, 1);

  for (let i = 0; i < count; i++) {
    const a = a0 + ((i + rng()) / count) * (a1 - a0);
    // sqrt keeps the areal density uniform across the annulus.
    let u = rng();
    if (fade > 0) u = Math.pow(u, 1 - fade * 0.55);
    const r = Math.sqrt(inner2 + u * (outer2 - inner2));
    emit(cx + Math.cos(a) * r, cy + Math.sin(a) * r, u);
  }
}

/** A soft blob of particles, used for data-point markers. */
export function sampleDisc(cx, cy, radius, count, rng, emit) {
  for (let i = 0; i < count; i++) {
    const a = ((i + rng()) / count) * TAU;
    const r = radius * Math.sqrt(rng()) * 0.92;
    emit(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r / radius);
  }
}
