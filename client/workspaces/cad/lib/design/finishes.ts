// Finishes and 3D looks the designer knows, with the names people use for them.

/** Floor finishes (room.mat). */
export const FLOOR_MATS: Record<string, string[]> = {
  oak: ['橡木', '木地板', '实木地板', '复合地板'], walnut: ['胡桃木', '胡桃木地板'], herring: ['人字拼', '人字拼地板', '鱼骨拼'], tile: ['大板', '瓷砖', '地砖', '灰白'],
  marble: ['大理石', '岩板'], cement: ['微水泥', '水泥'], terrazzo: ['水磨石'], carpet: ['地毯'], bath: ['防滑'], epoxy: ['环氧'], deck: ['木塑', '户外木'],
  paving: ['石材铺装', '庭院石'], grass: ['草坪'],
};
/** Wall finishes (room.wallMat). */
export const WALL_MATS: Record<string, string[]> = {
  latexWhite: ['白色', '白墙', '白色乳胶漆'], latexGrey: ['浅灰', '灰色'], latexSage: ['灰绿', '绿色'], latexWarm: ['奶咖', '米色', '暖色', '奶油'],
  wallpaper: ['墙布', '壁纸', '墙纸'], wallTile: ['墙砖', '瓷砖墙'], woodPanel: ['木饰面', '护墙板'],
};
/** Skirting boards (room.skirting). */
export const SKIRTINGS: Record<string, string[]> = { none: ['无', '不要', '隐形', '不做'], wood: ['实木', '木'], metal: ['金属', '铝', '不锈钢'] };
/** 3D style (plan.look.style). */
export const LOOK_STYLES: Record<string, string[]> = { real: ['写实'], diorama: ['沙盘', '模型', '微缩'], colorplan: ['彩平'] };
/** 3D palette (plan.look.palette); it changes the 3D display only, not the plan's finishes. */
export const LOOK_PALETTES: Record<string, string[]> = {
  plan: ['方案原色', '原色', '默认'], cream: ['奶油'], wood: ['原木'], morandi: ['莫兰迪'], wabi: ['侘寂'], nordic: ['北欧'], midcentury: ['中古'],
  chinese: ['新中式', '中式'], french: ['法式'], industrial: ['工业'], mono: ['极简', '黑白'], coastal: ['海风', '地中海'], dusk: ['夜景', '深色'],
};

/** A key from a key or a Chinese name ("人字拼地板" → herring); undefined when the designer has none like it. */
export function finish(table: Record<string, string[]>, value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  if (table[text]) return text;
  // The longest matching name wins: "胡桃木地板" is walnut, not the generic "木地板".
  let best: [string, number] | undefined;
  for (const [key, names] of Object.entries(table)) for (const name of names) if (text.includes(name) && name.length > (best?.[1] ?? 0)) best = [key, name.length];
  return best?.[0];
}
