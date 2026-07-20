const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MOBILE = 'C:/proyectos/CONNECT-HUB/apps/mobile';
const IMG = path.join(MOBILE, 'assets/images');

let raw = fs.readFileSync(path.join(MOBILE, 'assets/logo-mark.svg'), 'utf8').replace(/<\?xml[^>]*\?>/, '');
const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
// Versión monocroma: todas las caras del cubo en blanco (silueta para Android 13+)
const innerMono = inner.replace(/fill="#[0-9a-fA-F]{3,6}"/g, 'fill="#ffffff"');

const SIZE = 1024;

// FOREGROUND: cubo centrado con MUCHO aire — Android recorta a círculo la zona
// segura (66% central), así que el cubo ocupa ~55% del lienzo.
const PAD = 235, box = SIZE - PAD * 2;
const fgSvg = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <svg x="${PAD}" y="${PAD}" width="${box}" height="${box}" viewBox="1430 727 1200 1200">${inner}</svg>
</svg>`;

// BACKGROUND: mismo degradado morado profundo del ícono de iOS (opaco).
const bgSvg = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9b1ff0"/><stop offset="1" stop-color="#4a0a80"/></linearGradient></defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>
</svg>`;

// MONOCHROME: silueta blanca del cubo (transparente alrededor).
const monoSvg = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <svg x="${PAD}" y="${PAD}" width="${box}" height="${box}" viewBox="1430 727 1200 1200">${innerMono}</svg>
</svg>`;

(async () => {
  await sharp(Buffer.from(fgSvg)).png().toFile(path.join(IMG, 'android-icon-foreground.png'));
  await sharp(Buffer.from(bgSvg)).flatten({ background: '#4a0a80' }).png().toFile(path.join(IMG, 'android-icon-background.png'));
  await sharp(Buffer.from(monoSvg)).png().toFile(path.join(IMG, 'android-icon-monochrome.png'));
  for (const f of ['android-icon-foreground.png', 'android-icon-background.png', 'android-icon-monochrome.png']) {
    const m = await sharp(path.join(IMG, f)).metadata();
    console.log(`${f}: ${m.width}x${m.height} hasAlpha=${m.hasAlpha}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
