/**
 * DOM legend.
 *
 * A legend is always present for two or more series — colour alone is never the
 * only carrier of identity. It is built from real buttons so keyboard users can
 * toggle series too.
 */

export class Legend {
  constructor(root, chart) {
    this.chart = chart;
    this.el = document.createElement('div');
    this.el.className = 'pchart-legend';
    this.el.setAttribute('role', 'list');
    root.appendChild(this.el);
    this.items = [];
  }

  /** @param {Array} entries [{ label, color, muted, key }] */
  render(entries, options) {
    const legend = options.legend;
    const show = options.showLegend && entries.length > 1;
    this.el.style.display = show ? '' : 'none';
    this.el.dataset.align = legend.align;
    this.el.dataset.interactive = String(!!legend.interactive);
    this.el.style.color = legend.color;
    this.el.style.fontSize = legend.fontSize + 'px';
    if (!show) {
      this.el.textContent = '';
      this.items = [];
      return;
    }

    this.el.textContent = '';
    this.items = entries.map((entry) => {
      const item = document.createElement(legend.interactive ? 'button' : 'span');
      item.className = 'pchart-legend-item' + (entry.muted ? ' is-muted' : '');
      item.setAttribute('role', 'listitem');
      if (legend.interactive) {
        item.type = 'button';
        item.setAttribute('aria-pressed', String(!entry.muted));
        item.title = entry.muted ? 'Show ' + entry.label : 'Hide ' + entry.label;
        item.addEventListener('click', () => this.chart.toggleSeries(entry.key));
      }

      const marker = document.createElement('span');
      marker.className = 'pchart-legend-marker';
      marker.style.width = legend.markerSize + 'px';
      marker.style.height = legend.markerSize + 'px';
      marker.style.background = entry.color;
      marker.style.color = entry.color;

      const label = document.createElement('span');
      label.className = 'pchart-legend-label';
      label.textContent = entry.label;

      item.appendChild(marker);
      item.appendChild(label);
      this.el.appendChild(item);
      return item;
    });
  }

  destroy() {
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
  }
}
