# Mini Súper · Nube

Panel en internet, **solo de consulta**, que recibe los datos de una o varias tiendas Mini Súper. Sigue la misma estructura que `biblioteca` y que la app de la tienda: modelos de Sequelize, y capas routers → controllers → services.

```
server.js                  Arranque: conecta, sincroniza tablas y levanta Express
src/
  app.js                   Express (sesión, seguridad, archivos)
  libs/sequelize.js        Conexión (DATABASE_URL), modelos y sync({ alter: true })
  libs/errores.js          ErrorNube y respuestas { success: false, message }
  models/                  Un archivo por tabla + index.js (setupModels y relaciones)
  services/                sync (guardar paquetes), tiendas (panel), auth
  controllers/  routers/   Igual que en biblioteca
  middlewares/             Sesión, acceso a la tienda y clave de la tienda
scripts/                   crear-tienda, crear-usuario, desvincular-tienda
public/                    Panel (HTML, CSS y JavaScript)
```

## Tablas

| Modelo | Tabla | Para qué sirve |
|---|---|---|
| `Tiendas` | `tiendas` | Cada tienda, la huella de su clave y su última sincronización |
| `Usuarios` | `usuarios` | Quién entra al panel |
| `UsuariosTiendas` | `usuarios_tiendas` | Qué tiendas ve cada usuario (muchos a muchos) |
| `Ventas` | `ventas` | Copia de las ventas; los productos van en `partidas` (JSONB) |
| `Productos` | `productos` | Copia del catálogo y la existencia |
| `Trabajadores` | `trabajadores` | Copia de los trabajadores con crédito |
| `Cajas` | `cajas` | Copia de los cortes de caja con sus totales |

En `ventas`, `productos`, `trabajadores` y `cajas` la llave es **(tienda_id, id_local)**, donde `id_local` es el id del registro en la base de la tienda. Los datos se guardan con `bulkCreate(..., { updateOnDuplicate })`: recibir dos veces lo mismo actualiza el registro en lugar de duplicarlo.

Las listas usan `findAll`; el resumen y la nómina, que suman y agrupan, usan `sequelize.query()`, igual que los reportes de la tienda.

## Rutas

- `POST /api/sync`: la tienda manda sus cambios (`Authorization: Bearer <SYNC_TOKEN>`).
- `POST /api/auth/login`, `/logout`; `GET /api/auth/yo`.
- `GET /api/tiendas`, y para cada tienda `/:id/resumen`, `/ventas`, `/ventas/:venta`, `/inventario`, `/nomina` y `/cajas`.
- `POST /api/tiendas/:id/paquete`: carga un paquete traído en USB.

## Uso

Instalación y publicación: ver [../INSTALACION.md](../INSTALACION.md), paso 3.

```bash
npm install
npm start                                   # necesita DATABASE_URL y SESSION_SECRET
npm run crear-tienda -- "Nombre"            # muestra SYNC_URL y SYNC_TOKEN
npm run crear-usuario -- usuario "Nombre" "contraseña" 1|1,2|todas
npm run desvincular-tienda -- <id> [--borrar]
```

Las pruebas están en el proyecto principal: `npm test` en la carpeta de arriba ([../test/nube.test.js](../test/nube.test.js)).
