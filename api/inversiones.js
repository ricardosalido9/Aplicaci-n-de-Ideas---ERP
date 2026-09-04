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

// Cada concepto de la hoja cae en un cubo. Los nombres se comparan sin acentos
// ni mayúsculas, así que "Saldo Final" y "Saldo final" son lo mismo.
const CUBOS = {
  'saldo inicial': 'saldoInicial',
  'saldo final': 'saldoFinal',
  'principal pagado': 'principal',
  'intereses': 'intereses',
  'iva intereses': 'ivaIntereses',
  'intereses moratorios': 'moratorios',
  'iva moratorios': 'ivaMoratorios',
  'retenciones iva': 'retIVA',
  'retenciones isr': 'retISR',
  'comision exito': 'comision',
  'iva comision': 'ivaComision',
  'fondos agregados': 'fondos',
  'retiros': 'retiros',
  'ajustes': 'ajustes',
  'rendimiento neto': 'rendimientoNeto',
  'dinero disponible': 'disponible'
};
// Conceptos que describen el estado de la cartera al cierre, no un movimiento.
const CARTERA = ['al corriente', 'en mora', 'en transito', 'atrasado', 'vencido', 'pagado'];

module.exports = async (req, res) => {
  try {
    const { token } = await core.readBody(req);
    if (!core.verifyToken(token)) return res.status(401).json({ error: 'Sesión no válida.' });

    const cfg = core.MOVIMIENTOS_INVERSIONES;
    let values = [];
    try { values = await core.readRange(cfg.id, cfg.sheetName); }
    catch (e) { return res.status(200).json({ conectado: false, meses: [], plataformas: [] }); }
    if (values.length < 2) return res.status(200).json({ conectado: false, meses: [], plataformas: [] });

    const H = values[0].map(x => String(x || ''));
    const col = (...nombres) => {
      for (const n of nombres) {
        const i = H.findIndex(h => norm(h) === norm(n));
        if (i !== -1) return i;
      }
      return -1;
    };
    const cMes = col('Mes'), cAnio = col('Año', 'Anio'), cNom = col('Nombre', 'Plataforma'),
          cTipo = col('Tipo de Movimiento', 'Concepto'), cMonto = col('Monto');
    if (cNom === -1 || cTipo === -1 || cMonto === -1) {
      return res.status(200).json({ conectado: false, meses: [], plataformas: [] });
    }

    // --- Agrupa por plataforma + mes ---
    const periodos = {};   // "Plataforma|AAAAMM" -> acumulados
    const plataformas = {};
    for (let i = 1; i < values.length; i++) {
      const f = values[i] || [];
      const nombre = String(f[cNom] || '').trim();
      const mes = parseInt(f[cMes], 10), anio = parseInt(f[cAnio], 10);
      const monto = num(f[cMonto]);
      if (!nombre || !mes || !anio || monto === null) continue;
      plataformas[nombre] = true;
      const ym = anio * 100 + mes;
      const clave = nombre + '|' + ym;
      if (!periodos[clave]) periodos[clave] = { plataforma: nombre, ym, anio, mes, cartera: {} };
      const p = periodos[clave];
      const t = norm(f[cTipo]);
      if (CUBOS[t]) { p[CUBOS[t]] = (p[CUBOS[t]] || 0) + monto; }
      else if (CARTERA.indexOf(t) !== -1) {
        // El estatus es una foto al cierre, no se suma: se queda el último valor.
        p.cartera[String(f[cTipo]).trim()] = monto;
      }
    }

    // --- Calcula los indicadores de cada mes ---
    const meses = Object.keys(periodos).map(k => periodos[k]).sort((a, b) => a.ym - b.ym);
    const cero = v => (v === null || v === undefined || isNaN(v)) ? 0 : v;
    const ultimoSaldo = {};   // arrastra el cierre del mes anterior si falta el inicial

    meses.forEach(p => {
      if (!p.saldoInicial && ultimoSaldo[p.plataforma] !== undefined) {
        p.saldoInicial = ultimoSaldo[p.plataforma];
        p.saldoInicialHeredado = true;
      }
      if (p.saldoFinal) ultimoSaldo[p.plataforma] = p.saldoFinal;

      p.bruto      = cero(p.intereses) + cero(p.ivaIntereses) + cero(p.moratorios) + cero(p.ivaMoratorios);
      p.costo      = cero(p.comision) + cero(p.ivaComision);
      p.retencion  = cero(p.retIVA) + cero(p.retISR);
      p.neto       = +(p.bruto - p.costo).toFixed(2);
      p.enMano     = +(p.neto - p.retencion).toFixed(2);   // lo que de verdad queda

      // Saldo promedio del mes: base sobre la que se mide el rendimiento.
      const si = cero(p.saldoInicial), sf = cero(p.saldoFinal);
      p.base = (si && sf) ? (si + sf) / 2 : (si || sf);
      p.rendMensual = p.base > 0 ? p.neto / p.base : null;
      // Anualizado con interés compuesto, que es como se comparan tasas.
      p.rendAnual = p.rendMensual !== null ? Math.pow(1 + p.rendMensual, 12) - 1 : null;
      // Qué porcentaje del interés bruto se queda la plataforma y el SAT.
      p.mordida = p.bruto > 0 ? (p.costo + p.retencion) / p.bruto : null;

      // Salud de la cartera al cierre
      const c = p.cartera, llaves = Object.keys(c);
      if (llaves.length) {
        const activa = llaves.filter(k => norm(k) !== 'pagado')
                             .reduce((s, k) => s + cero(c[k]), 0);
        const malo = llaves.filter(k => ['vencido', 'en mora', 'atrasado'].indexOf(norm(k)) !== -1)
                           .reduce((s, k) => s + cero(c[k]), 0);
        p.carteraActiva = activa;
        p.morosidad = activa > 0 ? malo / activa : null;
      }
      delete p.saldoInicialHeredado;
    });

    return res.status(200).json({
      conectado: true,
      plataformas: Object.keys(plataformas).sort(),
      meses
    });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
