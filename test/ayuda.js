// Utilidades de prueba: levanta la aplicación sobre PostgreSQL embebido
// (PGlite) con las tablas creadas por los modelos de Sequelize, y un
// cliente HTTP con cookies.
import { conectarEnMemoria } from './ayuda-bd.js';
import { prepararBaseDeDatos } from '../src/libs/sequelize.js';
import { crearApp } from '../src/app.js';

/**
 * Los usuarios iniciales deben cambiar su contraseña al entrar; en las
 * pruebas se les quita esa obligación para poder usar la API de inmediato.
 */
export function quitarCambioPendiente(sequelize) {
  return sequelize.query('UPDATE usuarios SET debe_cambiar_contrasena = false');
}

export async function levantar() {
  const { sequelize, pglite } = await conectarEnMemoria();
  await prepararBaseDeDatos({ datosDePrueba: true });
  await quitarCambioPendiente(sequelize);
  const app = crearApp({ secreto: 'secreto-de-pruebas-de-al-menos-32-caracteres' });
  const servidor = await new Promise((ok) => {
    const s = app.listen(0, () => ok(s));
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  // Consulta SQL directa para verificar el estado de la base en las pruebas.
  const db = {
    async query(sql, bind = []) {
      const [rows] = await sequelize.query(sql, { bind });
      return { rows };
    },
  };

  return {
    db,
    sequelize,
    base,
    cliente: () => crearCliente(base),
    async cerrar() {
      servidor.close();
      await sequelize.close();
      await pglite.close();
    },
  };
}

function crearCliente(base) {
  let cookie = '';
  async function pedir(metodo, ruta, cuerpo) {
    const res = await fetch(base + ruta, {
      method: metodo,
      headers: {
        ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
    const nueva = res.headers.get('set-cookie');
    if (nueva) cookie = nueva.split(';')[0];
    let datos = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    // Mismo formato que biblioteca: { success, data } o { success: false, message }.
    if (datos && typeof datos === 'object' && !Array.isArray(datos)) {
      if (datos.success === true && 'data' in datos) datos = datos.data;
      else if (datos.success === false) datos = { ...datos, error: datos.message };
    }
    return { status: res.status, datos };
  }
  return {
    get: (r) => pedir('GET', r),
    post: (r, c = {}) => pedir('POST', r, c),
    put: (r, c = {}) => pedir('PUT', r, c),
    delete: (r) => pedir('DELETE', r),
    async login(usuario, contrasena) {
      const r = await pedir('POST', '/api/auth/login', { usuario, contrasena });
      if (r.status !== 200) throw new Error(`login falló: ${JSON.stringify(r.datos)}`);
      return r;
    },
    /** Usuario recién creado por el administrador: entra y pone su propia contraseña. */
    async entrarNuevo(usuario, contrasena) {
      await this.login(usuario, contrasena);
      const r = await pedir('POST', '/api/auth/cambiar-contrasena', { actual: contrasena, nueva: `${contrasena}-propia` });
      if (r.status !== 200) throw new Error(`cambio de contraseña falló: ${JSON.stringify(r.datos)}`);
    },
  };
}

/** Busca el id y la existencia de un producto por su código. */
export async function producto(db, codigo) {
  const { rows } = await db.query('SELECT id, existencia, costo FROM productos WHERE codigo = $1', [codigo]);
  return rows[0];
}
