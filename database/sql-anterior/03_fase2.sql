-- =====================================================================
-- Mini Súper - 03: fase 2
--   9.  configuracion           (una sola fila con la configuración)
--   10. sesiones_caja           (apertura y cierre de caja)
--   11. movimientos_caja        (ingresos y retiros de efectivo)
--   12. movimientos_inventario  (historial y ajustes manuales)
-- Además: cancelación de compras, ventas ligadas a la caja, precios
-- con o sin IVA y política de sobreventa configurable.
--
-- Ejecutar después de 01 y 02, conectado a "minisuper" como
-- "minisuper_app". Actualiza una base existente sin perder datos.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 9. configuracion: una sola fila (id = 1)
-- ---------------------------------------------------------------------
CREATE TABLE configuracion (
    id                           SMALLINT      PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    nombre_tienda                VARCHAR(120)  NOT NULL DEFAULT 'Mi Mini Súper'
                                 CHECK (length(trim(nombre_tienda)) > 0),
    direccion                    VARCHAR(255),
    telefono                     VARCHAR(30),
    rfc                          VARCHAR(13),
    mensaje_ticket               VARCHAR(255)  DEFAULT '¡Gracias por su compra!',
    moneda                       CHAR(3)       NOT NULL DEFAULT 'MXN' CHECK (moneda ~ '^[A-Z]{3}$'),
    formato_fecha                VARCHAR(10)   NOT NULL DEFAULT 'dd/mm/aaaa'
                                 CHECK (formato_fecha IN ('dd/mm/aaaa', 'aaaa-mm-dd')),
    precios_incluyen_iva         BOOLEAN       NOT NULL DEFAULT TRUE,
    tasa_iva_predeterminada      NUMERIC(5,4)  NOT NULL DEFAULT 0.16
                                 CHECK (tasa_iva_predeterminada >= 0 AND tasa_iva_predeterminada < 1),
    metodos_pago                 VARCHAR(20)[] NOT NULL DEFAULT '{efectivo,tarjeta,transferencia,otro}'
                                 CHECK (cardinality(metodos_pago) >= 1
                                        AND metodos_pago <@ '{efectivo,tarjeta,transferencia,otro}'::varchar[]),
    stock_minimo_predeterminado  NUMERIC(10,3) NOT NULL DEFAULT 5 CHECK (stock_minimo_predeterminado >= 0),
    permitir_sobreventa          BOOLEAN       NOT NULL DEFAULT FALSE,
    requiere_caja_abierta        BOOLEAN       NOT NULL DEFAULT TRUE,
    actualizado_por              BIGINT        REFERENCES usuarios (id) ON DELETE RESTRICT,
    actualizado_en               TIMESTAMPTZ   NOT NULL DEFAULT now()
);

INSERT INTO configuracion (id) VALUES (1);

-- ---------------------------------------------------------------------
-- 10. sesiones_caja: cada usuario puede tener una sola caja abierta.
-- ---------------------------------------------------------------------
CREATE TABLE sesiones_caja (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id         BIGINT        NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
    abierta_en         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    fondo_inicial      NUMERIC(10,2) NOT NULL CHECK (fondo_inicial >= 0),
    estado             VARCHAR(10)   NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
    cerrada_en         TIMESTAMPTZ,
    cerrada_por        BIGINT        REFERENCES usuarios (id) ON DELETE RESTRICT,
    efectivo_esperado  NUMERIC(10,2),
    monto_contado      NUMERIC(10,2) CHECK (monto_contado >= 0),
    diferencia         NUMERIC(10,2),
    notas_cierre       VARCHAR(255),

    CONSTRAINT sesiones_caja_cierre_completo CHECK (
        (estado = 'abierta'
         AND cerrada_en IS NULL AND cerrada_por IS NULL
         AND efectivo_esperado IS NULL AND monto_contado IS NULL AND diferencia IS NULL)
     OR (estado = 'cerrada'
         AND cerrada_en IS NOT NULL AND cerrada_por IS NOT NULL
         AND efectivo_esperado IS NOT NULL AND monto_contado IS NOT NULL
         AND diferencia = monto_contado - efectivo_esperado)
    )
);

CREATE UNIQUE INDEX uq_sesiones_caja_una_abierta ON sesiones_caja (usuario_id) WHERE estado = 'abierta';
CREATE INDEX idx_sesiones_caja_abierta_en ON sesiones_caja (abierta_en);

-- ---------------------------------------------------------------------
-- 11. movimientos_caja: ingresos y retiros extraordinarios de efectivo.
--     Las ventas no se copian aquí: se leen de "ventas".
-- ---------------------------------------------------------------------
CREATE TABLE movimientos_caja (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sesion_caja_id  BIGINT        NOT NULL REFERENCES sesiones_caja (id) ON DELETE RESTRICT,
    usuario_id      BIGINT        NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
    fecha           TIMESTAMPTZ   NOT NULL DEFAULT now(),
    tipo            VARCHAR(10)   NOT NULL CHECK (tipo IN ('ingreso', 'retiro')),
    monto           NUMERIC(10,2) NOT NULL CHECK (monto > 0),
    motivo          VARCHAR(255)  NOT NULL CHECK (length(trim(motivo)) > 0)
);

CREATE INDEX idx_movimientos_caja_sesion ON movimientos_caja (sesion_caja_id);

-- Ventas ligadas a la caja en la que se cobraron; precios con/sin IVA.
ALTER TABLE ventas
    ADD COLUMN sesion_caja_id BIGINT REFERENCES sesiones_caja (id) ON DELETE RESTRICT,
    ADD COLUMN precios_incluyen_iva BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX idx_ventas_sesion_caja ON ventas (sesion_caja_id);

-- Con precios sin IVA, el impuesto se suma al total.
ALTER TABLE ventas DROP CONSTRAINT ventas_total_cuadra;
ALTER TABLE ventas ADD CONSTRAINT ventas_total_cuadra
    CHECK (total = subtotal - descuento + CASE WHEN precios_incluyen_iva THEN 0 ELSE impuestos END);

-- ---------------------------------------------------------------------
-- Cancelación de compras (auditada igual que las ventas).
-- ---------------------------------------------------------------------
ALTER TABLE compras
    ADD COLUMN cancelada_por BIGINT REFERENCES usuarios (id) ON DELETE RESTRICT,
    ADD COLUMN cancelada_en TIMESTAMPTZ,
    ADD COLUMN motivo_cancelacion VARCHAR(255),
    ADD CONSTRAINT compras_cancelacion_completa CHECK (
        (estado = 'confirmada'
         AND cancelada_por IS NULL AND cancelada_en IS NULL AND motivo_cancelacion IS NULL)
     OR (estado = 'cancelada'
         AND cancelada_por IS NOT NULL AND cancelada_en IS NOT NULL
         AND length(trim(coalesce(motivo_cancelacion, ''))) > 0)
    );

-- ---------------------------------------------------------------------
-- Política de sobreventa: si el administrador la habilita, la existencia
-- puede quedar negativa. La aplicación aplica la regla según la
-- configuración, y cada cambio queda en movimientos_inventario.
-- ---------------------------------------------------------------------
ALTER TABLE productos DROP CONSTRAINT productos_existencia_check;

-- ---------------------------------------------------------------------
-- 12. movimientos_inventario: cada cambio de existencia, con signo
--     (+ entrada, - salida), quién, cuándo, motivo o referencia.
-- ---------------------------------------------------------------------
CREATE TABLE movimientos_inventario (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    producto_id          BIGINT        NOT NULL REFERENCES productos (id) ON DELETE RESTRICT,
    usuario_id           BIGINT        NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
    fecha                TIMESTAMPTZ   NOT NULL DEFAULT now(),
    tipo                 VARCHAR(20)   NOT NULL CHECK (tipo IN (
                             'inicial', 'compra', 'venta', 'cancelacion_venta',
                             'cancelacion_compra', 'ajuste_entrada', 'ajuste_salida')),
    cantidad             NUMERIC(10,3) NOT NULL,
    existencia_anterior  NUMERIC(10,3) NOT NULL,
    existencia_nueva     NUMERIC(10,3) NOT NULL,
    venta_id             BIGINT        REFERENCES ventas (id) ON DELETE RESTRICT,
    compra_id            BIGINT        REFERENCES compras (id) ON DELETE RESTRICT,
    motivo               VARCHAR(255),

    CONSTRAINT movimientos_inventario_cuadra
        CHECK (existencia_nueva = existencia_anterior + cantidad),
    CONSTRAINT movimientos_inventario_signo CHECK (
        (tipo IN ('inicial', 'compra', 'cancelacion_venta', 'ajuste_entrada') AND cantidad > 0)
     OR (tipo IN ('venta', 'cancelacion_compra', 'ajuste_salida') AND cantidad < 0)
    ),
    CONSTRAINT movimientos_inventario_referencia CHECK (
        (venta_id IS NOT NULL) = (tipo IN ('venta', 'cancelacion_venta'))
        AND (compra_id IS NOT NULL) = (tipo IN ('compra', 'cancelacion_compra'))
    ),
    CONSTRAINT movimientos_inventario_motivo_ajuste CHECK (
        tipo NOT IN ('ajuste_entrada', 'ajuste_salida')
        OR length(trim(coalesce(motivo, ''))) > 0
    )
);

CREATE INDEX idx_movimientos_inventario_producto ON movimientos_inventario (producto_id, fecha);
CREATE INDEX idx_movimientos_inventario_fecha ON movimientos_inventario (fecha);
CREATE INDEX idx_movimientos_inventario_venta ON movimientos_inventario (venta_id);
CREATE INDEX idx_movimientos_inventario_compra ON movimientos_inventario (compra_id);

-- Saldo de apertura del historial: un movimiento "inicial" por cada
-- producto con existencia, a nombre del primer administrador.
INSERT INTO movimientos_inventario
    (producto_id, usuario_id, tipo, cantidad, existencia_anterior, existencia_nueva, motivo)
SELECT p.id,
       (SELECT id FROM usuarios WHERE rol = 'administrador' ORDER BY id LIMIT 1),
       'inicial', p.existencia, 0, p.existencia,
       'Saldo al activar el historial de inventario'
  FROM productos p
 WHERE p.existencia > 0;

COMMIT;
