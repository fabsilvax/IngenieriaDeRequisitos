// Almacén en GitHub: cada guardado es un commit en una rama dedicada (por defecto "avances"),
// dentro de la carpeta NuestrosAvances. Sirve para Vercel, que no tiene disco persistente.
module.exports = function almacenGithub(o) {
  const base = o.base || 'https://api.github.com';
  const prefix = o.prefix || 'NuestrosAvances';
  const branch = o.branch || 'avances';
  const repo = o.repo;
  let listo = false;

  async function gh(method, url, body, accept) {
    return fetch(base + url, {
      method,
      cache: 'no-store',
      headers: Object.assign({
        Authorization: 'Bearer ' + o.token,
        Accept: accept || 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ingenieria-de-requisitos'
      }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
  }
  async function ok(r, ctx) {
    if (r.ok) return r;
    let m = ''; try { m = (await r.json()).message || ''; } catch (e) {}
    throw new Error('GitHub (' + ctx + ') ' + r.status + ' ' + m);
  }
  const enc = (rel) => rel.split('/').map(encodeURIComponent).join('/');
  const full = (rel) => prefix + '/' + rel;

  async function asegurarRama() {
    if (listo) return;
    const r = await gh('GET', '/repos/' + repo + '/git/ref/heads/' + encodeURIComponent(branch));
    if (r.status === 404) {
      const rep = await (await ok(await gh('GET', '/repos/' + repo), 'repo')).json();
      const ref = await (await ok(await gh('GET', '/repos/' + repo + '/git/ref/heads/' + encodeURIComponent(rep.default_branch)), 'rama base')).json();
      await ok(await gh('POST', '/repos/' + repo + '/git/refs', { ref: 'refs/heads/' + branch, sha: ref.object.sha }), 'crear rama');
    } else await ok(r, 'rama');
    listo = true;
  }
  async function meta(rel) {
    await asegurarRama();
    const r = await gh('GET', '/repos/' + repo + '/contents/' + enc(full(rel)) + '?ref=' + encodeURIComponent(branch));
    if (r.status === 404) return null;
    await ok(r, 'leer');
    const j = await r.json();
    return Array.isArray(j) ? null : { sha: j.sha, size: j.size };
  }
  async function put(rel, buf, mensaje) {
    for (let intento = 0; intento < 2; intento++) {
      const m = await meta(rel);
      const r = await gh('PUT', '/repos/' + repo + '/contents/' + enc(full(rel)), { message: mensaje, content: Buffer.from(buf).toString('base64'), branch, sha: m ? m.sha : undefined });
      if (r.status === 409 && intento === 0) continue;
      await ok(r, 'guardar');
      return;
    }
  }
  return {
    etiqueta: 'GitHub ' + repo + ' · rama ' + branch + ' · ' + prefix,
    nube: true,
    async preparar() { await asegurarRama(); },
    async leerJSON(n, def) { const b = await this.leer(n); if (!b) return def; try { return JSON.parse(b.toString('utf8')); } catch (e) { return def; } },
    async escribirJSON(n, d) { await put(n, Buffer.from(JSON.stringify(d, null, 2)), 'avances: actualizar ' + n); },
    async existe(rel) { return (await meta(rel)) !== null; },
    async leer(rel) {
      await asegurarRama();
      const r = await gh('GET', '/repos/' + repo + '/contents/' + enc(full(rel)) + '?ref=' + encodeURIComponent(branch), null, 'application/vnd.github.raw+json');
      if (r.status === 404) return null;
      await ok(r, 'leer');
      return Buffer.from(await r.arrayBuffer());
    },
    async guardar(rel, buf) { await put(rel, buf, 'avances: ' + rel); },
    async borrar(rel) {
      const m = await meta(rel);
      if (!m) return;
      await ok(await gh('DELETE', '/repos/' + repo + '/contents/' + enc(full(rel)), { message: 'avances: eliminar ' + rel, sha: m.sha, branch }), 'borrar');
    },
    async mover(a, b) {
      const datos = await this.leer(a);
      if (!datos) throw new Error('No existe el origen');
      await put(b, datos, 'avances: mover ' + a + ' a ' + b);
      await this.borrar(a);
    },
    async listar() {
      await asegurarRama();
      const r = await ok(await gh('GET', '/repos/' + repo + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1'), 'listar');
      const j = await r.json();
      return (j.tree || []).filter(e => e.type === 'blob' && e.path.indexOf(prefix + '/') === 0).map(e => ({ ruta: e.path.slice(prefix.length + 1), tamano: e.size, fecha: null }));
    }
  };
};
