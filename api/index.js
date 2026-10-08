// Función de Vercel: sirve la página y la API de avances, guardando en una rama de GitHub.
'use strict';
const path = require('path');
const { crear } = require('../lib/app');
const almacenGithub = require('../lib/almacen-github');

let manejar;
module.exports = async (req, res) => {
  if (!manejar) {
    const repo = process.env.GH_REPO || ((process.env.VERCEL_GIT_REPO_OWNER || '') + '/' + (process.env.VERCEL_GIT_REPO_SLUG || ''));
    const almacen = process.env.GH_TOKEN ? almacenGithub({ token: process.env.GH_TOKEN, repo, branch: process.env.GH_BRANCH || 'avances', base: process.env.GH_API_BASE }) : null;
    manejar = crear({
      almacen,
      htmlPath: path.join(__dirname, '..', 'legaltech-empresa1.html'),
      pass: process.env.ACCESS_PASSWORD || '',
      limiteBytes: 4 * 1024 * 1024 // Vercel rechaza cuerpos de más de 4.5 MB
    });
  }
  return manejar(req, res);
};
