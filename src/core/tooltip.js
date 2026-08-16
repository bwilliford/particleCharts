/**
 * Hover tooltip. An on-screen chart is an interactive chart, so this is on by
 * default for every type except an empty one.
 */

export class Tooltip {
  constructor(host, options) {
    this.el = document.createElement('div');
    this.el.className = 'pchart-tooltip';
    this.el.setAttribute('role', 'tooltip');
    host.appendChild(this.el);
    this.visible = false;
    this.applyTheme(options);
  }

  applyTheme(options) {
    const t = options.tooltip;
    this.el.style.background = t.background;
    this.el.style.color = t.color;
    this.el.style.borderColor = t.borderColor;
  }

  /**
   * @param {Object} payload { title, entries: [{name, value, color}], x, y }
   * @param {Object} bounds  { width, height } of the plot area
   */
  show(payload, bounds, options) {
    const format = options.tooltip.format;
    if (typeof format === 'function') {
      this.el.innerHTML = format(payload);
    } else {
      let html = payload.title ? '<div class="pchart-tooltip-title">' + escapeHtml(payload.title) + '</div>' : '';
      for (const e of payload.entries) {
        html +=
          '<div class="pchart-tooltip-row">' +
          '<span class="pchart-tooltip-swatch" style="background:' + escapeHtml(e.color) + '"></span>' +
          (e.name ? '<span class="pchart-tooltip-name">' + escapeHtml(e.name) + '</span>' : '') +
          '<span class="pchart-tooltip-value">' + escapeHtml(e.value) + '</span>' +
          '</div>';
      }
      this.el.innerHTML = html;
    }

    // Measure, then clamp inside the plot so the tooltip never leaves the chart.
    this.el.classList.add('is-visible');
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    let x = payload.x;
    let y = payload.y - 12;
    x = Math.max(w / 2 + 2, Math.min(bounds.width - w / 2 - 2, x));
    if (y - h < 2) y = payload.y + h + 20;
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
    this.visible = true;
  }

  hide() {
    if (!this.visible) return;
    this.el.classList.remove('is-visible');
    this.visible = false;
  }

  destroy() {
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
