// Generates small static webp thumbnails (first frame) for every bundled
// background, so the picker doesn't download each full GIF just to show a tile.
// Usage: node scripts/generate-thumbs.mjs
import { readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve('public');
const DIRS = ['default-backgrounds', 'backgrounds/desktop', 'backgrounds/mobile'];
const EXT = /\.(gif|png|jpe?g|webp|avif)$/i;
const WIDTH = 360;

for (const dir of DIRS) {
  const src = path.join(ROOT, dir);
  const out = path.join(src, 'thumbs');
  await mkdir(out, { recursive: true });
  for (const file of await readdir(src)) {
    if (!EXT.test(file)) continue;
    const dest = path.join(out, file.replace(EXT, '.webp'));
    // Default sharp reads only the first GIF frame.
    await sharp(path.join(src, file))
      .resize({ width: WIDTH, withoutEnlargement: true })
      .webp({ quality: 70 })
      .toFile(dest);
    console.log('thumb', path.relative(ROOT, dest));
  }
}
