/**
 * Reglas que la base de datos hace cumplir aunque alguien se salte la
 * aplicación (por ejemplo, editando desde pgAdmin). Sequelize no crea
 * restricciones CHECK con sync(), así que se agregan aquí; solo se crean
 * si todavía no existen.
 */
const RESTRICCIONES = [
    // usuarios
    ['usuarios', 'usuarios_rol_valido', "rol IN ('administrador', 'cajero')"],
    ['usuarios', 'usuarios_nombre_no_vacio', 'length(trim(nombre)) > 0'],

    // categorías y proveedores
    ['categorias', 'categorias_nombre_no_vacio', 'length(trim(nombre)) > 0'],
    ['proveedores', 'proveedores_nombre_no_vacio', 'length(trim(nombre)) > 0'],

    // productos
    ['productos', 'productos_precio_no_negativo', 'precio_venta >= 0'],
    ['productos', 'productos_costo_no_negativo', 'costo >= 0'],
    ['productos', 'productos_tasa_iva_valida', 'tasa_iva >= 0 AND tasa_iva < 1'],
    ['productos', 'productos_stock_minimo_no_negativo', 'stock_minimo >= 0'],
    ['productos', 'productos_unidad_valida', "unidad IN ('pieza', 'kg', 'litro')"],
    ['productos', 'productos_pieza_entera', "unidad <> 'pieza' OR existencia = trunc(existencia)"],
    ['productos', 'productos_codigo_no_vacio', 'length(trim(codigo)) > 0'],

    // ventas
    ['ventas', 'ventas_importes_no_negativos', 'subtotal >= 0 AND descuento >= 0 AND impuestos >= 0 AND total >= 0 AND cambio >= 0'],
    // Ventas nuevas: efectivo o crédito. Tarjeta, transferencia y otro solo
    // quedan válidos para ventas viejas registradas antes del cambio.
    ['ventas', 'ventas_metodo_valido_v2',
        "metodo_pago IN ('efectivo', 'credito', 'tarjeta', 'transferencia', 'otro')"],
    ['ventas', 'ventas_credito_con_trabajador', "(metodo_pago = 'credito') = (trabajador_id IS NOT NULL)"],
    ['ventas', 'ventas_credito_sin_efectivo', "metodo_pago <> 'credito' OR (monto_recibido IS NULL AND cambio = 0)"],
    ['ventas', 'ventas_descuento_nomina',
        "(descontado_en IS NULL) = (descontado_por IS NULL) AND (descontado_en IS NULL OR metodo_pago = 'credito')"],
    ['ventas', 'ventas_estado_valido', "estado IN ('completada', 'cancelada')"],
    ['ventas', 'ventas_total_cuadra',
        'total = subtotal - descuento + CASE WHEN precios_incluyen_iva THEN 0 ELSE impuestos END'],
    ['ventas', 'ventas_efectivo_cubre_total',
        "metodo_pago <> 'efectivo' OR (monto_recibido IS NOT NULL AND monto_recibido >= total AND cambio = monto_recibido - total)"],
    ['ventas', 'ventas_cancelacion_completa',
        "(estado = 'completada' AND cancelada_por IS NULL AND cancelada_en IS NULL AND motivo_cancelacion IS NULL) " +
        "OR (estado = 'cancelada' AND cancelada_por IS NOT NULL AND cancelada_en IS NOT NULL " +
        "AND length(trim(coalesce(motivo_cancelacion, ''))) > 0)"],

    // detalle de ventas
    ['detalle_ventas', 'detalle_ventas_cantidad_positiva', 'cantidad > 0'],
    ['detalle_ventas', 'detalle_ventas_importe_cuadra', 'importe = round(cantidad * precio_unitario, 2)'],
    ['detalle_ventas', 'detalle_ventas_costo_no_negativo', 'costo_unitario IS NULL OR costo_unitario >= 0'],

    // trabajadores (crédito por nómina)
    ['trabajadores', 'trabajadores_nombre_no_vacio', 'length(trim(nombre)) > 0'],
    ['trabajadores', 'trabajadores_numero_no_vacio', 'length(trim(numero)) > 0'],

    // compras
    ['compras', 'compras_total_no_negativo', 'total >= 0'],
    ['compras', 'compras_estado_valido', "estado IN ('confirmada', 'cancelada')"],
    ['compras', 'compras_cancelacion_completa',
        "(estado = 'confirmada' AND cancelada_por IS NULL AND cancelada_en IS NULL AND motivo_cancelacion IS NULL) " +
        "OR (estado = 'cancelada' AND cancelada_por IS NOT NULL AND cancelada_en IS NOT NULL " +
        "AND length(trim(coalesce(motivo_cancelacion, ''))) > 0)"],

    // detalle de compras
    ['detalle_compras', 'detalle_compras_cantidad_positiva', 'cantidad > 0'],
    ['detalle_compras', 'detalle_compras_costo_no_negativo', 'costo_unitario >= 0'],
    ['detalle_compras', 'detalle_compras_importe_cuadra', 'importe = round(cantidad * costo_unitario, 2)'],

    // configuración (una sola fila)
    ['configuracion', 'configuracion_una_fila', 'id = 1'],
    ['configuracion', 'configuracion_moneda_valida', "moneda ~ '^[A-Z]{3}$'"],
    ['configuracion', 'configuracion_formato_fecha_valido', "formato_fecha IN ('dd/mm/aaaa', 'aaaa-mm-dd')"],
    ['configuracion', 'configuracion_metodos_validos_v2',
        "cardinality(metodos_pago) >= 1 AND metodos_pago <@ '{efectivo,credito}'::varchar[]"],
    ['configuracion', 'configuracion_tasa_valida', 'tasa_iva_predeterminada >= 0 AND tasa_iva_predeterminada < 1'],
    ['configuracion', 'configuracion_ticket_ancho_valido', "ticket_ancho IN ('58', '80')"],

    // caja
    ['sesiones_caja', 'sesiones_caja_estado_valido', "estado IN ('abierta', 'cerrada')"],
    ['sesiones_caja', 'sesiones_caja_montos_no_negativos', 'fondo_inicial >= 0 AND (monto_contado IS NULL OR monto_contado >= 0)'],
    ['sesiones_caja', 'sesiones_caja_cierre_completo',
        "(estado = 'abierta' AND cerrada_en IS NULL AND cerrada_por IS NULL AND efectivo_esperado IS NULL " +
        'AND monto_contado IS NULL AND diferencia IS NULL) ' +
        "OR (estado = 'cerrada' AND cerrada_en IS NOT NULL AND cerrada_por IS NOT NULL " +
        'AND efectivo_esperado IS NOT NULL AND monto_contado IS NOT NULL ' +
        'AND diferencia = monto_contado - efectivo_esperado)'],
    ['movimientos_caja', 'movimientos_caja_tipo_valido', "tipo IN ('ingreso', 'retiro')"],
    ['movimientos_caja', 'movimientos_caja_monto_positivo', 'monto > 0'],
    ['movimientos_caja', 'movimientos_caja_motivo_no_vacio', 'length(trim(motivo)) > 0'],

    // historial de inventario
    ['movimientos_inventario', 'movimientos_inventario_tipo_valido_v2',
        "tipo IN ('inicial', 'compra', 'venta', 'cancelacion_venta', 'cancelacion_compra', " +
        "'ajuste_entrada', 'ajuste_salida', 'saldo_depurado')"],
    ['movimientos_inventario', 'movimientos_inventario_cuadra', 'existencia_nueva = existencia_anterior + cantidad'],
    ['movimientos_inventario', 'movimientos_inventario_signo_v2',
        "(tipo IN ('inicial', 'compra', 'cancelacion_venta', 'ajuste_entrada') AND cantidad > 0) " +
        "OR (tipo IN ('venta', 'cancelacion_compra', 'ajuste_salida') AND cantidad < 0) " +
        "OR (tipo = 'saldo_depurado' AND cantidad <> 0)"],
    ['movimientos_inventario', 'movimientos_inventario_referencia',
        "(venta_id IS NOT NULL) = (tipo IN ('venta', 'cancelacion_venta')) " +
        "AND (compra_id IS NOT NULL) = (tipo IN ('compra', 'cancelacion_compra'))"],
    ['movimientos_inventario', 'movimientos_inventario_motivo_ajuste',
        "tipo NOT IN ('ajuste_entrada', 'ajuste_salida') OR length(trim(coalesce(motivo, ''))) > 0"],
];

// Reglas reemplazadas por una versión _v2 (se borran si aún existen).
const OBSOLETAS = [
    ['ventas', 'ventas_metodo_valido'],
    ['configuracion', 'configuracion_metodos_validos'],
    ['movimientos_inventario', 'movimientos_inventario_tipo_valido'],
    ['movimientos_inventario', 'movimientos_inventario_signo'],
];

/**
 * Cambios de datos necesarios antes de aplicar las reglas nuevas.
 * Es seguro ejecutarlo en cada arranque.
 */
export async function migrar(sequelize) {
    for (const [tabla, nombre] of OBSOLETAS) {
        await sequelize.query(`ALTER TABLE ${tabla} DROP CONSTRAINT IF EXISTS ${nombre}`);
    }
    // Tarjeta / transferencia / otro ya no se ofrecen: efectivo y crédito.
    await sequelize.query(
        "UPDATE configuracion SET metodos_pago = '{efectivo,credito}' WHERE NOT (metodos_pago <@ '{efectivo,credito}'::varchar[])"
    );
}

/**
 * Sequelize 6 con sync({ alter: true }) vuelve a crear las llaves
 * foráneas en cada arranque (productos_categoria_id_fkey1, …fkey2, …).
 * Aquí se borran las copias y se deja una sola de cada una.
 */
export async function quitarLlavesDuplicadas(sequelize) {
    const llaves = await sequelize.query(
        `SELECT c.conrelid::regclass::text AS tabla, c.conname AS nombre, pg_get_constraintdef(c.oid) AS definicion
           FROM pg_constraint c
          WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
          ORDER BY c.conrelid, length(c.conname), c.conname`,
        { type: sequelize.QueryTypes.SELECT }
    );
    const vistas = new Set();
    for (const { tabla, nombre, definicion } of llaves) {
        const clave = `${tabla}|${definicion}`;
        if (vistas.has(clave)) {
            await sequelize.query(`ALTER TABLE ${tabla} DROP CONSTRAINT IF EXISTS "${nombre.replace(/"/g, '""')}"`);
        } else {
            vistas.add(clave);
        }
    }
}

export async function asegurarRestricciones(sequelize) {
    const existentes = new Set(
        (await sequelize.query(
            "SELECT conname FROM pg_constraint WHERE contype = 'c'",
            { type: sequelize.QueryTypes.SELECT }
        )).map((r) => r.conname)
    );
    for (const [tabla, nombre, expresion] of RESTRICCIONES) {
        if (!existentes.has(nombre)) {
            await sequelize.query(`ALTER TABLE ${tabla} ADD CONSTRAINT ${nombre} CHECK (${expresion})`);
        }
    }
}
