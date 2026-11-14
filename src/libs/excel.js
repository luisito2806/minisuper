/**
 * Utilidades para generar y leer archivos de Excel (.xlsx) con exceljs.
 */
import ExcelJS from 'exceljs';
import { ErrorApp } from './errores.js';

const FORMATOS = {
    moneda: '"$"#,##0.00',
    numero: '#,##0.###',
    entero: '#,##0',
    porcentaje: '0.00%',
    fecha: 'dd/mm/yyyy hh:mm',
    dia: 'dd/mm/yyyy',
};

/** Convierte texto de la base ("32.50") a número para que Excel pueda sumar. */
function valorCelda(valor, tipo) {
    if (valor === null || valor === undefined || valor === '') return null;
    if (['moneda', 'numero', 'entero', 'porcentaje'].includes(tipo)) return Number(valor);
    if (tipo === 'fecha') return new Date(valor);
    if (tipo === 'dia') return new Date(`${valor}T12:00:00`);
    return String(valor);
}

/**
 * Crea un libro con una o varias hojas y lo envía como descarga.
 *   hojas: [{ nombre, titulo?, columnas: [{ titulo, clave, ancho?, tipo? }], filas: [objetos], totales?: [claves] }]
 */
export async function enviarLibro(res, archivo, hojas) {
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Mini Súper';
    libro.created = new Date();
    for (const h of hojas) {
        const hoja = libro.addWorksheet(h.nombre.slice(0, 31));
        let fila = 1;
        if (h.titulo) {
            hoja.getCell(1, 1).value = h.titulo;
            hoja.getCell(1, 1).font = { bold: true, size: 14 };
            fila = 3;
        }
        const encabezado = hoja.getRow(fila);
        h.columnas.forEach((c, i) => {
            encabezado.getCell(i + 1).value = c.titulo;
            hoja.getColumn(i + 1).width = c.ancho ?? Math.max(12, c.titulo.length + 2);
            if (c.tipo && FORMATOS[c.tipo]) hoja.getColumn(i + 1).numFmt = FORMATOS[c.tipo];
        });
        encabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        encabezado.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F2F2F' } };
        const primera = fila + 1;
        for (const o of h.filas) {
            fila += 1;
            const r = hoja.getRow(fila);
            h.columnas.forEach((c, i) => {
                r.getCell(i + 1).value = valorCelda(o[c.clave], c.tipo);
            });
        }
        if (h.totales?.length && h.filas.length) {
            fila += 1;
            const r = hoja.getRow(fila);
            r.getCell(1).value = 'TOTAL';
            r.font = { bold: true };
            h.columnas.forEach((c, i) => {
                if (!h.totales.includes(c.clave)) return;
                const letra = hoja.getColumn(i + 1).letter;
                r.getCell(i + 1).value = { formula: `SUM(${letra}${primera}:${letra}${fila - 1})` };
            });
        }
        hoja.views = [{ state: 'frozen', ySplit: primera - 1 }];
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${archivo}"`);
    await libro.xlsx.write(res);
    res.end();
}

/** Valor simple de una celda (texto, número o fecha), sin fórmulas ni formato. */
function simple(valor) {
    if (valor === null || valor === undefined) return null;
    if (valor instanceof Date) return valor;
    if (typeof valor === 'object') {
        if ('result' in valor) return simple(valor.result);
        if ('text' in valor) return String(valor.text);
        if (Array.isArray(valor.richText)) return valor.richText.map((t) => t.text).join('');
        return null;
    }
    return valor;
}

/** Quita acentos, mayúsculas y signos para comparar encabezados. */
export const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();

/**
 * Lee la primera hoja de un .xlsx enviado en base64. Busca la fila de
 * encabezados (la primera que contiene alguno de `requeridos`) y devuelve
 * cada fila como objeto { encabezadoNormalizado: valor, _fila: número }.
 */
export async function leerLibro(base64, requeridos) {
    if (typeof base64 !== 'string' || !base64) throw new ErrorApp(400, 'Adjunta un archivo de Excel (.xlsx).');
    const libro = new ExcelJS.Workbook();
    try {
        await libro.xlsx.load(Buffer.from(base64, 'base64'));
    } catch {
        throw new ErrorApp(400, 'El archivo no es un Excel válido (.xlsx). Si es .xls o .csv, ábrelo en Excel y guárdalo como .xlsx.');
    }
    const hoja = libro.worksheets[0];
    if (!hoja) throw new ErrorApp(400, 'El archivo de Excel no tiene hojas.');

    let encabezados = null;
    let filaEncabezado = 0;
    const filas = [];
    hoja.eachRow({ includeEmpty: false }, (row, n) => {
        const valores = [];
        row.eachCell({ includeEmpty: true }, (cell, col) => {
            valores[col] = simple(cell.value);
        });
        if (!encabezados) {
            const normal = valores.map(normalizar);
            if (requeridos.some((r) => normal.includes(r))) {
                encabezados = normal;
                filaEncabezado = n;
            }
            return;
        }
        if (valores.every((x) => x === null || x === undefined || String(x).trim() === '')) return;
        const o = { _fila: n };
        encabezados.forEach((h, i) => {
            if (h) o[h] = valores[i] ?? null;
        });
        filas.push(o);
    });
    if (!encabezados) {
        throw new ErrorApp(400, `No se encontró la fila de encabezados. Debe tener una columna "${requeridos[0]}".`);
    }
    for (const r of requeridos) {
        if (!encabezados.includes(r)) {
            throw new ErrorApp(400, `Falta la columna "${r}" en la fila ${filaEncabezado} del archivo.`);
        }
    }
    return filas;
}
