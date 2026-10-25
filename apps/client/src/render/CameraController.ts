import { Container, Point } from 'pixi.js';
import { PixelCoord } from '@catanx/engine';
import { HexLayout, hexToId, pixelToHex } from '@catanx/engine';

interface CameraControllerConfig {
  minZoom?: number;
  maxZoom?: number;
  zoomStep?: number;
}

interface CameraTileResolver {
  getLayout: () => HexLayout;
  hasTile: (tileId: string) => boolean;
  tileToPixel: (tileId: string) => PixelCoord | null;
}

interface BoundsLike {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface CameraSnapshot {
  zoom: number;
  position: { x: number; y: number };
  viewport: BoundsLike;
}

type CameraChangeListener = (snapshot: CameraSnapshot) => void;

export class CameraController {
  private container: Container;
  private canvas: HTMLCanvasElement;
  private minZoom: number;
  private maxZoom: number;
  private zoomStep: number;
  private zoom: number;
  private isPanning = false;
  private pointer = { x: 0, y: 0 };
  private tileResolver: CameraTileResolver | null = null;
  private panSensitivity = 1;
  private listeners = new Set<CameraChangeListener>();

  constructor(
    container: Container,
    canvas: HTMLCanvasElement,
    config: CameraControllerConfig = {},
  ) {
    this.container = container;
    this.canvas = canvas;
    this.minZoom = config.minZoom ?? 0.3;
    this.maxZoom = config.maxZoom ?? 2;
    this.zoomStep = config.zoomStep ?? 0.15;
    this.zoom = 1;

    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  setTileResolver(resolver: CameraTileResolver): void {
    this.tileResolver = resolver;
  }

  onChange(listener: CameraChangeListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  setPanSensitivity(value: number): void {
    this.panSensitivity = Math.max(0.2, Math.min(4, value || 1));
  }

  zoomIn(): void {
    this.setZoom(this.zoom + this.zoomStep);
  }

  zoomOut(): void {
    this.setZoom(this.zoom - this.zoomStep);
  }

  getZoom(): number {
    return this.zoom;
  }

  panTo(tileId: string): boolean {
    if (!this.tileResolver) return false;
    const target = this.tileResolver.tileToPixel(tileId);
    if (!target) return false;

    this.panToPixel(target);
    return true;
  }

  fitAll(bounds: BoundsLike): void {
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const scaleX = (this.canvas.clientWidth * 0.82) / width;
    const scaleY = (this.canvas.clientHeight * 0.82) / height;

    this.setZoom(Math.min(scaleX, scaleY));

    const center: PixelCoord = {
      x: bounds.minX + width / 2,
      y: bounds.minY + height / 2,
    };
    this.panToPixel(center);
  }

  getViewportWorldBounds(): BoundsLike {
    const scale = this.zoom || 1;
    const minX = -this.container.position.x / scale;
    const minY = -this.container.position.y / scale;
    const maxX = (this.canvas.clientWidth - this.container.position.x) / scale;
    const maxY = (this.canvas.clientHeight - this.container.position.y) / scale;
    return { minX, maxX, minY, maxY };
  }

  screenToTile(x: number, y: number): string | null {
    if (!this.tileResolver) return null;
    const local = this.container.toLocal(new Point(x, y));
    const cube = pixelToHex({ x: local.x, y: local.y }, this.tileResolver.getLayout());
    const tileId = hexToId(cube);
    return this.tileResolver.hasTile(tileId) ? tileId : null;
  }

  screenToWorld(x: number, y: number): PixelCoord {
    const local = this.container.toLocal(new Point(x, y));
    return { x: local.x, y: local.y };
  }

  destroy(): void {
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.listeners.clear();
  }

  private panToPixel(target: PixelCoord): void {
    this.container.position.set(
      this.canvas.clientWidth / 2 - target.x * this.zoom,
      this.canvas.clientHeight / 2 - target.y * this.zoom,
    );
    this.emitChange();
  }

  private setZoom(nextZoom: number): void {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, nextZoom));
    this.container.scale.set(this.zoom);
    this.emitChange();
  }

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();

    const cursor = new Point(event.offsetX, event.offsetY);
    const before = this.container.toLocal(cursor);

    const next = this.zoom - Math.sign(event.deltaY) * this.zoomStep;
    this.setZoom(next);

    const after = this.container.toLocal(cursor);
    this.container.position.x += (after.x - before.x) * this.zoom;
    this.container.position.y += (after.y - before.y) * this.zoom;
    this.emitChange();
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 2 && event.button !== 1) return;
    this.isPanning = true;
    this.pointer = { x: event.clientX, y: event.clientY };
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.isPanning) return;
    const dx = event.clientX - this.pointer.x;
    const dy = event.clientY - this.pointer.y;
    this.container.position.x += dx * this.panSensitivity;
    this.container.position.y += dy * this.panSensitivity;
    this.pointer = { x: event.clientX, y: event.clientY };
    this.emitChange();
  };

  private onPointerUp = (): void => {
    this.isPanning = false;
  };

  private onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private emitChange(): void {
    if (this.listeners.size === 0) return;
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private getSnapshot(): CameraSnapshot {
    return {
      zoom: this.zoom,
      position: {
        x: this.container.position.x,
        y: this.container.position.y,
      },
      viewport: this.getViewportWorldBounds(),
    };
  }
}
