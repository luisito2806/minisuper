# Instalar el Mini Súper en la tienda y verlo desde la ciudad

La tienda **nunca depende de internet**: vende, cobra y guarda todo en su propia computadora. Para ver la tienda desde la ciudad hay tres niveles; cada uno funciona solo, y se pueden usar juntos.

| | Qué se necesita | Qué se ve desde la ciudad | Qué tan actualizado |
|---|---|---|---|
| **Paso 1:** USB | Nada (sin internet) | Los datos que traigas en la USB | Del día en que se copió |
| **Paso 2:** Tailscale | Internet en la tienda | La app completa de la tienda, como si estuvieras ahí | En vivo, si la computadora de la tienda está prendida |
| **Paso 3:** Nube | Un servidor en internet (gratis o barato) + internet en la tienda, **o** la USB | Panel de consulta: ventas, utilidad, inventario, nómina, cortes | Cada minuto con internet; con USB, al cargar el paquete |

---

## Paso 1: instalar en la computadora de la tienda

### Lo que hay que comprar
- **No-break (UPS)** de al menos 600 VA para la computadora y el módem. En zonas rurales los apagones son el mayor riesgo para la base de datos.
- **Dos memorias USB** de 16 GB o más: una se queda en la tienda y la otra viaja a la ciudad, y se van turnando.
- Opcional: lector de código de barras USB (funciona como teclado) e impresora de tickets de 80 mm.

### Opción A (recomendada): instalador, sin internet

En la tienda **no hay que instalar PostgreSQL ni Node.js**: `MiniSuper-Setup.exe` los trae adentro.

**En tu computadora (con internet), una vez por versión:**
1. Ten instalados Node.js 20+, PostgreSQL (la misma versión principal que usará la tienda, hoy la 18) e Inno Setup 6 (`winget install JRSoftware.InnoSetup`).
2. En la carpeta del proyecto ejecuta:

   ```powershell
   powershell -ExecutionPolicy Bypass -File instalador\empaquetar.ps1
   ```

   Toma Node y PostgreSQL de tu computadora (no descarga nada) y deja `instalador\salida\MiniSuper-Setup-<versión>.exe` (unos 60–70 MB).

**En la tienda:**
1. Copia el `.exe` con una USB y ejecútalo (pide permiso de administrador). Opciones del asistente:
   - *Imprimir el ticket directo*: el ticket sale en la impresora predeterminada sin el cuadro de impresión.
   - *Permitir entrar desde la ciudad con Tailscale*: ver el paso 2.
2. El instalador:
   - copia el programa a `C:\Program Files\MiniSuper`;
   - crea la base de datos en `C:\ProgramData\MiniSuper\pgdata` con una contraseña aleatoria, como servicio de Windows **MiniSuperPostgreSQL** (puerto 5433, solo esta computadora);
   - crea `C:\ProgramData\MiniSuper\.env`;
   - hace que el sistema **arranque solo al encender la computadora**, aunque nadie inicie sesión, y que se reinicie si se cae;
   - pone el icono **Mini Súper** en el escritorio.
3. Abre el icono (si la computadora acaba de encender, espera unos segundos) y entra con `admin` / `Admin123!`. El sistema te pide **poner una contraseña nueva** antes de continuar (al cajero le pasa lo mismo la primera vez).
4. En **Configuración**, llena los datos de la tienda y elige cómo se maneja el IVA. Si no cobras IVA, elige **No cobro IVA**.

**Actualizar:** ejecuta un `MiniSuper-Setup` más nuevo. Conserva la base, los respaldos y el `.env`; si los modelos cambiaron, el sistema hace un respaldo antes de actualizar las tablas. El instalador nuevo debe traer la **misma versión principal de PostgreSQL** (si no, se detiene sin tocar los datos).

**Desinstalar:** desde *Configuración de Windows → Aplicaciones*. Quita el programa y los servicios, pero **no** `C:\ProgramData\MiniSuper` (base, respaldos y `.env`).

**Datos y pgAdmin:** todo lo de la tienda está en `C:\ProgramData\MiniSuper` (solo administradores pueden abrirla, porque `.env` tiene la contraseña). Para verla con pgAdmin, conéctate a `localhost`, puerto `5433`, usuario `postgres`, con la contraseña `DB_PASSWORD` de ese `.env`.

### Opción B: instalación manual (desarrollo o computadora con PostgreSQL ya instalado)
1. Instala **PostgreSQL** (incluye pgAdmin) y **Node.js LTS** (20 o más nuevo).
2. En pgAdmin crea la base `minisuper` (clic derecho en **Databases** → **Create** → **Database…**).
3. Copia la carpeta del proyecto a la computadora, por ejemplo a `C:\MiniSuper`.
4. Abre PowerShell en esa carpeta y ejecuta:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\instalar-tienda.ps1
   ```

   El script necesita internet para instalar las dependencias. Además:
   - crea el `.env` (te pide la contraseña de PostgreSQL);
   - hace que el sistema **arranque solo** al iniciar sesión en Windows, sin ventana, y que se reinicie si se cierra por un error;
   - pone el icono **Mini Super** en el escritorio.
5. Sigue los pasos 3 y 4 de la opción A.

Para quitarlo: `scripts\desinstalar-tienda.ps1`. Este script no borra la base ni los respaldos.

### Respaldos y USB
- Cada día, al encender, se hace un **respaldo automático** en la carpeta `respaldos` (con el instalador: `C:\ProgramData\MiniSuper\respaldos`). Se conservan los últimos 30.
- Cada semana: conecta la USB y ve a **Configuración → Copiar a USB → Copiar a la USB**. Se guarda en `USB:\MiniSuper\<fecha>\`:
  - `minisuper_….backup`: el respaldo completo. Se restaura en pgAdmin con **Restore…**.
  - `paquete_minisuper_….json.gz`: los cambios para la nube (paso 3).
- Si algo falla, el registro del servidor está en `logs\servidor.log` (con el instalador: `C:\ProgramData\MiniSuper\logs\servidor.log`; la instalación deja el suyo en `instalacion.log`).

---

## Paso 2: entrar desde la ciudad con Tailscale (cuando la tienda tenga internet)

Para internet en una zona sin señal, las opciones son **internet satelital** o, si hay algo de señal cerca, un **módem 4G con antena exterior y amplificador**.

[Tailscale](https://tailscale.com) crea una red privada entre tus computadoras. Es gratis para uso personal, no hay que abrir puertos en el módem y la conexión va cifrada.

1. Crea una cuenta de Tailscale (con Google o Microsoft).
2. Instala Tailscale **en la computadora de la tienda** e inicia sesión con esa cuenta.
3. En la computadora de la tienda, abre PowerShell **como administrador** y ejecuta:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\instalar-tienda.ps1 -Tailscale
   ```

   Esto pone `HOST=0.0.0.0` en el `.env` (sin eso el sistema solo acepta conexiones de la propia computadora), abre el puerto 3000 **solo para tu red de Tailscale** y evita que la computadora se suspenda.
4. Instala Tailscale en la computadora o el celular de la ciudad, con la misma cuenta.
5. En la tienda ve a **Configuración → Entrar desde otra computadora**. Copia la dirección marcada **Tailscale** (por ejemplo `http://100.101.102.103:3000`) y ábrela en el navegador de la ciudad.

Se ve la app completa, en vivo, con el usuario y contraseña de siempre. Solo funciona mientras la computadora de la tienda esté prendida y con internet.

---

## Paso 3: panel en la nube

La carpeta `nube/` es una aplicación aparte que se publica en internet. Recibe los datos de una o varias tiendas (la de tu papá y, más adelante, la ferretería) y muestra un **panel de solo consulta**: resumen con utilidad, ventas, inventario, nómina y cortes de caja. Las ventas que la tienda borra con la depuración anual **se quedan en la nube** como historial.

### 3.1 Base de datos en la nube
Crea una base PostgreSQL en un servicio administrado, por ejemplo [Neon](https://neon.tech), que tiene plan gratuito. Copia la cadena de conexión: `postgres://usuario:contraseña@servidor/base?sslmode=require`.

### 3.2 Publicar la aplicación
Ejemplo con [Render](https://render.com) (*Web Service*):
1. Sube el proyecto a un repositorio **privado** de GitHub. El `.gitignore` ya excluye `.env`, respaldos y logs.
2. En Render: **New → Web Service** y elige el repositorio. Configúralo así:
   - **Root Directory:** `nube`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. En **Environment** agrega:
   - `DATABASE_URL` = la cadena del paso 3.1
   - `DATABASE_SSL` = `true`
   - `SESSION_SECRET` = una cadena aleatoria de 64 caracteres
   - `URL_PUBLICA` = la dirección que te dé Render, por ejemplo `https://minisuper-nube.onrender.com`

Revisa las condiciones actuales de los planes gratuitos de Render y Neon. Cambian con el tiempo, y en algunos el servidor "se duerme" si no se usa. Eso no es problema: la tienda reintenta cada minuto. Cualquier servidor con Node 20 y PostgreSQL sirve (un VPS, Railway, etc.).

### 3.3 Dar de alta la tienda y los usuarios
Desde tu computadora, dentro de `nube/`, con un `.env` que tenga el mismo `DATABASE_URL` y `DATABASE_SSL`:

```bash
cd nube
npm install
npm run crear-tienda -- "Mini Súper de mi papá"
# → muestra SYNC_URL y SYNC_TOKEN (la clave se muestra UNA sola vez)

npm run crear-usuario -- papa "Nombre de mi papá" "Una-contraseña-larga-1" 1
npm run crear-usuario -- yo "Mi nombre" "Otra-contraseña-larga-2" todas
```

El último dato son las tiendas que puede ver cada usuario: `1`, `1,2` o `todas`.

### 3.4 Conectar la tienda
En el `.env` de la computadora de la tienda, agrega las dos líneas que mostró `crear-tienda`:

```
SYNC_URL=https://minisuper-nube.onrender.com
SYNC_TOKEN=…
```

Reinicia la computadora o el servidor. En **Configuración → Ver la tienda desde la ciudad** verás:
- **Conexión: Activa**;
- **Cambios por enviar** bajando a 0.

La primera vez se manda todo lo que ya existía.

- **Con internet:** los cambios se mandan solos cada minuto. Si se va el internet, se acumulan y se mandan al volver.
- **Sin internet:** lleva la USB y en el panel de la nube entra a **Cargar USB** para subir el `paquete_minisuper_….json.gz`. Cargar el mismo paquete dos veces no duplica nada.
- Si se pierde un paquete o reinicias la nube: **Configuración → Enviar todo de nuevo**.

### Seguridad
- La nube solo **recibe** datos: nadie puede vender, borrar ni cambiar nada en la tienda desde internet.
- Cada tienda tiene su propia clave (`SYNC_TOKEN`). La nube guarda solo una huella (hash) de ella.
- Si la computadora de la tienda se reinstala desde cero (base nueva), la nube rechaza sus datos para no mezclarlos con los anteriores. Para aceptarla: `npm run desvincular-tienda -- 1` (agrega `--borrar` para empezar de cero).
- Usa contraseñas largas en la nube: está en internet. Después de 5 intentos fallidos, el usuario se bloquea 5 minutos.
 
 Lo que falta
Inno Setup no está instalado, así que el .exe todavía no se ha generado. Instálalo con winget install JRSoftware.InnoSetup y vuelve a ejecutar empaquetar.ps1. Debería pesar unos 60–70 MB, pero aún no lo he podido confirmar. Si quieres, lo instalo yo.
Falta probar la parte que necesita administrador: el servicio de PostgreSQL, la tarea de arranque y los permisos de la carpeta de datos. Tu Windows 11 Home no tiene Sandbox, así que conviene probar el .exe en otra PC o laptop antes de llevarlo a la tienda.
El .env.example ya no existe, y apareció un database.zip. Supuse que lo borraste tú y no lo volví a crear. El instalador no lo necesita, pero el README todavía dice "copia .env.example".