// ============================================================================
//  Ingresos y egresos.
//
//  Adaptado del módulo "ingresos-egresos" para vivir dentro de este panel:
//  usa la misma cuenta de servicio y el mismo token de sesión que el resto,
//  en vez de abrir su propia conexión y su propia ruta pública.
//
//  La lógica de lectura es la del módulo original y se respetó tal cual, porque
//  cada decisión que trae salió de un error real:
//    · los nombres de columna se buscan por varios candidatos
//    · los traspasos entre cuentas propias no cuentan como flujo
//    · el signo de los egresos se deduce
// ============================================================================
const core = require('./core');

const E = process.env;

const CFG = {
  // Archivo de Ingresos-Egresos de Aplicación de Ideas.
  ARCHIVO: E.SHEET_FINANZAS || '1YMP_ZtPlU2C8MVuNCgq2dO_kOXX2BPCC3XUazww89tM',

  PESTANAS: {
    ingresos: E.TAB_INGRESOS || 'INGRESOS',
    egresos:  E.TAB_EGRESOS  || 'EGRESOS'
  },

  // Los nombres de columna que se aceptan, en orden de preferencia. La primera
  // que exista en la hoja es la que se usa. Buscar un solo nombre haría que el
  // dato se lea como cero sin avisar, y un cero se ve igual que "no hubo nada".
  COLUMNAS: {
    fecha:        ['Fecha', 'Fecha del movimiento', 'Fecha de operación', 'Fecha operacion'],
    monto:        ['Total', 'Monto', 'Importe', 'Cantidad'],
    concepto:     ['Concepto', 'Descripción', 'Descripcion', 'Detalle'],
    categoria:    ['Categoría', 'Categoria', 'Rubro'],
    subcategoria: ['Subcategoría', 'Subcategoria', 'Sub categoría', 'Subrubro'],
    cuenta:       ['Cuenta', 'Banco', 'Cuenta bancaria'],
    // "Método de cobro" y "Método de pago" son los que usa esta hoja
    metodo:       ['Método de cobro', 'Método de pago', 'Método', 'Metodo', 'Forma de pago'],
    contraparte:  ['Cliente', 'Proveedor', 'Contraparte', 'Beneficiario'],
    referencia:   ['Referencia', 'Folio', 'Pedido', 'No. de Referencia'],
    linea:        ['Línea de negocio', 'Linea de negocio', 'Línea de Negocio']
  },

  // Movimientos que NO son flujo: mueven dinero de un bolsillo a otro sin que
  // entre ni salga de la empresa. Si se cuentan, ingresos y egresos del mes
  // salen inflados por el mismo monto de los dos lados.
  NO_ES_FLUJO: (E.CONCEPTOS_NO_FLUJO ||
    'traspaso entre cuentas,traspaso cuentas propias,movimiento interno,' +
    'pago de tarjeta,pago de tarjetas,traspaso').split(',')
      .map(s => s.trim()).filter(Boolean),

  // Conceptos que sí son entradas de dinero pero NO son ventas: capital que
  // mete el socio, deuda que se contrata, principal que regresa de una
  // plataforma. Se leen y se muestran, pero aparte del ingreso de operación.
  NO_ES_OPERACION: (E.CONCEPTOS_NO_OPERACION ||
    'aportacion de capital,aportación de capital,retiro de inversiones,' +
    'ingresos por adquisicion de deuda,ingresos por adquisición de deuda,' +
    'pago de prestamos,pago de préstamos').split(',')
      .map(s => s.trim()).filter(Boolean),

  SIGNO_EGRESOS: (E.SIGNO_EGRESOS || 'auto').toLowerCase()
};

const txt = (v) => String(v == null ? '' : v).trim();
function norm(s) {
  return String(s == null ? '' : s).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}
// Un monto puede venir como número, como "$ 1,234.56" o como texto con espacios.
function num(v) {
  if (typeof v === 'number') return v;
  const s = String(v == null ? '' : v).replace(/[^0-9.,\-]/g, '').replace(/,/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

const MESES = { ene:1, feb:2, mar:3, abr:4, may:5, jun:6, jul:7, ago:8, sep:9, sept:9,
                oct:10, nov:11, dic:12, enero:1, febrero:2, marzo:3, abril:4, mayo:5,
                junio:6, julio:7, agosto:8, septiembre:9, octubre:10, noviembre:11,
                diciembre:12 };

// Devuelve la fecha como número AAAAMMDD, que se ordena y se compara sin líos
// de zona horaria. Devuelve null si no se pudo entender.
//
// El formato con el mes en palabra —"9 enero 2025"— es el que usa esta hoja.
// Si el lector no lo entiende se pierden meses enteros y el error es difícil de
// ver, porque los totales siguen saliendo.
function fechaNum(v) {
  if (v instanceof Date) {
    return v.getFullYear() * 10000 + (v.getMonth() + 1) * 100 + v.getDate();
  }
  const s = norm(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return +m[1] * 10000 + +m[2] * 100 + +m[3];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);          // día/mes/año
  if (m) return +m[3] * 10000 + +m[2] * 100 + +m[1];
  m = s.replace(/,/g, ' ').replace(/\s+/g, ' ')
       .match(/^(\d{1,2})\s+(?:de\s+)?([a-z]+)\.?\s+(?:de\s+)?(\d{4})/);
  if (m && MESES[m[2]]) return +m[3] * 10000 + MESES[m[2]] * 100 + +m[1];
  return null;
}

function columna(encabezados, candidatas) {
  for (const c of candidatas) {
    const hit = encabezados.filter(h => norm(h) === norm(c))[0];
    if (hit) return hit;
  }
  return null;
}

// Lee una pestaña y devuelve encabezados y renglones como objetos.
// Los renglones totalmente vacíos se saltan: estas hojas traen cientos.
async function leer(pestana) {
  if (!CFG.ARCHIVO) {
    const e = new Error('No hay archivo de finanzas configurado.');
    e.pista = 'Falta la variable SHEET_FINANZAS con el id del archivo de Google.';
    throw e;
  }
  let values;
  try {
    values = await core.readRange(CFG.ARCHIVO, pestana);
  } catch (e) {
    const err = new Error('No se pudo leer la pestaña "' + pestana + '".');
    err.pista = /permission|403/i.test(e.message)
      ? 'El archivo no está compartido con la cuenta de servicio.'
      : (/unable to parse range|not found/i.test(e.message)
         ? 'Esa pestaña no existe en el archivo. Revisa el nombre exacto.'
         : e.message);
    throw err;
  }
  if (!values.length) return { encabezados: [], renglones: [] };
  const H = (values[0] || []).map(h => txt(h));
  const renglones = [];
  for (let i = 1; i < values.length; i++) {
    const f = values[i] || [];
    if (!H.some((_, j) => txt(f[j]) !== '')) continue;
    const o = { _fila: i + 1 };
    H.forEach((h, j) => { o[h] = (f[j] != null) ? f[j] : ''; });
    renglones.push(o);
  }
  return { encabezados: H, renglones };
}

function mapaDeColumnas(encabezados) {
  const m = {}, faltan = [];
  Object.keys(CFG.COLUMNAS).forEach(k => {
    m[k] = columna(encabezados, CFG.COLUMNAS[k]);
    if (!m[k]) faltan.push(k);
  });
  return { columnas: m, faltan };
}

// ¿Este movimiento mueve dinero de verdad, o solo lo cambia de bolsillo?
function esFlujo(r, m) {
  const donde = norm([r[m.concepto], r[m.categoria], r[m.subcategoria]]
                     .filter(Boolean).join(' '));
  if (!donde) return true;
  return !CFG.NO_ES_FLUJO.some(p => donde.indexOf(norm(p)) !== -1);
}

// ¿Es dinero de la operación, o es capital, deuda o principal que regresa?
function esOperacion(r, m) {
  const donde = norm([r[m.concepto], r[m.categoria], r[m.subcategoria]]
                     .filter(Boolean).join(' '));
  if (!donde) return true;
  return !CFG.NO_ES_OPERACION.some(p => donde.indexOf(norm(p)) !== -1);
}

module.exports = { CFG, leer, columna, mapaDeColumnas, esFlujo, esOperacion,
                   txt, norm, num, fechaNum };
