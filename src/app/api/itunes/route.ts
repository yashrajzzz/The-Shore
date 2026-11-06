import { NextRequest, NextResponse } from 'next/server';

/**
 * Song search.
 *
 * iTunes returns results in a loose "relevance" order where covers, karaoke,
 * lullaby and remix versions often crowd out the original track, and only a
 * handful are returned. So we:
 *  1. ask for many results from two storefronts (US + IN) in parallel,
 *  2. de-duplicate,
 *  3. re-rank: query-word match first, originals before covers/remixes.
 */

type ITunesItem = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
};

const STOREFRONTS = ['US', 'IN'];
const FETCH_LIMIT = 50;

// Low-quality "versions" that bury the real song. Ignored if the user typed them.
const JUNK = /karaoke|tribute|made famous|originally performed|in the style of|lullaby|rockabye|kidz bop|workout|\b8d\b|sleep version|nightcore|piano dreamers|\blofi\b|lo-fi|instrumental|backing track|ringtone|sped up|slowed|reverb|music box|8-bit|cover version|relaxing|meditation|smooth jazz|string quartet|vitamin string|\bcover\b/i;
const VARIANT = /remix|\blive\b|acoustic|radio edit|extended|mashup|\bmix\b|\bedit\b|version|unplugged|demo|reprise|stripped/i;

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ऀ-ॿ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreItem(item: ITunesItem, queryNorm: string, queryTokens: string[], index: number) {
  const hay = normalize(`${item.trackName} ${item.artistName}`);
  const words = new Set(hay.split(' '));
  const hit = queryTokens.filter((t) => words.has(t) || hay.includes(t)).length;
  let score = (queryTokens.length ? hit / queryTokens.length : 0) * 100;

  // Compare titles without "(feat. X)" / "[...]" / "- From ..." suffixes.
  const title = normalize(item.trackName.replace(/[([].*?[)\]]/g, ' ').replace(/\s-\s.*$/, ''));
  if (queryNorm && title === queryNorm) score += 25; // exact title
  else if (queryNorm && title.startsWith(queryNorm)) score += 10;

  const label = `${item.trackName} ${item.artistName} ${item.collectionName ?? ''}`;
  const typedJunk = JUNK.test(queryNorm);
  const typedVariant = VARIANT.test(queryNorm);
  if (!typedJunk && JUNK.test(label)) score -= 70;
  if (!typedVariant && VARIANT.test(item.trackName)) score -= 15;
  if (!item.previewUrl) score -= 5;

  // iTunes' own order already reflects popularity — keep a good part of it.
  score -= index * 0.5;
  return score;
}

async function fetchStorefront(term: string, country: string): Promise<ITunesItem[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=${FETCH_LIMIT}&country=${country}`;
  const res = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(`iTunes ${country} returned ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 40);

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter "q"' }, { status: 400 });
  }

  const settled = await Promise.allSettled(STOREFRONTS.map((c) => fetchStorefront(query, c)));
  const lists = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));

  if (lists.length === 0) {
    console.error('iTunes API error:', settled.map((r) => (r.status === 'rejected' ? String(r.reason) : '')).join('; '));
    return NextResponse.json({ error: 'Failed to fetch from iTunes' }, { status: 502 });
  }

  const queryNorm = normalize(query);
  const queryTokens = queryNorm.split(' ').filter(Boolean);

  // Merge + de-duplicate by (title, main artist), keeping the best-scored copy.
  const best = new Map<string, { item: ITunesItem; score: number; seen: number }>();
  lists.forEach((list) => {
    list.forEach((item, index) => {
      if (!item.trackId || !item.trackName) return;
      const key = `${normalize(item.trackName)}|${normalize(item.artistName).split(' ')[0]}`;
      const score = scoreItem(item, queryNorm, queryTokens, index);
      const prev = best.get(key);
      if (!prev) best.set(key, { item, score, seen: 1 });
      else {
        prev.seen += 1; // listed in both storefronts => widely available/popular
        if (score > prev.score) { prev.item = item; prev.score = score; }
      }
    });
  });

  const results = [...best.values()]
    .sort((a, b) => b.score + (b.seen > 1 ? 8 : 0) - (a.score + (a.seen > 1 ? 8 : 0)))
    .slice(0, limit)
    .map(({ item }) => ({
      trackId: item.trackId,
      trackName: item.trackName,
      artistName: item.artistName,
      collectionName: item.collectionName,
      artworkUrl100: item.artworkUrl100,
      previewUrl: item.previewUrl,
      trackTimeMillis: item.trackTimeMillis,
    }));

  return NextResponse.json({ resultCount: results.length, results });
}
