/**
 * Prepara la computadora de la tienda. Lo ejecuta MiniSuper-Setup.exe
 * (como administrador) con el Node que viene incluido; no necesita internet.
 *
 *   node configurar-equipo.js --programa "C:\Program Files\MiniSuper" --datos "C:\ProgramData\MiniSuper"
 *       [--tailscale] [--sin-servicios] [--pg-bin <carpeta>] [--puerto-pg 5433]
 *   node configurar-equipo.js --detener ...   detiene el servidor y PostgreSQL (antes de actualizar)
 *   node configurar-equipo.js --quitar ...    quita la tarea y el servicio (al desinstalar; los datos se quedan)
 *
 * Instalación nueva:
 *   1. Crea la base de PostgreSQL en <datos>\pgdata con una contraseña aleatoria
 *      (puerto 5433, solo esta computadora) y la registra como servicio de
 *      Windows "MiniSuperPostgreSQL", que arranca solo al encender.
 *   2. Crea la base "minisuper" y el archivo <datos>\.env.
 *   3. Registra la tarea "MiniSuper", que arranca el servidor al encender la
 *      computadora (aunque nadie inicie sesión) y lo reinicia si se cae.
 * Actualización: conserva la base, la contraseña y el .env (solo ajusta rutas).
 *
 * Con --sin-servicios (pruebas, o sin permisos de administrador) PostgreSQL
 * se arranca con pg_ctl en lugar de registrarse como servicio, y no se crea
 * la tarea.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SERVICIO_PG = 'MiniSuperPostgreSQL';
const TAREA = 'MiniSuper';
const BASE = 'minisuper';
const SID_NETWORK_SERVICE = '*S-1-5-20'; // cuenta con la que corren PostgreSQL y el servidor

// ---------- Argumentos ----------
const args = process.argv.slice(2);
const opcion = (nombre, predeterminado) => {
    const i = args.indexOf(`--${nombre}`);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : predeterminado;
};
const bandera = (nombre) => args.includes(`--${nombre}`);

const PROGRAMA = path.resolve(opcion('programa', path.join(import.meta.dirname, '..', '..')));
const DATOS = path.resolve(opcion('datos', path.join(process.env.ProgramData || 'C:\\ProgramData', 'MiniSuper')));
const PG_BIN = path.resolve(opcion('pg-bin', path.join(PROGRAMA, 'pgsql', 'bin')));
const PUERTO_PG = Number(opcion('puerto-pg', '5433'));
const SIN_SERVICIOS = bandera('sin-servicios');
const PGDATA = path.join(DATOS, 'pgdata');
const ENV = path.join(DATOS, '.env');
const LOGS = path.join(DATOS, 'logs');
const SERVIDOR_CMD = path.join(PROGRAMA, 'app', 'scripts', 'servidor.cmd');

// ---------- Utilidades ----------
function registrar(mensaje) {
    const linea = `[${new Date().toISOString()}] ${mensaje}`;
    console.log(linea);
    // Copia en la carpeta temporal de quien instala: se puede leer aunque la
    // carpeta de datos esté protegida o con permisos dañados.
    try {
        fs.appendFileSync(path.join(os.tmpdir(), 'minisuper-instalacion.log'), `${linea}\n`);
    } catch {
        // sin carpeta temporal: no importa
    }
    try {
        fs.mkdirSync(LOGS, { recursive: true });
        fs.appendFileSync(path.join(LOGS, 'instalacion.log'), `${linea}\n`);
    } catch {
        // sin carpeta de datos todavía: basta con la consola
    }
}

/** Ejecuta un programa; lanza un error con su salida si falla. */
function correr(exe, argumentos, { permitirFallo = false, env, sinSalida = false } = {}) {
    const r = spawnSync(exe, argumentos, {
        encoding: 'utf8', windowsHide: true, env: env ? { ...process.env, ...env } : process.env,
        // sinSalida: para programas que dejan otro proceso corriendo (pg_ctl start);
        // si heredara las tuberías, spawnSync esperaría para siempre.
        ...(sinSalida && { stdio: 'ignore' }),
    });
    if (r.status !== 0 && !permitirFallo) {
        const detalle = (r.stderr || r.stdout || r.error?.message || '').trim();
        throw new Error(`${path.basename(exe)} ${argumentos[0] ?? ''} falló: ${detalle}`);
    }
    return r;
}

const pg = (nombre) => path.join(PG_BIN, `${nombre}.exe`);

// Herramientas de Windows con ruta completa: en una PC con Git instalado,
// "whoami.exe" del PATH puede ser el de Git (otro programa, otras opciones).
const SYSTEM32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
const ICACLS = path.join(SYSTEM32, 'icacls.exe');
const SC = path.join(SYSTEM32, 'sc.exe');
const WHOAMI = path.join(SYSTEM32, 'whoami.exe');

/** PowerShell con el script codificado (evita problemas con comillas y espacios en rutas). */
function powershell(script, opciones) {
    const codificado = Buffer.from(script, 'utf16le').toString('base64');
    return correr('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', codificado], opciones);
}
const comillasPs = (texto) => `'${String(texto).replace(/'/g, "''")}'`;

/** Lee un .env como Map (conserva solo CLAVE=valor). */
function leerEnv() {
    const valores = new Map();
    if (!fs.existsSync(ENV)) return valores;
    for (const linea of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
        const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=(.*)$/.exec(linea);
        if (m) valores.set(m[1], m[2].trim());
    }
    return valores;
}

/** Cambia o agrega claves en el .env sin tocar las demás líneas (SYNC_URL, HOST, …). */
function fijarEnv(cambios) {
    let lineas = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8').split(/\r?\n/) : [];
    for (const [clave, valor] of Object.entries(cambios)) {
        const i = lineas.findIndex((l) => new RegExp(`^\\s*${clave}\\s*=`).test(l));
        if (i >= 0) lineas[i] = `${clave}=${valor}`;
        else lineas.push(`${clave}=${valor}`);
    }
    lineas = lineas.filter((l, i) => l.trim() || i < lineas.length - 1);
    fs.writeFileSync(ENV, `${lineas.join('\r\n')}\r\n`);
}

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function esperarPostgres() {
    for (let i = 0; i < 60; i++) {
        if (correr(pg('pg_isready'), ['-h', 'localhost', '-p', String(PUERTO_PG)], { permitirFallo: true }).status === 0) return;
        await esperar(1000);
    }
    throw new Error(`PostgreSQL no respondió en el puerto ${PUERTO_PG}. Revisa ${path.join(PGDATA, 'log')}.`);
}

const servicioExiste = () => correr(SC, ['query', SERVICIO_PG], { permitirFallo: true }).status === 0;

/** Pausa sin promesas (para los pasos síncronos). */
const pausa = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Espera hasta 60 s a que el servicio de PostgreSQL termine de detenerse. */
function esperarServicioDetenido() {
    for (let i = 0; i < 60; i++) {
        const estado = correr(SC, ['query', SERVICIO_PG], { permitirFallo: true }).stdout ?? '';
        if (!/RUNNING|STOP_PENDING|START_PENDING/.test(estado)) return;
        pausa(1000);
    }
}

// ---------- Pasos ----------

/** Detiene el servidor (tarea + node) y PostgreSQL. Se usa antes de actualizar. */
function detener() {
    registrar('Deteniendo el Mini Súper…');
    powershell(`
        Stop-ScheduledTask -TaskName ${comillasPs(TAREA)} -ErrorAction SilentlyContinue
        Get-CimInstance Win32_Process | Where-Object {
            ($_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*servidor.cmd*') -or
            ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*server.js*')
        } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`, { permitirFallo: true });
    if (servicioExiste()) {
        correr(SC, ['stop', SERVICIO_PG], { permitirFallo: true });
        esperarServicioDetenido();
    } else if (fs.existsSync(path.join(PGDATA, 'postmaster.pid'))) {
        correr(pg('pg_ctl'), ['stop', '-D', PGDATA, '-m', 'fast', '-w'], { permitirFallo: true });
    }
}

/** Al desinstalar: quita la tarea, el servicio y la regla de firewall. Los datos se quedan. */
function quitar() {
    detener();
    powershell(`
        Unregister-ScheduledTask -TaskName ${comillasPs(TAREA)} -Confirm:$false -ErrorAction SilentlyContinue
        Remove-NetFirewallRule -DisplayName 'Mini Super (Tailscale)' -ErrorAction SilentlyContinue`, { permitirFallo: true });
    if (servicioExiste()) correr(pg('pg_ctl'), ['unregister', '-N', SERVICIO_PG], { permitirFallo: true });
    registrar(`Servicios quitados. Los datos siguen en ${DATOS}.`);
}

/** Versión principal de PostgreSQL de los archivos incluidos (por ejemplo, 18). */
function versionPostgres() {
    const salida = correr(pg('postgres'), ['--version']).stdout;
    return /(\d+)(?:\.\d+)?/.exec(salida)?.[1];
}

/** Crea la base de PostgreSQL (initdb) con una contraseña aleatoria. Devuelve la contraseña. */
function crearCluster() {
    registrar(`Creando la base de datos en ${PGDATA}…`);
    const clave = crypto.randomBytes(24).toString('base64url');
    const archivoClave = path.join(os.tmpdir(), `minisuper-${crypto.randomBytes(8).toString('hex')}.txt`);
    fs.writeFileSync(archivoClave, clave, { mode: 0o600 });
    try {
        correr(pg('initdb'), [
            '-D', PGDATA, '-U', 'postgres', '-A', 'scram-sha-256', `--pwfile=${archivoClave}`,
            '-E', 'UTF8',
            // Orden alfabético en español (Ñ después de N, acentos junto a su letra).
            '--locale-provider=icu', '--icu-locale=es-MX', '--lc-messages=C',
        ]);
    } finally {
        fs.rmSync(archivoClave, { force: true });
    }
    fs.appendFileSync(path.join(PGDATA, 'postgresql.conf'), [
        '',
        '# --- Mini Súper ---',
        `port = ${PUERTO_PG}`,
        "listen_addresses = 'localhost'   # solo esta computadora",
        "log_timezone = 'America/Mexico_City'",
        "timezone = 'America/Mexico_City'",
        '',
    ].join('\r\n'));
    return clave;
}

/** SID de la cuenta que ejecuta este script, como "*S-1-5-21-…" (sirve en cualquier idioma de Windows). */
function cuentaActual() {
    const salida = correr(WHOAMI, ['/user', '/fo', 'csv', '/nh']).stdout.trim();
    const sid = /"(S-1-[\d-]+)"/.exec(salida)?.[1];
    if (!sid) throw new Error(`No se pudo saber la cuenta actual (whoami: ${salida}).`);
    return `*${sid}`;
}

/** Permisos: solo administradores, el sistema y la cuenta de los servicios pueden ver los datos (.env tiene la contraseña). */
function permisosDatos() {
    // 0. Administradores como dueños de todo: así se pueden reparar archivos
    //    que hayan quedado sin ningún permiso.
    correr(ICACLS, [DATOS, '/setowner', '*S-1-5-32-544', '/T', '/C', '/Q'], { permitirFallo: true });
    // 1. Solo la carpeta principal: sin los permisos heredados de ProgramData
    //    (que dejan leer a cualquier usuario) y con los tres que se heredan.
    //    OJO: sin /T. Con /T, /inheritance:r se aplica a CADA archivo y los
    //    deja sin permisos para la cuenta del servicio (PostgreSQL no arranca).
    correr(ICACLS, [DATOS, '/inheritance:r', '/grant:r',
        '*S-1-5-32-544:(OI)(CI)F', // Administradores
        '*S-1-5-18:(OI)(CI)F', // SYSTEM
        `${SID_NETWORK_SERVICE}:(OI)(CI)F`, // cuenta de PostgreSQL y del servidor
        '/C', '/Q']);
    // 2. Todo lo de adentro vuelve a heredar de la carpeta principal (también
    //    repara una instalación anterior con permisos mal puestos).
    correr(ICACLS, [path.join(DATOS, '*'), '/reset', '/T', '/C', '/Q']);
}

async function arrancarPostgres() {
    if (SIN_SERVICIOS) {
        if (correr(pg('pg_isready'), ['-h', 'localhost', '-p', String(PUERTO_PG)], { permitirFallo: true }).status !== 0) {
            correr(pg('pg_ctl'), ['start', '-D', PGDATA, '-l', path.join(LOGS, 'postgres.log'), '-w', '-t', '60'], { sinSalida: true });
        }
    } else {
        if (!servicioExiste()) {
            registrar(`Registrando el servicio ${SERVICIO_PG}…`);
            correr(pg('pg_ctl'), ['register', '-N', SERVICIO_PG, '-D', PGDATA, '-U', 'NT AUTHORITY\\NetworkService', '-S', 'auto', '-w']);
            // Si el servicio se cae, Windows lo reinicia.
            correr(SC, ['failure', SERVICIO_PG, 'reset=', '86400', 'actions=', 'restart/5000/restart/10000/restart/30000'], { permitirFallo: true });
        }
        correr(SC, ['start', SERVICIO_PG], { permitirFallo: true }); // si ya corría, no pasa nada
    }
    await esperarPostgres();
}

function crearBaseSiFalta(clave) {
    const env = { PGPASSWORD: clave };
    const conexion = ['-h', 'localhost', '-p', String(PUERTO_PG), '-U', 'postgres'];
    const existe = correr(pg('psql'), [...conexion, '-d', 'postgres', '-tAc', `SELECT 1 FROM pg_database WHERE datname = '${BASE}'`], { env })
        .stdout.trim() === '1';
    if (!existe) {
        registrar(`Creando la base "${BASE}"…`);
        correr(pg('createdb'), [...conexion, BASE], { env });
    }
}

/** Tarea de Windows que arranca el servidor al encender y lo reinicia si se cae. */
function registrarTarea() {
    registrar('Registrando el arranque automático (tarea "MiniSuper")…');
    const argumentos = `/s /c ""${SERVIDOR_CMD}" "${DATOS}""`;
    powershell(`
        $ErrorActionPreference = 'Stop'
        $accion = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ${comillasPs(argumentos)} -WorkingDirectory ${comillasPs(path.dirname(SERVIDOR_CMD))}
        $disparador = New-ScheduledTaskTrigger -AtStartup
        $cuenta = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\\NETWORKSERVICE' -LogonType ServiceAccount
        $ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable \`
            -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
        Register-ScheduledTask -TaskName ${comillasPs(TAREA)} -Action $accion -Trigger $disparador -Principal $cuenta \`
            -Settings $ajustes -Description 'Servidor del Mini Super' -Force | Out-Null
        Start-ScheduledTask -TaskName ${comillasPs(TAREA)}`);
}

/** Acceso desde la ciudad por Tailscale: puerto 3000 solo para 100.64.0.0/10. */
function habilitarTailscale(puerto) {
    registrar('Permitiendo la entrada por Tailscale…');
    fijarEnv({ HOST: '0.0.0.0' });
    powershell(`
        Remove-NetFirewallRule -DisplayName 'Mini Super (Tailscale)' -ErrorAction SilentlyContinue
        New-NetFirewallRule -DisplayName 'Mini Super (Tailscale)' -Direction Inbound -Protocol TCP -LocalPort ${Number(puerto)} \`
            -RemoteAddress '100.64.0.0/10' -Action Allow | Out-Null
        powercfg /change standby-timeout-ac 0
        powercfg /change hibernate-timeout-ac 0`);
}

// ---------- Programa ----------
async function instalar() {
    if (!fs.existsSync(pg('postgres'))) throw new Error(`No se encontró PostgreSQL en ${PG_BIN}.`);
    fs.mkdirSync(DATOS, { recursive: true });
    // Permisos ANTES de leer nada: una instalación anterior pudo dejar
    // archivos (el .env, la base) sin acceso. Se repiten al final para lo
    // que se cree después.
    if (!SIN_SERVICIOS) permisosDatos();
    fs.mkdirSync(path.join(DATOS, 'respaldos'), { recursive: true });
    fs.mkdirSync(LOGS, { recursive: true });
    registrar(`Programa: ${PROGRAMA} · Datos: ${DATOS}`);

    const env = leerEnv();
    let clave = env.get('DB_PASSWORD');
    const versionPg = versionPostgres();
    if (fs.existsSync(path.join(PGDATA, 'PG_VERSION'))) {
        // Actualización: la base ya existe. Debe ser de la misma versión
        // principal; si no, PostgreSQL no la puede abrir.
        const versionDatos = fs.readFileSync(path.join(PGDATA, 'PG_VERSION'), 'utf8').trim();
        if (versionDatos !== versionPg) {
            throw new Error(`La base de datos es de PostgreSQL ${versionDatos} y este instalador trae PostgreSQL ${versionPg}. ` +
                'Usa un instalador con la misma versión (los datos no se tocaron).');
        }
        if (!clave) throw new Error(`Existe ${PGDATA} pero falta DB_PASSWORD en ${ENV}.`);
        registrar('La base de datos ya existía: se conserva.');
    } else if (SIN_SERVICIOS) {
        clave = crearCluster();
    } else {
        // initdb se ejecuta SIN los privilegios de administrador (PostgreSQL
        // lo exige), así que no puede entrar a la carpeta protegida. Se le
        // da acceso a la cuenta que instala solo mientras corre initdb.
        const cuenta = cuentaActual();
        correr(ICACLS, [DATOS, '/grant', `${cuenta}:(OI)(CI)F`, '/C', '/Q']);
        try {
            clave = crearCluster();
        } finally {
            correr(ICACLS, [DATOS, '/remove:g', cuenta, '/C', '/Q'], { permitirFallo: true });
        }
    }

    // .env: se conservan los valores existentes (SESSION_SECRET, SYNC_*, HOST…);
    // las rutas y la conexión siempre se ajustan a esta instalación.
    const nuevo = !fs.existsSync(ENV);
    if (nuevo) {
        fs.writeFileSync(ENV, [
            '# Creado por el instalador del Mini Súper. Reinicia la computadora después de cambiarlo.',
            'PORT=3000',
            '# 127.0.0.1 = solo esta computadora; 0.0.0.0 = también otras (Tailscale)',
            'HOST=127.0.0.1',
            `SESSION_SECRET=${crypto.randomBytes(48).toString('hex')}`,
            'DATOS_DE_PRUEBA=false',
            '# Para ver la tienda desde la ciudad (paso 3 de INSTALACION.md):',
            '# SYNC_URL=https://tu-nube.onrender.com',
            '# SYNC_TOKEN=clave-que-da-crear-tienda',
            '',
        ].join('\r\n'));
    }
    fijarEnv({
        DB_HOST: 'localhost',
        DB_PORT: String(PUERTO_PG),
        DB_NAME: BASE,
        DB_USER: 'postgres',
        DB_PASSWORD: clave,
        PG_DUMP: pg('pg_dump'),
    });

    if (!SIN_SERVICIOS) permisosDatos();
    await arrancarPostgres();
    crearBaseSiFalta(clave);
    if (bandera('tailscale')) habilitarTailscale(leerEnv().get('PORT') || 3000);
    if (!SIN_SERVICIOS) registrarTarea();
    registrar('Listo.');
}

try {
    if (bandera('detener')) detener();
    else if (bandera('quitar')) quitar();
    else await instalar();
} catch (error) {
    registrar(`ERROR: ${error.message}`);
    process.exit(1);
}
