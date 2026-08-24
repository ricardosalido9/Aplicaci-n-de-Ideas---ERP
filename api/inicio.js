const core = require('../lib/core');

function norm(s) {
  return String(s == null ? '' : s).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function num(v) {
  const s = String(v == null ? '' : v).replace(/[^0-9.,\-]/g, '').replace(/,/g, '');
  if (!s || s === '-' || s === '.') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
const MESES = { enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,
  septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12 };
function fechaNum(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return (+m[1]) * 10000 + (+m[2]) * 100 + (+m[3]);
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return (+m[3]) * 10000 + (+m[2]) * 100 + (+m[1]);
  m = s.match(/^(\d{1,2})\s+(?:de\s+)?([a-záéíóú]+)\.?\s+(?:de\s+)?(\d{4})$/);
  if (m && MESES[m[2]]) return (+m[3]) * 10000 + MESES[m[2]] * 100 + (+m[1]);
  return null;
}
async function leer(key) {
  const cfg = core.SHEETS[key];
  if (!cfg) return { headers: [], rows: [] };
  let values;
  try { values = await core.readRange(cfg.id, cfg.sheetName); }
  catch (e) { return { headers: [], rows: [] }; }
  if (!values.length) return { headers: [], rows: [] };
  const headers = values[0].map(h => String(h));
  const formulaCols = new Set();
  (core.FORMULA_FIELDS[key] || []).forEach(f => {
    const i = headers.findIndex(h => norm(h) === norm(f));
    if (i !== -1) formulaCols.add(i);
  });
  const dataCols = headers.map((_, i) => i).filter(i => !formulaCols.has(i));
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const hasData = dataCols.some(c => values[i][c] != null && String(values[i][c]).trim() !== '');
    if (!hasData) continue;
    const o = {};
    headers.forEach((h, j) => { o[h] = (values[i][j] != null) ? values[i][j] : ''; });
    rows.push(o);
  }
  return { headers, rows };
}
function col(headers, ...nombres) {
  for (const n of nombres) {
    const h = headers.find(x => norm(x) === norm(n));
    if (h) return h;
  }
  return null;
}
function txt(v) { return String(v == null ? '' : v).trim(); }

module.exports = async (req, res) => {
  try {
    const { token } = await core.readBody(req);
    if (!core.verifyToken(token)) return res.status(401).json({ error: 'Sesión no válida.' });

    const [ventas, colaboradores, proveedores, incidencias] = await Promise.all([
      leer('ventas_registro'), leer('rrhh_colaboradores'),
      leer('compras_proveedores'), leer('rrhh_incidencias')
    ]);

    const hoy = new Date();
    const aaaamm = hoy.getFullYear() * 100 + (hoy.getMonth() + 1);
    const inicioMes = hoy.getFullYear() * 10000 + (hoy.getMonth() + 1) * 100 + 1;

    const out = { avisos: [], resumen: {} };

    // ---------- VENTAS: por cobrar ----------
    {
      const H = ventas.headers, R = ventas.rows;
      const cPC = col(H, 'Cuentas por Cobrar', 'Por Cobrar');
      const cTotal = col(H, 'Subtotal', 'Total');
      const cCliente = col(H, 'Cliente');
      const cFecha = col(H, 'Fecha');

      let montoPorCobrar = 0;
      const pendientes = [];
      if (cPC) {
        R.forEach(r => {
          const n = num(r[cPC]);
          if (n !== null && n > 0) {
            montoPorCobrar += n;
            pendientes.push({
              cliente: cCliente ? txt(r[cCliente]) : '',
              fecha: cFecha ? txt(r[cFecha]) : '',
              d: cFecha ? fechaNum(r[cFecha]) : null,
              monto: n
            });
          }
        });
      }
      pendientes.sort((a, b) => (b.monto || 0) - (a.monto || 0));

      // Ventas del mes en curso
      let ventasMes = 0, opsMes = 0;
      if (cFecha && cTotal) {
        R.forEach(r => {
          const f = fechaNum(r[cFecha]);
          if (f === null) return;
          if (Math.floor(f / 100) !== aaaamm) return;
          const n = num(r[cTotal]);
          if (n !== null) { ventasMes += n; opsMes++; }
        });
      }
      out.resumen.ventasMes = ventasMes;
      out.resumen.opsMes = opsMes;
      out.resumen.porCobrar = montoPorCobrar;
      out.porCobrar = pendientes.slice(0, 6);

      if (pendientes.length) {
        out.avisos.push({
          tipo: 'warn', area: 'ventas_registro', titulo: 'Cuentas por cobrar',
          detalle: pendientes.length + (pendientes.length === 1 ? ' venta pendiente' : ' ventas pendientes') +
                   ' por $' + montoPorCobrar.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          monto: montoPorCobrar, n: pendientes.length
        });
      }
    }

    // ---------- INCIDENCIAS del mes ----------
    {
      const H = incidencias.headers, R = incidencias.rows;
      const cFecha = col(H, 'Fecha');
      const cTipo = col(H, 'Incidencia', 'Inicdencia', 'Tipo');
      const cColab = col(H, 'Colaborador');
      const delMes = R.filter(r => {
        const f = cFecha ? fechaNum(r[cFecha]) : null;
        return f !== null && f >= inicioMes;
      });
      out.resumen.incidenciasMes = delMes.length;
      out.incidenciasRecientes = R
        .map(r => ({ r, f: cFecha ? fechaNum(r[cFecha]) : null }))
        .filter(x => x.f !== null)
        .sort((a, b) => b.f - a.f).slice(0, 5)
        .map(x => ({
          fecha: cFecha ? txt(x.r[cFecha]) : '',
          colaborador: cColab ? txt(x.r[cColab]) : '',
          tipo: cTipo ? txt(x.r[cTipo]) : ''
        }));
      if (delMes.length) {
        out.avisos.push({
          tipo: 'info', area: 'rrhh_incidencias', titulo: 'Incidencias este mes',
          detalle: delMes.length + (delMes.length === 1 ? ' incidencia registrada' : ' incidencias registradas'),
          n: delMes.length
        });
      }
    }

    // ---------- COLABORADORES: datos faltantes ----------
    {
      const H = colaboradores.headers, R = colaboradores.rows;
      const cSt = col(H, 'Status');
      const cRFC = col(H, 'RFC'), cNSS = col(H, 'NSS'), cCURP = col(H, 'CURP');
      const activos = cSt ? R.filter(r => norm(r[cSt]) === 'activo') : R;
      out.resumen.colaboradores = activos.length;
      const incompletos = activos.filter(r =>
        (cRFC && !txt(r[cRFC])) || (cNSS && !txt(r[cNSS])) || (cCURP && !txt(r[cCURP]))
      );
      if (incompletos.length) {
        out.avisos.push({
          tipo: 'warn', area: 'rrhh_colaboradores', titulo: 'Colaboradores con datos incompletos',
          detalle: incompletos.length + ' sin RFC, NSS o CURP',
          n: incompletos.length
        });
      }
    }

    // ---------- PROVEEDORES: datos faltantes ----------
    {
      const H = proveedores.headers, R = proveedores.rows;
      const cSt = col(H, 'Status');
      const cRFC = col(H, 'RFC');
      const activos = cSt ? R.filter(r => norm(r[cSt]) === 'activo') : R;
      out.resumen.proveedores = activos.length;
      if (cRFC) {
        const sinRFC = activos.filter(r => !txt(r[cRFC]));
        if (sinRFC.length) {
          out.avisos.push({
            tipo: 'warn', area: 'compras_proveedores', titulo: 'Proveedores sin RFC',
            detalle: sinRFC.length + ' proveedores activos sin RFC registrado',
            n: sinRFC.length
          });
        }
      }
    }

    return res.status(200).json(out);
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
