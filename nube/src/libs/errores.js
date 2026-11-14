/** Error con mensaje seguro para mostrar y código HTTP (igual que en la tienda). */
export class ErrorNube extends Error {
    constructor(status, mensaje) {
        super(mensaje);
        this.status = status;
    }
}

/** Respuesta de error en el formato de biblioteca: { success: false, message }. */
export function manejarError(res, error) {
    if (error instanceof ErrorNube) {
        return res.status(error.status).send({ success: false, message: error.message });
    }
    if (error?.type === 'entity.too.large') {
        return res.status(413).send({ success: false, message: 'El paquete es demasiado grande.' });
    }
    if (error?.type === 'entity.parse.failed') {
        return res.status(400).send({ success: false, message: 'El cuerpo de la petición no es JSON válido.' });
    }
    console.error(`[${new Date().toISOString()}]`, error);
    return res.status(500).send({ success: false, message: 'Ocurrió un error interno.' });
}
