import bcrypt from 'bcryptjs';

const CATEGORIAS = [
    ['Abarrotes', 'Productos básicos de despensa'],
    ['Bebidas', 'Refrescos, aguas y jugos'],
    ['Lácteos', 'Leche, quesos y yogurt'],
    ['Botanas', 'Frituras, galletas y dulces'],
    ['Limpieza', 'Productos de limpieza del hogar'],
    ['Frutas y verduras', 'Productos a granel'],
];

// código, nombre, categoría, precio, costo, IVA, existencia, mínimo, unidad
const PRODUCTOS = [
    ['7501000000011', 'Arroz 1 kg', 'Abarrotes', '32.00', '24.00', '0', '40', '10', 'pieza'],
    ['7501000000028', 'Frijol negro 1 kg', 'Abarrotes', '38.00', '29.00', '0', '35', '10', 'pieza'],
    ['7501000000035', 'Aceite vegetal 1 L', 'Abarrotes', '45.00', '36.00', '0', '20', '5', 'pieza'],
    ['7501000000042', 'Azúcar 1 kg', 'Abarrotes', '34.00', '26.00', '0', '30', '10', 'pieza'],
    ['7501000000059', 'Atún en agua 140 g', 'Abarrotes', '22.00', '16.00', '0', '50', '12', 'pieza'],
    ['7501000000066', 'Refresco cola 600 ml', 'Bebidas', '20.00', '14.50', '0.16', '60', '24', 'pieza'],
    ['7501000000073', 'Agua natural 1 L', 'Bebidas', '14.00', '9.00', '0', '48', '12', 'pieza'],
    ['7501000000080', 'Jugo de naranja 1 L', 'Bebidas', '32.00', '24.00', '0.16', '18', '6', 'pieza'],
    ['7501000000097', 'Leche entera 1 L', 'Lácteos', '28.00', '22.00', '0', '36', '12', 'pieza'],
    ['7501000000103', 'Yogurt natural 1 kg', 'Lácteos', '42.00', '32.00', '0', '12', '4', 'pieza'],
    ['7501000000110', 'Queso panela 400 g', 'Lácteos', '68.00', '52.00', '0', '8', '3', 'pieza'],
    ['7501000000127', 'Papas fritas 45 g', 'Botanas', '19.00', '13.00', '0.16', '40', '10', 'pieza'],
    ['7501000000134', 'Galletas de chocolate', 'Botanas', '24.00', '17.00', '0.16', '30', '10', 'pieza'],
    ['7501000000141', 'Chocolate en barra 40 g', 'Botanas', '16.00', '11.00', '0.16', '3', '8', 'pieza'],
    ['7501000000158', 'Detergente en polvo 1 kg', 'Limpieza', '48.00', '37.00', '0.16', '15', '5', 'pieza'],
    ['7501000000165', 'Cloro 1 L', 'Limpieza', '22.00', '15.00', '0.16', '20', '6', 'pieza'],
    ['7501000000172', 'Jabón de trastes 750 ml', 'Limpieza', '35.00', '26.00', '0.16', '0', '5', 'pieza'],
    ['INT-0001', 'Jitomate', 'Frutas y verduras', '28.00', '19.00', '0', '15.5', '5', 'kg'],
    ['INT-0002', 'Plátano', 'Frutas y verduras', '24.00', '16.00', '0', '12', '5', 'kg'],
    ['INT-0003', 'Cebolla blanca', 'Frutas y verduras', '30.00', '21.00', '0', '8.25', '4', 'kg'],
];

/**
 * Datos iniciales. Solo se insertan si la tabla está vacía, así que es
 * seguro ejecutarlo en cada arranque.
 *   - Siempre: la fila de configuración y los usuarios admin y cajero.
 *   - Con datosDePrueba: categorías, proveedores, 20 productos y 3 trabajadores.
 * Contraseñas iniciales (cambiarlas al primer uso): admin / Admin123!,
 * cajero / Cajero123!
 */
export async function sembrar(sequelize, { datosDePrueba = false } = {}) {
    const { Configuracion, Usuarios, Categorias, Proveedores, Productos, MovimientosInventario, Trabajadores } = sequelize.models;

    await Configuracion.findOrCreate({ where: { id: 1 }, defaults: { id: 1 } });

    if ((await Usuarios.count()) === 0) {
        await Usuarios.bulkCreate([
            { nombre: 'Administrador', usuario: 'admin', contrasena_hash: await bcrypt.hash('Admin123!', 10), rol: 'administrador' },
            { nombre: 'Cajero 1', usuario: 'cajero', contrasena_hash: await bcrypt.hash('Cajero123!', 10), rol: 'cajero' },
        ]);
    }

    if (datosDePrueba && (await Trabajadores.count()) === 0) {
        await Trabajadores.bulkCreate([
            { numero: '1001', nombre: 'Juan Pérez', area: 'Almacén' },
            { numero: '1002', nombre: 'María López', area: 'Producción' },
            { numero: '1003', nombre: 'Carlos Ramírez', area: 'Producción' },
        ]);
    }

    if (!datosDePrueba || (await Productos.count()) > 0) return;

    await sequelize.transaction(async (transaction) => {
        const admin = await Usuarios.findOne({ where: { rol: 'administrador' }, order: [['id', 'ASC']], transaction });
        if ((await Categorias.count({ transaction })) === 0) {
            await Categorias.bulkCreate(CATEGORIAS.map(([nombre, descripcion]) => ({ nombre, descripcion })), { transaction });
        }
        if ((await Proveedores.count({ transaction })) === 0) {
            await Proveedores.bulkCreate([
                { nombre: 'Distribuidora del Centro', telefono: '4431234567', correo: 'ventas@distcentro.example' },
                { nombre: 'Abastos Morelia', telefono: '4437654321' },
                { nombre: 'Coca-Cola', telefono: '4430001111' },
                { nombre: 'Bimbo', telefono: '4430002222' },
                { nombre: 'Sabritas', telefono: '4430003333' },
            ], { transaction });
        }
        const categorias = new Map((await Categorias.findAll({ transaction })).map((c) => [c.nombre, c.id]));
        const proveedores = new Map((await Proveedores.findAll({ transaction })).map((x) => [x.nombre, x.id]));
        // Proveedor habitual de los productos de ejemplo (frutas y verduras: compra manual).
        const proveedorDe = (codigo, categoria) => proveedores.get(
            ['7501000000066', '7501000000073', '7501000000080'].includes(codigo) ? 'Coca-Cola'
                : ['7501000000134', '7501000000141'].includes(codigo) ? 'Bimbo'
                    : codigo === '7501000000127' ? 'Sabritas'
                        : categoria === 'Frutas y verduras' ? null
                            : 'Distribuidora del Centro'
        ) ?? null;
        for (const [codigo, nombre, categoria, precio, costo, iva, existencia, minimo, unidad] of PRODUCTOS) {
            const p = await Productos.create({
                codigo, nombre, categoria_id: categorias.get(categoria), precio_venta: precio, costo,
                tasa_iva: iva, existencia, stock_minimo: minimo, unidad, proveedor_id: proveedorDe(codigo, categoria),

            }, { transaction });
            if (Number(existencia) > 0) {
                await MovimientosInventario.create({
                    producto_id: p.id, usuario_id: admin.id, tipo: 'inicial', cantidad: existencia,
                    existencia_anterior: '0', existencia_nueva: existencia, motivo: 'Inventario inicial de prueba',
                }, { transaction });
            }
        }
    });
}
