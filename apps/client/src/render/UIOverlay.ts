import { Application, Container, Graphics, Text } from 'pixi.js';

const SEASON_TINTS: Record<string, number> = {
  spring: 0x6ee7b7,
  summer: 0xfde047,
  autumn: 0xfb923c,
  winter: 0x93c5fd,
};

export class UIOverlay {
  private app: Application;
  private layer: Container;
  private seasonMask: Graphics;
  private bannerText: Text | null = null;

  constructor(app: Application, layer: Container) {
    this.app = app;
    this.layer = layer;
    this.seasonMask = new Graphics();
    this.layer.addChild(this.seasonMask);
  }

  setSeasonTint(season: string): void {
    const color = SEASON_TINTS[season] ?? 0xffffff;
    this.seasonMask.clear();
    this.seasonMask
      .rect(0, 0, this.app.screen.width, this.app.screen.height)
      .fill({ color, alpha: 0.08 });
  }

  showVictoryBanner(playerName: string): void {
    if (this.bannerText) {
      this.bannerText.destroy();
      this.bannerText = null;
    }

    const text = new Text({
      text: `${playerName} triomphe`,
      style: { fontSize: 52, fill: 0xfef3c7, fontWeight: '900' },
    });
    text.anchor.set(0.5);
    text.position.set(this.app.screen.width / 2, this.app.screen.height / 2);
    this.layer.addChild(text);
    this.bannerText = text;

    let elapsed = 0;
    const duration = 2100;

    const tick = () => {
      elapsed += this.app.ticker.deltaMS;
      const t = Math.min(1, elapsed / duration);
      text.alpha = 1 - t;
      text.scale.set(1 + t * 0.1);
      if (t >= 1) {
        this.app.ticker.remove(tick);
        text.destroy();
        if (this.bannerText === text) this.bannerText = null;
      }
    };

    this.app.ticker.add(tick);
  }

  destroy(): void {
    this.bannerText?.destroy();
    this.seasonMask.destroy();
  }
}
