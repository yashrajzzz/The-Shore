import { NextRequest, NextResponse } from 'next/server';

// Dynamically fetch active Piped API instances, with a hardcoded fallback
let cachedInstances: string[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getInstances(): Promise<string[]> {
  if (cachedInstances && Date.now() - cacheTime < CACHE_TTL) {
    return cachedInstances;
  }

  try {
    const res = await fetch('https://piped-instances.kavin.rocks/', {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const apis = data
        .map((i: any) => i.api_url)
        .filter((url: string) => url && url.startsWith('https://'));
      if (apis.length > 0) {
        cachedInstances = apis;
        cacheTime = Date.now();
        return apis;
      }
    }
  } catch {
    // Fallback to hardcoded
  }

  return [
    'https://api.piped.private.coffee',
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.adminforge.de',
  ];
}

async function searchWithInstance(instanceUrl: string, query: string): Promise<any> {
  const url = `${instanceUrl}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Piped API returned ${response.status}`);
  }

  return await response.json();
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter "q"' }, { status: 400 });
  }

  const instances = await getInstances();

  // Try each instance until one works
  for (const instance of instances) {
    try {
      const data = await searchWithInstance(instance, query);
      const items = data.items || [];

      // Extract video IDs from results
      const results = items
        .slice(0, 3)
        .map((item: any) => {
          const urlMatch = item.url?.match(/\/watch\?v=([^&]+)/);
          return {
            videoId: urlMatch ? urlMatch[1] : null,
            title: item.title,
            duration: item.duration,
            uploaderName: item.uploaderName,
            thumbnail: item.thumbnail,
          };
        })
        .filter((item: any) => item.videoId);

      if (results.length > 0) {
        return NextResponse.json({ results });
      }
    } catch (error) {
      console.warn(`Piped instance ${instance} failed, trying next...`);
      continue;
    }
  }

  return NextResponse.json({ error: 'Could not find video', results: [] }, { status: 404 });
}
