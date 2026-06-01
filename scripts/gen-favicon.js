/**
 * Regenerate the favicon/icon raster assets from the BLACK luwi tile SVG.
 *
 * Source of truth: frontend/public/assets/luwi/luwi-logo-black.svg (black squircle + white mark).
 * Outputs (Next.js App Router picks these up at build time):
 *   frontend/src/app/icon.png        (512x512)
 *   frontend/src/app/apple-icon.png  (180x180)
 *   frontend/src/app/favicon.ico     (16/32/48, PNG-encoded frames)
 *   frontend/public/assets/luwi/luwi-logo-black-512.png (reusable asset)
 *
 * Uses sharp (already a frontend dep). ImageMagick is NOT used (on Windows `convert`
 * is the filesystem tool, not IM). Run: node scripts/gen-favicon.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require(path.join(__dirname, '..', 'frontend', 'node_modules', 'sharp'));

const APP = path.join(__dirname, '..', 'frontend', 'src', 'app');
const ASSETS = path.join(__dirname, '..', 'frontend', 'public', 'assets', 'luwi');
const SRC_SVG = path.join(ASSETS, 'luwi-logo-black.svg');

function pngBuffer(size) {
    // high density so the SVG rasterizes crisply at small sizes
    return sharp(SRC_SVG, { density: 512 }).resize(size, size, { fit: 'contain' }).png().toBuffer();
}

// Assemble an .ico containing PNG-encoded frames (supported by all modern browsers + Win Vista+).
function buildIco(frames) {
    const count = frames.length;
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type = icon
    header.writeUInt16LE(count, 4);

    const dir = Buffer.alloc(16 * count);
    let offset = 6 + 16 * count;
    for (let i = 0; i < count; i++) {
        const { size, data } = frames[i];
        const base = i * 16;
        dir.writeUInt8(size >= 256 ? 0 : size, base + 0);  // width (0 => 256)
        dir.writeUInt8(size >= 256 ? 0 : size, base + 1);  // height
        dir.writeUInt8(0, base + 2);   // palette count
        dir.writeUInt8(0, base + 3);   // reserved
        dir.writeUInt16LE(1, base + 4);   // color planes
        dir.writeUInt16LE(32, base + 6);  // bits per pixel
        dir.writeUInt32LE(data.length, base + 8);  // size of image data
        dir.writeUInt32LE(offset, base + 12);       // offset of image data
        offset += data.length;
    }
    return Buffer.concat([header, dir, ...frames.map(f => f.data)]);
}

(async () => {
    fs.writeFileSync(path.join(APP, 'icon.png'), await pngBuffer(512));
    fs.writeFileSync(path.join(APP, 'apple-icon.png'), await pngBuffer(180));
    fs.writeFileSync(path.join(ASSETS, 'luwi-logo-black-512.png'), await pngBuffer(512));

    const frames = [];
    for (const size of [16, 32, 48]) frames.push({ size, data: await pngBuffer(size) });
    fs.writeFileSync(path.join(APP, 'favicon.ico'), buildIco(frames));

    console.log('Regenerated black favicon assets: icon.png(512), apple-icon.png(180), favicon.ico(16/32/48), luwi-logo-black-512.png');
})().catch(e => { console.error(e); process.exit(1); });
