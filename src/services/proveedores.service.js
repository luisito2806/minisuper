import { fn, col } from 'sequelize';
import { models } from '../libs/sequelize.js';
import { noEncontrado } from '../libs/errores.js';
import * as v from '../libs/validar.js';

const leer = (data) => ({
    nombre: v.texto(data.nombre, 'nombre', { max: 120, requerido: true }),
    telefono: v.texto(data.telefono, 'teléfono', { max: 20 }),
    correo: v.texto(data.correo, 'correo', { max: 120 }),
    direccion: v.texto(data.direccion, 'dirección', { max: 255 }),
    activo: v.booleano(data.activo, 'activo', true),
});

class proveedoresService {
    constructor() {}

    async create(data) {
        const res = await models.Proveedores.create(leer(data));
        return res;
    }

    /** Proveedores con cuántos productos activos se les compran normalmente. */
    async find() {
        const res = await models.Proveedores.findAll({ order: [['nombre', 'ASC']] });
        const cuentas = await models.Productos.findAll({
            attributes: ['proveedor_id', [fn('count', col('id')), 'num_productos']],
            where: { activo: true },
            group: ['proveedor_id'],
            raw: true,
        });
        const porProveedor = new Map(cuentas.map((c) => [String(c.proveedor_id), Number(c.num_productos)]));
        return res.map((p) => ({ ...p.toJSON(), num_productos: porProveedor.get(String(p.id)) ?? 0 }));
    }

    /** Cuántos productos activos no tienen proveedor (se compran a mano). */
    async sinProveedor() {
        return { num_productos: await models.Productos.count({ where: { activo: true, proveedor_id: null } }) };
    }


    async findOne(id) {
        const res = await models.Proveedores.findByPk(v.id(id));
        return res;
    }

    async update(id, data) {
        const model = await this.findOne(id);
        if (!model) throw noEncontrado('El proveedor');
        const res = await model.update(leer(data));
        return res;
    }

    /** Se desactiva en lugar de borrarse, para conservar sus compras. */
    async delete(id) {
        const model = await this.findOne(id);
        if (!model) throw noEncontrado('El proveedor');
        await model.update({ activo: false });
        return model;
    }
}

export default proveedoresService;
