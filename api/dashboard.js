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
// Devuelve AAAAMMDD como número, o null
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
function contarPor(rows, campo) {
  const out = {};
  rows.forEach(r => {
    const v = txt(r[campo]);
    if (!v) return;
    out[v] = (out[v] || 0) + 1;
  });
  return out;
}
function sumar(rows, campo) {
  let t = 0;
  rows.forEach(r => { const n = num(r[campo]); if (n !== null) t += n; });
  return t;
}

module.exports = async (req, res) => {
  try {
    const { token } = await core.readBody(req);
    if (!core.verifyToken(token)) return res.status(401).json({ error: 'Sesión no válida.' });

    const [ventas, contratos, colaboradores, proveedores, inventarios, incidencias] =
      await Promise.all([
        leer('ventas_registro'), leer('cli_contratos'), leer('rrhh_colaboradores'),
        leer('compras_proveedores'), leer('inv_activos'), leer('rrhh_incidencias')
      ]);

    const out = {};

    // VENTAS -> filas compactas: d(fecha num) f(fecha texto) t(total) c(cobrado) p(por cobrar) v(vendedor) s(servicio) cl(cliente)
    {
      const H = ventas.headers;
      const cF = col(H, 'Fecha'), cT = col(H, 'Total'), cC = col(H, 'Total Cobrado');
      const cP = col(H, 'Por Cobrar', 'Cuentas por Cobrar'), cV = col(H, 'Vendedor');
      const cS = col(H, 'Tipo de Servicio'), cCl = col(H, 'Cliente');
      out.ventas = ventas.rows.map(r => ({
        d: cF ? fechaNum(r[cF]) : null,
        f: cF ? txt(r[cF]) : '',
        t: cT ? num(r[cT]) : null,
        c: cC ? num(r[cC]) : null,
        p: cP ? num(r[cP]) : null,
        v: cV ? txt(r[cV]) : '',
        s: cS ? txt(r[cS]) : '',
        cl: cCl ? txt(r[cCl]) : ''
      }));
    }

    // CONTRATOS -> d(fecha num) f(fecha texto) t(tipo) n(monto)
    {
      const H = contratos.headers;
      const cF = col(H, 'Fecha de contrato', 'Fecha');
      const cT = col(H, 'Tipo de contrato', 'Tipo');
      const cN = col(H, 'Monto', 'Valor del contrato', 'Total');
      out.contratos = contratos.rows.map(r => ({
        d: cF ? fechaNum(r[cF]) : null,
        f: cF ? txt(r[cF]) : '',
        t: cT ? txt(r[cT]) : '',
        n: cN ? num(r[cN]) : null
      }));
    }

    // INCIDENCIAS -> d f t(tipo) c(colaborador)
    {
      const H = incidencias.headers;
      const cF = col(H, 'Fecha'), cT = col(H, 'Incidencia', 'Inicdencia', 'Tipo');
      const cC = col(H, 'Colaborador');
      out.incidencias = incidencias.rows.map(r => ({
        d: cF ? fechaNum(r[cF]) : null,
        f: cF ? txt(r[cF]) : '',
        t: cT ? txt(r[cT]) : '',
        c: cC ? txt(r[cC]) : ''
      }));
    }

    // COLABORADORES (agregados, sin filtro de fecha)
    {
      const H = colaboradores.headers, R = colaboradores.rows;
      const cSt = col(H, 'Status');
      const cSal = col(H, 'Salario Bruto Mensual', 'Salario Neto Mensual', 'Sueldo Mensual', 'Salario');
      const cAr = col(H, 'Área');
      const activos = cSt ? R.filter(r => norm(r[cSt]) === 'activo') : R;
      out.colaboradores = {
        registros: R.length,
        activos: activos.length,
        inactivos: R.length - activos.length,
        nomina: cSal ? sumar(activos, cSal) : 0,
        porArea: cAr ? contarPor(activos, cAr) : {}
      };
    }

    // PROVEEDORES
    {
      const H = proveedores.headers, R = proveedores.rows;
      const cSt = col(H, 'Status'), cCat = col(H, 'Categoría');
      out.proveedores = {
        registros: R.length,
        porStatus: cSt ? contarPor(R, cSt) : {},
        porCategoria: cCat ? contarPor(R, cCat) : {}
      };
    }

    // INVENTARIOS
    {
      const H = inventarios.headers, R = inventarios.rows;
      const cSt = col(H, 'Status'), cCat = col(H, 'Categoría');
      out.inventarios = {
        registros: R.length,
        porStatus: cSt ? contarPor(R, cSt) : {},
        porCategoria: cCat ? contarPor(R, cCat) : {}
      };
    }

    return res.status(200).json(out);
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
