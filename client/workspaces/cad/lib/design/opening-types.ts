export const OPENING_DEFAULTS: Record<string, { sill: number; head: number }> = {
  door: { sill: 0, head: 2100 },
  double: { sill: 0, head: 2100 },
  unequal: { sill: 0, head: 2100 },
  sliding: { sill: 0, head: 2400 },
  folding: { sill: 0, head: 2400 },
  pocket: { sill: 0, head: 2100 },
  hole: { sill: 0, head: 2100 },
  garage: { sill: 0, head: 2400 },
  window: { sill: 900, head: 2400 },
  slideWindow: { sill: 900, head: 2400 },
  floorWindow: { sill: 0, head: 2500 },
  highWindow: { sill: 1500, head: 2100 },
  bay: { sill: 450, head: 2400 },
  glassWall: { sill: 0, head: 2600 },
};

export const OPENING_TYPES = Object.keys(OPENING_DEFAULTS);
export function isOpeningType(value: unknown): value is string {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(OPENING_DEFAULTS, value);
}
