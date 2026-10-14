// Type declaration for lightweight-charts until npm install runs
// Remove this file once the package is installed
declare module 'lightweight-charts' {
  export const ColorType: { Solid: string; VerticalGradient: string };
  export const CrosshairMode: { Normal: number; Magnet: number };
  export interface IChartApi {
    addCandlestickSeries(options?: Record<string, unknown>): ISeriesApi<'Candlestick'>;
    addHistogramSeries(options?: Record<string, unknown>): ISeriesApi<'Histogram'>;
    addLineSeries(options?: Record<string, unknown>): ISeriesApi<'Line'>;
    subscribeCrosshairMove(cb: (param: { time?: unknown; point?: { x: number; y: number }; seriesData?: Map<ISeriesApi<any>, unknown> }) => void): void;
    remove(): void;
    timeScale(): ITimeScaleApi;
    applyOptions(options: Record<string, unknown>): void;
    resize(width: number, height: number): void;
    series(): ISeriesApi<any>[];
    setCrosshairPosition(price: unknown, time: unknown, series: ISeriesApi<any>): void;
  }
  export interface ISeriesApi<T extends string> {
    setData(data: unknown[]): void;
    update(data: unknown): void;
    setMarkers(markers: unknown[]): void;
    priceScaleId?: string;
    priceScale(): { applyOptions(opts: Record<string, unknown>): void };
    createPriceLine(options: Record<string, unknown>): unknown;
  }
  export interface ITimeScaleApi {
    fitContent(): void;
    scrollToPosition(position: number, animated?: boolean): void;
    subscribeVisibleLogicalRangeChange(cb: (range: { from: number; to: number } | null) => void): void;
  }
  export interface CandlestickData { time: number | string; open: number; high: number; low: number; close: number }
  export interface HistogramData { time: number | string; value: number; color?: string }
  export interface LineData { time: number | string; value: number }
  export function createChart(container: HTMLElement, options?: Record<string, unknown>): IChartApi;
}