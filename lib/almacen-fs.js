// Almacén en disco local: guarda dentro de la carpeta NuestrosAvances.
const fs = require('fs');
const path = require('path');

module.exports = function almacenFs(AV, estados) {
  const abs = (rel) => path.join(AV, ...rel.split('/'));
  return {
    etiqueta: AV,
    async preparar() {
      fs.mkdirSync(AV, { recursive: true });
      for (const v of estados) fs.mkdirSync(path.join(AV, v), { recursive: true });
    },
    async leerJSON(n, def) { try { return JSON.parse(fs.readFileSync(path.join(AV, n), 'utf8')); } catch (e) { return def; } },
    async escribirJSON(n, d) {
      fs.mkdirSync(AV, { recursive: true });
      const f = path.join(AV, n), t = f + '.tmp';
      fs.writeFileSync(t, JSON.stringify(d, null, 2));
      fs.renameSync(t, f);
    },
    async existe(rel) { return fs.existsSync(abs(rel)); },
    async leer(rel) { const p = abs(rel); return fs.existsSync(p) ? fs.readFileSync(p) : null; },
    async guardar(rel, buf) { const p = abs(rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); },
    async borrar(rel) { fs.unlinkSync(abs(rel)); },
    async mover(a, b) { const p = abs(b); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.renameSync(abs(a), p); },
    // Devuelve todos los archivos bajo la carpeta: [{ruta, tamano, fecha}]
    async listar() {
      const out = [];
      const walk = (dir) => {
        if (!fs.existsSync(dir)) return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else { const st = fs.statSync(p); out.push({ ruta: path.relative(AV, p).split(path.sep).join('/'), tamano: st.size, fecha: st.mtime.toISOString() }); }
        }
      };
      walk(AV);
      return out;
    }
  };
};
