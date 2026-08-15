/**
 * Genera el manual de producto en PDF (inglés) a partir de las secciones en
 * Markdown: convierte a HTML con estilos propios y lo imprime con Chrome
 * headless. Uso: node docs/pdf/build-pdf.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = __dirname;
const secciones = JSON.parse(fs.readFileSync(path.join(DIR, '_secciones.json'), 'utf8'));

/* ---------- Markdown → HTML (subset: headings, tablas, listas, código, énfasis) ---------- */
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function mdToHtml(md) {
  const out = [];
  const lines = md.split('\n');
  let i = 0;
  let listaAbierta = null; // 'ul' | 'ol'
  const cerrarLista = () => {
    if (listaAbierta) { out.push(`</${listaAbierta}>`); listaAbierta = null; }
  };

  while (i < lines.length) {
    const l = lines[i];

    // bloque de código
    if (/^```/.test(l.trim())) {
      cerrarLista();
      const lang = l.trim().slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) buf.push(lines[i++]);
      i++;
      out.push(`<pre class="code"${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // tabla
    if (/^\s*\|/.test(l) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      cerrarLista();
      const celdas = (fila) =>
        fila.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = celdas(l);
      i += 2;
      const filas = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) filas.push(celdas(lines[i++]));
      out.push(
        `<table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead>` +
          `<tbody>${filas
            .map((f) => `<tr>${f.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
            .join('')}</tbody></table>`,
      );
      continue;
    }

    // encabezados
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      cerrarLista();
      const n = h[1].length;
      const txt = inline(h[2]);
      const id = h[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      out.push(`<h${n} id="${id}">${txt}</h${n}>`);
      i++;
      continue;
    }

    // separador
    if (/^\s*---+\s*$/.test(l)) { cerrarLista(); out.push('<hr/>'); i++; continue; }

    // cita
    if (/^\s*>\s?/.test(l)) {
      cerrarLista();
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }

    // listas
    const li = l.match(/^\s*[-*]\s+(.*)$/);
    const oli = l.match(/^\s*\d+\.\s+(.*)$/);
    if (li || oli) {
      const tipo = li ? 'ul' : 'ol';
      if (listaAbierta && listaAbierta !== tipo) cerrarLista();
      if (!listaAbierta) { out.push(`<${tipo}>`); listaAbierta = tipo; }
      out.push(`<li>${inline((li || oli)[1])}</li>`);
      i++;
      continue;
    }

    // párrafo
    if (l.trim() === '') { cerrarLista(); i++; continue; }
    const buf = [l];
    i++;
    while (i < lines.length && lines[i].trim() !== '' &&
           !/^\s*[-*]\s|^\s*\d+\.\s|^#{1,4}\s|^\s*\||^```|^\s*>/.test(lines[i])) {
      buf.push(lines[i++]);
    }
    cerrarLista();
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  cerrarLista();
  return out.join('\n');
}

/* ---------- documento ---------- */
const ORDEN = [
  'Administration Panel',
  'Roles, Permissions & Event Approval Workflow',
  'Mobile App (Attendees)',
  'Integrations & QR Check-in API',
];
const ordenadas = ORDEN.map((t) => secciones.find((s) => s.titulo === t)).filter(Boolean);
for (const s of secciones) if (!ordenadas.includes(s)) ordenadas.push(s);

const hoy = process.env.FECHA_DOC || new Date().toISOString().slice(0, 10);

const toc = ordenadas
  .map((s, n) => `<li><span class="tocn">${n + 1}</span> ${esc(s.titulo)}</li>`)
  .join('');

const cuerpo = ordenadas
  .map(
    (s, n) => `<section class="seccion">
  <div class="sec-num">Section ${n + 1}</div>
  <h1>${esc(s.titulo)}</h1>
  ${mdToHtml(s.markdown)}
</section>`,
  )
  .join('\n');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>ConnectHub+ — Product Documentation</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: #1f2430; font-size: 10.5pt; line-height: 1.55; margin: 0; }
  .portada { height: 247mm; display: flex; flex-direction: column;
             justify-content: center; page-break-after: always; }
  .marca { color: #6d28d9; font-weight: 800; letter-spacing: .18em;
           text-transform: uppercase; font-size: 11pt; }
  .portada h1 { font-size: 34pt; line-height: 1.1; margin: 8mm 0 4mm;
                color: #17103a; letter-spacing: -.5pt; }
  .portada .sub { font-size: 13pt; color: #52586b; max-width: 130mm; }
  .portada .meta { margin-top: 16mm; font-size: 10pt; color: #6b7280;
                   border-top: 2px solid #ede9fe; padding-top: 5mm; }
  .barra { height: 6px; width: 60mm; background: linear-gradient(90deg,#6d28d9,#a78bfa);
           border-radius: 3px; margin-bottom: 6mm; }
  .toc { page-break-after: always; }
  .toc h2 { color: #17103a; font-size: 18pt; margin-bottom: 6mm; }
  .toc ol { list-style: none; padding: 0; }
  .toc li { padding: 3.5mm 0; border-bottom: 1px solid #eef0f4; font-size: 12pt; }
  .tocn { display: inline-block; width: 9mm; height: 9mm; line-height: 9mm;
          text-align: center; background: #f5f3ff; color: #6d28d9;
          border-radius: 50%; font-weight: 700; font-size: 10pt; margin-right: 4mm; }
  .seccion { page-break-before: always; }
  .sec-num { color: #8b5cf6; font-weight: 700; font-size: 9pt;
             letter-spacing: .14em; text-transform: uppercase; }
  h1 { font-size: 23pt; color: #17103a; margin: 2mm 0 6mm; letter-spacing: -.3pt;
       border-bottom: 3px solid #ede9fe; padding-bottom: 3mm; }
  h2 { font-size: 15pt; color: #4c1d95; margin: 9mm 0 3mm; page-break-after: avoid; }
  h3 { font-size: 12pt; color: #312e81; margin: 6mm 0 2mm; page-break-after: avoid; }
  h4 { font-size: 11pt; color: #3f3f56; margin: 5mm 0 2mm; }
  p { margin: 0 0 3mm; text-align: justify; }
  ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
  li { margin-bottom: 1.6mm; }
  table { width: 100%; border-collapse: collapse; margin: 3mm 0 5mm;
          font-size: 9.5pt; page-break-inside: avoid; }
  th { background: #f5f3ff; color: #4c1d95; text-align: left; font-weight: 700;
       padding: 2.4mm 3mm; border-bottom: 2px solid #ddd6fe; }
  td { padding: 2.2mm 3mm; border-bottom: 1px solid #eef0f4; vertical-align: top; }
  tr:nth-child(even) td { background: #fbfaff; }
  code { font-family: "Cascadia Mono", Consolas, monospace; font-size: 9pt;
         background: #f4f4f7; padding: .4mm 1.2mm; border-radius: 3px; color: #5b21b6; }
  pre.code { background: #17103a; color: #e9e6ff; padding: 4mm; border-radius: 4px;
             overflow: hidden; page-break-inside: avoid; margin: 3mm 0 5mm; }
  pre.code code { background: none; color: inherit; font-size: 8.6pt;
                  white-space: pre-wrap; word-break: break-word; }
  blockquote { border-left: 3px solid #a78bfa; background: #faf9ff; margin: 3mm 0;
               padding: 2.5mm 4mm; color: #4b5563; font-size: 10pt; }
  hr { border: none; border-top: 1px solid #eef0f4; margin: 6mm 0; }
  a { color: #6d28d9; text-decoration: none; }
</style></head><body>

<div class="portada">
  <div class="barra"></div>
  <div class="marca">ConnectHub+</div>
  <h1>Product Documentation</h1>
  <div class="sub">Event management platform — administration panel, attendee mobile
  apps, roles &amp; approval workflow, and QR check-in integration.</div>
  <div class="meta">
    <strong>Audience:</strong> partners and integration teams<br/>
    <strong>Version:</strong> 1.0 &nbsp;·&nbsp; <strong>Date:</strong> ${hoy}<br/>
    <strong>Platform:</strong> Web panel · iOS · Android
  </div>
</div>

<div class="toc">
  <h2>Contents</h2>
  <ol>${toc}</ol>
</div>

${cuerpo}
</body></html>`;

const htmlPath = path.join(DIR, 'ConnectHub-Documentation.html');
fs.writeFileSync(htmlPath, html, 'utf8');
console.log('HTML:', htmlPath, (html.length / 1024).toFixed(0) + ' KB');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
if (!CHROME) { console.error('No se encontró Chrome/Edge'); process.exit(1); }

const pdfPath = path.join(DIR, 'ConnectHub-Documentation.pdf');
execFileSync(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-pdf-header-footer',
  `--print-to-pdf=${pdfPath}`,
  `file:///${htmlPath.replace(/\\/g, '/')}`,
], { stdio: 'inherit' });
console.log('PDF:', pdfPath, (fs.statSync(pdfPath).size / 1024).toFixed(0) + ' KB');
