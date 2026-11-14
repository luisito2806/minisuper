import { Op, fn, col } from 'sequelize';
import { models, obtenerSequelize } from '../libs/sequelize.js';
import { ErrorApp, noEncontrado } from '../libs/errores.js';
import * as v from '../libs/validar.js';

const esAdmin = (usuario) => usuario?.rol === 'administrador';

const leer = (data) => ({
    numero: v.texto(data.numero, 'número de trabajador', { max: 20, requerido: true }),
    nombre: v.texto(data.nombre, 'nombre', { max: 120, requerido: true }),
    area: v.texto(data.area, 'área', { max: 80 }),
    activo: v.booleano(data.activo, 'activo', true),
});

class trabajadoresService {
    constructor() {}

    async create(data) {
        const res = await models.Trabajadores.create(leer(data));
        return res;
    }

    /**
     * Lista de trabajadores. El cajero solo ve los activos (para vender a
     * crédito); el administrador ve todos y lo que deben sin descontar.
     */
    async find(query, usuario) {
        if (!esAdmin(usuario)) {
            return models.Trabajadores.findAll({
                where: { activo: true },
                attributes: ['id', 'numero', 'nombre'],
                order: [['nombre', 'ASC']],
            });
        }
        const where = {};
        const q = v.texto(query.q, 'búsqueda', { max: 120 });
        if (q) {
            const patron = `%${q.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
            where[Op.or] = [{ nombre: { [Op.iLike]: patron } }, { numero: q }];
        }
        const trabajadores = await models.Trabajadores.findAll({
            where,
            order: [['activo', 'DESC'], ['nombre', 'ASC']],
        });

        // Lo que cada uno debe: ventas a crédito completadas aún no descontadas.
        const adeudos = await models.Ventas.findAll({
            attributes: [
                'trabajador_id',
                [fn('sum', col('total')), 'pendiente'],
                [fn('count', col('id')), 'ventas_pendientes'],
            ],
            where: { metodo_pago: 'credito', estado: 'completada', descontado_en: null },
            group: ['trabajador_id'],
            raw: true,
        });
        const porTrabajador = new Map(adeudos.map((a) => [String(a.trabajador_id), a]));

        return trabajadores.map((t) => {
            const a = porTrabajador.get(String(t.id));
            return {
                ...t.toJSON(),
                pendiente: a?.pendiente ?? '0',
                ventas_pendientes: Number(a?.ventas_pendientes ?? 0),
            };
        });
    }

    async findOne(id) {
        const res = await models.Trabajadores.findByPk(v.id(id));
        if (!res) throw noEncontrado('El trabajador');
        return res;
    }

    async update(id, data) {
        const model = await this.findOne(id);
        const res = await model.update(leer(data));
        return res;
    }

    /**
     * Alta y actualización masiva (importar de Excel). Cada fila:
     *   { fila, numero, nombre, area, activo }
     * Si el número ya existe se actualizan nombre, área y estado; si no, se
     * da de alta. Primero se validan todas: si alguna falla, no se aplica nada.
     */
    async importar(filas) {
        const errores = [];
        const leidos = [];
        const numeros = new Set();
        for (const f of filas) {
            try {
                const campos = leer(f);
                if (numeros.has(campos.numero)) throw new ErrorApp(400, `El número ${campos.numero} está repetido en el archivo.`);
                numeros.add(campos.numero);
                leidos.push(campos);
            } catch (error) {
                errores.push(`Fila ${f.fila}: ${error.message}`);
            }
        }
        if (errores.length) {
            throw new ErrorApp(400, `No se importó nada. Corrige el archivo:\n${errores.slice(0, 15).join('\n')}${errores.length > 15 ? `\n… y ${errores.length - 15} errores más.` : ''}`);
        }
        if (!leidos.length) throw new ErrorApp(400, 'El archivo no tiene trabajadores.');

        return obtenerSequelize().transaction(async (transaction) => {
            let nuevos = 0;
            let actualizados = 0;
            for (const campos of leidos) {
                const actual = await models.Trabajadores.findOne({ where: { numero: campos.numero }, transaction });
                if (actual) {
                    await actual.update(campos, { transaction });
                    actualizados += 1;
                } else {
                    await models.Trabajadores.create(campos, { transaction });
                    nuevos += 1;
                }
            }
            return { nuevos, actualizados };
        });
    }

    /** Se da de baja (no se borra) para conservar sus ventas a crédito. */
    async delete(id) {
        const model = await this.findOne(id);
        await model.update({ activo: false });
        return model;
    }
}

export default trabajadoresService;
