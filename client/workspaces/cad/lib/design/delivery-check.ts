/**
 * The delivery check (交付检查) as a chat message: the designer's acceptance run on the current design
 * (designer/scripts/qa.mjs --lite --quick and qa_files.py, run by /api/cad/qa), then, as the designer's
 * GUIDE asks at delivery, what is still open: the design's own warnings, the MEP audit, the symbol list
 * and the items left to confirm.
 */

export type QaItem = { name: string; msg?: string; shot?: string };
export type QaStatus = {
  jobId: string;
  state: 'running' | 'done' | 'failed';
  error?: string;
  seconds?: number;
  total?: number;
  failed?: QaItem[];
  unverified?: QaItem[];
  shots?: string[];
  pageErrors?: string[];
  soft?: boolean;
  files?: { ok: boolean; summary?: string };
  report?: string;
};
export type DeliveryOpen = { errors: string[]; warnings: string[]; audit: string[]; recognition?: string };

/** Parentheses encoded too, so the URL survives a markdown image. */
const encode = (value: string) => encodeURIComponent(value).replace(/\(/g, '%28').replace(/\)/g, '%29');
export const shotUrl = (jobId: string, name: string) => `/api/cad/qa/shot?jobId=${encode(jobId)}&name=${encode(name)}`;

/** Screenshots worth a look: the failed and unverified steps first, then a few overall views. */
function pickShots(status: QaStatus, limit = 6): string[] {
  const named = [...(status.failed ?? []), ...(status.unverified ?? [])].map(item => item.shot).filter((shot): shot is string => !!shot);
  const overall = (status.shots ?? []).filter(shot => /鸟瞰|3D|平面|出图|打开/.test(shot));
  return [...new Set([...named, ...overall, ...(status.shots ?? [])])].slice(0, limit);
}

export function deliveryMessage(status: QaStatus, open: DeliveryOpen, zh = true): string {
  const list = (items: string[]) => items.map(item => `- ${item}`).join('\n');
  if (status.state === 'failed') {
    return [zh ? '**交付检查没跑完**' : '**The delivery check did not finish**', status.error ?? ''].filter(Boolean).join('\n\n');
  }
  const failed = status.failed ?? [];
  const total = status.total ?? 0;
  const files = status.files;
  const passed = total > 0 && !failed.length && files?.ok === true;
  const gates = !open.errors.length && !open.warnings.length && !open.audit.length;
  const parts = [
    zh
      ? `**交付检查：${passed && gates ? '通过' : '还有问题'}**（${status.seconds ?? 0} 秒）`
      : `**Delivery check: ${passed && gates ? 'passed' : 'issues left'}** (${status.seconds ?? 0}s)`,
    zh
      ? `- 设计器逐项操作（按钮、工具、面板、导出）：${total - failed.length} / ${total} 通过${status.unverified?.length ? `，${status.unverified.length} 项未验证（无显卡，看截图）` : ''}`
      : `- Designer walkthrough (buttons, tools, panels, exports): ${total - failed.length} / ${total} passed${status.unverified?.length ? `, ${status.unverified.length} unverified (no GPU, see the screenshots)` : ''}`,
    zh
      ? `- 导出文件能否打开：${files?.ok ? '通过' : '没通过'}`
      : `- Exported files open: ${files?.ok ? 'yes' : 'no'}`,
    zh
      ? `- 户型检查：${open.errors.length} 个错误、${open.warnings.length} 个警告；水电审计：${open.audit.length} 个问题`
      : `- Design check: ${open.errors.length} errors, ${open.warnings.length} warnings; MEP audit: ${open.audit.length} problems`,
  ];
  if (failed.length) parts.push(`${zh ? '**没通过的项**' : '**Failed steps**'}\n${list(failed.map(item => `${item.name}${item.msg ? `：${item.msg}` : ''}`))}`);
  if (files && !files.ok && files.summary) parts.push(`${zh ? '**导出文件**' : '**Exported files**'}\n\`\`\`\n${files.summary}\n\`\`\``);
  if (status.pageErrors?.length) parts.push(`${zh ? '**页面报错**' : '**Page errors**'}\n${list(status.pageErrors.slice(0, 5))}`);
  if (open.errors.length || open.warnings.length) parts.push(`${zh ? '**户型检查**' : '**Design check**'}\n${list([...open.errors, ...open.warnings])}`);
  if (open.audit.length) parts.push(`${zh ? '**水电审计**' : '**MEP audit**'}\n${list(open.audit)}`);
  if (open.recognition) parts.push(open.recognition);
  const shots = pickShots(status);
  if (shots.length) parts.push(`${zh ? '**截图**（要人工过一遍）' : '**Screenshots** (look them over)'}\n\n${shots.map(shot => `![${shot.replace(/\.png$/, '').replace(/[[\]]/g, '')}](${shotUrl(status.jobId, shot)})`).join('\n')}`);
  if (status.report) parts.push(zh ? `完整报告：服务器上的 \`${status.report}\`，每一步截图在同目录 shots/。` : `Full report: \`${status.report}\` on the server, every step's screenshot in shots/ next to it.`);
  return parts.join('\n\n');
}
