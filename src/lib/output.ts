interface IncludesObject {
  users?: any[];
  media?: any[];
  tweets?: any[];
  polls?: any[];
  places?: any[];
}

export function mergeIncludes(target: IncludesObject, source: IncludesObject): IncludesObject {
  const result = { ...target };
  for (const key of ['users', 'media', 'tweets', 'polls', 'places'] as const) {
    if (source[key]) {
      const existing = result[key] ?? [];
      const existingIds = new Set(existing.map((item: any) => item.id ?? item.media_key));
      const newItems = source[key]!.filter((item: any) => !existingIds.has(item.id ?? item.media_key));
      result[key] = [...existing, ...newItems];
    }
  }
  return result;
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
