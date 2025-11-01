export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (!Array.isArray(items) || chunkSize <= 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}


