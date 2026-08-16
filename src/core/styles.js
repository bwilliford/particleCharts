/**
 * The library ships its own (tiny) stylesheet for the legend and tooltip so a
 * single `<script>` tag is genuinely all you need. Injected once, on first use.
 */

const STYLE_ID = 'particle-charts-styles';

const CSS = `
.pchart-root{position:relative;display:flex;width:100%;height:100%;min-width:0;min-height:0;
  font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased}
.pchart-root[data-legend="top"]{flex-direction:column}
.pchart-root[data-legend="bottom"]{flex-direction:column-reverse}
.pchart-root[data-legend="left"]{flex-direction:row}
.pchart-root[data-legend="right"]{flex-direction:row-reverse}
.pchart-plot{position:relative;flex:1 1 auto;min-width:0;min-height:0}
.pchart-canvas{display:block;position:absolute;inset:0;width:100%;height:100%}

.pchart-legend{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;flex:0 0 auto;
  padding:2px 0 12px;line-height:1.2;user-select:none}
.pchart-root[data-legend="bottom"] .pchart-legend{padding:12px 0 2px}
.pchart-root[data-legend="left"] .pchart-legend,
.pchart-root[data-legend="right"] .pchart-legend{flex-direction:column;align-items:flex-start;
  /* Centre the stack against the plot rather than letting it pile up in the
     top corner — a side legend should read as a key beside the chart. */
  justify-content:center;padding:0 16px 0 0;max-width:40%}
.pchart-root[data-legend="right"] .pchart-legend{padding:0 0 0 16px}
.pchart-legend[data-align="center"]{justify-content:center}
.pchart-legend[data-align="end"]{justify-content:flex-end}

.pchart-legend-item{display:inline-flex;align-items:center;gap:7px;background:none;border:0;
  padding:2px 0;margin:0;font:inherit;font-size:12px;color:inherit;cursor:default;
  transition:opacity .18s ease}
.pchart-legend[data-interactive="true"] .pchart-legend-item{cursor:pointer}
.pchart-legend-item:focus-visible{outline:1px solid currentColor;outline-offset:3px;border-radius:3px}
.pchart-legend-item.is-muted{opacity:.38}
.pchart-legend-item.is-muted .pchart-legend-label{text-decoration:line-through}
.pchart-legend-marker{flex:0 0 auto;border-radius:50%;box-shadow:0 0 10px 0 currentColor}
.pchart-legend-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.pchart-tooltip{position:absolute;z-index:5;pointer-events:none;opacity:0;
  transform:translate(-50%,-100%);transition:opacity .12s ease;
  padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.12);
  background:rgba(12,14,19,.94);color:#e9edf3;font-size:12px;line-height:1.45;
  box-shadow:0 8px 28px rgba(0,0,0,.45);white-space:nowrap;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.pchart-tooltip.is-visible{opacity:1}
.pchart-tooltip-title{font-weight:600;margin-bottom:4px;opacity:.72;font-size:11px;
  letter-spacing:.02em;text-transform:uppercase}
.pchart-tooltip-row{display:flex;align-items:center;gap:8px}
.pchart-tooltip-row + .pchart-tooltip-row{margin-top:2px}
.pchart-tooltip-swatch{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
.pchart-tooltip-name{opacity:.72;margin-right:auto}
.pchart-tooltip-value{font-variant-numeric:tabular-nums;font-weight:600}

.pchart-a11y{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0 0 0 0);white-space:nowrap;border:0}

@media (prefers-reduced-motion:reduce){
  .pchart-legend-item,.pchart-tooltip{transition:none}
}
`;

export function injectStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
