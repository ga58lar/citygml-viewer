export type SurfaceType = 'wall' | 'roof' | 'ground' | 'closure';
export type ObjectClass = 'building' | 'bridge' | 'tunnel';

export interface ParsedSurface {
  id: string;
  type: SurfaceType;
  triangles: number[];
}

export interface ParsedBuilding {
  id: string;
  objectClass: ObjectClass;
  attributes: Record<string, string>;
  surfaces: ParsedSurface[];
}

export interface ParsedScene {
  buildings: ParsedBuilding[];
  center: { x: number; y: number; z: number };
}

export type ExtToWebMsg =
  | { type: 'loadFile'; uri: string }
  | { type: 'error'; message: string };

export type WebToExtMsg =
  | { type: 'ready' }
  | { type: 'selectBuilding'; buildingId: string }
  | { type: 'openAsText' };
