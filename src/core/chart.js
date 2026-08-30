/**
 * Base chart: DOM scaffolding, layout, the render loop and interaction.
 *
 * Subclasses supply four things:
 *   labelSpec()            -> the strings the axis needs to measure
 *   computeGeometry()      -> scales / element rects for the current plot box
 *   buildTargets(budget)   -> particle targets
 *   drawBackdrop / drawForeground / hitTest
 */

import { clamp, createRng, isNum, resolveBox, resolveElement } from './utils.js';
import { colorAt } from './color.js';
import { normalizeData } from './data.js';
import { resolveOptions } from './options.js';
import { ParticleField } from './particles.js';
import { Renderer } from './renderer.js';
import { Legend } from './legend.js';
import { Tooltip } from './tooltip.js';
import { injectStyles } from './styles.js';
import { measureAxisPadding, formatValue } from './axis.js';

const REFERENCE_AREA = 640 * 360;
/** Particle size the budget is neutral at; smaller sizes earn proportionally more. */
const REFERENCE_SIZE = 1.6;
/** Particles for a reference-area plot at density 1 and reference size. */
const BASE_BUDGET = 700;
/**
 * Frame budget for a settled chart: idle drift is repainted at ~30fps. Set a
 * shade under 1000/30 on purpose — at exactly 33.33ms the check lands on the
 * 60Hz frame boundary, where float error decides it, and the drift stutters
 * between every-second and every-third frame. Under the boundary it is always
 * every second frame at 60Hz, every fourth at 120Hz.
 */
const DRIFT_FRAME_MS = 1000 / 32;

export class Chart {
  constructor(target, config) {
    injectStyles();

    this.container = resolveElement(target);
    this.options = resolveOptions(config || {});
    this.rawData = (config && config.data) || null;
    this.data = normalizeData(this.rawData);
    this.hidden = new Set();
    this.hover = null;
    this.destroyed = false;
    this.frame = 0;
    this.lastTime = 0;
    this.startTime = 0;
    this.visible = true;
    this.plot = { x: 0, y: 0, w: 0, h: 0 };
    this.padding = { top: 0, right: 0, bottom: 0, left: 0 };
    this.rng = createRng(0x5eed);
    // Honour the OS motion preference: no entrance flight, no idle drift.
    this.motionOk = !prefersReducedMotion();

    this.buildDom();
    this.field = new ParticleField();

    this.observeResize();
    this.bindPointer();
    this.observeVisibility();

    this.syncColors();
    this.layout({ initial: true });
    this.start();
  }

  // ---------------------------------------------------------------- DOM ----

  buildDom() {
    const root = document.createElement('div');
    root.className = 'pchart-root';
    root.dataset.legend = this.options.legend.position;
    this.root = root;

    this.plotHost = document.createElement('div');
    this.plotHost.className = 'pchart-plot';

    this.legend = new Legend(root, this);
    root.appendChild(this.plotHost);

    this.renderer = new Renderer(this.plotHost, this.options);
    this.renderer.canvas.setAttribute('role', 'img');

    this.tooltip = new Tooltip(this.plotHost, this.options);

    this.table = document.createElement('div');
    this.table.className = 'pchart-a11y';
    root.appendChild(this.table);

    this.container.appendChild(root);
  }

  observeResize() {
    if (!this.options.responsive || typeof ResizeObserver === 'undefined') return;
    /**
     * A dragged window fires this every frame, and every layout re-measures the
     * axis and rebuilds every particle target — the most expensive thing the
     * chart does. Coalesce to one layout per frame, and drop the intermediate
     * sizes rather than laying out for sizes nobody ever sees.
     */
    this.resizeObserver = new ResizeObserver(() => {
      if (this.destroyed || this.resizeFrame) return;
      this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = 0;
        if (!this.destroyed) this.layout({ resize: true });
      });
    });
    this.resizeObserver.observe(this.plotHost);
  }

  observeVisibility() {
    if (!this.options.pauseWhenHidden) return;
    this.onVisibility = () => {
      this.visible = document.visibilityState !== 'hidden' && this.inViewport !== false;
      if (this.visible) this.start();
    };
    document.addEventListener('visibilitychange', this.onVisibility);

    if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        this.inViewport = entries[0].isIntersecting;
        this.onVisibility();
      }, { rootMargin: '0px' });
      this.intersectionObserver.observe(this.root);
    }
  }

  bindPointer() {
    if (!this.options.showTooltip) return;
    this.onPointerMove = (event) => {
      const rect = this.renderer.canvas.getBoundingClientRect();
      this.handleHover(event.clientX - rect.left, event.clientY - rect.top);
      this.start(); // an idle-stopped chart still has to draw its highlight
    };
    this.onPointerLeave = () => {
      this.hover = null;
      this.tooltip.hide();
      this.start();
    };
    this.plotHost.addEventListener('pointermove', this.onPointerMove);
    this.plotHost.addEventListener('pointerleave', this.onPointerLeave);
  }

  // ------------------------------------------------------------- series ----

  syncColors() {
    this.data.series.forEach((s, i) => {
      s.color = s.color || colorAt(this.options.particle.color, i, s);
      s.key = s.name + '#' + i;
    });
  }

  /** Series the user has not muted via the legend. */
  visibleSeries() {
    return this.data.series.filter((s) => !this.hidden.has(s.key));
  }

  toggleSeries(key) {
    if (this.hidden.has(key)) this.hidden.delete(key);
    else if (this.visibleSeries().length > 1) this.hidden.add(key);
    else return; // never let the last series be hidden
    this.layout({ soft: true });
  }

  legendEntries() {
    return this.data.series.map((s) => ({
      key: s.key,
      label: s.name,
      color: s.color,
      muted: this.hidden.has(s.key)
    }));
  }

  // ------------------------------------------------------------- layout ----

  layout(flags) {
    if (this.destroyed) return;
    const opts = this.options;

    this.legend.render(this.legendEntries(), opts);

    const rect = this.plotHost.getBoundingClientRect();
    const width = rect.width || this.container.clientWidth || 600;
    const height = rect.height || this.container.clientHeight || 320;
    this.renderer.resize(width, height);

    const ctx = this.renderer.ctx;
    this.padding = opts.padding != null
      ? resolveBox(opts.padding, { top: 12, right: 14, bottom: 10, left: 12 })
      : measureAxisPadding(ctx, this.labelSpec(), opts);

    this.plot = {
      x: this.padding.left,
      y: this.padding.top,
      w: Math.max(1, this.renderer.width - this.padding.left - this.padding.right),
      h: Math.max(1, this.renderer.height - this.padding.top - this.padding.bottom)
    };

    this.computeGeometry();
    this.renderTable();
    this.retarget();
    this.updateAriaLabel();
    this.start();
  }

  /**
   * Regenerate particle targets for the current geometry without touching the
   * legend or the a11y table — cheap enough to run on a hover change.
   */
  retarget() {
    const opts = this.options;
    const targets = this.buildTargets(this.particleBudget());
    this.field.setTargets(targets, {
      spawn: {
        x: this.plot.x + this.plot.w / 2,
        y: this.plot.y + this.plot.h / 2,
        radius: Math.min(this.plot.w, this.plot.h) * 0.5
      },
      animate: opts.animate && this.motionOk,
      duration: opts.duration,
      stagger: this.motionOk ? opts.stagger : 0,
      immediate: opts.animate === false
    });
    this.start();
  }

  /**
   * How many particles a region of `area` square pixels is worth. Sub-linear in
   * area so a wide chart does not cost proportionally more to draw, and inverse
   * in particle size so smaller particles are issued in greater numbers.
   *
   * Calibrated so the defaults (size 0.5, density 5) fill a 640x360 plot with a
   * fine, legible dust. `particle.max` is the safety ceiling, not the target.
   */
  budgetForArea(area) {
    const p = this.options.particle;
    const sizeFactor = clamp(REFERENCE_SIZE / Math.max(0.1, p.size), 0.3, 3);
    const scale = Math.pow(Math.max(area, 1) / REFERENCE_AREA, 0.62);
    return Math.round(clamp(BASE_BUDGET * p.density * scale * sizeFactor, 120, p.max));
  }

  particleBudget() {
    return this.budgetForArea(this.plot.w * this.plot.h);
  }

  // --------------------------------------------------------------- loop ----

  start() {
    if (this.destroyed || this.frame || !this.visible) return;
    this.lastTime = 0;
    const tick = (now) => {
      this.frame = 0;
      if (this.destroyed) return;
      const cfg = this.options.particle;

      /**
       * Particles in flight need every frame. Once they have arrived the only
       * motion left is the idle drift — a slow sine wobble that samples the
       * same at 30fps as at 60 — so paint it half as often and hand the rest
       * of the frame budget back to the page. On a 120Hz display this cuts the
       * work by four rather than two, which is why it is a time budget and not
       * a frame counter.
       */
      if (!this.field.settled || now - this.lastTime >= DRIFT_FRAME_MS) {
        const dt = this.lastTime ? Math.min(now - this.lastTime, 64) : 16.7;
        this.lastTime = now;
        this.field.update(dt, cfg);
        this.draw(now);
      }

      // A chart with no idle drift has nothing left to animate once its
      // particles arrive, so stop burning frames until something changes.
      // `start()` is called again by layout, update and hover.
      const idle = this.field.settled && (!this.motionOk || !cfg.jitter);
      if (this.visible && !idle) this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  draw(now) {
    const r = this.renderer;
    const opts = this.options;
    r.beginFrame(opts.background);
    const ctx = r.ctx;

    const particleCfg = this.motionOk ? opts.particle : this.stillConfig();

    this.drawBackdrop(ctx);
    r.paintScene(this.field.particles, particleCfg, now);
    r.composite(particleCfg);
    this.drawForeground(ctx);
  }

  /**
   * The particle config with drift removed, for readers who asked for reduced
   * motion. Rebuilt only when the options object identity changes — this used
   * to allocate a fresh object on every single frame.
   */
  stillConfig() {
    if (this.stillFrom !== this.options.particle) {
      this.stillFrom = this.options.particle;
      this.stillCfg = { ...this.options.particle, jitter: 0 };
    }
    return this.stillCfg;
  }

  // ---------------------------------------------------------- public API ---

  /** Swap in new data (and optionally new options); particles morph to the new shape. */
  update(data, options) {
    if (data !== undefined && data !== null) {
      this.rawData = data;
      this.data = normalizeData(data);
      this.hidden.clear();
    }
    if (options) this.options = resolveOptions(options, this.options);
    this.syncColors();
    this.applyOptionSideEffects();
    this.layout({});
    return this;
  }

  setOptions(options) {
    return this.update(null, options);
  }

  applyOptionSideEffects() {
    this.root.dataset.legend = this.options.legend.position;
    this.tooltip.applyTheme(this.options);
    this.renderer.maxDpr = this.options.maxDpr;
  }

  resize() {
    this.layout({ resize: true });
    return this;
  }

  /** PNG snapshot of the current frame. */
  toDataURL(type, quality) {
    return this.renderer.canvas.toDataURL(type || 'image/png', quality);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.intersectionObserver) this.intersectionObserver.disconnect();
    if (this.onVisibility) document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.onPointerMove) {
      this.plotHost.removeEventListener('pointermove', this.onPointerMove);
      this.plotHost.removeEventListener('pointerleave', this.onPointerLeave);
    }
    this.tooltip.destroy();
    this.legend.destroy();
    this.renderer.destroy();
    this.field.clear();
    if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
  }

  // ------------------------------------------------------ accessibility ----

  updateAriaLabel() {
    const names = this.data.series.map((s) => s.name).join(', ');
    this.renderer.canvas.setAttribute(
      'aria-label',
      this.options.type + ' chart of ' + (names || 'no data') + ' across ' + this.data.labels.length + ' categories'
    );
  }

  /** Screen-reader table. Colour is never the only way to read this chart. */
  renderTable() {
    const { labels, series } = this.data;
    if (!series.length) {
      this.table.innerHTML = '';
      return;
    }
    let html = '<table><caption>Chart data</caption><thead><tr><th scope="col">Category</th>';
    for (const s of series) html += '<th scope="col">' + esc(s.name) + '</th>';
    html += '</tr></thead><tbody>';
    labels.forEach((label, i) => {
      html += '<tr><th scope="row">' + esc(label) + '</th>';
      for (const s of series) {
        html += '<td>' + (isNum(s.values[i]) ? esc(formatValue(s.values[i], this.options)) : '—') + '</td>';
      }
      html += '</tr>';
    });
    this.table.innerHTML = html + '</tbody></table>';
  }

  // ------------------------------------------------------- subclass hooks --

  labelSpec() {
    return { valueLabels: [], categoryLabels: [] };
  }

  computeGeometry() {}

  buildTargets() {
    return [];
  }

  drawBackdrop() {}

  drawForeground() {}

  handleHover() {}
}

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
