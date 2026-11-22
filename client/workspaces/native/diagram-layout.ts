import { arrangeDiagramXml, parseLayout, tidyIfBetter, type ArrangeResult } from '../diagram/lib/arrange';
import { lintDiagramXml } from '../diagram/lib/layout-lint';
import { buildModel } from '../diagram/lib/tidy-layout';

export async function correctDiagramLayout(currentXml: string, nextXml: string, options: { mode?: 'create' | 'edit'; layout?: string; only?: string[] } = {}) {
  const current = buildModel(currentXml);
  const mode = options.mode ?? (current.vertices.size ? 'edit' : 'create');
  let result: ArrangeResult;
  if (mode === 'create') {
    result = await arrangeDiagramXml(nextXml, parseLayout(options.layout));
  } else {
    const previous = new Map(current.cells.map(cell => [cell.id, currentXml.slice(cell.start, cell.end)]));
    const changedIds = options.only ?? buildModel(nextXml).cells
      .filter(cell => previous.get(cell.id) !== nextXml.slice(cell.start, cell.end))
      .map(cell => cell.id);
    const tidied = tidyIfBetter(nextXml, { only: changedIds });
    const original = lintDiagramXml(nextXml).score;
    const tidy = lintDiagramXml(tidied.xml).score;
    result = { ...tidied, chosen: tidied.report.applied ? 'tidy' : 'original', scores: { original, tidy },
      candidates: [{ method: 'original', xml: nextXml, score: original }, ...(tidied.report.applied ? [{ method: 'tidy' as const, xml: tidied.xml, score: tidy }] : [])],
      skipped: tidied.report.applied ? [] : [{ method: 'tidy', reason: tidied.report.reason ?? 'nothing to tidy' }] };
  }
  return { xml: result.xml, correction: {
    originalXml: nextXml, correctedXml: result.xml, mode, layout: parseLayout(options.layout),
    method: result.chosen, scores: result.scores, afterScore: lintDiagramXml(result.xml).score,
    moved: result.report.moved, straightened: result.report.straightened, reason: result.report.reason,
  } };
}
