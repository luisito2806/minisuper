-- =====================================================================
-- Mini Súper - 01: esquema (8 tablas)
-- Ejecutar conectado a la base "minisuper" COMO "minisuper_app", para
-- que las tablas le pertenezcan a la aplicación (no a "postgres").
-- Orden por dependencias: usuarios, categorias, proveedores, productos,
-- ventas, detalle_ventas, compras, detalle_compras.
-- =====================================================================

BEGIN;

-- Hash de contraseñas (bcrypt) para los datos iniciales.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Folios legibles: V-000001, C-000001
CREATE SEQUENCE IF NOT EXISTS folio_ventas_seq;
CREATE SEQUENCE IF NOT EXISTS folio_compras_seq;

-- ---------------------------------------------------------------------
-- 1. usuarios
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre           VARCHAR(100) NOT NULL,
    usuario          VARCHAR(50)  NOT NULL UNIQUE,
    contrasena_hash  VARCHAR(255) NOT NULL,
    rol              VARCHAR(20)  NOT NULL
                     CHECK (rol IN ('administrador', 'cajero')),
    activo           BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (length(trim(nombre)) > 0),
    CHECK (length(trim(usuario)) > 0)
);

-- ---------------------------------------------------------------------
-- 2. categorias
-- ---------------------------------------------------------------------
CREATE TABLE categorias (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre       VARCHAR(60)  NOT NULL UNIQUE,
    descripcion  VARCHAR(200),
    activo       BOOLEAN      NOT NULL DEFAULT TRUE,
    CHECK (length(trim(nombre)) > 0)
);

-- ---------------------------------------------------------------------
-- 3. proveedores
-- ---------------------------------------------------------------------
CREATE TABLE proveedores (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre     VARCHAR(120) NOT NULL,
    telefono   VARCHAR(20),
    correo     VARCHAR(120),
    direccion  VARCHAR(255),
    activo     BOOLEAN      NOT NULL DEFAULT TRUE,
    CHECK (length(trim(nombre)) > 0)
);

-- ---------------------------------------------------------------------
-- 4. productos
--    precio_venta incluye IVA. tasa_iva: 0.16 general, 0 alimentos básicos.
-- ---------------------------------------------------------------------
CREATE TABLE productos (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo          VARCHAR(50)   NOT NULL UNIQUE,
    nombre          VARCHAR(120)  NOT NULL,
    descripcion     VARCHAR(255),
    categoria_id    BIGINT        NOT NULL
                    REFERENCES categorias (id) ON DELETE RESTRICT,
    precio_venta    NUMERIC(10,2) NOT NULL CHECK (precio_venta >= 0),
    costo           NUMERIC(10,2) NOT NULL CHECK (costo >= 0),
    tasa_iva        NUMERIC(5,4)  NOT NULL DEFAULT 0.16
                    CHECK (tasa_iva >= 0 AND tasa_iva < 1),
    existencia      NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (existencia >= 0),
    stock_minimo    NUMERIC(10,3) NOT NULL DEFAULT 5 CHECK (stock_minimo >= 0),
    unidad          VARCHAR(10)   NOT NULL DEFAULT 'pieza'
                    CHECK (unidad IN ('pieza', 'kg', 'litro')),
    activo          BOOLEAN       NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CHECK (length(trim(codigo)) > 0),
    CHECK (length(trim(nombre)) > 0),
    -- Las piezas no se venden en fracciones.
    CHECK (unidad <> 'pieza' OR existencia = trunc(existencia))
);

CREATE INDEX idx_productos_nombre    ON productos (lower(nombre));
CREATE INDEX idx_productos_categoria ON productos (categoria_id);

-- ---------------------------------------------------------------------
-- 5. ventas
--    subtotal = suma de importes (IVA incluido)
--    total    = subtotal - descuento
--    impuestos = IVA contenido en el total (informativo)
-- ---------------------------------------------------------------------
CREATE TABLE ventas (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    folio               VARCHAR(20)   NOT NULL UNIQUE
                        DEFAULT 'V-' || lpad(nextval('folio_ventas_seq')::text, 6, '0'),
    usuario_id          BIGINT        NOT NULL
                        REFERENCES usuarios (id) ON DELETE RESTRICT,
    fecha               TIMESTAMPTZ   NOT NULL DEFAULT now(),
    subtotal            NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
    descuento           NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
    impuestos           NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (impuestos >= 0),
    total               NUMERIC(10,2) NOT NULL CHECK (total >= 0),
    metodo_pago         VARCHAR(20)   NOT NULL
                        CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'transferencia', 'otro')),
    monto_recibido      NUMERIC(10,2) CHECK (monto_recibido >= 0),
    cambio              NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cambio >= 0),
    estado              VARCHAR(15)   NOT NULL DEFAULT 'completada'
                        CHECK (estado IN ('completada', 'cancelada')),
    cancelada_por       BIGINT        REFERENCES usuarios (id) ON DELETE RESTRICT,
    cancelada_en        TIMESTAMPTZ,
    motivo_cancelacion  VARCHAR(255),

    CONSTRAINT ventas_total_cuadra
        CHECK (total = subtotal - descuento),
    CONSTRAINT ventas_efectivo_cubre_total
        CHECK (metodo_pago <> 'efectivo'
               OR (monto_recibido IS NOT NULL
                   AND monto_recibido >= total
                   AND cambio = monto_recibido - total)),
    CONSTRAINT ventas_cancelacion_completa
        CHECK (
            (estado = 'completada'
             AND cancelada_por IS NULL AND cancelada_en IS NULL AND motivo_cancelacion IS NULL)
         OR (estado = 'cancelada'
             AND cancelada_por IS NOT NULL AND cancelada_en IS NOT NULL
             AND length(trim(coalesce(motivo_cancelacion, ''))) > 0)
        )
);

CREATE INDEX idx_ventas_fecha   ON ventas (fecha);
CREATE INDEX idx_ventas_usuario ON ventas (usuario_id);

-- ---------------------------------------------------------------------
-- 6. detalle_ventas
--    precio_unitario y tasa_iva se copian del producto al vender.
-- ---------------------------------------------------------------------
CREATE TABLE detalle_ventas (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venta_id         BIGINT        NOT NULL REFERENCES ventas (id) ON DELETE RESTRICT,
    producto_id      BIGINT        NOT NULL REFERENCES productos (id) ON DELETE RESTRICT,
    cantidad         NUMERIC(10,3) NOT NULL CHECK (cantidad > 0),
    precio_unitario  NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0),
    tasa_iva         NUMERIC(5,4)  NOT NULL CHECK (tasa_iva >= 0 AND tasa_iva < 1),
    importe          NUMERIC(10,2) NOT NULL CHECK (importe >= 0),
    CONSTRAINT detalle_ventas_producto_unico UNIQUE (venta_id, producto_id),
    CONSTRAINT detalle_ventas_importe_cuadra
        CHECK (importe = round(cantidad * precio_unitario, 2))
);

CREATE INDEX idx_detalle_ventas_producto ON detalle_ventas (producto_id);

-- ---------------------------------------------------------------------
-- 7. compras
-- ---------------------------------------------------------------------
CREATE TABLE compras (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    folio         VARCHAR(20)   NOT NULL UNIQUE
                  DEFAULT 'C-' || lpad(nextval('folio_compras_seq')::text, 6, '0'),
    proveedor_id  BIGINT        NOT NULL REFERENCES proveedores (id) ON DELETE RESTRICT,
    usuario_id    BIGINT        NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
    fecha         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    total         NUMERIC(10,2) NOT NULL CHECK (total >= 0),
    estado        VARCHAR(15)   NOT NULL DEFAULT 'confirmada'
                  CHECK (estado IN ('confirmada', 'cancelada')),
    notas         VARCHAR(255)
);

CREATE INDEX idx_compras_fecha     ON compras (fecha);
CREATE INDEX idx_compras_proveedor ON compras (proveedor_id);
CREATE INDEX idx_compras_usuario   ON compras (usuario_id);

-- ---------------------------------------------------------------------
-- 8. detalle_compras
-- ---------------------------------------------------------------------
CREATE TABLE detalle_compras (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    compra_id       BIGINT        NOT NULL REFERENCES compras (id) ON DELETE RESTRICT,
    producto_id     BIGINT        NOT NULL REFERENCES productos (id) ON DELETE RESTRICT,
    cantidad        NUMERIC(10,3) NOT NULL CHECK (cantidad > 0),
    costo_unitario  NUMERIC(10,2) NOT NULL CHECK (costo_unitario >= 0),
    importe         NUMERIC(10,2) NOT NULL CHECK (importe >= 0),
    CONSTRAINT detalle_compras_producto_unico UNIQUE (compra_id, producto_id),
    CONSTRAINT detalle_compras_importe_cuadra
        CHECK (importe = round(cantidad * costo_unitario, 2))
);

CREATE INDEX idx_detalle_compras_producto ON detalle_compras (producto_id);

-- Mantener actualizado_en de productos.
CREATE FUNCTION tocar_actualizado_en() RETURNS trigger AS $$
BEGIN
    NEW.actualizado_en := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_productos_actualizado_en
    BEFORE UPDATE ON productos
    FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();

COMMIT;
