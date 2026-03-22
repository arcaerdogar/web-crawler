export const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'it', 'in', 'on', 'at', 'to', 'of', 'and', 'or', 'but',
  'for', 'with', 'from', 'this', 'that', 'are', 'was', 'be', 'as', 'by', 'we',
  'he', 'she', 'they', 'do', 'not', 'have', 'has', 'had', 'will', 'would', 'can',
  'could', 'should', 'may', 'might', 'its', 'our', 'your', 'their', 'been'
]);

export function extractLinks(html: string, baseUrl: string): string[] {
  const regex = /<a[^>]+href=["']([^"']+)["']/gi;
  const links: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1], baseUrl).toString();
      links.push(resolved);
    } catch {
      // skip invalid URLs
    }
  }

  return links;
}

export function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
}

export function countFrequencies(tokens: string[]): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const token of tokens) {
    freq[token] = (freq[token] ?? 0) + 1;
  }
  return freq;
}
