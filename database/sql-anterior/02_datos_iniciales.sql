-- =====================================================================
-- Mini Súper - 02: datos iniciales de prueba
-- Ejecutar después de 01_esquema.sql, conectado a "minisuper".
-- Contraseñas iniciales (CAMBIARLAS al primer uso):
--   admin  / Admin123!
--   cajero / Cajero123!
-- =====================================================================

BEGIN;

INSERT INTO usuarios (nombre, usuario, contrasena_hash, rol) VALUES
    ('Administrador', 'admin',  crypt('Admin123!',  gen_salt('bf', 10)), 'administrador'),
    ('Cajero 1',      'cajero', crypt('Cajero123!', gen_salt('bf', 10)), 'cajero');

INSERT INTO categorias (nombre, descripcion) VALUES
    ('Abarrotes', 'Productos básicos de despensa'),
    ('Bebidas',   'Refrescos, aguas y jugos'),
    ('Lácteos',   'Leche, quesos y yogurt'),
    ('Botanas',   'Frituras, galletas y dulces'),
    ('Limpieza',  'Productos de limpieza del hogar'),
    ('Frutas y verduras', 'Productos a granel');

INSERT INTO proveedores (nombre, telefono, correo) VALUES
    ('Distribuidora del Centro', '4431234567', 'ventas@distcentro.example'),
    ('Abastos Morelia',          '4437654321', NULL);

-- codigo, nombre, categoria, precio, costo, iva, existencia, minimo, unidad
INSERT INTO productos (codigo, nombre, categoria_id, precio_venta, costo, tasa_iva, existencia, stock_minimo, unidad)
SELECT p.codigo, p.nombre, c.id, p.precio, p.costo, p.iva, p.existencia, p.minimo, p.unidad
FROM (VALUES
    ('7501000000011', 'Arroz 1 kg',                'Abarrotes',  32.00, 24.00, 0.00, 40, 10, 'pieza'),
    ('7501000000028', 'Frijol negro 1 kg',         'Abarrotes',  38.00, 29.00, 0.00, 35, 10, 'pieza'),
    ('7501000000035', 'Aceite vegetal 1 L',        'Abarrotes',  45.00, 36.00, 0.00, 20,  5, 'pieza'),
    ('7501000000042', 'Azúcar 1 kg',               'Abarrotes',  34.00, 26.00, 0.00, 30, 10, 'pieza'),
    ('7501000000059', 'Atún en agua 140 g',        'Abarrotes',  22.00, 16.00, 0.00, 50, 12, 'pieza'),
    ('7501000000066', 'Refresco cola 600 ml',      'Bebidas',    20.00, 14.50, 0.16, 60, 24, 'pieza'),
    ('7501000000073', 'Agua natural 1 L',          'Bebidas',    14.00,  9.00, 0.00, 48, 12, 'pieza'),
    ('7501000000080', 'Jugo de naranja 1 L',       'Bebidas',    32.00, 24.00, 0.16, 18,  6, 'pieza'),
    ('7501000000097', 'Leche entera 1 L',          'Lácteos',    28.00, 22.00, 0.00, 36, 12, 'pieza'),
    ('7501000000103', 'Yogurt natural 1 kg',       'Lácteos',    42.00, 32.00, 0.00, 12,  4, 'pieza'),
    ('7501000000110', 'Queso panela 400 g',        'Lácteos',    68.00, 52.00, 0.00,  8,  3, 'pieza'),
    ('7501000000127', 'Papas fritas 45 g',         'Botanas',    19.00, 13.00, 0.16, 40, 10, 'pieza'),
    ('7501000000134', 'Galletas de chocolate',     'Botanas',    24.00, 17.00, 0.16, 30, 10, 'pieza'),
    ('7501000000141', 'Chocolate en barra 40 g',   'Botanas',    16.00, 11.00, 0.16,  3,  8, 'pieza'),
    ('7501000000158', 'Detergente en polvo 1 kg',  'Limpieza',   48.00, 37.00, 0.16, 15,  5, 'pieza'),
    ('7501000000165', 'Cloro 1 L',                 'Limpieza',   22.00, 15.00, 0.16, 20,  6, 'pieza'),
    ('7501000000172', 'Jabón de trastes 750 ml',   'Limpieza',   35.00, 26.00, 0.16,  0,  5, 'pieza'),
    ('INT-0001',      'Jitomate',                  'Frutas y verduras', 28.00, 19.00, 0.00, 15.500, 5, 'kg'),
    ('INT-0002',      'Plátano',                   'Frutas y verduras', 24.00, 16.00, 0.00, 12.000, 5, 'kg'),
    ('INT-0003',      'Cebolla blanca',            'Frutas y verduras', 30.00, 21.00, 0.00,  8.250, 4, 'kg')
) AS p(codigo, nombre, categoria, precio, costo, iva, existencia, minimo, unidad)
JOIN categorias c ON c.nombre = p.categoria;

COMMIT;
