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

/** A line of the 「图上符号 → 建模」 list (GUIDE section 2): what the drawing shows and how it was modelled. */
export type SymbolRow = { symbol: string; where?: string; count?: number; model: string };

/** How an uploaded floorplan was read (GUIDE sections 0–2), kept with the design until delivery. */
export type Recognition = {
  route: string;
  notes?: string[];
  warnings?: string[];
  /** The recognizer's check image (walls and openings drawn over the original). */
  overlay?: string;
  /** Route "dual": the furnished layout plan the furniture is read from. */
  layoutImage?: string;
  /** Route "dxf-layout": the drawing's blocks and texts. */
  inventory?: unknown;
  /** The user's answers to the 待确认清单, by topic. */
  answers?: Record<string, string[]>;
  symbols?: SymbolRow[];
  /** What is still to be confirmed (estimated storey height, unsure sills, inferred bearing walls, unknown symbols…). */
  confirm?: string[];
  /** The draft has been completed from the drawing (later messages are ordinary edits). */
  completed?: boolean;
};

export type CadDesign = {
  plan: InternalPlan;
  revision: number;
  lastSource: 'ai' | 'user' | 'recognize';
  status: 'draft' | 'confirmed';
  underlay?: Underlay;
  /** A building's underlays, one per floor (the designer preset's `underlays`). */
  underlays?: Array<Underlay | null>;
  recognition?: Recognition;
  /** MEP points were edited by hand (in the designer or on request): later layout edits leave them alone. */
  mepManual?: boolean;
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
