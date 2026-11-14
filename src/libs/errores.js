/** Error con mensaje seguro para mostrar al usuario y código HTTP. */
export class ErrorApp extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

export const noEncontrado = (que) => new ErrorApp(404, `${que} no existe.`);

// Errores de PostgreSQL más comunes traducidos a mensajes claros.
const ERRORES_PG = {
  23505: [409, 'Ya existe un registro con ese valor (código, folio, nombre o usuario duplicado).'],
  23503: [409, 'La operación hace referencia a un registro que no existe o que está en uso.'],
  23514: [400, 'Algún dato no cumple las reglas (valores negativos, totales o estados inválidos).'],
  23502: [400, 'Falta un dato obligatorio.'],
  '22P02': [400, 'Formato de dato inválido.'],
  22003: [400, 'Un número está fuera del rango permitido.'],
  22001: [400, 'Un texto excede la longitud permitida.'],
};

/** Convierte cualquier error en [status, mensaje] sin exponer detalles internos. */
export function traducirError(error) {
  if (error instanceof ErrorApp) return [error.status, error.message];
  switch (error?.name) {
    case 'SequelizeUniqueConstraintError':
      return ERRORES_PG[23505];
    case 'SequelizeForeignKeyConstraintError':
      return ERRORES_PG[23503];
    case 'SequelizeValidationError': {
      const e = error.errors?.[0];
      if (e?.type === 'notNull Violation') return [400, `Falta el dato obligatorio "${e.path}".`];
      return [400, e?.message ?? 'Datos inválidos.'];
    }
    default:
      break;
  }
  const codigo = error?.parent?.code ?? error?.original?.code ?? error?.code;
  if (codigo && ERRORES_PG[codigo]) return ERRORES_PG[codigo];
  return null;
}

/**
 * Respuesta de error para los controladores (mismo formato que
 * biblioteca: { success: false, message }).
 */
export function manejarError(res, error) {
  const traducido = traducirError(error);
  if (traducido) {
    return res.status(traducido[0]).send({ success: false, message: traducido[1] });
  }
  // Solo se registra en el servidor; al cliente no se le muestran detalles.
  console.error(`[${new Date().toISOString()}]`, error);
  return res.status(500).send({ success: false, message: 'Ocurrió un error interno. La operación no se completó.' });
}

/** Middleware final de Express (JSON mal formado, rutas inexistentes…). */
export function manejadorErrores(err, _req, res, _next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).send({ success: false, message: 'El cuerpo de la petición no es JSON válido.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).send({ success: false, message: 'La petición es demasiado grande.' });
  }
  return manejarError(res, err);
}
