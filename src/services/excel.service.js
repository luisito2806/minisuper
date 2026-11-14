/**
 * Exportar a Excel (reportes, ventas, productos, nómina, lista de compra,
 * hoja de conteo) e importar (productos y conteo físico).
 */
import { Op } from 'sequelize';
import { models } from '../libs/sequelize.js';
import { ErrorApp } from '../libs/errores.js';
import { enviarLibro, leerLibro, normalizar } from '../libs/excel.js';
import { rangoFechas } from '../libs/fechas.js';
import * as v from '../libs/validar.js';
import reportesService from './reportes.service.js';
import nominaService from './nomina.service.js';
import inventarioService from './inventario.service.js';
import productosService from './productos.service.js';
import trabajadoresService from './trabajadores.service.js';

const reportes = new reportesService();
const nomina = new nominaService();
const inventario = new inventarioService();
const productos = new productosService();
const trabajadores = new trabajadoresService();

const METODOS = { efectivo: 'Efectivo', credito: 'Crédito (nómina)', tarjeta: 'Tarjeta', transferencia: 'Transferencia', otro: 'Otro' };
const UNIDADES = { pieza: 'pieza', pz: 'pieza', piezas: 'pieza', kg: 'kg', kilo: 'kg', kilos: 'kg', litro: 'litro', l: 'litro', lt: 'litro', litros: 'litro' };

/** Número de una celda de Excel como texto con máximo `escala` decimales. */
function numeroTexto(valor, escala) {
    if (valor === null || valor === undefined || valor === '') return '';
    if (typeof valor === 'number') return String(Number(valor.toFixed(escala)));
    return String(valor).replace(/[$,\s]/g, '');
}

const periodo = (q) => `${v.fecha(q.desde, 'desde') ?? 'inicio'}_a_${v.fecha(q.hasta, 'hasta') ?? 'hoy'}`;

class excelService {
    constructor() {}

    /** Reporte de ventas: resumen, utilidad por día, más vendidos y por método. */
    async reporte(res, query) {
        const r = await reportes.ventas({ ...query, limite: '100' });
        const s = r.resumen;
        await enviarLibro(res, `reporte_${periodo(query)}.xlsx`, [
            {
                nombre: 'Resumen',
                titulo: `Reporte de ventas del ${query.desde ?? ''} al ${query.hasta ?? ''}`,
                columnas: [{ titulo: 'Concepto', clave: 'c', ancho: 30 }, { titulo: 'Valor', clave: 'v', tipo: 'numero', ancho: 16 }],
                filas: [
                    { c: 'Ventas', v: s.num_ventas },
                    { c: 'Total vendido', v: s.total },
                    { c: 'Descuentos', v: s.descuentos },
                    { c: 'IVA', v: s.impuestos },
                    { c: 'Venta sin IVA', v: s.venta_neta },
                    { c: 'Costo de lo vendido', v: s.costo },
                    { c: 'Utilidad estimada', v: s.utilidad },
                    { c: 'Ventas canceladas', v: s.num_canceladas },
                ],
            },
            {
                nombre: 'Utilidad por día',
                columnas: [
                    { titulo: 'Día', clave: 'dia', tipo: 'dia' },
                    { titulo: 'Ventas', clave: 'num_ventas', tipo: 'entero' },
                    { titulo: 'Total cobrado', clave: 'total', tipo: 'moneda', ancho: 16 },
                    { titulo: 'Venta sin IVA', clave: 'venta_neta', tipo: 'moneda', ancho: 16 },
                    { titulo: 'Costo', clave: 'costo', tipo: 'moneda', ancho: 16 },
                    { titulo: 'Utilidad', clave: 'utilidad', tipo: 'moneda', ancho: 16 },
                ],
                filas: r.utilidad_por_dia,
                totales: ['num_ventas', 'total', 'venta_neta', 'costo', 'utilidad'],
            },
            {
                nombre: 'Más vendidos',
                columnas: [
                    { titulo: 'Código', clave: 'codigo', ancho: 16 },
                    { titulo: 'Producto', clave: 'nombre', ancho: 32 },
                    { titulo: 'Categoría', clave: 'categoria', ancho: 18 },
                    { titulo: 'Unidad', clave: 'unidad' },
                    { titulo: 'Cantidad', clave: 'cantidad', tipo: 'numero' },
                    { titulo: 'Importe', clave: 'importe', tipo: 'moneda', ancho: 16 },
                    { titulo: 'Costo', clave: 'costo', tipo: 'moneda', ancho: 16 },
                    { titulo: 'Utilidad aprox.', clave: 'utilidad', tipo: 'moneda', ancho: 16 },
                ],
                filas: r.mas_vendidos,
                totales: ['importe', 'costo', 'utilidad'],
            },
            {
                nombre: 'Por método de pago',
                columnas: [
                    { titulo: 'Método', clave: 'metodo', ancho: 20 },
                    { titulo: 'Ventas', clave: 'num_ventas', tipo: 'entero' },
                    { titulo: 'Total', clave: 'total', tipo: 'moneda', ancho: 16 },
                ],
                filas: r.por_metodo.map((m) => ({ ...m, metodo: METODOS[m.metodo_pago] ?? m.metodo_pago })),
                totales: ['num_ventas', 'total'],
            },
        ]);
    }

    /** Todas las ventas de un periodo, con sus productos en otra hoja. */
    async ventas(res, query) {
        const encontradas = await models.Ventas.findAll({
            where: { [Op.and]: rangoFechas(query, 'Ventas.fecha') },
            include: [
                { model: models.Usuarios, as: 'cajero', attributes: ['nombre'] },
                { model: models.Trabajadores, as: 'trabajador', attributes: ['numero', 'nombre'] },
                {
                    model: models.DetalleVentas,
                    as: 'partidas',
                    include: [{ model: models.Productos, as: 'producto', attributes: ['codigo', 'nombre'] }],
                },
            ],
            order: [['fecha', 'ASC'], [{ model: models.DetalleVentas, as: 'partidas' }, 'id', 'ASC']],
        });
        const ventas = encontradas.map((x) => ({
            ...x.toJSON(),
            cajero: x.cajero?.nombre,
            trabajador_numero: x.trabajador?.numero,
            trabajador: x.trabajador?.nombre,
        }));
        const partidas = encontradas.flatMap((x) => x.partidas.map((d) => ({
            folio: x.folio,
            fecha: x.fecha,
            codigo: d.producto.codigo,
            nombre: d.producto.nombre,
            cantidad: d.cantidad,
            precio_unitario: d.precio_unitario,
            importe: d.importe,
            estado: x.estado,
        })));
        await enviarLibro(res, `ventas_${periodo(query)}.xlsx`, [
            {
                nombre: 'Ventas',
                columnas: [
                    { titulo: 'Folio', clave: 'folio' },
                    { titulo: 'Fecha', clave: 'fecha', tipo: 'fecha', ancho: 18 },
                    { titulo: 'Cajero', clave: 'cajero', ancho: 18 },
                    { titulo: 'Método', clave: 'metodo', ancho: 18 },
                    { titulo: 'Núm. trabajador', clave: 'trabajador_numero' },
                    { titulo: 'Trabajador', clave: 'trabajador', ancho: 24 },
                    { titulo: 'Subtotal', clave: 'subtotal', tipo: 'moneda' },
                    { titulo: 'Descuento', clave: 'descuento', tipo: 'moneda' },
                    { titulo: 'IVA', clave: 'impuestos', tipo: 'moneda' },
                    { titulo: 'Total', clave: 'total', tipo: 'moneda' },
                    { titulo: 'Estado', clave: 'estado' },
                    { titulo: 'Motivo de cancelación', clave: 'motivo_cancelacion', ancho: 30 },
                    { titulo: 'Descontado en nómina', clave: 'descontado_en', tipo: 'fecha', ancho: 20 },
                ],
                filas: ventas.map((x) => ({ ...x, metodo: METODOS[x.metodo_pago] ?? x.metodo_pago })),
            },
            {
                nombre: 'Productos vendidos',
                columnas: [
                    { titulo: 'Folio', clave: 'folio' },
                    { titulo: 'Fecha', clave: 'fecha', tipo: 'fecha', ancho: 18 },
                    { titulo: 'Código', clave: 'codigo', ancho: 16 },
                    { titulo: 'Producto', clave: 'nombre', ancho: 32 },
                    { titulo: 'Cantidad', clave: 'cantidad', tipo: 'numero' },
                    { titulo: 'Precio', clave: 'precio_unitario', tipo: 'moneda' },
                    { titulo: 'Importe', clave: 'importe', tipo: 'moneda' },
                    { titulo: 'Estado de la venta', clave: 'estado' },
                ],
                filas: partidas,
            },
        ]);
    }

    /** Catálogo de productos. Sirve también como plantilla para importar. */
    async productos(res) {
        const productos = await models.Productos.findAll({
            include: [{ model: models.Categorias, as: 'categoria', attributes: ['nombre'] }],
            order: [['nombre', 'ASC']],
        });
        const filas = productos.map((p) => ({
            ...p.toJSON(),
            categoria: p.categoria.nombre,
            iva: Math.round(Number(p.tasa_iva) * 10000) / 100,
            activo: p.activo ? 'Sí' : 'No',
        }));
        await enviarLibro(res, 'productos.xlsx', [{
            nombre: 'Productos',
            columnas: [
                { titulo: 'Código', clave: 'codigo', ancho: 18 },
                { titulo: 'Nombre', clave: 'nombre', ancho: 32 },
                { titulo: 'Categoría', clave: 'categoria', ancho: 18 },
                { titulo: 'Precio venta', clave: 'precio_venta', tipo: 'moneda' },
                { titulo: 'Costo', clave: 'costo', tipo: 'moneda' },
                { titulo: 'IVA %', clave: 'iva', tipo: 'numero' },
                { titulo: 'Stock mínimo', clave: 'stock_minimo', tipo: 'numero' },
                { titulo: 'Unidad', clave: 'unidad' },
                { titulo: 'Existencia', clave: 'existencia', tipo: 'numero' },
                { titulo: 'Activo', clave: 'activo' },
            ],
            filas,
        }]);
    }

    /** Hoja para el conteo físico: se llena la columna "Contado" y se carga de vuelta. */
    async hojaConteo(res, query) {
        const where = { activo: true };
        if (query.categoria_id) where.categoria_id = v.id(query.categoria_id, 'categoría');
        const productos = await models.Productos.findAll({
            where,
            attributes: ['codigo', 'nombre', 'unidad', 'existencia'],
            include: [{ model: models.Categorias, as: 'categoria', attributes: ['nombre'] }],
            order: [[{ model: models.Categorias, as: 'categoria' }, 'nombre', 'ASC'], ['nombre', 'ASC']],
        });
        const filas = productos.map((p) => ({ ...p.toJSON(), categoria: p.categoria.nombre }));
        await enviarLibro(res, 'conteo_fisico.xlsx', [{
            nombre: 'Conteo',
            titulo: 'Conteo físico: escribe en "Contado" lo que hay en el anaquel y carga el archivo en Inventario',
            columnas: [
                { titulo: 'Código', clave: 'codigo', ancho: 18 },
                { titulo: 'Producto', clave: 'nombre', ancho: 34 },
                { titulo: 'Categoría', clave: 'categoria', ancho: 18 },
                { titulo: 'Unidad', clave: 'unidad' },
                { titulo: 'Existencia registrada', clave: 'existencia', tipo: 'numero', ancho: 22 },
                { titulo: 'Contado', clave: 'contado', tipo: 'numero', ancho: 14 },
            ],
            filas,
        }]);
    }

    /** Descuentos de nómina de la semana: resumen por trabajador y detalle. */
    async nomina(res, query) {
        const s = await nomina.semana(query);
        const ventas = await models.Ventas.findAll({
            where: {
                metodo_pago: 'credito',
                estado: 'completada',
                [Op.and]: rangoFechas({ desde: s.inicio, hasta: s.fin }, 'Ventas.fecha'),
            },
            attributes: ['folio', 'fecha', 'total', 'descontado_en'],
            include: [{ model: models.Trabajadores, as: 'trabajador', attributes: ['numero', 'nombre'] }],
            order: [[{ model: models.Trabajadores, as: 'trabajador' }, 'nombre', 'ASC'], ['fecha', 'ASC']],
        });
        const detalle = ventas.map((x) => ({
            ...x.toJSON(),
            numero: x.trabajador.numero,
            trabajador: x.trabajador.nombre,
        }));
        await enviarLibro(res, `nomina_${s.inicio}_a_${s.fin}.xlsx`, [
            {
                nombre: 'Descuentos',
                titulo: `Descuentos de nómina · semana del ${s.inicio} al ${s.fin} (sábado a viernes)`,
                columnas: [
                    { titulo: 'Núm. trabajador', clave: 'numero', ancho: 16 },
                    { titulo: 'Nombre', clave: 'nombre', ancho: 30 },
                    { titulo: 'Área', clave: 'area', ancho: 16 },
                    { titulo: 'Compras', clave: 'num_ventas', tipo: 'entero' },
                    { titulo: 'Total a descontar', clave: 'total', tipo: 'moneda', ancho: 18 },
                    { titulo: 'Pendiente', clave: 'pendiente', tipo: 'moneda', ancho: 14 },
                ],
                filas: s.trabajadores,
                totales: ['num_ventas', 'total', 'pendiente'],
            },
            {
                nombre: 'Detalle',
                columnas: [
                    { titulo: 'Núm. trabajador', clave: 'numero', ancho: 16 },
                    { titulo: 'Nombre', clave: 'trabajador', ancho: 30 },
                    { titulo: 'Folio', clave: 'folio' },
                    { titulo: 'Fecha', clave: 'fecha', tipo: 'fecha', ancho: 18 },
                    { titulo: 'Total', clave: 'total', tipo: 'moneda' },
                    { titulo: 'Descontado', clave: 'descontado_en', tipo: 'fecha', ancho: 18 },
                ],
                filas: detalle,
                totales: ['total'],
            },
        ]);
    }

    /** Lista de compra sugerida. */
    async sugerida(res) {
        const filas = await inventario.sugerida();
        await enviarLibro(res, 'lista_de_compra.xlsx', [{
            nombre: 'Lista de compra',
            columnas: [
                { titulo: 'Proveedor (última compra)', clave: 'proveedor', ancho: 26 },
                { titulo: 'Código', clave: 'codigo', ancho: 18 },
                { titulo: 'Producto', clave: 'nombre', ancho: 32 },
                { titulo: 'Unidad', clave: 'unidad' },
                { titulo: 'Existencia', clave: 'existencia', tipo: 'numero' },
                { titulo: 'Mínimo', clave: 'stock_minimo', tipo: 'numero' },
                { titulo: 'Vendido 14 días', clave: 'vendido_14_dias', tipo: 'numero', ancho: 16 },
                { titulo: 'Comprar', clave: 'sugerido', tipo: 'numero' },
                { titulo: 'Costo', clave: 'costo', tipo: 'moneda' },
            ],
            filas,
        }]);
    }

    /** Importa productos desde un Excel con las columnas de la exportación. */
    async importarProductos(data, usuario) {
        const filas = await leerLibro(data.archivo, ['codigo', 'nombre']);
        const unidad = (u) => (u ? UNIDADES[normalizar(u)] ?? String(u) : undefined);
        const iva = (x) => {
            if (x === null || x === undefined || x === '') return undefined;
            const n = Number(numeroTexto(x, 4));
            // Se acepta "16" (porcentaje) o "0.16" (fracción).
            return Number.isFinite(n) && n >= 1 ? String(Number((n / 100).toFixed(4))) : numeroTexto(x, 4);
        };
        return productos.importar(filas.map((f) => ({
            fila: f._fila,
            codigo: f.codigo === null ? '' : String(f.codigo).trim(),
            nombre: f.nombre === null ? '' : String(f.nombre),
            categoria: f.categoria === null ? '' : String(f.categoria ?? ''),
            precio_venta: numeroTexto(f['precio venta'] ?? f.precio, 2),
            costo: numeroTexto(f.costo, 2),
            tasa_iva: iva(f['iva %'] ?? f.iva),
            stock_minimo: numeroTexto(f['stock minimo'] ?? f.minimo, 3),
            unidad: unidad(f.unidad),
            existencia: numeroTexto(f.existencia, 3),
            activo: f.activo === null || f.activo === undefined ? true : !['no', 'false', '0'].includes(normalizar(f.activo)),
        })), usuario);
    }

    /**
     * Lee una hoja de conteo llenada (columnas "Código" y "Contado") y
     * devuelve los productos encontrados para revisarlos antes de aplicar.
     */
    /** Lista de trabajadores. Sirve también como plantilla para importar. */
    async trabajadores(res) {
        const filas = (await models.Trabajadores.findAll({ order: [['nombre', 'ASC']] }))
            .map((t) => ({ ...t.toJSON(), activo: t.activo ? 'Sí' : 'No' }));
        await enviarLibro(res, 'trabajadores.xlsx', [{
            nombre: 'Trabajadores',
            columnas: [
                { titulo: 'Número', clave: 'numero', ancho: 14 },
                { titulo: 'Nombre', clave: 'nombre', ancho: 34 },
                { titulo: 'Área', clave: 'area', ancho: 20 },
                { titulo: 'Activo', clave: 'activo', ancho: 10 },
            ],
            filas,
        }]);
    }

    /** Importa trabajadores de un Excel con columnas Número, Nombre y (opcional) Área y Activo. */
    async importarTrabajadores(data) {
        const filas = await leerLibro(data.archivo, ['numero', 'nombre']);
        const texto = (x) => (x === null || x === undefined ? '' : String(x).trim());
        return trabajadores.importar(filas.map((f) => ({
            fila: f._fila,
            // Excel guarda 1001 como número: se pasa a texto sin decimales.
            numero: typeof f.numero === 'number' ? String(Math.trunc(f.numero)) : texto(f.numero),
            nombre: texto(f.nombre),
            area: texto(f.area ?? f.departamento),
            activo: f.activo === null || f.activo === undefined || texto(f.activo) === ''
                ? true
                : !['no', 'false', '0', 'baja'].includes(normalizar(f.activo)),
        })));
    }

    async leerConteo(data) {
        const filas = (await leerLibro(data.archivo, ['codigo', 'contado']))
            .filter((f) => f.contado !== null && f.contado !== undefined && String(f.contado).trim() !== '');
        if (!filas.length) throw new ErrorApp(400, 'La columna "Contado" está vacía: escribe lo que contaste.');
        const codigos = filas.map((f) => String(f.codigo ?? '').trim());
        const encontrados = new Map((await models.Productos.findAll({
            where: { codigo: codigos },
            attributes: ['id', 'codigo', 'nombre', 'unidad', 'existencia'],
            raw: true,
        })).map((p) => [p.codigo, p]));

        const partidas = [];
        const noEncontrados = [];
        for (const f of filas) {
            const p = encontrados.get(String(f.codigo ?? '').trim());
            if (!p) {
                noEncontrados.push(`Fila ${f._fila}: código "${f.codigo ?? ''}"`);
                continue;
            }
            partidas.push({ ...p, contado: numeroTexto(f.contado, 3) });
        }
        return { partidas, no_encontrados: noEncontrados };
    }
}

export default excelService;
