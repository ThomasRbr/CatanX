import { Application, Container } from 'pixi.js';

export interface PixiAppOptions {
  backgroundColor?: number;
}

export class PixiApp {
  readonly app: Application;
  readonly world: Container;
  readonly overlay: Container;
  readonly ready: Promise<void>;

  private host: HTMLDivElement;
  private canvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;
  private initialized = false;
  private finalized = false;

  constructor(host: HTMLDivElement, options: PixiAppOptions = {}) {
    this.host = host;
    this.app = new Application();
    this.world = new Container();
    this.overlay = new Container();

    this.ready = this.app
      .init({
        antialias: true,
        backgroundColor: options.backgroundColor ?? 0x152c37,
        resolution: 1,
        autoDensity: true,
        width: Math.max(1, host.clientWidth),
        height: Math.max(1, host.clientHeight),
      })
      .then(() => {
        this.initialized = true;
        const canvas = this.readCanvas();
        if (!canvas) {
          this.finalized = true;
          return;
        }
        this.canvas = canvas;

        if (this.destroyed) {
          this.teardownInitializedApp();
          return;
        }
        host.appendChild(canvas);
        this.app.stage.addChild(this.world);
        this.app.stage.addChild(this.overlay);
        this.attachResizeObserver();
      });
  }

  private attachResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.destroyed) return;
      const renderer = (
        this.app as Application & { renderer?: { resize: (width: number, height: number) => void } }
      ).renderer;
      if (!renderer) return;
      renderer.resize(Math.max(1, this.host.clientWidth), Math.max(1, this.host.clientHeight));
    });
    this.resizeObserver.observe(this.host);
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.canvas ?? this.readCanvas();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    // If init has not completed yet, teardown will happen in `ready.then`.
    if (!this.initialized) return;
    this.teardownInitializedApp();
  }

  private teardownInitializedApp(): void {
    if (this.finalized) return;
    this.finalized = true;

    const canvas = this.canvas ?? this.readCanvas();
    if (canvas && canvas.parentElement === this.host) {
      this.host.removeChild(canvas);
    }
    this.canvas = null;

    const renderer = (this.app as Application & { renderer?: unknown }).renderer;
    if (!renderer) return;

    try {
      this.app.destroy(true, { children: true, texture: false });
    } catch {
      // Ignore teardown races during strict-mode double unmount.
    }
  }

  private readCanvas(): HTMLCanvasElement | null {
    try {
      return this.app.canvas;
    } catch {
      return null;
    }
  }
}
