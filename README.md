# Mini Súper

Aplicación web para administrar un mini súper: punto de venta (efectivo y crédito por nómina), caja, productos, inventario con historial y conteo físico, compras, proveedores, trabajadores y nómina, usuarios, reportes con utilidad, Excel, respaldos y configuración.

Está hecha con **Node.js + Express + Sequelize + PostgreSQL** (administrable con pgAdmin) + exceljs y sigue la misma estructura que el proyecto guía `biblioteca`:

- Cada tabla es un **modelo de Sequelize**.
- Las tablas se crean solas al arrancar el servidor (`sequelize.sync({ alter: true })`). En los arranques siguientes solo se vuelven a revisar si cambió algún modelo, y antes se hace un respaldo.
- La API está organizada en **routers → controllers → services**.

Especificación: [MiniSuper-Instrucciones.md](MiniSuper-Instrucciones.md)

**Instalar en la tienda y ver la tienda desde la ciudad (USB, Tailscale y panel en la nube): [INSTALACION.md](INSTALACION.md).** Para la tienda hay un instalador (`MiniSuper-Setup.exe`) que trae PostgreSQL y Node adentro y no necesita internet.

## Contraseñas (entorno local)

**Usuarios de la aplicación** (se crean solos la primera vez que arranca; **el sistema pide cambiar la contraseña la primera vez que entras**):

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

## Demostración (con datos de ejemplo)

```bash
npm install
npm run demo
```

Abre http://localhost:3000. La demo usa PostgreSQL embebido en memoria (PGlite) con los mismos modelos y genera **cuatro semanas de operación** con fechas hasta hoy: unas 330 ventas en efectivo y a crédito (algunas canceladas), cortes de caja con faltantes y sobrantes, ingresos y retiros, compras semanales a proveedores (una cancelada), mermas y un conteo físico, nómina con semanas ya descontadas y la actual pendiente, y algunos productos bajos o agotados. Los datos se pierden al cerrar y se vuelven a generar al arrancar (unos 10 segundos). Con `DEMO_VACIA=true` arranca solo con el catálogo de ejemplo.

| Usuario | Contraseña | Rol |
|---|---|---|
| admin | Admin123! | Administrador |
| cajero | Cajero123! | Cajero (entre semana) |
| ana | Cajera123! | Cajero (fines de semana) |

La caja del cajero de hoy queda abierta, así que se puede vender en cuanto se entra.

### La misma demostración en PostgreSQL (para verla en pgAdmin)

1. En pgAdmin crea una base vacía, por ejemplo `minisuper_demo`.
2. Carga los datos (usa la conexión de tu `.env`, cambiando solo la base):

   ```powershell
   $env:DB_NAME='minisuper_demo'; npm run cargar-demo
   ```

3. Arranca con esa base: `$env:DB_NAME='minisuper_demo'; npm start`.

El script se niega a cargar en una base que ya tenga ventas, para no mezclar datos de ejemplo con los reales.

### Publicarla en internet (Render)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/luisito2806/minisuper)

El archivo `render.yaml` publica el **modo demostración** (`node scripts/demo.js`). En el plan gratuito de Render (512 MB) PostgreSQL en memoria no cabe, así que ahí la demo usa una base externa gratuita:

1. Crea una cuenta en [Neon](https://neon.tech) (gratis, sin tarjeta) y un proyecto nuevo.
2. Copia su *connection string* (`postgresql://…?sslmode=require`).
3. Pégala en Render como `DEMO_DATABASE_URL`: te la pide al crear el servicio, o agrégala después en el servicio → **Environment**.

Con base externa, la demo se **regenera cuando cambia el día** (se vacía la base y se cargan las cuatro semanas con fechas hasta hoy); si ya se generó hoy, se reutiliza y el arranque es rápido. Para forzar que vuelva a su estado inicial, pon `DEMO_REINICIAR=true` en **Environment** (y quítalo después). Esa base es solo para la demo: nunca uses la de una tienda real.

El plan gratuito se duerme tras 15 minutos sin visitas: **ábrelo unos minutos antes de presentar**. La primera vez del día tarda más porque genera los datos.

Para una tienda real no uses Render: instala el sistema en la computadora de la tienda siguiendo [INSTALACION.md](INSTALACION.md).

## Instalación con PostgreSQL y pgAdmin

1. Instala Node.js 20 o superior, PostgreSQL y pgAdmin.
2. En pgAdmin crea una base vacía llamada `minisuper`: clic derecho en **Databases** → **Create** → **Database…**. Si prefieres hacerlo con SQL, está en [database/00_crear_base.sql](database/00_crear_base.sql).
3. Copia `.env.example` como `.env` y revisa los valores:

   | Variable | Para qué sirve |
   |---|---|
   | `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME` | Los mismos datos con los que te conectas en pgAdmin |
   | `SESSION_SECRET` | Cadena aleatoria de 32 caracteres o más |
   | `DATOS_DE_PRUEBA` | `true` carga 20 productos y 3 trabajadores de ejemplo la primera vez; `false` para una tienda real |
   | `HOST` | `127.0.0.1` (predeterminado): solo se entra desde esta computadora. `0.0.0.0`: también desde otras (Tailscale o red local) |
   | `RESPALDO_AUTOMATICO` | Opcional. `false` desactiva el respaldo diario automático |
   | `PG_DUMP` | Opcional. Ruta de `pg_dump` si no se encuentra sola (en Windows se busca en `C:\Program Files\PostgreSQL\<versión>\bin`) |
   | `ACTUALIZAR_ESQUEMA` | Opcional. `true` fuerza revisar las tablas con `sync({ alter: true })` aunque los modelos no hayan cambiado |
   | `ACTUALIZAR_SIN_RESPALDO` | Opcional y riesgoso. `true` actualiza las tablas aunque falle el respaldo previo |

4. Ejecuta:

   ```bash
   npm install
   npm run dev      # con nodemon, se reinicia al guardar cambios
   # o
   npm start
   ```

   Al arrancar, la aplicación hace el respaldo del día y después crea o actualiza las 14 tablas, sus relaciones y restricciones, la configuración y los usuarios iniciales. En pgAdmin aparecen en `minisuper` → **Schemas** → **public** → **Tables** (presiona F5 para actualizar).
5. Entra a http://localhost:3000. La primera vez el sistema te pide **cambiar la contraseña inicial** (lo mismo con `cajero`). Luego llena los datos de la tienda en **Configuración**.

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
scripts/demo.js              Modo demostración con PGlite y cuatro semanas de datos de ejemplo
scripts/cargar-demo.js       Carga esos datos de ejemplo en una base PostgreSQL vacía (pgAdmin)
src/libs/demostracion.js     Genera la demostración con los mismos servicios de la app
scripts/instalar-tienda.ps1  Instalación manual en la tienda (con PostgreSQL y Node ya instalados)
scripts/configurar-equipo.js Lo ejecuta MiniSuper-Setup.exe: base, servicio de PostgreSQL, tarea y .env
scripts/servidor.cmd         Mantiene el servidor corriendo (lo reinicia si se cae)
scripts/abrir.vbs            Icono del escritorio: espera al servidor y abre la app en Edge
instalador/empaquetar.ps1    Arma MiniSuper-Setup.exe (Node + PostgreSQL + app, sin internet en la tienda)
instalador/MiniSuper.iss     Script de Inno Setup del instalador
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

La base `minisuper` lleva **14 tablas**. Todas se crean solas desde los modelos de [src/models/](src/models/) al arrancar el servidor.

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

### Columnas de cada tabla

Notación: **PK** = llave primaria (entero autoincremental), **FK →** = llave foránea, **único** = índice único. *Fecha y hora* es `TIMESTAMP WITH TIME ZONE`. Toda columna es obligatoria (`NOT NULL`) salvo que diga *opcional*.

#### 1. `usuarios`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER | PK |
| `nombre` | VARCHAR(100) | |
| `usuario` | VARCHAR(50) | único |
| `contrasena_hash` | VARCHAR(255) | Contraseña cifrada |
| `rol` | VARCHAR(20) | `administrador` o `cajero` |
| `activo` | BOOLEAN | Predeterminado `true` |
| `debe_cambiar_contrasena` | BOOLEAN | Predeterminado `false`. `true` = al entrar debe poner su propia contraseña (usuarios iniciales y contraseñas puestas por el administrador) |
| `creado_en` | Fecha y hora | Automático |

#### 2. `categorias`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER | PK |
| `nombre` | VARCHAR(60) | único |
| `descripcion` | VARCHAR(200) | opcional |
| `activo` | BOOLEAN | Predeterminado `true` |

#### 3. `productos`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER | PK |
| `codigo` | VARCHAR(50) | único (código de barras o clave) |
| `nombre` | VARCHAR(120) | |
| `descripcion` | VARCHAR(255) | opcional |
| `categoria_id` | INTEGER | FK → `categorias.id` |
| `proveedor_id` | INTEGER | FK → `proveedores.id`, opcional |
| `precio_venta` | DECIMAL(10,2) | |
| `costo` | DECIMAL(10,2) | |
| `tasa_iva` | DECIMAL(5,4) | Predeterminado `0.16` |
| `existencia` | DECIMAL(10,3) | Predeterminado `0` |
| `stock_minimo` | DECIMAL(10,3) | Predeterminado `5` |
| `unidad` | VARCHAR(10) | `pieza`, `kg` o `litro`; predeterminado `pieza` |
| `activo` | BOOLEAN | Predeterminado `true` |
| `creado_en`, `actualizado_en` | Fecha y hora | Automáticos |

#### 4. `proveedores`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER | PK |
| `nombre` | VARCHAR(120) | |
| `telefono` | VARCHAR(20) | opcional |
| `correo` | VARCHAR(120) | opcional |
| `direccion` | VARCHAR(255) | opcional |
| `activo` | BOOLEAN | Predeterminado `true` |

#### 5. `ventas`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER | PK |
| `folio` | VARCHAR(20) | único, automático (`V-000001`, secuencia `folio_ventas_seq`) |
| `usuario_id` | INTEGER | FK → `usuarios.id` (quién vendió) |
| `sesion_caja_id` | INTEGER | FK → `sesiones_caja.id`, opcional |
| `fecha` | Fecha y hora | Predeterminado: ahora |
| `subtotal` | DECIMAL(10,2) | |
| `descuento` | DECIMAL(10,2) | Predeterminado `0` |
| `impuestos` | DECIMAL(10,2) | Predeterminado `0` |
| `total` | DECIMAL(10,2) | |
| `precios_incluyen_iva` | BOOLEAN | Cómo se calculó el IVA en esa venta |
| `metodo_pago` | VARCHAR(20) | `efectivo` o `credito` (también acepta los anteriores: `tarjeta`, `transferencia`, `otro`) |
| `trabajador_id` | INTEGER | FK → `trabajadores.id`; obligatorio solo en ventas a crédito |
| `descontado_en` | Fecha y hora | opcional; cuándo se descontó en nómina |
| `descontado_por` | INTEGER | FK → `usuarios.id`, opcional |
| `monto_recibido` | DECIMAL(10,2) | opcional (efectivo recibido) |
| `cambio` | DECIMAL(10,2) | Predeterminado `0` |
| `estado` | VARCHAR(15) | `completada` o `cancelada` |
| `cancelada_por` | INTEGER | FK → `usuarios.id`, opcional |
| `cancelada_en` | Fecha y hora | opcional |
| `motivo_cancelacion` | VARCHAR(255) | opcional |

#### 6. `detalle_ventas`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER | PK |
| `venta_id` | INTEGER | FK → `ventas.id` |
| `producto_id` | INTEGER | FK → `productos.id` |
| `cantidad` | DECIMAL(10,3) | |
| `precio_unitario` | DECIMAL(10,2) | Precio al momento de vender |
| `tasa_iva` | DECIMAL(5,4) | |
| `costo_unitario` | DECIMAL(10,2) | opcional; sirve para calcular la utilidad |
| `importe` | DECIMAL(10,2) | |

Único: (`venta_id`, `producto_id`).

#### 7. `compras`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER | PK |
| `folio` | VARCHAR(20) | único, automático (`C-000001`, secuencia `folio_compras_seq`) |
| `proveedor_id` | INTEGER | FK → `proveedores.id` |
| `usuario_id` | INTEGER | FK → `usuarios.id` |
| `fecha` | Fecha y hora | Predeterminado: ahora |
| `total` | DECIMAL(10,2) | |
| `estado` | VARCHAR(15) | `confirmada` o `cancelada` |
| `notas` | VARCHAR(255) | opcional |
| `cancelada_por` | INTEGER | FK → `usuarios.id`, opcional |
| `cancelada_en` | Fecha y hora | opcional |
| `motivo_cancelacion` | VARCHAR(255) | opcional |

#### 8. `detalle_compras`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER | PK |
| `compra_id` | INTEGER | FK → `compras.id` |
| `producto_id` | INTEGER | FK → `productos.id` |
| `cantidad` | DECIMAL(10,3) | |
| `costo_unitario` | DECIMAL(10,2) | |
| `importe` | DECIMAL(10,2) | |

Único: (`compra_id`, `producto_id`).

#### 9. `configuracion` (una sola fila, `id = 1`)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | SMALLINT | PK, siempre `1` |
| `nombre_tienda` | VARCHAR(120) | Predeterminado `Mi Mini Súper` |
| `direccion` | VARCHAR(255) | opcional |
| `telefono` | VARCHAR(30) | opcional |
| `rfc` | VARCHAR(13) | opcional |
| `mensaje_ticket` | VARCHAR(255) | opcional; predeterminado `¡Gracias por su compra!` |
| `ticket_encabezado` | VARCHAR(255) | opcional |
| `ticket_ancho` | VARCHAR(2) | `58` u `80` (mm); predeterminado `80` |
| `ticket_mostrar_cajero` | BOOLEAN | Predeterminado `true` |
| `moneda` | CHAR(3) | Predeterminado `MXN` |
| `formato_fecha` | VARCHAR(10) | `dd/mm/aaaa` o `aaaa-mm-dd` |
| `cobrar_iva` | BOOLEAN | Predeterminado `true` |
| `precios_incluyen_iva` | BOOLEAN | Predeterminado `true` |
| `tasa_iva_predeterminada` | DECIMAL(5,4) | Predeterminado `0.16` |
| `metodos_pago` | VARCHAR(20)[] | Predeterminado `{efectivo, credito}` |
| `stock_minimo_predeterminado` | DECIMAL(10,3) | Predeterminado `5` |
| `permitir_sobreventa` | BOOLEAN | Predeterminado `false` |
| `requiere_caja_abierta` | BOOLEAN | Predeterminado `true` |
| `tienda_uuid` | UUID | Automático; identifica a la tienda ante la nube |
| `actualizado_por` | INTEGER | FK → `usuarios.id`, opcional |
| `esquema_huella` | VARCHAR(64) | Uso interno, opcional: huella de los modelos; si cambia, el arranque respalda y actualiza las tablas |
| `actualizado_en` | Fecha y hora | Automático |

#### 10. `sesiones_caja`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER | PK |
| `usuario_id` | INTEGER | FK → `usuarios.id`; una sola caja abierta por usuario |
| `abierta_en` | Fecha y hora | Predeterminado: ahora |
| `fondo_inicial` | DECIMAL(10,2) | |
| `estado` | VARCHAR(10) | `abierta` o `cerrada` |
| `cerrada_en` | Fecha y hora | opcional |
| `cerrada_por` | INTEGER | FK → `usuarios.id`, opcional |
| `efectivo_esperado` | DECIMAL(10,2) | opcional; se guarda al cerrar |
| `monto_contado` | DECIMAL(10,2) | opcional |
| `diferencia` | DECIMAL(10,2) | opcional |
| `notas_cierre` | VARCHAR(255) | opcional |

#### 11. `movimientos_caja`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER | PK |
| `sesion_caja_id` | INTEGER | FK → `sesiones_caja.id` |
| `usuario_id` | INTEGER | FK → `usuarios.id` |
| `fecha` | Fecha y hora | Predeterminado: ahora |
| `tipo` | VARCHAR(10) | `ingreso` o `retiro` |
| `monto` | DECIMAL(10,2) | |
| `motivo` | VARCHAR(255) | |

#### 12. `movimientos_inventario`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER | PK |
| `producto_id` | INTEGER | FK → `productos.id` |
| `usuario_id` | INTEGER | FK → `usuarios.id` |
| `fecha` | Fecha y hora | Predeterminado: ahora |
| `tipo` | VARCHAR(20) | `inicial`, `compra`, `venta`, `cancelacion_venta`, `cancelacion_compra`, `ajuste_entrada`, `ajuste_salida` o `saldo_depurado` |
| `cantidad` | DECIMAL(10,3) | Positiva si entra, negativa si sale |
| `existencia_anterior` | DECIMAL(10,3) | |
| `existencia_nueva` | DECIMAL(10,3) | Siempre `existencia_anterior + cantidad` |
| `venta_id` | INTEGER | FK → `ventas.id`; solo en movimientos de venta |
| `compra_id` | INTEGER | FK → `compras.id`; solo en movimientos de compra |
| `motivo` | VARCHAR(255) | opcional; obligatorio en ajustes |

#### 13. `trabajadores`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER | PK |
| `numero` | VARCHAR(20) | único (número de empleado) |
| `nombre` | VARCHAR(120) | |
| `area` | VARCHAR(80) | opcional |
| `activo` | BOOLEAN | Predeterminado `true` |
| `creado_en`, `actualizado_en` | Fecha y hora | Automáticos |

#### 14. `sync_pendientes`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | BIGINT | PK |
| `entidad` | VARCHAR(20) | `venta`, `producto`, `trabajador`, `caja` o `tienda` |
| `entidad_id` | INTEGER | `id` del registro que cambió |
| `version` | INTEGER | Predeterminado `1`; sube con cada cambio |

Único: (`entidad`, `entidad_id`).

### Relaciones

```
categorias    1 ── N  productos
proveedores   1 ── N  productos, compras
usuarios      1 ── N  ventas, compras, sesiones_caja, movimientos_caja, movimientos_inventario
sesiones_caja 1 ── N  ventas, movimientos_caja
trabajadores  1 ── N  ventas                (solo ventas a crédito)
ventas        1 ── N  detalle_ventas   N ── 1  productos
compras       1 ── N  detalle_compras  N ── 1  productos
productos     1 ── N  movimientos_inventario  (ligado a la venta o compra que lo originó)
```

### Tablas del panel en la nube

El panel de [nube/](nube/) es otra aplicación, con **su propia base** y 7 tablas. Las tablas con datos de la tienda usan la llave compuesta (`tienda_id`, `id_local`), donde `id_local` es el `id` que el registro tiene en la tienda.

| Tabla | Llave | Columnas |
|---|---|---|
| `tiendas` | `id` | `nombre`, `token_hash` (único), `uuid_local` (único, opcional), `direccion`, `ultima_sync`, `creada_en` |
| `usuarios` | `id` | `usuario` (único), `nombre`, `contrasena_hash`, `todas` (ve todas las tiendas), `activo` |
| `usuarios_tiendas` | (`usuario_id`, `tienda_id`) | Qué tiendas puede ver cada usuario |
| `productos` | (`tienda_id`, `id_local`) | `codigo`, `nombre`, `categoria`, `unidad`, `precio_venta`, `costo`, `existencia`, `stock_minimo`, `activo` |
| `trabajadores` | (`tienda_id`, `id_local`) | `numero`, `nombre`, `area`, `activo` |
| `ventas` | (`tienda_id`, `id_local`) | `folio`, `fecha`, `cajero`, `metodo_pago`, `trabajador_id`, `trabajador_numero`, `trabajador_nombre`, `subtotal`, `descuento`, `impuestos`, `total`, `costo`, `estado`, `cancelada_en`, `motivo_cancelacion`, `descontado_en`, `sesion_caja_id`, `partidas` (JSONB con los productos) |
| `cajas` | (`tienda_id`, `id_local`) | `usuario`, `abierta_en`, `cerrada_en`, `estado`, `fondo_inicial`, `efectivo_esperado`, `monto_contado`, `diferencia`, `ventas_efectivo`, `ventas_credito`, `num_ventas`, `ingresos`, `retiros` |

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
- **Solo en esta computadora.** El servidor escucha en `127.0.0.1` y el acceso es por HTTP. Para usarlo desde otras computadoras pon `HOST=0.0.0.0` y usa una red de confianza (Tailscale), nunca el puerto abierto a internet.
- **`sync({ alter: true })` en lugar de migraciones.** Es cómodo, como en biblioteca, pero si **renombras** una columna en un modelo, Sequelize borra la vieja y crea una nueva vacía. El arranque hace un respaldo antes de actualizar las tablas; aun así, para renombrar copia los datos a mano o restaura el respaldo.
