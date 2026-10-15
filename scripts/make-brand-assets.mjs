// path: scripts/make-brand-assets.mjs
// Builds the favicon pack, touch icons, PWA icons and default social image from the logo mark.
// Usage: node scripts/make-brand-assets.mjs   (needs the sharp package)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
fs.mkdirSync(path.join(pub, 'brand'), { recursive: true });

const PRIMARY = '#1842b4';
const MARK_PATH = 'M9 8h3v7l6-7h3.8l-6.2 7.2L22 24h-3.7l-4.6-6.6L12 19v5H9z';

const markSvg = (size, { rounded = true, padding = 0, background = PRIMARY } = {}) => {
  const inner = size - padding * 2;
  const scale = inner / 32;
  const radius = rounded ? 8 * scale : 0;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="${rounded ? 'none' : background}"/>` +
    `<rect x="${padding}" y="${padding}" width="${inner}" height="${inner}" rx="${radius}" fill="${background}"/>` +
    `<g transform="translate(${padding} ${padding}) scale(${scale})"><path d="${MARK_PATH}" fill="#ffffff"/></g></svg>`
  );
};

const write = (name, content) => fs.writeFileSync(path.join(pub, name), content);

write('favicon.svg', markSvg(32));
write('brand/logo-icon.svg', markSvg(128));
write(
  'brand/logo-light.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="40" viewBox="0 0 240 40"><g transform="translate(4 4)">${markSvg(32).replace(/<\/?svg[^>]*>/g, '')}</g><text x="46" y="27" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" fill="#ffffff">KD SOLUTION IT</text></svg>`,
);
write(
  'brand/logo-dark.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="40" viewBox="0 0 240 40"><g transform="translate(4 4)">${markSvg(32).replace(/<\/?svg[^>]*>/g, '')}</g><text x="46" y="27" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" fill="#0f172a">KD SOLUTION IT</text></svg>`,
);

const png = async (name, svg, size) =>
  sharp(Buffer.from(svg))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(pub, name));
await png('favicon-16x16.png', markSvg(256), 16);
await png('favicon-32x32.png', markSvg(256), 32);
await png('apple-touch-icon.png', markSvg(512, { rounded: false }), 180);
await png('icon-192.png', markSvg(512), 192);
await png('icon-512.png', markSvg(512), 512);
await png('icon-maskable-512.png', markSvg(512, { rounded: false, padding: 64 }), 512);

const og =
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">` +
  `<rect width="1200" height="630" fill="#0a0f1c"/>` +
  `<g transform="translate(96 220) scale(5)">${markSvg(32).replace(/<\/?svg[^>]*>/g, '')}</g>` +
  `<text x="96" y="470" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#ffffff">KD SOLUTION IT</text>` +
  `<text x="96" y="530" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#cbd5e1">Invoicing, payments, payroll and accounting</text></svg>`;
await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toFile(path.join(pub, 'og-default.png'));

write(
  'manifest.webmanifest',
  `${JSON.stringify(
    {
      name: 'KD SOLUTION IT',
      short_name: 'KD SOLUTION',
      description: 'Invoicing, payments, payroll and accounting for growing businesses.',
      start_url: '/dashboard',
      scope: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: PRIMARY,
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2,
  )}\n`,
);
process.stdout.write('brand assets written to public/\n');
