const { chromium } = require('playwright');
const fs = require('fs');

const OUT = 'C:/proyectos/capturas-playstore';
const BASE = 'http://localhost:8100';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // Tokens reales de la cuenta demo contra el API local (misma BD que prod)
  const res = await fetch('http://localhost:4000/public/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD }),
  });
  const { accessToken, refreshToken } = await res.json();
  if (!accessToken) throw new Error('login API falló');
  console.log('tokens OK');

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 720 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  // Sesión inyectada ANTES de que cargue la app (tokenStorage web = localStorage)
  await ctx.addInitScript(([a, r]) => {
    localStorage.setItem('ch.asist.access', a);
    localStorage.setItem('ch.asist.refresh', r);
  }, [accessToken, refreshToken]);

  const page = await ctx.newPage();
  const shot = async (name, ms = 9000) => {
    await page.waitForTimeout(ms);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log('✓', name);
  };

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await shot('02-home', 14000); // bootstrap + sync institución + imágenes NAS

  await page.goto(`${BASE}/evento/147`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await shot('03-evento', 10000);

  await page.goto(`${BASE}/entrada/665`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await shot('04-ticket', 8000);

  await page.goto(`${BASE}/agenda`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await shot('05-agenda', 8000);

  await page.goto(`${BASE}/comunidad`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await shot('06-comunidad', 8000);

  await browser.close();
  console.log('LISTO');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
