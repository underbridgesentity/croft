// Generate all Croft icon assets from brand/icon-source.png (the new brand icon).
import sharp from 'sharp';

const SRC = 'brand/icon-source.png';
const BLUE = { r: 31, g: 153, b: 255 };

// --- detect the blue icon's bounding box, then crop just inside the rounded corners ---
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
let minX = width, minY = height, maxX = 0, maxY = 0;
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const i = (y * width + x) * channels, r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
  if (a > 210 && b > 110 && b > r + 15 && b >= g - 10) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
}
const size = Math.min(maxX - minX + 1, maxY - minY + 1);
const inset = Math.round(size * 0.05);
const sq = { left: minX + inset, top: minY + inset, width: size - 2 * inset, height: size - 2 * inset };

// 1024 full-bleed master
const master = await sharp(SRC).extract(sq).resize(1024, 1024).png().toBuffer();

const fullbleed = async (n, out, flat = false) => {
  let img = sharp(master).resize(n, n);
  if (flat) img = img.flatten({ background: BLUE });
  await img.png().toFile(out);
  console.log('  ', out);
};
const padded = async (n, out, frac) => {
  const inner = Math.round(n * frac);
  const icon = await sharp(master).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: n, height: n, channels: 4, background: { ...BLUE, alpha: 1 } } })
    .composite([{ input: icon, gravity: 'center' }]).flatten({ background: BLUE }).png().toFile(out);
  console.log('  ', out);
};

console.log('PWA icons:');
await fullbleed(192, 'web/public/icons/icon-192.png');
await fullbleed(512, 'web/public/icons/icon-512.png');
await padded(192, 'web/public/icons/icon-maskable-192.png', 0.8);   // Android safe zone
await padded(512, 'web/public/icons/icon-maskable-512.png', 0.8);
await fullbleed(180, 'web/public/apple-touch-icon.png', true);
await fullbleed(64, 'web/public/favicon.png', true);

console.log('iOS:');
await fullbleed(1024, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', true);
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])
  await padded(2732, `ios/App/App/Assets.xcassets/Splash.imageset/${f}`, 0.26);

console.log('done');
