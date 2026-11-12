import type { PlanDecision } from '../../chat/cad-steps-text';

/** What the recognizer's routes are called for the user (the designer's GUIDE section 1). */
export const ROUTE_NAMES: Record<string, [zh: string, en: string]> = {
  image: ['户型图 / 截图 / 扫描件（位图识别）', 'plan image, screenshot or scan (bitmap)'],
  cadshot: ['黑底 CAD 截图（按颜色分层识别）', 'black CAD screenshot (by line colour)'],
  cad: ['CAD 矢量图纸（按尺寸标注定坐标）', 'vector CAD drawing (by its dimensions)'],
  cadpair: ['多页 CAD PDF（每页一层）', 'multi-page CAD PDF (a floor per page)'],
  building: ['多层 / 描边墙图纸（逐层拆分）', 'multi-floor or outlined-wall drawing (split by floor)'],
  'dxf-layout': ['装修公司家具布置图 DXF（块清单）', 'furniture-layout DXF (block list)'],
  dual: ['原图 + 装修平面布置图（墙按原图，家具按布置图）', 'original plan + layout plan (walls from the first, furniture from the second)'],
};

type Result = { route?: string; notes?: string[]; warnings?: string[] };

/** The recognition result, before the 待确认清单. */
export function recognitionSummary(result: Result, walls: number, openings: number, floors: number, zh = true): string {
  const route = ROUTE_NAMES[String(result.route)]?.[zh ? 0 : 1] ?? String(result.route ?? '');
  const lines = [
    zh ? `识别路线：${route}` : `Route: ${route}`,
    zh ? `- 墙 ${walls} 面，门窗洞口 ${openings} 个${floors > 1 ? `，${floors} 层` : ''}` : `- ${walls} walls, ${openings} openings${floors > 1 ? `, ${floors} floors` : ''}`,
    ...(result.notes ?? []).map(note => `- ${note}`),
    ...(result.warnings ?? []).map(warning => `- ⚠ ${warning}`),
    zh
      ? '原图已作为底图（设计器「户型」面板可以显示 / 隐藏）。识别只给出墙和门窗洞口；房间、门窗类型和开向、承重、尺寸链、家具和水电由 AI 读原图补全，先确认下面几项。'
      : 'The original is shown as underlay. Recognition gives walls and openings only; the model reads the drawing for rooms, opening types and swings, bearing walls, dimension chains, furniture and MEP. Settle these first.',
  ];
  return lines.join('\n\n');
}

/** The designer's GUIDE section 0 (待确认清单) as clickable decisions; the first option is the GUIDE's default. */
export function floorplanQuestions(dual: boolean, building: boolean, zh = true): PlanDecision[] {
  const q = (topic: string, question: string, options: string[], group = zh ? '还原' : 'Reconstruction'): PlanDecision => ({ group, topic, question, options, choice: options[0] });
  const list: PlanDecision[] = zh
    ? [
        q('还原方式', '图上的家具、柜子、洁具、符号、电箱', ['一比一还原图上内容，再补没有的', '只照图放主要家具，其余补最优搭配']),
        q('公共区', '电梯厅、楼梯间、强弱电井、风井、管井', ['还原墙体和设备，不布家具', '还原并布置家具', '不还原']),
        ...(dual ? [q('两张图以谁为准', '原图和装修平面布置图', ['墙按原图、家具按布置图', '墙和家具都按布置图'])] : []),
        q('不认识的符号', '图上看不懂的图例', ['列出来问我（标为待确认）', '按最接近的家具处理，并在清单里标出']),
        q('层高', '图上没标时', ['按常规估 2800（标为估算）', '2700', '2900', '3000'], '图上没标的参数'),
        ...(building ? [q('楼板厚', '图上没标时', ['按常规估 120（标为估算）', '100', '150'], '图上没标的参数')] : []),
        q('窗台高', '看不出窗台高的玻璃 / 窗', ['按常规估（普通窗 900、飘窗 450、落地窗 0），标为待确认', '都按落地窗', '都按普通窗 900'], '图上没标的参数'),
      ]
    : [
        q('Restore', 'furniture, cabinets, fixtures, symbols, panels on the drawing', ['Restore everything drawn one to one, then add what is missing', 'Only the main furniture as drawn, the rest chosen for me']),
        q('Common areas', 'lift lobby, stairwell, shafts', ['Walls and equipment, no furniture', 'Restore and furnish', 'Leave out']),
        ...(dual ? [q('Which drawing wins', 'original vs layout plan', ['Walls from the original, furniture from the layout plan', 'Both from the layout plan'])] : []),
        q('Unknown symbols', 'legend items you cannot read', ['List them and ask me (marked to confirm)', 'Use the closest furniture and mark it in the list']),
        q('Storey height', 'when the drawing has none', ['Estimate 2800 (marked as estimated)', '2700', '2900', '3000'], 'Not on the drawing'),
        ...(building ? [q('Slab', 'when the drawing has none', ['Estimate 120 (marked as estimated)', '100', '150'], 'Not on the drawing')] : []),
        q('Window sills', 'glass or windows without a sill height', ['Estimate (window 900, bay 450, floor window 0), marked unsure', 'All floor-to-ceiling', 'All 900'], 'Not on the drawing'),
      ];
  return list;
}
