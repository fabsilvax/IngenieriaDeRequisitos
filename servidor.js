// Servidor local de "Nuestros avances". Sin dependencias: solo Node.js.
// Uso: node servidor.js   (o doble clic en iniciar.bat)  ->  http://localhost:4173
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
// En Railway monta un volumen y apunta DATA_DIR a él (p. ej. /data) para que los archivos no se pierdan al redeplegar.
const AV = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'NuestrosAvances'));
const HTML = path.join(ROOT, 'legaltech-empresa1.html');
const PORT = Number(process.env.PORT) || 4173;
// En la nube (PORT definido) escucha en todas las interfaces; en tu PC solo en localhost.
const HOST = process.env.PORT ? '0.0.0.0' : '127.0.0.1';
// Si defines ACCESS_PASSWORD, toda la web pide usuario y esa contraseña (el usuario puede ser cualquiera).
const PASS = process.env.ACCESS_PASSWORD || '';
const MAX_BYTES = 200 * 1024 * 1024;

const ESTADOS = { porhacer: 'PorHacer', discutido: 'PlanesDiscutidos', hecho: 'CosasHechas' };
const REG = path.join(AV, '_registro.json');
const STATE = path.join(AV, '_estado-web.json');

const TIPOS = {
  Documentos: ['pdf', 'doc', 'docx', 'odt', 'txt', 'md', 'rtf'],
  Hojas: ['xls', 'xlsx', 'csv', 'ods'],
  Presentaciones: ['ppt', 'pptx', 'odp', 'key'],
  Imagenes: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'],
  Diagramas: ['drawio', 'vsdx', 'mmd', 'puml'],
  'Audio-Video': ['mp4', 'mov', 'mkv', 'webm', 'mp3', 'wav', 'm4a'],
  Codigo: ['html', 'js', 'css', 'json', 'py', 'java', 'ts', 'sql'],
  Comprimidos: ['zip', 'rar', '7z']
};
const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', mp4: 'video/mp4', mp3: 'audio/mpeg', txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8', json: 'application/json; charset=utf-8', csv: 'text/csv; charset=utf-8' };
const NOTAS = { nota: 'Notas', conclusion: 'Conclusiones', decision: 'Decisiones' };

function tipoDe(nombre) {
  const ext = path.extname(nombre).slice(1).toLowerCase();
  for (const k of Object.keys(TIPOS)) if (TIPOS[k].includes(ext)) return k;
  return 'Otros';
}
function limpio(n) {
  const s = String(n || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '').trim().slice(0, 120);
  return s || 'sin-nombre';
}
function readJSON(f, def) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return def; } }
function writeJSON(f, data) { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(data, null, 2)); fs.renameSync(t, f); }
function unico(dir, nombre) {
  let n = nombre, i = 2;
  const ext = path.extname(nombre), base = path.basename(nombre, ext);
  while (fs.existsSync(path.join(dir, n))) n = `${base} (${i++})${ext}`;
  return n;
}
// Resuelve una ruta relativa dentro de NuestrosAvances; devuelve null si intenta salir o apunta a archivos internos.
function segura(rel) {
  const abs = path.resolve(AV, String(rel || ''));
  if (!abs.startsWith(AV + path.sep)) return null;
  const parte = path.relative(AV, abs).split(path.sep);
  if (!Object.values(ESTADOS).includes(parte[0]) || parte.length < 3) return null;
  return abs;
}
function estadoDeRuta(rel) {
  const p = rel.split('/')[0];
  return Object.keys(ESTADOS).find(k => ESTADOS[k] === p);
}
function escanear() {
  const out = [];
  for (const k of Object.keys(ESTADOS)) {
    const base = path.join(AV, ESTADOS[k]);
    if (!fs.existsSync(base)) continue;
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (!e.name.startsWith('.') && !e.name.startsWith('_')) {
          const st = fs.statSync(p);
          out.push({ ruta: path.relative(AV, p).split(path.sep).join('/'), nombre: e.name, tamano: st.size, fecha: st.mtime.toISOString() });
        }
      }
    };
    walk(base);
  }
  return out;
}
function listado() {
  const reg = readJSON(REG, []);
  const vistos = new Set();
  const items = [];
  for (const r of reg) {
    const abs = segura(r.ruta);
    if (abs && fs.existsSync(abs)) { items.push(r); vistos.add(r.ruta); }
  }
  for (const f of escanear()) {
    if (vistos.has(f.ruta)) continue;
    items.push({ ruta: f.ruta, titulo: f.nombre, clase: 'archivo', estado: estadoDeRuta(f.ruta), tipo: f.ruta.split('/')[1], entregable: 'general', responsable: '', descripcion: '', fecha: f.fecha, tamano: f.tamano, sinRegistrar: true });
  }
  return items.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}
function asegurarCarpetas() {
  fs.mkdirSync(AV, { recursive: true });
  for (const v of Object.values(ESTADOS)) fs.mkdirSync(path.join(AV, v), { recursive: true });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function cuerpo(req, limite) {
  return new Promise((ok, fail) => {
    const trozos = []; let total = 0;
    req.on('data', c => { total += c.length; if (total > limite) { fail(new Error('Archivo demasiado grande')); req.destroy(); } else trozos.push(c); });
    req.on('end', () => ok(Buffer.concat(trozos)));
    req.on('error', fail);
  });
}
function meta(req) {
  try { return JSON.parse(decodeURIComponent(req.headers['x-meta'] || '{}')); } catch (e) { return {}; }
}
function registrar(entry) { const reg = readJSON(REG, []); reg.push(entry); writeJSON(REG, reg); }

const server = http.createServer(async (req, res) => {
  try {
    if (PASS) {
      const h = req.headers.authorization || '';
      const dado = h.startsWith('Basic ') ? Buffer.from(h.slice(6), 'base64').toString('utf8') : '';
      if (dado.slice(dado.indexOf(':') + 1) !== PASS) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Empresa 1"', 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Acceso restringido');
      }
    }
    const url = new URL(req.url, 'http://localhost');
    const ruta = url.pathname;
    const muta = req.method !== 'GET' && req.method !== 'HEAD';
    // Protección: las peticiones que modifican datos exigen una cabecera propia (una web ajena no puede enviarla sin permiso CORS).
    if (muta && req.headers['x-lt'] !== '1') return json(res, 403, { error: 'Petición no permitida' });

    if (req.method === 'GET' && (ruta === '/' || ruta === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(fs.readFileSync(HTML));
    }
    if (req.method === 'GET' && ruta === '/api/ping') return json(res, 200, { ok: true, carpeta: AV, estados: ESTADOS, tipos: TIPOS, notas: NOTAS });
    if (req.method === 'GET' && ruta === '/api/registro') return json(res, 200, { items: listado() });
    if (req.method === 'GET' && ruta === '/api/estado') return json(res, 200, readJSON(STATE, {}));
    if (req.method === 'PUT' && ruta === '/api/estado') {
      const b = await cuerpo(req, 5 * 1024 * 1024);
      writeJSON(STATE, JSON.parse(b.toString('utf8') || '{}'));
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && ruta.startsWith('/f/')) {
      const abs = segura(decodeURIComponent(ruta.slice(3)));
      if (!abs || !fs.existsSync(abs)) return json(res, 404, { error: 'No existe' });
      const ext = path.extname(abs).slice(1).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Disposition': 'inline; filename*=UTF-8\'\'' + encodeURIComponent(path.basename(abs)), 'X-Content-Type-Options': 'nosniff' });
      return fs.createReadStream(abs).pipe(res);
    }
    if (req.method === 'POST' && ruta === '/api/archivo') {
      const estado = req.headers['x-estado'];
      if (!ESTADOS[estado]) return json(res, 400, { error: 'Estado inválido' });
      const nombre = limpio(decodeURIComponent(req.headers['x-nombre'] || ''));
      const datos = await cuerpo(req, MAX_BYTES);
      const tipo = tipoDe(nombre);
      const dir = path.join(AV, ESTADOS[estado], tipo);
      fs.mkdirSync(dir, { recursive: true });
      const final = unico(dir, nombre);
      fs.writeFileSync(path.join(dir, final), datos);
      const m = meta(req);
      const entry = { ruta: [ESTADOS[estado], tipo, final].join('/'), titulo: String(m.titulo || final).slice(0, 160), clase: 'archivo', estado, tipo, entregable: m.entregable || 'general', responsable: m.responsable || '', descripcion: String(m.descripcion || '').slice(0, 2000), fecha: new Date().toISOString(), tamano: datos.length };
      registrar(entry);
      return json(res, 200, { ok: true, item: entry });
    }
    if (req.method === 'POST' && ruta === '/api/nota') {
      const b = JSON.parse((await cuerpo(req, 2 * 1024 * 1024)).toString('utf8'));
      if (!ESTADOS[b.estado] || !NOTAS[b.clase]) return json(res, 400, { error: 'Datos inválidos' });
      const texto = String(b.texto || '').trim();
      if (!texto) return json(res, 400, { error: 'La nota está vacía' });
      const titulo = String(b.titulo || 'Sin título').slice(0, 160);
      const fecha = new Date();
      const dir = path.join(AV, ESTADOS[b.estado], NOTAS[b.clase]);
      fs.mkdirSync(dir, { recursive: true });
      const nombre = unico(dir, limpio(fecha.toISOString().slice(0, 10) + ' ' + titulo) + '.md');
      const md = `# ${titulo}\n\n- Tipo: ${NOTAS[b.clase]}\n- Estado: ${ESTADOS[b.estado]}\n- Entregable: ${b.entregable || 'general'}\n- Responsable: ${b.responsable || '-'}\n- Fecha: ${fecha.toISOString()}\n\n${texto}\n`;
      fs.writeFileSync(path.join(dir, nombre), md, 'utf8');
      const entry = { ruta: [ESTADOS[b.estado], NOTAS[b.clase], nombre].join('/'), titulo, clase: b.clase, estado: b.estado, tipo: NOTAS[b.clase], entregable: b.entregable || 'general', responsable: b.responsable || '', descripcion: '', texto: texto.slice(0, 20000), fecha: fecha.toISOString(), tamano: Buffer.byteLength(md) };
      registrar(entry);
      return json(res, 200, { ok: true, item: entry });
    }
    if (req.method === 'POST' && ruta === '/api/mover') {
      const b = JSON.parse((await cuerpo(req, 100000)).toString('utf8'));
      const origen = segura(b.ruta);
      if (!origen || !fs.existsSync(origen) || !ESTADOS[b.estado]) return json(res, 400, { error: 'Datos inválidos' });
      const partes = b.ruta.split('/');
      const destDir = path.join(AV, ESTADOS[b.estado], partes[1]);
      fs.mkdirSync(destDir, { recursive: true });
      const nombre = unico(destDir, partes[partes.length - 1]);
      fs.renameSync(origen, path.join(destDir, nombre));
      const nueva = [ESTADOS[b.estado], partes[1], nombre].join('/');
      const reg = readJSON(REG, []);
      let e = reg.find(x => x.ruta === b.ruta);
      if (!e) { e = { titulo: nombre, clase: 'archivo', tipo: partes[1], entregable: 'general', responsable: '', descripcion: '', fecha: new Date().toISOString() }; reg.push(e); }
      e.ruta = nueva; e.estado = b.estado;
      writeJSON(REG, reg);
      return json(res, 200, { ok: true, ruta: nueva });
    }
    if (req.method === 'POST' && ruta === '/api/borrar') {
      const b = JSON.parse((await cuerpo(req, 100000)).toString('utf8'));
      const abs = segura(b.ruta);
      if (!abs || !fs.existsSync(abs)) return json(res, 400, { error: 'No existe' });
      fs.unlinkSync(abs);
      writeJSON(REG, readJSON(REG, []).filter(x => x.ruta !== b.ruta));
      return json(res, 200, { ok: true });
    }
    json(res, 404, { error: 'No encontrado' });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

asegurarCarpetas();
server.listen(PORT, HOST, () => {
  console.log('Legal Tech · Empresa 1');
  console.log('Abre http://localhost:' + PORT + ' en tu navegador');
  if (PASS) console.log('Protegido con ACCESS_PASSWORD');
  console.log('Guardando en: ' + AV);
  console.log('Para cerrar el servidor presiona Ctrl+C');
});
