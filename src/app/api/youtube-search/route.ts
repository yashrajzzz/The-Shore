import { NextRequest, NextResponse } from 'next/server';

/**
 * YouTube Video Search API Route
 *
 * Uses multiple strategies to find YouTube video IDs:
 * 1. Invidious API instances (raced in parallel for speed)
 * 2. YouTube HTML scraping as final fallback
 *
 * Flow: iTunes search → user picks song → this route finds YouTube video ID → IFrame API plays it
 */

interface YouTubeResult {
  videoId: string;
  title: string;
  duration: number | null;
  uploaderName: string;
  thumbnail: string;
}

// Invidious instances with public API access — raced in parallel
const INVIDIOUS_INSTANCES = [
  'https://invidious.f5.si',
  'https://yt.chocolatemoo53.com',
  'https://invidious.tiekoetter.com',
  'https://invidious.nerdvpn.de',
  'https://inv.nadeko.net',
];

/**
 * Try a single Invidious instance. Returns results or throws.
 */
async function tryInvidiousInstance(
  instance: string,
  query: string,
  signal: AbortSignal
): Promise<YouTubeResult[]> {
  const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance`;

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('empty results');
  }

  const results: YouTubeResult[] = [];

  for (const item of data) {
    if (item.type !== 'video' || !item.videoId) continue;

    results.push({
      videoId: item.videoId,
      title: item.title || '',
      duration: item.lengthSeconds || null,
      uploaderName: item.author || '',
      thumbnail:
        item.videoThumbnails?.[0]?.url ||
        `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
    });

    if (results.length >= 5) break;
  }

  if (results.length === 0) {
    throw new Error('no video results in response');
  }

  return results;
}

/**
 * Race all Invidious instances in parallel — first successful response wins.
 * Uses a shared AbortController to cancel remaining requests once one succeeds.
 */
async function searchViaInvidious(query: string): Promise<YouTubeResult[]> {
  const controller = new AbortController();

  // Set a global timeout for the entire race
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    // Create a promise for each instance
    const promises = INVIDIOUS_INSTANCES.map(async (instance) => {
      try {
        const results = await tryInvidiousInstance(instance, query, controller.signal);
        // Cancel other in-flight requests
        controller.abort();
        return results;
      } catch (err) {
        // Re-throw so Promise.any sees this as a rejection
        throw new Error(`${instance}: ${(err as Error).message}`);
      }
    });

    const results = await Promise.any(promises);
    return results;
  } catch (err) {
    // All instances failed (AggregateError from Promise.any)
    if (err instanceof AggregateError) {
      console.error(
        'All Invidious instances failed:',
        err.errors.map((e: Error) => e.message).join('; ')
      );
    } else {
      console.error('Invidious search failed:', err);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function scrapeYouTubeSearch(query: string): Promise<YouTubeResult[]> {
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`;

  const response = await fetch(searchUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`YouTube returned ${response.status}`);
  }

  const html = await response.text();

  const dataMatch = html.match(/var ytInitialData = ({.*?});<\/script>/s);
  if (!dataMatch) {
    throw new Error('Could not extract YouTube initial data');
  }

  const data = JSON.parse(dataMatch[1]);

  const contents =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents;

  if (!Array.isArray(contents)) return [];

  const results: YouTubeResult[] = [];

  for (const section of contents) {
    const items = section?.itemSectionRenderer?.contents;
    if (!Array.isArray(items)) continue;

    for (const item of items) {
      const renderer = item?.videoRenderer;
      if (!renderer?.videoId) continue;

      let duration: number | null = null;
      const durationText = renderer.lengthText?.simpleText;
      if (typeof durationText === 'string') {
        const parts = durationText.split(':').map(Number);
        if (parts.length === 2) {
          duration = parts[0] * 60 + parts[1];
        } else if (parts.length === 3) {
          duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
      }

      results.push({
        videoId: renderer.videoId,
        title:
          renderer.title?.runs?.[0]?.text || renderer.title?.simpleText || '',
        duration,
        uploaderName:
          renderer.ownerText?.runs?.[0]?.text ||
          renderer.shortBylineText?.runs?.[0]?.text ||
          '',
        thumbnail:
          renderer.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || '',
      });

      if (results.length >= 5) break;
    }

    if (results.length >= 5) break;
  }

  return results;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json(
      { error: 'Missing query parameter "q"' },
      { status: 400 }
    );
  }

  try {
    // Strategy 1: Race Invidious instances in parallel (fast)
    let results = await searchViaInvidious(query);

    // Strategy 2: Direct YouTube scraping (fallback)
    if (results.length === 0) {
      try {
        results = await scrapeYouTubeSearch(query);
      } catch (scrapeErr) {
        console.error('YouTube scrape fallback failed:', scrapeErr);
      }
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: 'No videos found', results: [] },
        { status: 404 }
      );
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error('YouTube search error:', err);
    return NextResponse.json(
      { error: 'Search failed', results: [] },
      { status: 500 }
    );
  }
}
