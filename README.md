# Mini Súper

Aplicación web para administrar un mini súper: punto de venta (efectivo y crédito por nómina), caja, productos, inventario con historial y conteo físico, compras, proveedores, trabajadores y nómina, usuarios, reportes con utilidad, Excel, respaldos y configuración.

Está hecha con **Node.js + Express + Sequelize + PostgreSQL** (administrable con pgAdmin) + exceljs y sigue la misma estructura que el proyecto guía `biblioteca`:

- Cada tabla es un **modelo de Sequelize**.
- Las tablas se crean solas al arrancar el servidor (`sequelize.sync({ alter: true })`).
- La API está organizada en **routers → controllers → services**.

Especificación: [MiniSuper-Instrucciones.md](MiniSuper-Instrucciones.md)

**Instalar en la tienda y ver la tienda desde la ciudad (USB, Tailscale y panel en la nube): [INSTALACION.md](INSTALACION.md).**

## Contraseñas (entorno local)

**Usuarios de la aplicación** (se crean solos la primera vez que arranca; cámbialas en *Mi cuenta*):

| Usuario | Contraseña | Rol |
|---|---|---|
| admin | Admin123! | Administrador |
| cajero | Cajero123! | Cajero |

**PostgreSQL / pgAdmin** (valores de `.env`):

| Dato | Valor |
|---|---|
| Usuario | postgres |
| Contraseña | La que pusiste al instalar PostgreSQL (va en `.env`, que no se sube a GitHub) |

| Host / puerto | localhost:5432 |
| Base | minisuper |

## Probar sin instalar PostgreSQL

```bash
npm install
npm run demo
prender tunel cloudflared tunnel --url http://localhost:3000
```

Abre http://localhost:3000. El demo usa PostgreSQL embebido en memoria (PGlite) con los mismos modelos; los datos se pierden al cerrar.

| Usuario | Contraseña | Rol |
|---|---|---|
| admin | Admin123! | Administrador |
| cajero | Cajero123! | Cajero |

Para vender, primero abre la caja en la sección **Caja** (o desactiva esa opción en **Configuración**).

## Instalación con PostgreSQL y pgAdmin

1. Instala Node.js 20 o superior, PostgreSQL y pgAdmin.
2. En pgAdmin crea una base vacía llamada `minisuper`: clic derecho en **Databases** → **Create** → **Database…**. Si prefieres hacerlo con SQL, está en [database/00_crear_base.sql](database/00_crear_base.sql).
3. Copia `.env.example` como `.env` y revisa los valores:

   | Variable | Para qué sirve |
   |---|---|
   | `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME` | Los mismos datos con los que te conectas en pgAdmin |
   | `SESSION_SECRET` | Cadena aleatoria de 32 caracteres o más |
   | `DATOS_DE_PRUEBA` | `true` carga 20 productos y 3 trabajadores de ejemplo la primera vez; `false` para una tienda real |
| `RESPALDO_AUTOMATICO` | Opcional. `false` desactiva el respaldo diario automático |
| `PG_DUMP` | Opcional. Ruta de `pg_dump` si no se encuentra sola (en Windows se busca en `C:\Program Files\PostgreSQL\<versión>\bin`) |

4. Ejecuta:

   ```bash
   npm install
   npm run dev      # con nodemon, se reinicia al guardar cambios
   # o
   npm start
   ```

   Al arrancar, la aplicación hace el respaldo del día y después crea o actualiza las 14 tablas, sus relaciones y restricciones, la configuración y los usuarios iniciales. En pgAdmin aparecen en `minisuper` → **Schemas** → **public** → **Tables** (presiona F5 para actualizar).
5. Entra a http://localhost:3000, **cambia las contraseñas iniciales** en *Mi cuenta* y llena los datos de la tienda en **Configuración**.

Para ver el diagrama entidad-relación en pgAdmin: clic derecho en la base `minisuper` → **ERD For Database**.

## Estructura (igual que biblioteca)

```
server.js                    Arranque: conecta, sincroniza tablas y levanta Express
src/
  app.js                     Configuración de Express (sesión, seguridad, archivos)
  libs/
    sequelize.js             Conexión (variables DB_*), modelos y sync
    restricciones.js         Reglas CHECK, migraciones y limpieza de llaves duplicadas
    respaldos.js             Respaldos con pg_dump (diario, manual y antes de depurar)
    excel.js                 Generar y leer archivos .xlsx (exceljs)
    semilla.js               Datos iniciales (solo si la base está vacía)
    dinero.js, validar.js, errores.js, fechas.js
  models/                    Un archivo por tabla + index.js (setupModels y relaciones)
  services/                  Lógica: create / find / findOne / update / delete …
  controllers/               get / getById / create / update / _delete …
  routers/                   Rutas de cada recurso + index.js (routesApi)
  middlewares/               Sesión y permisos por rol
public/                      Interfaz (HTML, CSS y JavaScript)
scripts/demo.js              Modo demostración con PGlite
scripts/instalar-tienda.ps1  Instalador para la computadora de la tienda (Windows)
nube/                        Panel en la nube (aplicación aparte, solo consulta)
test/                        Pruebas automáticas
```

### Cómo agregar una tabla nueva

Es el mismo procedimiento que en biblioteca:

1. Crea `src/models/<nombre>.model.js` con la clase `extends Model`, su `Schema` y su `config()`.
2. Regístralo en `src/models/index.js` (`X.init(XSchema, X.config(sequelize))`) y define sus relaciones.
3. Crea su `service`, su `controller` y su `router`, y agrega el router en `src/routers/index.js`.
4. Reinicia el servidor: la tabla aparece sola en pgAdmin.

### Diferencias con biblioteca, y por qué

- **El dinero usa `DECIMAL`, no `DOUBLE`.** Con `DOUBLE`, operaciones como `0.1 + 0.2` no dan exacto.
- **Restricciones en la base.** Sequelize no crea restricciones `CHECK`, así que [restricciones.js](src/libs/restricciones.js) las agrega después del `sync`. Así las reglas (no negativos, totales que cuadran, una sola caja abierta, venta a crédito con trabajador, etc.) se cumplen aunque alguien edite desde pgAdmin.
- **Llaves foráneas duplicadas.** `sync({ alter: true })` de Sequelize 6 vuelve a crear las llaves foráneas en cada arranque (`…_fkey1`, `…_fkey2`). [restricciones.js](src/libs/restricciones.js) borra las copias después del `sync`.
- **Unicidad con nombre.** Los campos únicos se declaran como índices con nombre. Así `sync({ alter: true })` no los duplica en cada arranque, cosa que pasa con `unique: true`.
- **`DELETE` desactiva el registro** (`activo = false`) en lugar de borrarlo, para conservar el historial. Las ventas y las compras se cancelan con motivo; las ventas se borran de verdad solo con la depuración anual.
- **Altas y errores.** Las altas responden `{ success: true, data }` y los errores `{ success: false, message }`, como en biblioteca, pero con el código HTTP correcto (400, 401, 403, 404, 409) en lugar de siempre 500.
- **Módulos.** El proyecto usa `import` en lugar de `require`, porque el navegador comparte el archivo `dinero.js` con el servidor.
- **Consultas: métodos de Sequelize, salvo los reportes de totales.** Altas, cambios, bajas y listas usan los métodos del modelo, como en biblioteca (`findAll`, `findByPk`, `count`, `create`, `bulkCreate`, `update`, `destroy`, con `include` para las relaciones). Solo los **reportes que suman y agrupan** usan `sequelize.query()` (la función `consultar`), que también es de Sequelize:
  - reporte de ventas y utilidad por día ([reportes.service.js](src/services/reportes.service.js));
  - resumen del corte de caja ([caja.service.js](src/services/caja.service.js));
  - lista de compra sugerida ([inventario.service.js](src/services/inventario.service.js));
  - resumen semanal de nómina ([nomina.service.js](src/services/nomina.service.js));
  - totales de los cortes que se mandan a la nube ([sincronizacion.service.js](src/services/sincronizacion.service.js)).

  Con `findAll` + `fn('sum')` esas consultas quedarían mucho más largas y difíciles de leer.
- **Disparadores (triggers).** [disparadores.js](src/libs/disparadores.js) anota en `sync_pendientes` cada cambio que hay que mandar a la nube, aunque se haga desde pgAdmin. Sequelize no los crea, así que se crean después del `sync`, igual que las restricciones.


## Tablas

| # | Modelo | Tabla | Para qué sirve |
|---|---|---|---|
| 1 | `Usuarios` | `usuarios` | Acceso y roles (administrador, cajero) |
| 2 | `Categorias` | `categorias` | Agrupar productos |
| 3 | `Productos` | `productos` | Catálogo, precio, costo, IVA, existencia |
| 4 | `Proveedores` | `proveedores` | A quién se compra |
| 5 | `Ventas` | `ventas` | Encabezado de la venta, pago, cancelación y caja |
| 6 | `DetalleVentas` | `detalle_ventas` | Partidas de cada venta |
| 7 | `Compras` | `compras` | Encabezado de la compra y cancelación |
| 8 | `DetalleCompras` | `detalle_compras` | Partidas de cada compra |
| 9 | `Configuracion` | `configuracion` | Datos de la tienda, IVA, métodos de pago, políticas (una fila) |
| 10 | `SesionesCaja` | `sesiones_caja` | Apertura y cierre de caja |
| 11 | `MovimientosCaja` | `movimientos_caja` | Ingresos y retiros de efectivo |
| 12 | `MovimientosInventario` | `movimientos_inventario` | Historial de cada cambio de existencia |
| 13 | `Trabajadores` | `trabajadores` | Quién compra a crédito (se le descuenta en nómina) |
| 14 | `SyncPendientes` | `sync_pendientes` | Cambios por enviar a la nube (la llenan disparadores de PostgreSQL) |

## IVA

En **Configuración → Impuestos** se elige una de tres opciones:
- **No cobro IVA:** el precio es lo que paga el cliente; no se calcula ni se muestra IVA, aunque el producto tenga tasa.
- **El IVA ya viene en el precio:** el total no cambia; el ticket muestra cuánto IVA incluye.
- **Sumar el IVA al precio:** al total se le agrega el IVA de cada producto.

El "IVA predeterminado" solo se usa para productos **nuevos**; los existentes conservan su tasa.

## Ventas: efectivo y crédito por nómina

- **Efectivo:** se captura lo recibido y se calcula el cambio. Entra a la caja.
- **Crédito (nómina):** se elige al trabajador por número o nombre; no hay límite de crédito. No entra a la caja. El ticket sale con nombre, número y línea de firma.
- En la pantalla de venta, <kbd>F8</kbd> cambia entre efectivo y crédito.
- Las ventas viejas con tarjeta, transferencia u otro siguen siendo válidas en la base, pero ya no se ofrecen.

## Nómina (administrador)

- Semana de **sábado a viernes**. La sección **Nómina** muestra lo que cada trabajador compró a crédito, con su detalle, y se exporta a Excel para pasarlo a nómina.
- **Marcar como descontada** (toda la semana o un trabajador) evita cobrar dos veces. Lo comprado después en esa misma semana queda pendiente.
- Si se cancela una venta que ya se descontó, el sistema avisa que hay que reembolsar al trabajador.
- Los trabajadores solo los da de alta, edita o da de baja el administrador. El cajero solo ve la lista de activos para vender.

## Cancelar ventas

El administrador cancela desde **Ventas** (botón *Cancelar* en cada fila o en el detalle) o justo después de cobrar. Los productos regresan al inventario y la venta deja de contar en caja, reportes y nómina. El historial oculta las canceladas por defecto (filtro *Estado*). Se borran por completo con la depuración anual.

## Inventario

- **Conteo físico:** en *Inventario → Conteo físico* se escribe lo contado (o se descarga la hoja de Excel, se llena y se carga). Solo se ajustan los productos que no coinciden; queda en el historial.
- **Lista de compra sugerida:** productos en o bajo su mínimo, con la cantidad para llegar al doble del mínimo (o a lo vendido en 2 semanas, si es más) y su último proveedor. *Registrar compra con esta lista* abre la compra ya llenada.
- **Aviso en Vender:** cuántos productos están por agotarse.
- **Compras con lector de código de barras:** en modo escáner cada lectura del mismo producto suma 1.

## Excel

- **Exportar:** reporte de ventas (resumen, utilidad por día, más vendidos), ventas del periodo con sus productos, catálogo de productos, nómina semanal, lista de compra y hoja de conteo.
- **Importar:** productos (altas y cambios de precio masivos; si una fila tiene error no se aplica nada) y conteo físico.

## Respaldos y depuración (administrador, en Configuración)

- **Respaldo automático** con `pg_dump` una vez al día, al arrancar (antes de actualizar las tablas) y cada hora revisa. Se guardan los últimos 30 en `respaldos/`. Botón *Respaldar ahora* y descarga de cada archivo.
- **Borrar ventas de hace más de un año:** muestra cuántas se borrarían, hace un respaldo antes y pide escribir BORRAR. Borra ventas, partidas, su historial de inventario y cortes de caja de esas fechas. Las existencias no cambian (el historial viejo se resume en un renglón *saldo* por producto) y se conservan las ventas a crédito sin descontar.

## Pruebas

```bash
npm test
```

Las 76 pruebas corren contra PostgreSQL real (PGlite) con las tablas creadas por los modelos. Cubren:

- Que reiniciar el servidor no duplique tablas, índices ni restricciones.
- Que las reglas se cumplan aunque se inserte desde pgAdmin.
- Permisos por rol, probados con llamadas directas a la API.
- Cálculos de dinero, con IVA incluido y sin IVA.
- Existencia insuficiente y sobreventa, incluidas ventas simultáneas.
- Pagos insuficientes, códigos duplicados y productos inactivos.
- Folios.
- Cancelaciones que se aplican una sola vez.
- Caja.
- Ajustes de inventario.
- Que la existencia siempre coincida con la suma del historial (también después de depurar).
- Ventas a crédito, semana de nómina y descuento una sola vez.
- Conteo físico, lista de compra, utilidad y Excel (exportar e importar).
- Sincronización con la nube por internet y por USB, sin duplicar ni perder cambios ([test/nube.test.js](test/nube.test.js)).
- Las tres formas de manejar el IVA.

## Permisos

| Acción | Cajero | Administrador |
|---|:-:|:-:|
| Vender, consultar productos e inventario | ✔ | ✔ |
| Abrir y cerrar su caja, registrar ingresos y retiros | ✔ | ✔ |
| Ver ventas y cortes de caja | solo los suyos | todos |
| Cerrar la caja de otro usuario | | ✔ |
| Vender a crédito a un trabajador | ✔ | ✔ |
| Aplicar descuentos, cancelar ventas y compras | | ✔ |
| Productos, categorías, compras, proveedores | | ✔ |
| Trabajadores, nómina, Excel, respaldos, borrar ventas viejas | | ✔ |
| Ajustes e historial de inventario | | ✔ |
| Reportes, usuarios, configuración, ver costos | | ✔ |

Los permisos se validan en el servidor en cada petición, no solo en la interfaz.

## Cómo funciona la caja

- Cada usuario abre su caja con un **fondo inicial**. Solo puede tener una abierta.
- **Efectivo esperado = fondo inicial + ventas en efectivo + ingresos − retiros.** Las ventas a crédito y las canceladas no cuentan.
- No se puede retirar más del efectivo esperado.
- Al cerrar se guardan el esperado, el contado y la diferencia. Una caja no se cierra dos veces.

## Respaldo y restauración

Además del respaldo automático (ver arriba), se puede respaldar a mano (en pgAdmin: clic derecho en la base → **Backup…**, o desde una terminal):


```bash
pg_dump -h localhost -U postgres -F c -f respaldos/minisuper_AAAA-MM-DD.backup minisuper
```

Restauración (en pgAdmin: **Restore…**, o desde una terminal):

```bash
pg_restore -h localhost -U postgres -d minisuper --clean --if-exists respaldos/minisuper_AAAA-MM-DD.backup
```

## Limitaciones

- **Sesiones en memoria.** Las sesiones se guardan en la memoria del servidor: al reiniciarlo hay que volver a iniciar sesión.
- **Sin integración con equipo.** No hay integración con impresoras, lectores ni terminales de pago. El ticket se imprime desde el navegador. Un lector de código de barras que funcione como teclado sí funciona.
- **Solo en esta computadora.** El acceso es por HTTP en `localhost`. Para usarlo desde otras computadoras se necesita HTTPS o una red de confianza.
- **`sync({ alter: true })` es cómodo para desarrollar**, como en biblioteca, pero haz un respaldo antes de cambiar un modelo en una base con datos reales.
