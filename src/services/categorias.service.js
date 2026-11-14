import { models, obtenerSequelize } from '../libs/sequelize.js';
import { noEncontrado } from '../libs/errores.js';
import * as v from '../libs/validar.js';

const leer = (data) => ({
    nombre: v.texto(data.nombre, 'nombre', { max: 60, requerido: true }),
    descripcion: v.texto(data.descripcion, 'descripción', { max: 200 }),
    activo: v.booleano(data.activo, 'activo', true),
});

class categoriasService {
    constructor() {}

    async create(data) {
        const res = await models.Categorias.create(leer(data));
        return res;
    }

    async find() {
        const db = obtenerSequelize();
        const res = await models.Categorias.findAll({
            attributes: {
                include: [[
                    db.literal('(SELECT count(*)::int FROM productos p WHERE p.categoria_id = "Categorias"."id")'),
                    'num_productos'
                ]]
            },
            order: [['nombre', 'ASC']]
        });
        return res;
    }

    async findOne(id) {
        const res = await models.Categorias.findByPk(v.id(id));
        return res;
    }

    async update(id, data) {
        const model = await this.findOne(id);
        if (!model) throw noEncontrado('La categoría');
        const res = await model.update(leer(data));
        return res;
    }

    /** Se desactiva en lugar de borrarse, para conservar el historial. */
    async delete(id) {
        const model = await this.findOne(id);
        if (!model) throw noEncontrado('La categoría');
        await model.update({ activo: false });
        return model;
    }
}

export default categoriasService;
