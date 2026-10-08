// Servidor local de "Nuestros avances". Sin dependencias: solo Node.js.
// Uso: node servidor.js   (o doble clic en iniciar.bat)  ->  http://localhost:4173
'use strict';
const http = require('http');
const path = require('path');
const { crear, ESTADOS } = require('./lib/app');
const almacenFs = require('./lib/almacen-fs');

const PORT = Number(process.env.PORT) || 4173;
// Si defines PORT (hosting propio) escucha en todas las interfaces; en tu PC solo en localhost.
const HOST = process.env.PORT ? '0.0.0.0' : '127.0.0.1';
const PASS = process.env.ACCESS_PASSWORD || '';
const AV = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'NuestrosAvances'));

const almacen = almacenFs(AV, Object.values(ESTADOS));
const manejar = crear({ almacen, htmlPath: path.join(__dirname, 'legaltech-empresa1.html'), pass: PASS, limiteBytes: 200 * 1024 * 1024 });

almacen.preparar().then(() => {
  http.createServer(manejar).listen(PORT, HOST, () => {
    console.log('Legal Tech · Empresa 1');
    console.log('Abre http://localhost:' + PORT + ' en tu navegador');
    console.log('Guardando en: ' + AV);
    if (PASS) console.log('Protegido con ACCESS_PASSWORD');
    console.log('Para cerrar el servidor presiona Ctrl+C');
  });
});
