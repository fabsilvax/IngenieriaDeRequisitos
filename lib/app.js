// Lógica común de "Nuestros avances": la usan el servidor local (disco) y Vercel (GitHub).
'use strict';
const fs = require('fs');
const path = require('path');

const ESTADOS = { porhacer: 'PorHacer', discutido: 'PlanesDiscutidos', hecho: 'CosasHechas' };
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
const REG = '_registro.json';
const STATE = '_estado-web.json';

function tipoDe(nombre) {
  const ext = path.extname(nombre).slice(1).toLowerCase();
  for (const k of Object.keys(TIPOS)) if (TIPOS[k].includes(ext)) return k;
  return 'Otros';
}
function limpio(n) {
  const s = String(n || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '').trim().slice(0, 120);
  return s || 'sin-nombre';
}
// Valida una ruta relativa: Estado/Tipo/archivo, sin salirse de las carpetas permitidas.
function segura(rel) {
  const s = String(rel || '');
  if (!s || s.includes('\\') || s.startsWith('/')) return null;
  const p = s.split('/');
  if (p.length < 3 || p.some(x => !x || x === '.' || x === '..')) return null;
  if (!Object.values(ESTADOS).includes(p[0])) return null;
  return p.join('/');
}
const estadoDeRuta = (rel) => Object.keys(ESTADOS).find(k => ESTADOS[k] === rel.split('/')[0]);

function crear(opc) {
  const alm = opc.almacen; // puede ser null: se sirve la página pero la API responde 503
  const limite = opc.limiteBytes || 200 * 1024 * 1024;
  const PASS = opc.pass || '';

  function json(res, code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  }
  async function cuerpo(req) {
    if (req.body !== undefined && req.body !== null) { // Vercel puede entregar el cuerpo ya leído
      if (Buffer.isBuffer(req.body)) return req.body;
      if (typeof req.body === 'string') return Buffer.from(req.body);
      return Buffer.from(JSON.stringify(req.body));
    }
    return new Promise((ok, fail) => {
      const t = []; let n = 0;
      req.on('data', c => { n += c.length; if (n > limite) { fail(new Error('Archivo demasiado grande (máx. ' + Math.floor(limite / 1048576) + ' MB)')); req.destroy(); } else t.push(c); });
      req.on('end', () => ok(Buffer.concat(t)));
      req.on('error', fail);
    });
  }
  const meta = (req) => { try { return JSON.parse(decodeURIComponent(req.headers['x-meta'] || '{}')); } catch (e) { return {}; } };
  async function unico(dirRel, nombre) {
    const ext = path.extname(nombre), base = path.basename(nombre, ext);
    let n = nombre, i = 2;
    while (await alm.existe(dirRel + '/' + n)) n = base + ' (' + (i++) + ')' + ext;
    return n;
  }
  async function listado() {
    const reg = await alm.leerJSON(REG, []);
    const archivos = await alm.listar();
    const existen = new Set(), items = [], vistos = new Set();
    for (const f of archivos) {
      const p = f.ruta.split('/');
      if (p.length < 3 || !Object.values(ESTADOS).includes(p[0]) || p[p.length - 1].startsWith('.') || p[p.length - 1].startsWith('_')) continue;
      existen.add(f.ruta);
    }
    for (const r of reg) if (existen.has(r.ruta)) { items.push(r); vistos.add(r.ruta); }
    for (const f of archivos) {
      if (!existen.has(f.ruta) || vistos.has(f.ruta)) continue;
      const p = f.ruta.split('/');
      items.push({ ruta: f.ruta, titulo: p[p.length - 1], clase: 'archivo', estado: estadoDeRuta(f.ruta), tipo: p[1], entregable: 'general', responsable: '', descripcion: '', fecha: f.fecha || new Date(0).toISOString(), tamano: f.tamano, sinRegistrar: true });
    }
    return items.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  }
  async function registrar(e) { const reg = await alm.leerJSON(REG, []); reg.push(e); await alm.escribirJSON(REG, reg); }

  return async function manejar(req, res) {
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
      let ruta = url.pathname;
      if (ruta === '/api/index') ruta = '/';
      const muta = req.method !== 'GET' && req.method !== 'HEAD';
      // Las peticiones que modifican datos exigen una cabecera propia que una web ajena no puede enviar.
      if (muta && req.headers['x-lt'] !== '1') return json(res, 403, { error: 'Petición no permitida' });

      if (req.method === 'GET' && (ruta === '/' || ruta === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(fs.readFileSync(opc.htmlPath));
      }
      if (!alm) return json(res, 503, { error: 'Falta configurar el almacenamiento (variable GH_TOKEN)' });

      if (req.method === 'GET' && ruta === '/api/ping') {
        await alm.preparar();
        return json(res, 200, { ok: true, carpeta: alm.etiqueta, nube: !!alm.nube, limiteBytes: limite, estados: ESTADOS, tipos: TIPOS, notas: NOTAS });
      }
      if (req.method === 'GET' && ruta === '/api/registro') return json(res, 200, { items: await listado() });
      if (req.method === 'GET' && ruta === '/api/estado') return json(res, 200, await alm.leerJSON(STATE, {}));
      if (req.method === 'PUT' && ruta === '/api/estado') {
        const b = await cuerpo(req);
        await alm.escribirJSON(STATE, JSON.parse(b.toString('utf8') || '{}'));
        return json(res, 200, { ok: true });
      }
      if (req.method === 'GET' && ruta.startsWith('/f/')) {
        const rel = segura(decodeURIComponent(ruta.slice(3)));
        const datos = rel && await alm.leer(rel);
        if (!datos) return json(res, 404, { error: 'No existe' });
        const ext = path.extname(rel).slice(1).toLowerCase();
        const h = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Disposition': "inline; filename*=UTF-8''" + encodeURIComponent(path.basename(rel)), 'X-Content-Type-Options': 'nosniff' };
        if (ext === 'svg') h['Content-Security-Policy'] = 'sandbox';
        res.writeHead(200, h);
        return res.end(datos);
      }
      if (req.method === 'POST' && ruta === '/api/archivo') {
        const estado = req.headers['x-estado'];
        if (!ESTADOS[estado]) return json(res, 400, { error: 'Estado inválido' });
        const nombre = limpio(decodeURIComponent(req.headers['x-nombre'] || ''));
        const datos = await cuerpo(req);
        const tipo = tipoDe(nombre);
        const dir = ESTADOS[estado] + '/' + tipo;
        const final = await unico(dir, nombre);
        await alm.guardar(dir + '/' + final, datos);
        const m = meta(req);
        const e = { ruta: dir + '/' + final, titulo: String(m.titulo || final).slice(0, 160), clase: 'archivo', estado, tipo, entregable: m.entregable || 'general', responsable: m.responsable || '', descripcion: String(m.descripcion || '').slice(0, 2000), fecha: new Date().toISOString(), tamano: datos.length };
        await registrar(e);
        return json(res, 200, { ok: true, item: e });
      }
      if (req.method === 'POST' && ruta === '/api/nota') {
        const b = JSON.parse((await cuerpo(req)).toString('utf8'));
        if (!ESTADOS[b.estado] || !NOTAS[b.clase]) return json(res, 400, { error: 'Datos inválidos' });
        const texto = String(b.texto || '').trim();
        if (!texto) return json(res, 400, { error: 'La nota está vacía' });
        const titulo = String(b.titulo || 'Sin título').slice(0, 160);
        const fecha = new Date();
        const dir = ESTADOS[b.estado] + '/' + NOTAS[b.clase];
        const nombre = await unico(dir, limpio(fecha.toISOString().slice(0, 10) + ' ' + titulo) + '.md');
        const md = '# ' + titulo + '\n\n- Tipo: ' + NOTAS[b.clase] + '\n- Estado: ' + ESTADOS[b.estado] + '\n- Entregable: ' + (b.entregable || 'general') + '\n- Responsable: ' + (b.responsable || '-') + '\n- Fecha: ' + fecha.toISOString() + '\n\n' + texto + '\n';
        await alm.guardar(dir + '/' + nombre, Buffer.from(md, 'utf8'));
        const e = { ruta: dir + '/' + nombre, titulo, clase: b.clase, estado: b.estado, tipo: NOTAS[b.clase], entregable: b.entregable || 'general', responsable: b.responsable || '', descripcion: '', texto: texto.slice(0, 20000), fecha: fecha.toISOString(), tamano: Buffer.byteLength(md) };
        await registrar(e);
        return json(res, 200, { ok: true, item: e });
      }
      if (req.method === 'POST' && ruta === '/api/mover') {
        const b = JSON.parse((await cuerpo(req)).toString('utf8'));
        const origen = segura(b.ruta);
        if (!origen || !ESTADOS[b.estado] || !(await alm.existe(origen))) return json(res, 400, { error: 'Datos inválidos' });
        const partes = origen.split('/');
        const destDir = ESTADOS[b.estado] + '/' + partes[1];
        const nombre = await unico(destDir, partes[partes.length - 1]);
        await alm.mover(origen, destDir + '/' + nombre);
        const nueva = destDir + '/' + nombre;
        const reg = await alm.leerJSON(REG, []);
        let e = reg.find(x => x.ruta === origen);
        if (!e) { e = { titulo: nombre, clase: 'archivo', tipo: partes[1], entregable: 'general', responsable: '', descripcion: '', fecha: new Date().toISOString() }; reg.push(e); }
        e.ruta = nueva; e.estado = b.estado;
        await alm.escribirJSON(REG, reg);
        return json(res, 200, { ok: true, ruta: nueva });
      }
      if (req.method === 'POST' && ruta === '/api/borrar') {
        const b = JSON.parse((await cuerpo(req)).toString('utf8'));
        const rel = segura(b.ruta);
        if (!rel || !(await alm.existe(rel))) return json(res, 400, { error: 'No existe' });
        await alm.borrar(rel);
        await alm.escribirJSON(REG, (await alm.leerJSON(REG, [])).filter(x => x.ruta !== rel));
        return json(res, 200, { ok: true });
      }
      json(res, 404, { error: 'No encontrado' });
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  };
}
module.exports = { crear, ESTADOS };
