// Cada paquete que se importa debe estar declarado en el package.json de su
// aplicación. En la computadora de desarrollo un paquete olvidado se
// encuentra igual (en el node_modules de la carpeta de arriba), pero al
// publicar (Render instala solo lo de nube/package.json) la app no arranca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.join(import.meta.dirname, '..');

function archivosJs(carpeta) {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(carpeta, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'public' ? [] : archivosJs(ruta);
    return e.name.endsWith('.js') ? [ruta] : [];
  });
}

/** Paquetes importados (sin "node:" ni rutas relativas), con el nombre base del paquete. */
function importados(archivos) {
  const nombres = new Set();
  for (const archivo of archivos) {
    const codigo = fs.readFileSync(archivo, 'utf8');
    for (const [, origen] of codigo.matchAll(/(?:from\s+|import\s*\(\s*)'([^'.][^']*)'/g)) {
      if (origen.startsWith('node:')) continue;
      const partes = origen.split('/');
      nombres.add(origen.startsWith('@') ? partes.slice(0, 2).join('/') : partes[0]);
    }
  }
  return nombres;
}

function faltantes(carpetas, packageJson, { incluirDev = false } = {}) {
  const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
  const declarados = new Set(Object.keys({ ...pkg.dependencies, ...(incluirDev ? pkg.devDependencies : {}) }));
  const archivos = carpetas.flatMap((c) => (fs.statSync(c).isDirectory() ? archivosJs(c) : [c]));
  return [...importados(archivos)].filter((n) => !declarados.has(n)).sort();
}

test('el panel de la nube declara todos los paquetes que usa (Render instala solo nube/package.json)', () => {
  const nube = path.join(RAIZ, 'nube');
  assert.deepEqual(faltantes([path.join(nube, 'src'), path.join(nube, 'scripts'), path.join(nube, 'server.js')], path.join(nube, 'package.json')), []);
});

test('la aplicación de la tienda declara todos los paquetes que usa (el instalador copia solo las dependencias)', () => {
  assert.deepEqual(faltantes([path.join(RAIZ, 'src'), path.join(RAIZ, 'server.js')], path.join(RAIZ, 'package.json')), []);
});
