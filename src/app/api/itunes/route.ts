import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  const limit = searchParams.get('limit') || '15';

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter "q"' }, { status: 400 });
  }

  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`;
    const response = await fetch(itunesUrl, { next: { revalidate: 300 } });

    if (!response.ok) {
      throw new Error(`iTunes API returned ${response.status}`);
    }

    const data = await response.json();

    // Return only the fields we need to minimize payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = data.results.map((item: any) => ({
      trackId: item.trackId,
      trackName: item.trackName,
      artistName: item.artistName,
      collectionName: item.collectionName,
      artworkUrl100: item.artworkUrl100,
      previewUrl: item.previewUrl,
      trackTimeMillis: item.trackTimeMillis,
    }));

    return NextResponse.json({ resultCount: data.resultCount, results });
  } catch (error: unknown) {
    console.error('iTunes API error:', error);
    return NextResponse.json({ error: 'Failed to fetch from iTunes' }, { status: 502 });
  }
}
