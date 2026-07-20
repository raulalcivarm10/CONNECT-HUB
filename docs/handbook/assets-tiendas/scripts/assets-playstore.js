const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MOBILE = 'C:/proyectos/CONNECT-HUB/apps/mobile';
const OUT = 'C:/proyectos/capturas-playstore';
fs.mkdirSync(OUT, { recursive: true });

let raw = fs.readFileSync(path.join(MOBILE, 'assets/logo-mark.svg'), 'utf8').replace(/<\?xml[^>]*\?>/, '');
const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();

(async () => {
  // 1) Ícono 512×512 para la ficha (desde el icono 1024 ya de marca)
  await sharp(path.join(MOBILE, 'assets/images/icon.png')).resize(512, 512).png().toFile(path.join(OUT, 'icon-512.png'));

  // 2) Gráfico destacado 1024×500: degradado + cubo + nombre
  const fg = `<svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9b1ff0"/><stop offset="1" stop-color="#4a0a80"/></linearGradient></defs>
    <rect width="1024" height="500" fill="url(#g)"/>
    <rect x="80" y="110" width="280" height="280" rx="56" fill="#ffffff"/>
    <svg x="120" y="150" width="200" height="200" viewBox="1430 727 1200 1200">${inner}</svg>
    <text x="420" y="240" font-family="Arial, Helvetica, sans-serif" font-size="88" font-weight="bold" fill="#ffffff">ConnectHub+</text>
    <text x="424" y="310" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="#e9d5ff">Events, tickets &amp; networking</text>
  </svg>`;
  await sharp(Buffer.from(fg)).flatten({ background: '#4a0a80' }).png().toFile(path.join(OUT, 'feature-graphic-1024x500.png'));

  for (const f of ['icon-512.png', 'feature-graphic-1024x500.png']) {
    const m = await sharp(path.join(OUT, f)).metadata();
    console.log(`${f}: ${m.width}x${m.height} alpha=${m.hasAlpha}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
