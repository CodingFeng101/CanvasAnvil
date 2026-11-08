import catalog from '../../../../../resources/hpd/catalog.json';

export function isValidKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(catalog, key);
}
export function catalogPromptTable(): string {
  return ['key | 名称 | 宽×深×高 (mm)', ...Object.entries(catalog).map(([key, item]) => `${key} | ${item.name} | ${item.w}×${item.d}×${item.h}`)].join('\n');
}
export function suggestKeys(badKey: string): string[] {
  const query = badKey.toLowerCase();
  const grams = (value: string) => Array.from(value, (_, i) => value.slice(i, i + 2));
  const queryGrams = grams(query);
  return Object.entries(catalog).map(([key, item]) => {
    const text = `${key} ${item.name} ${item.type}`.toLowerCase();
    const score = queryGrams.filter(gram => text.includes(gram)).length / Math.max(queryGrams.length, 1);
    return { key, score };
  }).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)).slice(0, 3).map(item => item.key);
}

/** Chinese display name for a furniture key ("curtain" → "落地窗帘"), or the key itself. */
export function catalogName(key: string): string {
  return (catalog as Record<string, { name?: string }>)[key]?.name ?? key;
}
