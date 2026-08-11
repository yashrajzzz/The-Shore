import { NextRequest, NextResponse } from 'next/server';

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.in.projectsegfau.lt',
];

async function searchWithInstance(instanceUrl: string, query: string): Promise<any> {
  const url = `${instanceUrl}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Piped API returned ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter "q"' }, { status: 400 });
  }

  // Try each Piped instance until one works
  for (const instance of PIPED_INSTANCES) {
    try {
      const data = await searchWithInstance(instance, query);
      const items = data.items || [];

      if (items.length === 0) continue;

      // Return the top 3 results so the caller can pick
      const results = items.slice(0, 3).map((item: any) => {
        // Extract video ID from /watch?v=XXXX URL format
        const urlMatch = item.url?.match(/\/watch\?v=([^&]+)/);
        const videoId = urlMatch ? urlMatch[1] : null;

        return {
          videoId,
          title: item.title,
          duration: item.duration, // in seconds
          uploaderName: item.uploaderName,
          thumbnail: item.thumbnail,
        };
      }).filter((item: any) => item.videoId);

      if (results.length > 0) {
        return NextResponse.json({ results });
      }
    } catch (error) {
      console.warn(`Piped instance ${instance} failed:`, error);
      continue;
    }
  }

  return NextResponse.json({ error: 'Could not find video', results: [] }, { status: 404 });
}
