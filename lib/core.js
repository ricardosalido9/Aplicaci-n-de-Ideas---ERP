const crypto = require('crypto');
const { google } = require('googleapis');

// Versión del proyecto. Sube el último número cada vez que se entrega un ZIP.
// Tiene que ser IDÉNTICA a la constante VERSION de index.html.
const VERSION = '2026.08.24-011';

const SECRET = process.env.SESSION_SECRET || 'cambia-este-secreto';
const SESSION_MS = 6 * 60 * 60 * 1000; // 6 horas

// ===== Menú de áreas (barra lateral) =====
// `key` = identificador interno (se usa en SHEETS), `label` = lo que se ve, `icon` = ícono.
// Íconos: home, grid, chart, clipboard, tag, users, cart, box, briefcase, dollar, book, card, factory.
const MENU = [
  { key:'inicio',      label:'Inicio',           icon:'home' },
  { key:'dashboard',   label:'Dashboard',        icon:'chart' },
  // Ingresos: lo que la empresa factura y cobra. Cada ítem es la hoja de Ventas
  // filtrada por su línea de negocio.
  { key:'ingresos_g',  label:'Ingresos',         icon:'tag', children:[
      { key:'ventas_registro',   label:'Todas las fuentes' },
      { key:'ventas_consultoria',label:'Consultoría' },
      { key:'ventas_inversiones',label:'Rendimientos' },
      { key:'ventas_prestamos',  label:'Préstamos' },
      { key:'ventas_puerto',     label:'Puerto Escondido' },
      { key:'ventas_leads',      label:'Prospectos' },
      { key:'ventas_cotiza',     label:'Cotizaciones' }
  ] },
  // Inversiones: el patrimonio en las plataformas. No es lo mismo que el
  // rendimiento que se factura: aquí vive el capital, la cartera y los estados
  // de cuenta que las plataformas mandan cada mes.
  { key:'inversiones_g', label:'Inversiones',    icon:'card', children:[
      { key:'inv_analisis',      label:'Rendimiento y cartera' },
      { key:'importar',          label:'Importar estados de cuenta' }
  ] },
  { key:'clientes',    label:'Clientes',         icon:'users', children:[
      { key:'cli_directorio',   label:'Directorio' },
      { key:'cli_contratos',    label:'Contratos' }
  ] },
  { key:'proyectos',   label:'Proyectos',        icon:'clipboard', children:[
      { key:'proy_cartera',     label:'Cartera de Proyectos' },
      { key:'proy_entregables', label:'Entregables' },
      { key:'proy_horas',       label:'Horas y Honorarios' }
  ] },
  { key:'compras',     label:'Compras',          icon:'cart', children:[
      { key:'compras_proveedores', label:'Proveedores' },
      { key:'compras_ordenes',     label:'Órdenes de Compra' }
  ] },
  { key:'inventarios', label:'Activos',          icon:'box', children:[
      { key:'inv_activos',      label:'Activos Fijos' },
      { key:'inv_almacen',      label:'Almacén' }
  ] },
  { key:'rrhh',        label:'Recursos Humanos', icon:'briefcase', children:[
      { key:'rrhh_colaboradores', label:'Colaboradores' },
      { key:'rrhh_incidencias',   label:'Incidencias' }
  ] },
  { key:'finanzas',    label:'Finanzas',         icon:'dollar', children:[
      { key:'fin_flujo', label:'Ingresos y Egresos' },
      { key:'bancos',   label:'Bancos y Cajas' },
      { key:'ingresos', label:'Ingresos' },
      { key:'egresos',  label:'Egresos' },
      { key:'cxc',      label:'Cuentas por Cobrar' },
      { key:'cxp',      label:'Cuentas por Pagar' }
  ] },
  { key:'contabilidad', label:'Contabilidad',    icon:'book', children:[
      { key:'cfdi_emitidos',  label:'CFDIs Emitidos' },
      { key:'cfdi_recibidos', label:'CFDIs Recibidos' },
      { key:'cfdi_nomina',    label:'CFDIs Nómina' }
  ] }
];

// ===== Hojas conectadas (key del menú -> archivo y pestaña) =====
// Cada línea conecta un `key` del menú con un archivo de Google Sheets y su pestaña.
// El `id` es lo que va entre /d/ y /edit en la URL de la hoja:
//   https://docs.google.com/spreadsheets/d/ESTO_ES_EL_ID/edit
// Descomenta y llena SOLO las áreas que ya tengas. Las que no estén aquí
// aparecen en el menú pero no se pueden abrir (es intencional: te sirve de mapa).
// Archivo de ventas de Aplicación de Ideas (todas las fuentes de ingreso viven aquí).
const VENTAS_ID = process.env.VENTAS_SHEET_ID || '181v9VGgX2V2rrS_Zsi4x8zMBIhkI6ikwCWaitWiP3Zs';

const SHEETS = {
  // ---- Conectadas ----
  // Las cinco áreas de ingresos leen LA MISMA pestaña "Ventas 2026".
  // Lo que las diferencia es el filtro de AREA_ROW_FILTERS de más abajo,
  // así no hay que duplicar datos ni mantener cinco hojas en paralelo.
  ventas_registro:    { id: VENTAS_ID, sheetName: 'Ventas 2026' },
  ventas_consultoria: { id: VENTAS_ID, sheetName: 'Ventas 2026' },
  ventas_inversiones: { id: VENTAS_ID, sheetName: 'Ventas 2026' },
  ventas_prestamos:   { id: VENTAS_ID, sheetName: 'Ventas 2026' },
  ventas_puerto:      { id: VENTAS_ID, sheetName: 'Ventas 2026' },
  cxc:                { id: VENTAS_ID, sheetName: 'Ventas 2026' },

  // ---- Pendientes: descomenta y pega el ID cuando tengas la hoja ----
  // ventas_leads:     { id: 'PEGA_EL_ID', sheetName: 'Prospectos' },
  // ventas_cotiza:    { id: 'PEGA_EL_ID', sheetName: 'Cotizaciones' },
  // cli_directorio:   { id: 'PEGA_EL_ID', sheetName: 'Lista de Clientes' },
  // cli_contratos:    { id: 'PEGA_EL_ID', sheetName: 'Contratos' },
  // proy_cartera:     { id: 'PEGA_EL_ID', sheetName: 'Proyectos' },
  // proy_entregables: { id: 'PEGA_EL_ID', sheetName: 'Entregables' },
  // proy_horas:       { id: 'PEGA_EL_ID', sheetName: 'Horas' },
  // compras_proveedores: { id: 'PEGA_EL_ID', sheetName: 'Lista de Proveedores' },
  // compras_ordenes:  { id: 'PEGA_EL_ID', sheetName: 'Órdenes de Compra' },
  // inv_activos:      { id: 'PEGA_EL_ID', sheetName: 'Lista de Activos' },
  // inv_almacen:      { id: 'PEGA_EL_ID', sheetName: 'Almacén' },
  // rrhh_colaboradores: { id: 'PEGA_EL_ID', sheetName: 'Lista de Colaboradores' },
  // rrhh_incidencias: { id: 'PEGA_EL_ID', sheetName: 'Registro de Incidencias' },
  // bancos:           { id: 'PEGA_EL_ID', sheetName: 'Bancos y Cajas' },
  // ingresos:         { id: 'PEGA_EL_ID', sheetName: 'INGRESOS' },
  // egresos:          { id: 'PEGA_EL_ID', sheetName: 'EGRESOS' },
  // cxp:              { id: 'PEGA_EL_ID', sheetName: 'Cuentas por Pagar' },
  // cfdi_emitidos:    { id: 'PEGA_EL_ID', sheetName: 'Emitidos' },
  // cfdi_recibidos:   { id: 'PEGA_EL_ID', sheetName: 'Recibidos' },
  // cfdi_nomina:      { id: 'PEGA_EL_ID', sheetName: 'Nómina' },
};

// Pestaña donde vive el detalle mes a mes de las plataformas de inversión.
// Es la que alimenta el importador de estados de cuenta.
const MOVIMIENTOS_INVERSIONES = { id: VENTAS_ID, sheetName: 'Inversiones' };

// Filtros de fila por área: el área solo muestra los registros que cumplen la condición.
// gt0 = el valor numérico de la columna debe ser mayor a cero.
const AREA_ROW_FILTERS = {
  // Cada fuente de ingreso es la misma hoja filtrada por "Línea de Negocio".
  ventas_consultoria: { field: 'Línea de Negocio', op: 'eq', value: 'Consultoría' },
  ventas_inversiones: { field: 'Línea de Negocio', op: 'eq', value: 'Inversiones' },
  ventas_prestamos:   { field: 'Línea de Negocio', op: 'eq', value: 'Préstamos' },
  ventas_puerto:      { field: 'Línea de Negocio', op: 'eq', value: 'Dividendos' },
  // Cuentas por Cobrar: solo las filas que siguen con saldo pendiente.
  cxc: { field: 'Cuentas por Cobrar', op: 'gt0' }
};

// Los menús desplegables se leen de una pestaña "CATEGORIAS" dentro del MISMO
// archivo de cada área. Los encabezados de esa pestaña = nombre del campo a poblar.

// Hoja de usuarios (usuario | contraseña | nombre | rol).
// Ya apunta a la hoja de Aplicación de Ideas. La variable de entorno USERS_SHEET_ID,
// si existe en Vercel, tiene prioridad sobre este valor.
const USERS_SHEET = {
  id: process.env.USERS_SHEET_ID || '1C2-5HbgpKWGeGwgyL2ov0_7KTD5nYAFQ69UpNjFUTQE',
  sheetName: 'Usuarios ERP'
};

// ===== Google Sheets (cuenta de servicio) =====
// Opción fácil: pegar el JSON completo en GOOGLE_CREDENTIALS.
// Alternativa: GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY por separado.
function getCredentials() {
  if (process.env.GOOGLE_CREDENTIALS) {
    const c = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    return { email: c.client_email, key: c.private_key };
  }
  let key = process.env.GOOGLE_PRIVATE_KEY || '';
  if (key.charAt(0) === '"' && key.charAt(key.length - 1) === '"') key = key.slice(1, -1);
  key = key.replace(/\\n/g, '\n');
  return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: key };
}
function getSheets() {
  const c = getCredentials();
  const auth = new google.auth.JWT(c.email, null, c.key, ['https://www.googleapis.com/auth/spreadsheets']);
  return google.sheets({ version: 'v4', auth });
}
async function readRange(spreadsheetId, sheetName) {
  const sheets = getSheets();
  const r = await sheets.spreadsheets.values.get({ spreadsheetId, range: "'" + sheetName + "'" });
  return r.data.values || [];
}
async function appendRow(spreadsheetId, sheetName, row) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId, range: "'" + sheetName + "'",
    valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
}

// Escribe una fila respetando las columnas calculadas (no las toca).
// rowNumber: fila real de la hoja. skipCols: índices de columnas a NO escribir.
async function writeRowSkipping(spreadsheetId, sheetName, rowNumber, rowArr, skipCols) {
  const sheets = getSheets();
  const data = [];
  let i = 0;
  while (i < rowArr.length) {
    if (skipCols.has(i)) { i++; continue; }
    let j = i;
    while (j < rowArr.length && !skipCols.has(j)) j++;
    data.push({
      range: "'" + sheetName + "'!" + _colLetter(i) + rowNumber + ":" + _colLetter(j - 1) + rowNumber,
      values: [rowArr.slice(i, j)]
    });
    i = j;
  }
  if (!data.length) return { ok: true };
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: 'USER_ENTERED', data }
  });
  return { ok: true };
}

// ===== Categorías (listas para los desplegables) =====
function _colLetter(idx) {
  let s = '', n = idx + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function _norm(s) { return String(s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function _categoriesSheetFor(key) {
  const cfg = SHEETS[key];
  return cfg ? { id: cfg.id, sheetName: 'CATEGORIAS' } : null;
}
async function getCategories(key) {
  const c = _categoriesSheetFor(key);
  if (!c) return {};
  let values;
  try { values = await readRange(c.id, c.sheetName); }
  catch (e) { return {}; } // si el archivo no tiene pestaña CATEGORIAS, sin desplegables
  if (!values.length) return {};
  const headers = values[0].map(h => String(h).trim());
  const out = {};
  headers.forEach((h, col) => {
    if (!h) return;
    const list = [];
    for (let i = 1; i < values.length; i++) {
      const v = values[i][col];
      if (v != null && String(v).trim() !== '') list.push(String(v).trim());
    }
    out[h] = list;
  });
  return out;
}
async function addCategory(key, categoria, valor) {
  const c = _categoriesSheetFor(key);
  if (!c) throw new Error('Área sin hoja de categorías.');
  const sheets = getSheets();
  const values = await readRange(c.id, c.sheetName);
  const headers = (values[0] || []).map(h => String(h).trim());
  let col = -1;
  for (let i = 0; i < headers.length; i++) {
    if (_norm(headers[i]) === _norm(categoria)) { col = i; break; }
  }
  if (col === -1) throw new Error('No existe la categoría "' + categoria + '" en la hoja CATEGORIAS.');
  let row = 1;
  while (row < values.length && values[row][col] != null && String(values[row][col]).trim() !== '') row++;
  const range = "'" + c.sheetName + "'!" + _colLetter(col) + (row + 1);
  await sheets.spreadsheets.values.update({
    spreadsheetId: c.id, range, valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[valor]] }
  });
  return { ok: true };
}

// ===== Tokens de sesión (HMAC firmado) =====
function signToken(payload) {
  const body = Buffer.from(JSON.stringify(Object.assign({}, payload, { exp: Date.now() + SESSION_MS }))).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verifyToken(token) {
  try {
    if (!token) return null;
    const parts = String(token).split('.');
    const body = parts[0], sig = parts[1] || '';
    const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (Date.now() > data.exp) return null;
    return data;
  } catch (e) { return null; }
}

// Devuelve la sesión solo si el usuario puede escribir (no es lector)
function verifyWriter(token) {
  const s = verifyToken(token);
  if (!s) return null;
  const rol = _norm(s.rol || '');
  if (rol === 'lector' || rol === 'viewer' || rol === 'lectura' || rol === 'solo lectura') return null;
  return s;
}

// ===== Usuarios (contraseña en texto plano) =====
// La hoja se lee por NOMBRE de encabezado, no por posición: podés agregar,
// reordenar o quitar columnas (Correo, Comentarios, Teléfono...) sin tocar el código.
// Obligatorias: usuario | contraseña. Opcionales: nombre | rol.
// rol: 'admin' o 'staff' pueden escribir; 'lector' solo consulta. Si va vacío, se asume 'staff'.
const USER_COLS = {
  usuario:    ['usuario', 'user', 'usuarios', 'cuenta'],
  contrasena: ['contrasena', 'contraseña', 'password', 'clave', 'pass'],
  nombre:     ['nombre', 'nombre completo', 'name'],
  rol:        ['rol', 'roles', 'perfil', 'permiso', 'permisos']
};
function _findCol(headers, alias) {
  for (const a of alias) {
    const i = headers.findIndex(h => _norm(h) === _norm(a));
    if (i !== -1) return i;
  }
  return -1;
}
// Lee la pestaña de usuarios. Si no se llama exactamente como dice USERS_SHEET.sheetName,
// busca la primera pestaña cuyo nombre contenga "usuario" (y si no, usa la primera de todas).
// Así un cambio de nombre en la hoja no deja a nadie fuera.
async function readUsersRows() {
  try {
    return await readRange(USERS_SHEET.id, USERS_SHEET.sheetName);
  } catch (e) {
    const sheets = getSheets();
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: USERS_SHEET.id, fields: 'sheets.properties.title'
    });
    const titulos = (meta.data.sheets || []).map(s => s.properties.title);
    if (!titulos.length) throw e;
    const elegida = titulos.find(t => _norm(t).indexOf('usuario') !== -1) || titulos[0];
    return await readRange(USERS_SHEET.id, elegida);
  }
}

async function findUser(usuario) {
  if (!USERS_SHEET.id || USERS_SHEET.id.indexOf('PEGA_EL_ID') === 0) {
    throw new Error('Falta configurar la hoja de usuarios: pon su ID en lib/core.js (USERS_SHEET) o en la variable de entorno USERS_SHEET_ID.');
  }
  const rows = await readUsersRows();
  if (!rows.length) return null;
  const headers = (rows[0] || []).map(h => String(h == null ? '' : h));

  const cUser = _findCol(headers, USER_COLS.usuario);
  const cPass = _findCol(headers, USER_COLS.contrasena);
  if (cUser === -1 || cPass === -1) {
    throw new Error('La hoja "' + USERS_SHEET.sheetName +
      '" necesita columnas "usuario" y "contraseña" en la fila 1.');
  }
  const cNom = _findCol(headers, USER_COLS.nombre);
  const cRol = _findCol(headers, USER_COLS.rol);

  const buscado = String(usuario == null ? '' : usuario).trim().toLowerCase();
  if (!buscado) return null;

  for (let i = 1; i < rows.length; i++) {
    const fila = rows[i] || [];
    const u = String(fila[cUser] == null ? '' : fila[cUser]).trim();
    if (u.toLowerCase() !== buscado) continue;
    return {
      usuario: u,
      contrasena: fila[cPass],
      nombre: cNom !== -1 ? String(fila[cNom] == null ? '' : fila[cNom]).trim() : '',
      rol: cRol !== -1 ? String(fila[cRol] == null ? '' : fila[cRol]).trim() : ''
    };
  }
  return null;
}

// ===== Utilidad: leer el body JSON =====
async function readBody(req) {
  if (req.body) {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
    return req.body;
  }
  return await new Promise((resolve) => {
    let d = ''; req.on('data', c => d += c);
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); } });
  });
}

async function updateRow(spreadsheetId, sheetName, rowNumber, record) {
  const sheets = getSheets();
  const values = await readRange(spreadsheetId, sheetName);
  const headers = (values[0] || []).map(h => String(h));
  const rowArr = headers.map(h => (record && record[h] != null) ? record[h] : '');
  const lastCol = _colLetter(headers.length - 1);
  const range = "'" + sheetName + "'!A" + rowNumber + ":" + lastCol + rowNumber;
  await sheets.spreadsheets.values.update({
    spreadsheetId, range, valueInputOption: 'USER_ENTERED', requestBody: { values: [rowArr] }
  });
  return { ok: true };
}

// Columnas calculadas por fórmula en la hoja: el ERP NO las escribe (deja que la fórmula trabaje).
// Columnas que la hoja calcula sola y que el panel NO debe pisar al guardar.
// En "Ventas 2026": Mes y Año salen de la Fecha, Total = Subtotal + IVA y
// Cuentas por Cobrar = Total - Cobrado. "Cobrado" NO va aquí a propósito:
// se deja manual para poder registrar pagos parciales desde el panel.
const CAMPOS_CALCULADOS_VENTAS = ['Mes', 'Año', 'Total', 'Cuentas por Cobrar'];
const FORMULA_FIELDS = {
  ventas_registro:    CAMPOS_CALCULADOS_VENTAS,
  ventas_consultoria: CAMPOS_CALCULADOS_VENTAS,
  ventas_inversiones: CAMPOS_CALCULADOS_VENTAS,
  ventas_prestamos:   CAMPOS_CALCULADOS_VENTAS,
  ventas_puerto:      CAMPOS_CALCULADOS_VENTAS,
  cxc:                CAMPOS_CALCULADOS_VENTAS
  // proy_horas:      ['Importe'],
};

// ===== Alta y edición de registros (respetando columnas calculadas) =====
function _skipCols(key, headers) {
  const skip = new Set();
  (FORMULA_FIELDS[key] || []).forEach(f => {
    const i = headers.findIndex(h => _norm(h) === _norm(f));
    if (i !== -1) skip.add(i);
  });
  return skip;
}
async function addRecord(key, record) {
  const cfg = SHEETS[key];
  if (!cfg) throw new Error('Esta área no está conectada.');
  const values = await readRange(cfg.id, cfg.sheetName);
  const headers = (values[0] || []).map(h => String(h));
  const skip = _skipCols(key, headers);
  const rowArr = headers.map(h => (record && record[h] != null) ? record[h] : '');
  if (skip.size === 0) {           // sin fórmulas: append normal
    await appendRow(cfg.id, cfg.sheetName, rowArr);
    return { ok: true };
  }
  // Con fórmulas: busca la primera fila realmente vacía y escribe sin tocar las calculadas
  const dataCols = headers.map((_, i) => i).filter(i => !skip.has(i));
  let target = values.length + 1;  // por defecto, después de la última fila con datos
  for (let r = 1; r < values.length; r++) {
    const empty = dataCols.every(c => values[r][c] == null || String(values[r][c]).trim() === '');
    if (empty) { target = r + 1; break; }
  }
  await writeRowSkipping(cfg.id, cfg.sheetName, target, rowArr, skip);
  return { ok: true };
}
async function updateRecord(key, rowNumber, record) {
  const cfg = SHEETS[key];
  if (!cfg) throw new Error('Esta área no está conectada.');
  const values = await readRange(cfg.id, cfg.sheetName);
  const headers = (values[0] || []).map(h => String(h));
  const skip = _skipCols(key, headers);
  const rowArr = headers.map(h => (record && record[h] != null) ? record[h] : '');
  await writeRowSkipping(cfg.id, cfg.sheetName, Number(rowNumber), rowArr, skip);
  return { ok: true };
}

// Agrega varios movimientos de golpe a la pestaña de Inversiones.
// Respeta el orden de los encabezados de la fila 1, así que si mañana se
// agrega o se mueve una columna, sigue funcionando.
async function agregarMovimientos(filas) {
  if (!filas || !filas.length) return 0;
  const cfg = MOVIMIENTOS_INVERSIONES;
  const values = await readRange(cfg.id, cfg.sheetName);
  const headers = (values[0] || []).map(h => String(h));
  if (!headers.length) throw new Error('La pestaña "' + cfg.sheetName + '" no tiene encabezados en la fila 1.');
  const sheets = getSheets();
  const rows = filas.map(f => headers.map(h => {
    const k = Object.keys(f).find(x => _norm(x) === _norm(h));
    return k ? f[k] : '';
  }));
  await sheets.spreadsheets.values.append({
    spreadsheetId: cfg.id, range: "'" + cfg.sheetName + "'",
    valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows }
  });
  return rows.length;
}

// ===== Tablas de referencia (autocompletado al elegir una opción) =====
// Por área: hoja del mismo archivo, columna clave y columnas que se autocompletan.
const LOOKUPS = {
  // Al elegir un valor, se autocompletan otros campos desde otra pestaña del mismo archivo.
  // Ejemplo: al elegir un Colaborador en Incidencias, traer su Puesto y su Área.
  // rrhh_incidencias: {
  //   sheetName: 'Colaboradores',
  //   keyField: 'Colaborador',
  //   keyAliases: ['Colaborador', 'Nombre', 'Nombre completo', 'Empleado'],
  //   fills: ['Puesto', 'Área', 'Departamento']
  // },
  // Ejemplo: al elegir un Proyecto en Horas, traer su Cliente y su Responsable.
  // proy_horas: {
  //   sheetName: 'Proyectos',
  //   keyField: 'Proyecto',
  //   keyAliases: ['Proyecto', 'Nombre del proyecto', 'Clave'],
  //   fills: ['Cliente', 'Responsable', 'Tarifa']
  // }
};

async function getLookup(key) {
  const cfgArea = SHEETS[key];
  const lk = LOOKUPS[key];
  if (!cfgArea || !lk) return null;
  let values;
  try { values = await readRange(cfgArea.id, lk.sheetName); }
  catch (e) { return null; }
  if (!values.length) return null;
  const headers = values[0].map(h => String(h).trim());
  // Localiza la columna clave probando los alias (tolera acentos/espacios/mayúsculas)
  const aliases = lk.keyAliases || [lk.keyField];
  let keyCol = -1;
  for (const a of aliases) {
    const i = headers.findIndex(h => _norm(h) === _norm(a));
    if (i !== -1) { keyCol = i; break; }
  }
  if (keyCol === -1) return null; // no se encontró la columna de nombres
  const options = [];
  const map = {};
  for (let i = 1; i < values.length; i++) {
    const name = String(values[i][keyCol] == null ? '' : values[i][keyCol]).trim();
    if (!name) continue;
    if (options.indexOf(name) === -1) options.push(name);
    const rec = {};
    lk.fills.forEach(f => {
      const c = headers.findIndex(h => _norm(h) === _norm(f));
      if (c !== -1) rec[f] = String(values[i][c] == null ? '' : values[i][c]).trim();
    });
    map[name] = rec;
  }
  options.sort(function (a, b) { return a.localeCompare(b, 'es'); });
  return { keyField: lk.keyField, fills: lk.fills, options, map };
}

module.exports = { VERSION, MENU, SHEETS, USERS_SHEET, FORMULA_FIELDS, AREA_ROW_FILTERS,
  MOVIMIENTOS_INVERSIONES, agregarMovimientos, norm: _norm, readRange, appendRow, updateRow,
  addRecord, updateRecord, getCategories, addCategory, getLookup, getSheets,
  signToken, verifyToken, verifyWriter, findUser, readBody };
