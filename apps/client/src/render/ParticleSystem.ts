import { Application, Container, Graphics } from 'pixi.js';
import { PixelCoord } from '@catanx/engine';

type Particle = {
  sprite: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
  size: number;
  color: number;
};

export class ParticleSystem {
  private app: Application;
  private layer: Container;
  private particles: Particle[] = [];
  private pool: Graphics[] = [];
  private readonly maxPoolSize = 512;

  constructor(app: Application, layer: Container) {
    this.app = app;
    this.layer = layer;
    this.app.ticker.add(this.onTick);
  }

  destroy(): void {
    this.app.ticker.remove(this.onTick);
    this.particles.forEach((p) => p.sprite.destroy());
    this.pool.forEach((sprite) => sprite.destroy());
    this.particles = [];
    this.pool = [];
  }

  emitFire(center: PixelCoord, intensity = 1): void {
    this.emit(center, 14 * intensity, () => ({
      color: Math.random() > 0.45 ? 0xff6b35 : 0xfcc419,
      speed: 30 + Math.random() * 80,
      angle: -Math.PI / 2 + (Math.random() - 0.5) * 0.9,
      life: 450 + Math.random() * 300,
      size: 1 + Math.random() * 3,
      gravity: -20,
    }));
  }

  emitSnow(center: PixelCoord, intensity = 1): void {
    this.emit(center, 18 * intensity, () => ({
      color: 0xe6f7ff,
      speed: 20 + Math.random() * 30,
      angle: Math.PI / 2 + (Math.random() - 0.5) * 0.6,
      life: 1200 + Math.random() * 900,
      size: 1 + Math.random() * 2,
      gravity: 8,
    }));
  }

  emitRain(center: PixelCoord, intensity = 1): void {
    this.emit(center, 22 * intensity, () => ({
      color: 0x7dd3fc,
      speed: 100 + Math.random() * 120,
      angle: Math.PI / 2 + (Math.random() - 0.5) * 0.2,
      life: 450 + Math.random() * 250,
      size: 1,
      gravity: 25,
    }));
  }

  emitMist(center: PixelCoord, intensity = 1): void {
    this.emit(center, 10 * intensity, () => ({
      color: 0xcbd5e1,
      speed: 12 + Math.random() * 18,
      angle: Math.PI + (Math.random() - 0.5) * 1.2,
      life: 1200 + Math.random() * 600,
      size: 4 + Math.random() * 6,
      gravity: -2,
    }));
  }

  emitGold(center: PixelCoord, intensity = 1): void {
    this.emit(center, 12 * intensity, () => ({
      color: Math.random() > 0.3 ? 0xffd700 : 0xfff3b0,
      speed: 45 + Math.random() * 60,
      angle: -Math.PI / 2 + (Math.random() - 0.5) * 1.8,
      life: 700 + Math.random() * 450,
      size: 2 + Math.random() * 2,
      gravity: 45,
    }));
  }

  private emit(
    center: PixelCoord,
    count: number,
    descriptor: () => {
      color: number;
      speed: number;
      angle: number;
      life: number;
      size: number;
      gravity: number;
    },
  ): void {
    for (let i = 0; i < count; i++) {
      const item = descriptor();
      const sprite = this.acquireParticleSprite(item.size, item.color);
      sprite.position.set(
        center.x + (Math.random() - 0.5) * 10,
        center.y + (Math.random() - 0.5) * 8,
      );

      this.particles.push({
        sprite,
        vx: Math.cos(item.angle) * item.speed,
        vy: Math.sin(item.angle) * item.speed,
        life: item.life,
        maxLife: item.life,
        gravity: item.gravity,
        size: item.size,
        color: item.color,
      });
    }
  }

  private onTick = (): void => {
    if (this.particles.length === 0) return;

    const dt = this.app.ticker.deltaMS / 1000;
    const next: Particle[] = [];

    for (const particle of this.particles) {
      particle.life -= this.app.ticker.deltaMS;
      if (particle.life <= 0) {
        this.releaseParticleSprite(particle.sprite);
        continue;
      }

      particle.vy += particle.gravity * dt;
      particle.sprite.position.x += particle.vx * dt;
      particle.sprite.position.y += particle.vy * dt;
      particle.sprite.alpha = Math.max(0, particle.life / particle.maxLife);

      next.push(particle);
    }

    this.particles = next;
  };

  private acquireParticleSprite(size: number, color: number): Graphics {
    const sprite = this.pool.pop() ?? new Graphics();
    sprite.clear();
    sprite.circle(0, 0, size).fill({ color, alpha: 0.95 });
    sprite.alpha = 1;
    if (sprite.parent !== this.layer) {
      this.layer.addChild(sprite);
    }
    return sprite;
  }

  private releaseParticleSprite(sprite: Graphics): void {
    if (sprite.parent) {
      sprite.parent.removeChild(sprite);
    }
    sprite.clear();
    if (this.pool.length >= this.maxPoolSize) {
      sprite.destroy();
      return;
    }
    this.pool.push(sprite);
  }
}
