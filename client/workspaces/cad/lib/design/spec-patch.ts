import type { HouseSpec } from './types';
import type { OpsTouched } from './plan-ops';

/**
 * RFC 6902 JSON Patch on a HouseSpec: the model edits any field of the designer's own format
 * (designer/reference/spec-format.md) without sending the whole spec back.
 */
export type SpecPatchOp =
  | { op: 'add' | 'replace' | 'test'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'move' | 'copy'; from: string; path: string };

const unescape = (token: string) => token.replace(/~1/g, '/').replace(/~0/g, '~');
function tokens(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`路径 ${pointer} 要以 / 开头（JSON Pointer，例如 /rooms/2/mat）`);
  return pointer.slice(1).split('/').map(unescape);
}
type Container = Record<string, unknown> | unknown[];
function parentOf(root: unknown, pointer: string): { parent: Container; key: string } {
  const list = tokens(pointer);
  if (!list.length) throw new Error('不能替换整个 spec，请写到具体字段');
  let node = root;
  for (const token of list.slice(0, -1)) {
    if (Array.isArray(node)) node = node[Number(token)];
    else if (node && typeof node === 'object') node = (node as Record<string, unknown>)[token];
    else node = undefined;
    if (node === undefined || node === null || typeof node !== 'object') throw new Error(`路径 ${pointer} 不存在（${token} 处断了），请对照当前 designSpec`);
  }
  return { parent: node as Container, key: list[list.length - 1] };
}
function index(list: unknown[], key: string, pointer: string, adding: boolean): number {
  if (adding && key === '-') return list.length;
  const at = Number(key);
  if (!/^\d+$/.test(key) || at > list.length || (!adding && at === list.length)) throw new Error(`路径 ${pointer} 的下标 ${key} 越界（数组长度 ${list.length}）`);
  return at;
}
function get(root: unknown, pointer: string): unknown {
  let node = root;
  for (const token of tokens(pointer)) {
    node = Array.isArray(node) ? node[Number(token)] : node && typeof node === 'object' ? (node as Record<string, unknown>)[token] : undefined;
    if (node === undefined) throw new Error(`路径 ${pointer} 不存在`);
  }
  return node;
}
function add(root: unknown, pointer: string, value: unknown) {
  const { parent, key } = parentOf(root, pointer);
  if (Array.isArray(parent)) parent.splice(index(parent, key, pointer, true), 0, value);
  else parent[key] = value;
}
function remove(root: unknown, pointer: string): unknown {
  const { parent, key } = parentOf(root, pointer);
  if (Array.isArray(parent)) return parent.splice(index(parent, key, pointer, false), 1)[0];
  if (!(key in parent)) throw new Error(`路径 ${pointer} 不存在，无法删除`);
  const old = parent[key];
  delete parent[key];
  return old;
}

/** Apply a patch to a copy of the spec; every op must apply, or nothing does. */
export function applySpecPatch(spec: HouseSpec, patch: SpecPatchOp[]): HouseSpec {
  if (!Array.isArray(patch) || !patch.length) throw new Error('patch 必须是非空数组');
  const root = structuredClone(spec);
  patch.forEach((operation, at) => {
    try {
      if (!operation || typeof operation !== 'object' || typeof operation.path !== 'string') throw new Error('每条都要有 op 和 path');
      switch (operation.op) {
        case 'add': add(root, operation.path, structuredClone(operation.value)); break;
        case 'remove': remove(root, operation.path); break;
        case 'replace': {
          // The exported spec leaves default fields out (hinge "from", side +1…), so replacing a missing
          // object field sets it; array items still have to exist.
          const { parent, key } = parentOf(root, operation.path);
          if (!Array.isArray(parent) && !(key in parent)) parent[key] = structuredClone(operation.value);
          else { remove(root, operation.path); add(root, operation.path, structuredClone(operation.value)); }
          break;
        }
        case 'move': { const value = remove(root, operation.from); add(root, operation.path, value); break; }
        case 'copy': add(root, operation.path, structuredClone(get(root, operation.from))); break;
        case 'test': if (JSON.stringify(get(root, operation.path)) !== JSON.stringify(operation.value)) throw new Error(`test 不通过：${operation.path}`); break;
        default: throw new Error(`op 只能是 add / remove / replace / move / copy / test`);
      }
    } catch (reason) {
      throw new Error(`patch 第 ${at + 1} 条（${(operation as { op?: string })?.op} ${(operation as { path?: string })?.path}）：${reason instanceof Error ? reason.message : String(reason)}`);
    }
  });
  return root;
}

/**
 * What a patch touches, by path, in the same terms as cad_ops: wall / opening / furniture / structure
 * edits make the session lay out MEP again; MEP points are hand edits; finishes and the 3D look are neither.
 */
export function patchTouches(patch: SpecPatchOp[]): OpsTouched & { comments: boolean } {
  const touched = { layout: false, elec: false, finish: false, look: false, relayoutElec: false, comments: false };
  for (const operation of patch) {
    const parts = tokens(operation.path).map(String);
    const at = parts[0] === 'floors' ? parts.slice(2) : parts;
    const [section, , field] = at;
    if (section === 'elec') touched.elec = true;
    else if (section === 'autoElec') touched.relayoutElec = true;
    else if (section === 'look') touched.look = true;
    else if (section === 'comments') touched.comments = true;
    else if (section === 'rooms' && field && ['mat', 'wallMat', 'tile', 'skirting', 'ceil'].includes(field)) touched.finish = true;
    else if (section === 'furniture' && field && ['color', 'opt', 'name', 'price', 'brand'].includes(field)) touched.finish = true;
    else if (['name', 'phase', 'north', 'site', 'mep', 'style', 'height', 'dims', 'expectDims', 'heightFrom'].includes(section)) touched.finish = true;
    else touched.layout = true;
  }
  return touched;
}
