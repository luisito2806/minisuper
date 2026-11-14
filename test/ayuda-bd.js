// Conecta Sequelize a un PostgreSQL embebido en memoria (PGlite), para
// las pruebas y el modo demo. No necesita PostgreSQL instalado.
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { conectar } from '../src/libs/sequelize.js';

export async function conectarEnMemoria() {
  const pglite = new PGlite();
  const { connection } = createPgConfig(pglite);

  // Módulo "pg" cuyo Client habla con PGlite en lugar de abrir un socket.
  class ClientePGlite extends pg.Client {
    constructor(config) {
      super({ ...config, connection });
    }
  }
  const dialectModule = Object.assign(Object.create(pg), { Client: ClientePGlite });

  const sequelize = conectar({
    database: 'postgres',
    username: 'postgres',
    password: 'x',
    host: 'localhost',
    port: 5432,
    dialectModule,
    // PGlite atiende una conexión a la vez.
    pool: { max: 1, min: 0, idle: 60000, acquire: 60000, evict: 0 },
  });
  return { sequelize, pglite };
}
