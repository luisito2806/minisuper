/**
 * Disparadores (triggers) que anotan en sync_pendientes cada cambio que
 * hay que mandar a la nube. Funcionan aunque el cambio se haga desde
 * pgAdmin. Es seguro ejecutarlo en cada arranque.
 */

// [tabla, entidad en la nube, columna con el id de la entidad]
const DISPARADORES = [
    ['ventas', 'venta', 'id'],
    ['productos', 'producto', 'id'],
    ['trabajadores', 'trabajador', 'id'],
    ['sesiones_caja', 'caja', 'id'],
    ['movimientos_caja', 'caja', 'sesion_caja_id'],
    ['configuracion', 'tienda', 'id'],
];

/** Pone en la cola todo lo que existe (primera vez o "enviar todo de nuevo"). */
export async function encolarTodo(sequelize, transaction) {
    for (const [tabla, entidad, columna] of DISPARADORES) {
        if (tabla === 'movimientos_caja') continue; // ya van con su caja
        await sequelize.query(
            `INSERT INTO sync_pendientes (entidad, entidad_id, version)
             SELECT '${entidad}', ${columna}, 1 FROM ${tabla}
             ON CONFLICT (entidad, entidad_id) DO UPDATE SET version = sync_pendientes.version + 1`,
            { transaction }
        );
    }
}

export async function asegurarDisparadores(sequelize) {
    const [[{ existia }]] = await sequelize.query(
        "SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sync_encolar') AS existia"
    );
    await sequelize.query(`
        CREATE OR REPLACE FUNCTION sync_encolar() RETURNS trigger AS $$
        BEGIN
            INSERT INTO sync_pendientes (entidad, entidad_id, version)
            VALUES (TG_ARGV[0], (to_jsonb(NEW) ->> TG_ARGV[1])::int, 1)
            ON CONFLICT (entidad, entidad_id) DO UPDATE SET version = sync_pendientes.version + 1;
            RETURN NULL;
        END
        $$ LANGUAGE plpgsql`);
    for (const [tabla, entidad, columna] of DISPARADORES) {
        await sequelize.query(`DROP TRIGGER IF EXISTS ${tabla}_sync ON ${tabla}`);
        await sequelize.query(
            `CREATE TRIGGER ${tabla}_sync AFTER INSERT OR UPDATE ON ${tabla}
             FOR EACH ROW EXECUTE FUNCTION sync_encolar('${entidad}', '${columna}')`
        );
    }
    // Primera vez: lo que ya existía también se manda.
    if (!existia) await encolarTodo(sequelize);
}
