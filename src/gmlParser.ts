import { XMLParser } from 'fast-xml-parser';
import earcut from 'earcut';
import type { ParsedBuilding, ParsedScene, ParsedSurface, SurfaceType, ObjectClass } from './types';

// Describes how to find top-level objects and their parts for each CityGML feature type
const OBJECT_SPECS: Array<{
  objectClass: ObjectClass;
  topTag: string;
  prefix: string;
  partContainer: string;
  partElement: string;
}> = [
  {
    objectClass: 'building',
    topTag: 'bldg:Building',
    prefix: 'bldg',
    partContainer: 'bldg:consistsOfBuildingPart',
    partElement:   'bldg:BuildingPart',
  },
  {
    objectClass: 'bridge',
    topTag: 'brid:Bridge',
    prefix: 'brid',
    partContainer: 'brid:consistsOfBridgePart',
    partElement:   'brid:BridgePart',
  },
  {
    objectClass: 'tunnel',
    topTag: 'tun:Tunnel',
    prefix: 'tun',
    partContainer: 'tun:consistsOfTunnelPart',
    partElement:   'tun:TunnelPart',
  },
];

const SURFACE_LOCAL_NAMES: Array<[string, SurfaceType]> = [
  ['WallSurface',    'wall'],
  ['RoofSurface',    'roof'],
  ['GroundSurface',  'ground'],
  ['ClosureSurface', 'closure'],
];

function asArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

// fast-xml-parser returns {#text, @_attr} for elements that have both text and attributes
function getText(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object' && '#text' in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>)['#text']);
  }
  return String(val);
}

function triangulatePosList(
  posListRaw: unknown,
  cx: number, cy: number, cz: number
): number[] {
  const posListText = getText(posListRaw);
  const raw = posListText.trim().split(/\s+/).map(Number);
  const nPts = Math.floor(raw.length / 3);
  if (nPts < 3) return [];

  const last = nPts - 1;
  const isClosed =
    raw[0] === raw[last * 3] &&
    raw[1] === raw[last * 3 + 1] &&
    raw[2] === raw[last * 3 + 2];
  const count = isClosed ? nPts - 1 : nPts;
  if (count < 3) return [];

  const pts: number[] = [];
  for (let i = 0; i < count; i++) {
    pts.push(raw[i * 3] - cx, raw[i * 3 + 1] - cy, raw[i * 3 + 2] - cz);
  }

  if (count === 3) return pts;

  // Newell's method: find dominant normal axis, project onto best 2D plane.
  // Vertical wall quads share X,Y pairs and are degenerate in the XY plane —
  // projecting onto YZ or XZ fixes this.
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const xi = pts[i * 3],     yi = pts[i * 3 + 1], zi = pts[i * 3 + 2];
    const xj = pts[j * 3],     yj = pts[j * 3 + 1], zj = pts[j * 3 + 2];
    nx += (yi - yj) * (zi + zj);
    ny += (zi - zj) * (xi + xj);
    nz += (xi - xj) * (yi + yj);
  }

  const absNx = Math.abs(nx), absNy = Math.abs(ny), absNz = Math.abs(nz);
  const flat2D: number[] = [];
  if (absNz >= absNx && absNz >= absNy) {
    for (let i = 0; i < count; i++) flat2D.push(pts[i * 3], pts[i * 3 + 1]);
  } else if (absNx >= absNy) {
    for (let i = 0; i < count; i++) flat2D.push(pts[i * 3 + 1], pts[i * 3 + 2]);
  } else {
    for (let i = 0; i < count; i++) flat2D.push(pts[i * 3], pts[i * 3 + 2]);
  }

  const indices = earcut(flat2D, undefined, 2);
  if (indices.length === 0) return [];

  const triangles: number[] = [];
  for (const idx of indices) {
    triangles.push(pts[idx * 3], pts[idx * 3 + 1], pts[idx * 3 + 2]);
  }
  return triangles;
}

function extractPolygonTriangles(
  multiSurface: any,
  cx: number, cy: number, cz: number
): number[] {
  const triangles: number[] = [];
  for (const sm of asArray(multiSurface?.['gml:surfaceMember'])) {
    for (const polygon of asArray(sm?.['gml:Polygon'])) {
      const ring = polygon?.['gml:exterior']?.['gml:LinearRing'];
      if (!ring) continue;
      const posList = ring['gml:posList'];
      if (!posList) continue;
      triangles.push(...triangulatePosList(posList, cx, cy, cz));
    }
  }
  return triangles;
}

function parseBoundedBy(
  bb: any,
  prefix: string,
  cx: number, cy: number, cz: number
): ParsedSurface | null {
  for (const [localName, surfType] of SURFACE_LOCAL_NAMES) {
    const surfNode = bb[`${prefix}:${localName}`];
    if (!surfNode) continue;
    const id: string = surfNode['@_gml:id'] ?? '';
    const ms = surfNode[`${prefix}:lod2MultiSurface`]?.['gml:MultiSurface'];
    if (!ms) continue;
    const triangles = extractPolygonTriangles(ms, cx, cy, cz);
    if (triangles.length === 0) continue;
    return { id, type: surfType, triangles };
  }
  return null;
}

function parseObject(
  node: any,
  spec: typeof OBJECT_SPECS[number],
  cx: number, cy: number, cz: number
): ParsedBuilding {
  const { objectClass, prefix, partContainer, partElement } = spec;
  const id: string = node['@_gml:id'] ?? 'unknown';
  const attributes: Record<string, string> = {};

  for (const attr of asArray(node['gen:stringAttribute'])) {
    const name: string = attr['@_name'] ?? '';
    const value = attr['gen:value'];
    if (name) attributes[name] = getText(value);
  }

  const surfaces: ParsedSurface[] = [];

  for (const bb of asArray(node[`${prefix}:boundedBy`])) {
    const s = parseBoundedBy(bb, prefix, cx, cy, cz);
    if (s) surfaces.push(s);
  }

  for (const cpp of asArray(node[partContainer])) {
    const part = cpp[partElement];
    if (!part) continue;
    for (const bb of asArray(part[`${prefix}:boundedBy`])) {
      const s = parseBoundedBy(bb, prefix, cx, cy, cz);
      if (s) surfaces.push(s);
    }
  }

  return { id, objectClass, attributes, surfaces };
}

export function parseGML(xmlText: string): ParsedScene {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
    parseTagValue: false,
    trimValues: true,
    processEntities: false,
    ignoreDeclaration: true,
  });

  const doc = parser.parse(xmlText);
  const cityModel = doc['core:CityModel'] ?? doc['CityModel'];

  const env = cityModel?.['gml:boundedBy']?.['gml:Envelope'];
  const lower = getText(env?.['gml:lowerCorner']).trim().split(/\s+/).map(Number);
  const upper = getText(env?.['gml:upperCorner']).trim().split(/\s+/).map(Number);
  const center = {
    x: (lower[0] + upper[0]) / 2,
    y: (lower[1] + upper[1]) / 2,
    z: (lower[2] + upper[2]) / 2,
  };

  const members = asArray(cityModel?.['core:cityObjectMember'] ?? cityModel?.['cityObjectMember']);
  const buildings: ParsedBuilding[] = [];

  for (const member of members) {
    for (const spec of OBJECT_SPECS) {
      for (const obj of asArray(member[spec.topTag])) {
        if (obj) buildings.push(parseObject(obj, spec, center.x, center.y, center.z));
      }
    }
  }

  return { buildings, center };
}
