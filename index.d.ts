/**
 * Particle Charts — type declarations.
 *
 * Nested option groups (`particle`, `axis`, `legend`, `line`, `bar`, `pie`) can
 * also be set through the flat aliases below; where both are given, the nested
 * form wins.
 */

export declare const version: string;

// ---------------------------------------------------------------- data ------

export type Primitive = number | string | null | undefined;

export interface PointObject {
  label?: Primitive;
  name?: Primitive;
  x?: Primitive;
  key?: Primitive;
  category?: Primitive;
  date?: Primitive;
  value?: Primitive;
  y?: Primitive;
  count?: Primitive;
  total?: Primitive;
  amount?: Primitive;
  /** The bubble chart's third dimension. Ignored by every other type. */
  r?: Primitive;
  size?: Primitive;
  z?: Primitive;
  radius?: Primitive;
  weight?: Primitive;
}

/**
 * One series' points: bare numbers, `{x, y}` objects, or `[label, value]`
 * pairs. A third slot — `{x, y, r}` or `[label, value, size]` — is the bubble
 * chart's size dimension.
 */
export type SeriesPoints = Array<
  number | null | PointObject | [Primitive, Primitive] | [Primitive, Primitive, Primitive]
>;

export interface SeriesInput {
  name?: string;
  /** Any one of these is read, in this order. */
  data?: SeriesPoints;
  values?: SeriesPoints;
  points?: SeriesPoints;
  /** Overrides the palette slot for this series. */
  color?: string;
}

/**
 * Everything is normalised to `{ labels, series }`, so all of these work:
 *
 *   [4, 8, 15]
 *   [{ label: 'Jan', value: 4 }]
 *   { labels: ['Jan'], values: [4] }
 *   { labels: ['Q1'], series: [{ name: 'Revenue', data: [42] }] }
 *   { Chrome: 62, Safari: 19 }
 */
export type ChartData =
  | SeriesPoints
  | SeriesInput[]
  | {
      labels?: Primitive[];
      xValues?: Array<number | null>;
      values?: SeriesPoints;
      data?: SeriesPoints;
      /** Parallel bubble sizes, when values are given as a flat array. */
      sizes?: Array<number | null>;
      series?: SeriesInput[];
      datasets?: SeriesInput[];
      name?: string;
      color?: string;
    }
  | Record<string, number>;

// ------------------------------------------------------------- options ------

export type ChartType =
  | 'line' | 'area' | 'bar' | 'column'
  | 'bubble' | 'scatter'
  | 'pie' | 'donut'
  | 'radar' | 'spider';

/** A colour, a list of colours assigned by slot, or a function of the slot index. */
export type ColorSpec = string | string[] | ((index: number, item: unknown) => string);

export type PaddingSpec =
  | number
  | [number, number]
  | [number, number, number, number]
  | { top?: number; right?: number; bottom?: number; left?: number };

export interface ParticleOptions {
  /** Null falls back to the built-in palette. */
  color?: ColorSpec | null;
  /** Particle radius in CSS pixels. */
  size?: number;
  /** 0–1 random size spread. 0 keeps every particle identical. */
  sizeJitter?: number;
  /** Multiplier on the auto-computed particle budget. */
  density?: number;
  /** Hard ceiling on particle count, whatever the density. */
  max?: number;
  /** Additive glow strength, 0–1. */
  bloom?: number;
  /** Blur radius of the bloom pass, in CSS pixels. */
  bloomRadius?: number;
  /** Kept under 1 so additive stacking does not clip hues to white. */
  opacity?: number;
  /** Idle drift amplitude in pixels. */
  jitter?: number;
  jitterSpeed?: number;
  /** Spring stiffness pulling a particle to its target, 0–1. */
  speed?: number;
  damping?: number;
  shape?: 'soft' | 'dot' | 'square';
}

export interface AxisOptions {
  color?: string;
  gridColor?: string;
  textColor?: string;
  /** Colour of the hover crosshair. */
  crosshairColor?: string;
  fontFamily?: string;
  fontSize?: number;
  /** Approximate tick count; nice-number rounding picks the real one. */
  ticks?: number;
  grid?: boolean;
  xGrid?: boolean;
  xLabels?: boolean;
  yLabels?: boolean;
  beginAtZero?: boolean;
  min?: number | null;
  max?: number | null;
  format?: ((value: number) => string) | null;
  xTitle?: string;
  yTitle?: string;
}

export interface LegendOptions {
  position?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  /** Click or key a legend entry to mute that series. */
  interactive?: boolean;
  markerSize?: number;
  fontSize?: number;
  color?: string;
}

export interface TooltipPayloadEntry {
  name: string;
  value: string;
  color: string;
}

export interface TooltipPayload {
  title: string;
  entries: TooltipPayloadEntry[];
  x: number;
  y: number;
}

export interface TooltipOptions {
  /** Return an HTML string to take over rendering. */
  format?: ((payload: TooltipPayload) => string) | null;
  background?: string;
  color?: string;
  borderColor?: string;
}

export interface LineOptions {
  curve?: 'smooth' | 'linear' | 'step';
  /** Thickness of the particle band forming the stroke, in pixels. */
  width?: number;
  /** `type: 'area'` turns this on. */
  area?: boolean;
  /** Share of a series' particles spent on the fill, plus whatever the stroke cap frees. */
  areaAmount?: number;
  areaFade?: number;
  points?: boolean;
  pointRadius?: number;
}

export interface BarOptions {
  /** Gap between categories, 0–1 of the band. */
  padding?: number;
  /** Gap between bars inside a group, 0–1 of the slot. */
  groupPadding?: number;
  stacked?: boolean;
  horizontal?: boolean;
  /** How much the fill thins toward the growing end, 0–1. */
  fade?: number;
  radius?: number;
}

export interface BubbleOptions {
  /** Smallest bubble radius in pixels. */
  minRadius?: number;
  /** Largest bubble radius in pixels. Values map between the two by area. */
  maxRadius?: number;
  /** Feather the rim, 0–1. */
  edgeFade?: number;
  /** Pin the size domain instead of taking it from the data. */
  minValue?: number | null;
  maxValue?: number | null;
  /** Ring every bubble behind its cloud. The hovered one is ringed regardless. */
  outline?: boolean;
}

export interface RadarOptions {
  /** Web rings between the centre and the outer edge. */
  levels?: number;
  /** `'polygon'` follows the spokes; `'circle'` draws true rings. */
  shape?: 'polygon' | 'circle';
  /** Thickness of the particle band forming each outline, in pixels. */
  width?: number;
  fill?: boolean;
  /** Share of a series' particles spent on the fill, 0–1. */
  fillAmount?: number;
  /** >0 thins the fill toward the centre. */
  fillFade?: number;
  points?: boolean;
  pointRadius?: number;
  /** Degrees; -90 puts the first spoke straight up. */
  startAngle?: number;
}

export interface PieOptions {
  /** Fraction of the outer radius. `type: 'donut'` defaults this to 0.62. */
  innerRadius?: number;
  /** Degrees; 0 is 3 o'clock. */
  startAngle?: number;
  /** Gap between slices, in degrees. */
  padAngle?: number;
  /** Shrink factor against the space left once labels are accounted for. */
  radius?: number;
  edgeFade?: number;
  /** Drawn outside the ring when `showValues` is on. */
  labels?: 'percent' | 'value' | 'label' | 'none';
  /** `'total'` prints a running total in a donut hole. */
  center?: 'auto' | 'total' | 'none' | string;
}

export type ChartTheme = 'dark' | 'light';

export interface ChartOptions {
  type?: ChartType;
  data?: ChartData;

  /**
   * Which chrome palette the axis, legend and tooltip default to. Particle
   * colours are never themed. Any colour set explicitly wins over the theme.
   */
  theme?: ChartTheme;

  background?: string;
  /** Left unset, padding is measured from the axis labels actually drawn. */
  padding?: PaddingSpec | null;
  responsive?: boolean;
  maxDpr?: number;
  /** Pause the render loop when the tab hides or the chart scrolls out of view. */
  pauseWhenHidden?: boolean;

  animate?: boolean;
  /** Entrance flight time, ms. */
  duration?: number;
  /** 0–1: how much of the entrance is spread across particles. */
  stagger?: number;

  showAxis?: boolean;
  showGrid?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showValues?: boolean;

  particle?: ParticleOptions;
  axis?: AxisOptions;
  legend?: LegendOptions;
  tooltip?: TooltipOptions;
  line?: LineOptions;
  bar?: BarOptions;
  bubble?: BubbleOptions;
  radar?: RadarOptions;
  pie?: PieOptions;

  // ---- flat aliases ----
  particleColor?: ColorSpec | null;
  particleSize?: number;
  particleDensity?: number;
  particleCount?: number;
  particleBloom?: number;
  particleOpacity?: number;
  particleJitter?: number;
  particleSpeed?: number;
  particleShape?: ParticleOptions['shape'];
  colors?: ColorSpec;
  minRadius?: BubbleOptions['minRadius'];
  maxRadius?: BubbleOptions['maxRadius'];
  levels?: RadarOptions['levels'];
  webShape?: RadarOptions['shape'];
  curve?: LineOptions['curve'];
  fillArea?: boolean;
  lineWidth?: number;
  showPoints?: boolean;
  stacked?: boolean;
  horizontal?: boolean;
  barPadding?: number;
  innerRadius?: number;
  startAngle?: number;
  padAngle?: number;
  legendPosition?: LegendOptions['position'];
  legendAlign?: LegendOptions['align'];
  min?: number | null;
  max?: number | null;
  beginAtZero?: boolean;
  valueFormat?: ((value: number) => string) | null;
  format?: ((value: number) => string) | null;
  ticks?: number;
  xTitle?: string;
  yTitle?: string;
  fontFamily?: string;
  textColor?: string;
  axisColor?: string;
  gridColor?: string;
  crosshairColor?: string;
}

// --------------------------------------------------------------- chart ------

export interface NormalisedSeries {
  name: string;
  color: string;
  key: string;
  values: Array<number | null>;
  /** Bubble sizes, present only when the input carried a third value. */
  sizes?: Array<number | null>;
  /**
   * This series' own numeric x positions, present only when its points carried
   * them. The shared `xValues` can hold one x per index; a scatter with two
   * series needs one per series.
   */
  xs?: Array<number | null>;
}

export interface NormalisedData {
  labels: string[];
  xValues: number[] | null;
  series: NormalisedSeries[];
}

export interface PlotBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export declare class Chart {
  constructor(target: Element | string, config?: ChartOptions);

  readonly container: Element;
  readonly root: HTMLDivElement;
  readonly options: Required<Pick<ChartOptions, 'type'>> & ChartOptions;
  readonly data: NormalisedData;
  readonly plot: PlotBox;
  readonly destroyed: boolean;

  /** Swap the data (and optionally options); particles morph to the new shape. */
  update(data?: ChartData | null, options?: ChartOptions): this;
  /** Restyle without touching the data. */
  setOptions(options: ChartOptions): this;
  /** Force a re-layout. */
  resize(): this;
  /** Mute or unmute a series (cartesian) or a slice (radial), by its key. */
  toggleSeries(key: string): void;
  /** Pause the render loop — e.g. while the page is scrolling. */
  stop(): void;
  /** Resume it. */
  start(): void;
  /** PNG snapshot of the current frame. */
  toDataURL(type?: string, quality?: number): string;
  /** Stop the loop, drop listeners, remove the DOM. Idempotent. */
  destroy(): void;
}

export declare class LineChart extends Chart {}
export declare class BarChart extends Chart {}
export declare class BubbleChart extends Chart {}
export declare class PieChart extends Chart {}
export declare class RadarChart extends Chart {}

/** Create a chart. Works with or without `new`; the type picks the class. */
export declare function ParticleChart(target: Element | string, config?: ChartOptions): Chart;
export declare namespace ParticleChart {
  const create: typeof ParticleChart;
}

export declare function line(target: Element | string, data: ChartData, options?: ChartOptions): Chart;
export declare function area(target: Element | string, data: ChartData, options?: ChartOptions): Chart;
export declare function bar(target: Element | string, data: ChartData, options?: ChartOptions): Chart;
export declare function bubble(target: Element | string, data: ChartData, options?: ChartOptions): Chart;
export declare function pie(target: Element | string, data: ChartData, options?: ChartOptions): Chart;
export declare function donut(target: Element | string, data: ChartData, options?: ChartOptions): Chart;
export declare function radar(target: Element | string, data: ChartData, options?: ChartOptions): Chart;

/** The resolved default options object. */
export declare const defaults: Required<
  Pick<
    ChartOptions,
    'type' | 'particle' | 'axis' | 'legend' | 'tooltip' | 'line' | 'bar' | 'bubble' | 'radar' | 'pie'
  >
> &
  ChartOptions;

/** The built-in categorical palette, in slot order. */
export declare const palette: string[];

/** The chrome colour palettes behind the `theme` option. */
export declare const themes: Record<ChartTheme, {
  axis: { color: string; gridColor: string; textColor: string; crosshairColor: string };
  legend: { color: string };
  tooltip: { background: string; color: string; borderColor: string };
}>;
