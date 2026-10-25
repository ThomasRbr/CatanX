import type { ReactNode } from 'react';
import { createElement } from 'react';
import { ICON_NAMES, type CatanXIconName } from './names';

type PathProps = {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: 'round' | 'square' | 'butt';
  strokeLinejoin?: 'round' | 'miter' | 'bevel';
  fillRule?: 'evenodd' | 'nonzero';
};

function path(props: PathProps): ReactNode {
  return createElement('path', {
    key: props.d,
    fill: props.fill ?? 'currentColor',
    stroke: props.stroke,
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin,
    fillRule: props.fillRule,
    d: props.d,
  });
}

function g(children: ReactNode[], key: string): ReactNode {
  return createElement('g', { key }, ...children);
}

/** Geometric SVG content for each CatanX icon (24×24 viewBox). */
export const ICON_REGISTRY: Record<CatanXIconName, ReactNode> = {
  wood: g(
    [
      path({ d: 'M11 3h2l1.5 8H9.5L11 3z' }),
      path({ d: 'M8 12h8v2H8z' }),
      path({ d: 'M10 14h4v7h-4z' }),
      path({ d: 'M7 9l2 1.5M17 9l-2 1.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }),
    ],
    'wood',
  ),
  brick: g(
    [path({ d: 'M3 6h8v4H3zM13 6h8v4h-8zM7 12h8v4H7zM3 18h8v4H3zM13 18h8v4h-8z' })],
    'brick',
  ),
  sheep: g(
    [
      path({
        d: 'M8 10c0-2.5 2-4.5 4-4.5s4 2 4 4.5c1.5.3 2.5 1.5 2.5 3.2 0 1.8-1.4 3.3-3.2 3.3H8.7C6.9 16.5 5.5 15 5.5 13.2c0-1.7 1-2.9 2.5-3.2z',
      }),
      path({ d: 'M9.5 9.5h1v1h-1zM13.5 9.5h1v1h-1z' }),
      path({
        d: 'M10.5 12.2c.4.5 1.2.8 1.5.8s1.1-.3 1.5-.8',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1,
      }),
      path({ d: 'M9 16.5l-1 4h2l.5-2.5M15 16.5l1 4h-2l-.5-2.5' }),
    ],
    'sheep',
  ),
  wheat: g(
    [
      path({ d: 'M12 3c1.5 2 2 4 2 6-1.2-.4-2-.4-2-.4s-.8 0-2 .4c0-2 .5-4 2-6z' }),
      path({ d: 'M8 8c1.2 1.5 1.8 3 2 4.5-.8-.3-1.5-.5-2-.5-.5 0-1.2.2-2 .5.2-1.5.8-3 2-4.5z' }),
      path({ d: 'M16 8c1.2 1.5 1.8 3 2 4.5-.8-.3-1.5-.5-2-.5s-1.2.2-2 .5c.2-1.5.8-3 2-4.5z' }),
      path({ d: 'M11.5 12.5h1V21h-1z' }),
    ],
    'wheat',
  ),
  ore: g(
    [
      path({
        d: 'M12 3l7 5v8l-7 5-7-5V8l7-5z',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinejoin: 'round',
      }),
      path({ d: 'M12 8l3.5 2.2v4.2L12 16.5l-3.5-2.1V10.2L12 8z' }),
    ],
    'ore',
  ),
  gold: g(
    [
      path({
        d: 'M12 3.5A8.5 8.5 0 1 1 3.5 12 8.5 8.5 0 0 1 12 3.5z',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
      }),
      path({
        d: 'M12 7v10M9 9.5c0-1.2 1.3-2 3-2s3 .8 3 2-1.3 1.6-3 1.8-3 .8-3 2 1.3 2 3 2 3-.8 3-2',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
      }),
    ],
    'gold',
  ),
  ckPaper: g(
    [
      path({
        d: 'M6 4.5h9l3 3V20H6V4.5z',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinejoin: 'round',
      }),
      path({
        d: 'M15 4.5V8h3M9 11h6M9 14h6M9 17h4',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
      }),
    ],
    'ckPaper',
  ),
  ckCloth: g(
    [
      path({
        d: 'M7 5.5c1.3 1 2.8 1.5 5 1.5s3.7-.5 5-1.5l2 3-2 2V20H7v-9.5l-2-2 2-3z',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinejoin: 'round',
      }),
      path({
        d: 'M10 7v13M14 7v13M7 12h10M7 16h10',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 0.9,
        strokeLinecap: 'round',
      }),
    ],
    'ckCloth',
  ),
  ckCoin: g(
    [
      path({
        d: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
      }),
      path({
        d: 'M12 7v10M9.5 9c.8-.8 1.6-1.2 2.8-1.2 1.4 0 2.5.7 2.5 1.8 0 2.8-5.6 1.2-5.6 4.1 0 1.4 1.2 2.3 2.9 2.3 1.2 0 2.2-.4 3-1.2',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.35,
        strokeLinecap: 'round',
      }),
    ],
    'ckCoin',
  ),
  settlement: g(
    [
      path({ d: 'M4 11l8-7 8 7v10H4V11z' }),
      path({ d: 'M10 14h4v7h-4z', fill: 'var(--night-teal, #102E2B)' }),
    ],
    'settlement',
  ),
  city: g(
    [
      path({ d: 'M3 20V9l4-3v3l4-3v14H3z' }),
      path({ d: 'M11 20V7l5-3v4l5-2v14H11z' }),
      path({ d: 'M5 12h2v2H5zM5 15h2v2H5zM13 11h2v2h-2zM17 13h2v2h-2z' }),
    ],
    'city',
  ),
  road: g(
    [
      path({
        d: 'M4 16l6-10h4l6 10H4z',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinejoin: 'round',
      }),
      path({ d: 'M8 16l3-5h2l3 5' }),
      path({ d: 'M10 9.5h4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 }),
    ],
    'road',
  ),
  dice: g(
    [
      path({
        d: 'M5 5h14v14H5z',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinejoin: 'round',
      }),
      path({
        d: 'M8.5 8.5h2v2h-2zM13.5 8.5h2v2h-2zM8.5 13.5h2v2h-2zM13.5 13.5h2v2h-2zM11 11h2v2h-2z',
      }),
    ],
    'dice',
  ),
  endTurn: g(
    [
      path({
        d: 'M12 4a8 8 0 1 1-7.5 5.2',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
      }),
      path({
        d: 'M4.5 4.5v5h5',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }),
    ],
    'endTurn',
  ),
  build: g(
    [
      path({
        d: 'M5 20l2.5-9 4 2 2-7 5.5 14H5z',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinejoin: 'round',
      }),
      path({ d: 'M14 4l1.5 3H19l-2.8 2 1 3.2L14 10.5 11.8 12.2l1-3.2L10 7h3.5L14 4z' }),
    ],
    'build',
  ),
  trade: g(
    [
      path({
        d: 'M7 8h9l-2-2M16 16H7l2 2',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }),
      path({ d: 'M5 11h6v2H5zM13 11h6v2h-6z' }),
    ],
    'trade',
  ),
  tech: g(
    [
      path({
        d: 'M12 3.5l1.2 2.4 2.6.4-1.9 1.9.5 2.6L12 9.6l-2.4 1.2.5-2.6-1.9-1.9 2.6-.4L12 3.5z',
      }),
      path({
        d: 'M12 11.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
      }),
      path({
        d: 'M12 14.2v3.6M10.2 16h3.6',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
      }),
    ],
    'tech',
  ),
  diplomacy: g(
    [
      path({
        d: 'M6 8c0-1.5 1.5-2.5 3-2.5h1v8H9c-1.5 0-3-1-3-2.5V8zM18 8c0-1.5-1.5-2.5-3-2.5h-1v8h1c1.5 0 3-1 3-2.5V8z',
      }),
      path({ d: 'M10 18h4v2h-4zM11 13.5h2V18h-2z' }),
    ],
    'diplomacy',
  ),
  army: g(
    [
      path({ d: 'M12 3l2 3h3l-2.5 2.2.9 3.3L12 9.8l-3.4 1.7.9-3.3L7 6h3l2-3z' }),
      path({ d: 'M8 14h8l1 7H7l1-7z' }),
    ],
    'army',
  ),
  settings: g(
    [
      path({
        d: 'M10.2 3.5h3.6l.5 2.2 2-.9 2.5 2.5-.9 2 2.2.5v3.6l-2.2.5.9 2-2.5 2.5-2-.9-.5 2.2h-3.6l-.5-2.2-2 .9-2.5-2.5.9-2L3.5 12.8v-3.6l2.2-.5-.9-2 2.5-2.5 2 .9.5-2.2z',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinejoin: 'round',
      }),
      path({
        d: 'M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
      }),
    ],
    'settings',
  ),
  help: g(
    [
      path({
        d: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
      }),
      path({
        d: 'M9.5 9.2c0-1.5 1.2-2.5 2.5-2.5s2.5 1 2.5 2.5c0 1.2-.8 1.8-1.6 2.3-.7.4-1.2.8-1.2 1.7',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
      }),
      path({ d: 'M11.2 16.2h1.6v1.6h-1.6z' }),
    ],
    'help',
  ),
  save: g(
    [
      path({
        d: 'M5 5h11l3 3v11H5V5z',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinejoin: 'round',
      }),
      path({ d: 'M8 5v5h7V5' }),
      path({ d: 'M8 14h8v5H8z' }),
    ],
    'save',
  ),
  close: g(
    [
      path({
        d: 'M6 6l12 12M18 6L6 18',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
      }),
    ],
    'close',
  ),
  check: g(
    [
      path({
        d: 'M5 12.5l4.5 4.5L19 7',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2.2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }),
    ],
    'check',
  ),
  warning: g(
    [
      path({
        d: 'M12 4l9 16H3L12 4z',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinejoin: 'round',
      }),
      path({
        d: 'M12 10v4.5',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
      }),
      path({ d: 'M11.2 17h1.6v1.6h-1.6z' }),
    ],
    'warning',
  ),
  victory: g(
    [
      path({
        d: 'M7 5h10v1c0 3.5-2 6-5 6.5C9 12 7 9.5 7 6V5z',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
      }),
      path({
        d: 'M5 6c0 2.5 1.2 4 3 4.5M19 6c0 2.5-1.2 4-3 4.5',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
      }),
      path({ d: 'M12 12.5V17M9 20h6M10 17h4v3h-4z' }),
    ],
    'victory',
  ),
  season: g(
    [
      path({
        d: 'M12 4a8 8 0 1 0 0 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
      }),
      path({ d: 'M12 4a8 8 0 0 1 0 16V4z' }),
      path({
        d: 'M12 2v2M12 20v2M2 12h2M20 12h2',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
      }),
    ],
    'season',
  ),
  menu: g(
    [
      path({
        d: 'M5 7h14M5 12h14M5 17h14',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
      }),
    ],
    'menu',
  ),
  more: g([path({ d: 'M6 11h2v2H6zM11 11h2v2h-2zM16 11h2v2h-2z' })], 'more'),
};

export function hasIcon(name: string): name is CatanXIconName {
  return (ICON_NAMES as readonly string[]).includes(name);
}

export function listIcons(): readonly CatanXIconName[] {
  return ICON_NAMES;
}

export function getIconNode(name: CatanXIconName): ReactNode {
  return ICON_REGISTRY[name];
}
