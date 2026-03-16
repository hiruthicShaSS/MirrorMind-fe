export type ReferenceLink = { title: string; url: string; snippet?: string };

// Best-effort client-side fetch; falls back to heuristic if blocked.
export async function buildReferenceLinks(idea: string): Promise<ReferenceLink[]> {
  const q = idea.trim();
  if (!q) return [];
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_redirect=1&no_html=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('search failed');
    const data = (await res.json()) as any;
    const topics: any[] = data?.RelatedTopics || [];
    const links: ReferenceLink[] = topics
      .map((t) => {
        const text = t?.Text || '';
        const firstUrl = t?.FirstURL || '';
        if (!text || !firstUrl) return null;
        const [title, ...rest] = text.split(' - ');
        return { title: title || text, url: firstUrl, snippet: rest.join(' - ') || text };
      })
      .filter(Boolean) as ReferenceLink[];
    return links.slice(0, 5);
  } catch {
    // Heuristic fallback
    return [
      {
        title: 'Comparable apps analysis',
        url: 'https://example.com/comparable-apps',
        snippet: `Similar apps for "${q}" with pros/cons were not fetched (offline fallback).`,
      },
    ];
  }
}
