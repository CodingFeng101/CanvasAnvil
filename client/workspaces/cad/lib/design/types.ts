export type SinglePlan = {
  version: 2;
  name: string;
  nodes: Array<{ id: string; x: number; y: number }>;
  walls: Array<{
    id: string;
    a: string;
    b: string;
    t: number;
    [key: string]: unknown;
  }>;
  openings: Array<{ id: string; wall: string; type: string; pos: number; width: number; [key: string]: unknown }>;
  rooms: Array<{ id: string; x: number; y: number; name: string; [key: string]: unknown }>;
  furniture: Array<{
    id: string;
    key: string;
    x: number;
    y: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

export type BuildingPlan = {
  version: 2;
  kind: 'building';
  name: string;
  cur: number;
  floors: Array<{ plan: SinglePlan; [key: string]: unknown }>;
  [key: string]: unknown;
};

export type InternalPlan = SinglePlan | BuildingPlan;

export type Underlay = {
  src: string;
  imgW: number;
  imgH: number;
  mmPerPx: number;
  x: number;
  y: number;
};

export type CadDesign = {
  plan: InternalPlan;
  revision: number;
  lastSource: 'ai' | 'user' | 'recognize';
  status: 'draft' | 'confirmed';
  underlay?: Underlay;
  updatedAt: number;
};

export type DesignIssue = {
  level: 'error' | 'warn' | 'info';
  code: string;
  msg: string;
  at?: [number, number];
  path?: string;
  room?: string;
  targets?: Array<{ kind: string; id: string }>;
};

export type RoomArea = {
  name: string;
  area: number;
  rects?: Array<{ x: number; y: number; w: number; h: number }>;
  at: [number, number];
};

export type Point = [number, number];
export type HouseSpec = {
  name?: string;
  height?: number;
  walls: Array<{ a: Point; b: Point; t: number; bearing?: boolean; openings?: Array<{ type: string; from: number; to: number; [key: string]: unknown }> }>;
  rooms?: Array<{ at: Point; name: string; [key: string]: unknown }>;
  furniture?: Array<{ key: string; at: Point; rot?: number; [key: string]: unknown }>;
  [key: string]: unknown;
};
export function isBuilding(plan: InternalPlan): plan is BuildingPlan {
  return plan.kind === 'building';
}
