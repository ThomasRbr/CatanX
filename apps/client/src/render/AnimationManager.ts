import { Application, Container, Graphics, Text } from 'pixi.js';
import { PixelCoord } from '@catanx/engine';

type Tween = {
  update: (deltaMS: number) => boolean;
};

type TweenMode = 'sequential' | 'parallel';

interface QueuedTween {
  tween: Tween;
  mode: TweenMode;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export class AnimationManager {
  private app: Application;
  private layer: Container;
  private activeTweens: QueuedTween[] = [];
  private queuedSequentialTweens: Tween[] = [];
  private hasSequentialActive = false;

  constructor(app: Application, layer: Container) {
    this.app = app;
    this.layer = layer;
    this.app.ticker.add(this.onTick);
  }

  destroy(): void {
    this.app.ticker.remove(this.onTick);
    this.activeTweens = [];
    this.queuedSequentialTweens = [];
    this.hasSequentialActive = false;
    this.layer.removeChildren();
  }

  runConstructionPulse(center: PixelCoord, color = 0x7bd389, parallel = false): void {
    const ring = new Graphics();
    this.layer.addChild(ring);

    const duration = 500;
    let elapsed = 0;

    this.enqueueTween(
      {
        update: (deltaMS) => {
          elapsed += deltaMS;
          const t = Math.min(1, elapsed / duration);
          const e = easeOutCubic(t);
          const radius = lerp(4, 26, e);

          ring.clear();
          ring.circle(center.x, center.y, radius).stroke({ color, width: 2, alpha: 1 - t });

          if (t >= 1) {
            ring.destroy();
            return true;
          }
          return false;
        },
      },
      parallel ? 'parallel' : 'sequential',
    );
  }

  runCombatImpact(center: PixelCoord, parallel = false): void {
    const flash = new Graphics();
    this.layer.addChild(flash);

    const duration = 260;
    let elapsed = 0;

    this.enqueueTween(
      {
        update: (deltaMS) => {
          elapsed += deltaMS;
          const t = Math.min(1, elapsed / duration);

          flash.clear();
          flash
            .circle(center.x, center.y, 18 + 24 * t)
            .fill({ color: 0xdb3a34, alpha: 0.45 * (1 - t) });

          if (t >= 1) {
            flash.destroy();
            return true;
          }
          return false;
        },
      },
      parallel ? 'parallel' : 'sequential',
    );
  }

  runMoveTrail(from: PixelCoord, to: PixelCoord, color = 0xffffff, parallel = true): void {
    const marker = new Graphics();
    this.layer.addChild(marker);

    const duration = 400;
    let elapsed = 0;

    this.enqueueTween(
      {
        update: (deltaMS) => {
          elapsed += deltaMS;
          const t = Math.min(1, elapsed / duration);
          const x = lerp(from.x, to.x, easeOutCubic(t));
          const y = lerp(from.y, to.y, easeOutCubic(t));

          marker.clear();
          marker.circle(x, y, 6).fill({ color, alpha: 0.8 * (1 - t * 0.35) });

          if (t >= 1) {
            marker.destroy();
            return true;
          }
          return false;
        },
      },
      parallel ? 'parallel' : 'sequential',
    );
  }

  runDeathBurst(center: PixelCoord, parallel = false): void {
    const particles: Graphics[] = [];
    for (let i = 0; i < 10; i++) {
      const p = new Graphics();
      p.circle(0, 0, 2 + (i % 2)).fill({ color: 0xf97316, alpha: 0.95 });
      p.position.set(center.x, center.y);
      particles.push(p);
      this.layer.addChild(p);
    }

    const duration = 520;
    let elapsed = 0;

    this.enqueueTween(
      {
        update: (deltaMS) => {
          elapsed += deltaMS;
          const t = Math.min(1, elapsed / duration);

          particles.forEach((p, i) => {
            const angle = (Math.PI * 2 * i) / particles.length;
            const radius = 10 + 28 * t;
            p.position.set(
              center.x + Math.cos(angle) * radius,
              center.y + Math.sin(angle) * radius,
            );
            p.alpha = 1 - t;
          });

          if (t >= 1) {
            particles.forEach((p) => p.destroy());
            return true;
          }
          return false;
        },
      },
      parallel ? 'parallel' : 'sequential',
    );
  }

  runResourceFloat(label: string, from: PixelCoord, to: PixelCoord, parallel = true): void {
    const text = new Text({
      text: label,
      style: { fill: 0xf7d070, fontSize: 14, fontWeight: '700' },
    });
    text.anchor.set(0.5);
    text.position.set(from.x, from.y);
    this.layer.addChild(text);

    const duration = 750;
    let elapsed = 0;

    this.enqueueTween(
      {
        update: (deltaMS) => {
          elapsed += deltaMS;
          const t = Math.min(1, elapsed / duration);
          const e = easeOutCubic(t);

          text.position.set(lerp(from.x, to.x, e), lerp(from.y, to.y, e));
          text.alpha = 1 - t * 0.9;

          if (t >= 1) {
            text.destroy();
            return true;
          }
          return false;
        },
      },
      parallel ? 'parallel' : 'sequential',
    );
  }

  private onTick = (): void => {
    if (this.activeTweens.length === 0 && this.queuedSequentialTweens.length === 0) return;

    const deltaMS = this.app.ticker.deltaMS;
    const survivors: QueuedTween[] = [];
    let sequentialEnded = false;

    for (const entry of this.activeTweens) {
      const done = entry.tween.update(deltaMS);
      if (done) {
        if (entry.mode === 'sequential') {
          sequentialEnded = true;
          this.hasSequentialActive = false;
        }
        continue;
      }
      survivors.push(entry);
    }

    this.activeTweens = survivors;

    if (!this.hasSequentialActive && this.queuedSequentialTweens.length > 0) {
      const next = this.queuedSequentialTweens.shift();
      if (next) {
        this.activeTweens.push({ tween: next, mode: 'sequential' });
        this.hasSequentialActive = true;
      }
      return;
    }

    if (sequentialEnded && this.queuedSequentialTweens.length > 0) {
      const next = this.queuedSequentialTweens.shift();
      if (next) {
        this.activeTweens.push({ tween: next, mode: 'sequential' });
        this.hasSequentialActive = true;
      }
    }
  };

  private enqueueTween(tween: Tween, mode: TweenMode): void {
    if (mode === 'parallel') {
      this.activeTweens.push({ tween, mode });
      return;
    }

    if (this.hasSequentialActive) {
      this.queuedSequentialTweens.push(tween);
      return;
    }

    this.activeTweens.push({ tween, mode: 'sequential' });
    this.hasSequentialActive = true;
  }
}
