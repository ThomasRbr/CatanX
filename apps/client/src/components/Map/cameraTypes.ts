/** Renderer-agnostic camera contracts shared by Pixi and Three boards. */

export interface CameraViewport {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  zoom: number;
}

export interface CameraFocusRequest {
  tileId: string;
  nonce: number;
}
