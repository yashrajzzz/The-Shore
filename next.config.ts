import type { NextConfig } from "next";
import type { RemotePattern } from 'next/dist/shared/lib/image-config';

const supabaseHost = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return null;
    return new URL(url).hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  images: {
    // remotePatterns shape can be environment-driven; cast to any to avoid strict RemotePattern typing issues in some environments
    remotePatterns: (
      [
        ...(supabaseHost ? [{ protocol: 'https', hostname: supabaseHost, port: '', pathname: '/**' }] : []),
        { protocol: 'https', hostname: 'i.ytimg.com', port: '', pathname: '/**' },
        { protocol: 'https', hostname: '*.ytimg.com', port: '', pathname: '/**' },
        { protocol: 'https', hostname: '*.googleusercontent.com', port: '', pathname: '/**' },
      ]
    ) as unknown as RemotePattern[],
  },
};

export default nextConfig;
