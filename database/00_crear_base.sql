-- =====================================================================
-- Mini Súper: crear la base de datos vacía (único paso manual).
--
-- En pgAdmin: clic derecho en "Databases" → Create → Database…, nombre
-- "minisuper". O abre Query Tool sobre la base "postgres" y ejecuta:
-- =====================================================================

CREATE DATABASE minisuper ENCODING = 'UTF8' TEMPLATE = template0;

ALTER DATABASE minisuper SET timezone TO 'America/Mexico_City';

-- Las 12 tablas, sus relaciones, restricciones y datos iniciales las crea
-- la aplicación al arrancar (modelos de Sequelize + sync), igual que en
-- el proyecto biblioteca. No hace falta ejecutar nada más.
