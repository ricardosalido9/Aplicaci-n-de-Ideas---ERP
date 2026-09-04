const core = require('../lib/core');
const estados = require('../lib/estados');
const pdf = require('pdf-parse/lib/pdf-parse.js');

// Convierte el PDF (que llega en base64 desde el navegador) a texto plano.
async function textoDelPDF(base64) {
  const buf = Buffer.from(String(base64 || '').replace(/^data:[^,]*,/, ''), 'base64');
  const d = await pdf(buf);
  return d.text || '';
}

// Lee la pestaña de movimientos para dos cosas:
//   1) saber el saldo de cierre del mes anterior de cada plataforma
//   2) detectar si ese mes ya se importó antes (para no duplicar)
async function historial() {
  const cfg = core.MOVIMIENTOS_INVERSIONES;
  let values;
  try { values = await core.readRange(cfg.id, cfg.sheetName); }
  catch (e) { return { cierres: {}, importados: {} }; }
  if (!values.length) return { cierres: {}, importados: {} };

  const H = values[0].map(h => String(h || '').trim());
  const idx = nombre => H.findIndex(h => core.norm(h) === core.norm(nombre));
  const cN = idx('Nombre'), cM = idx('Mes'), cA = idx('Año'),
        cT = idx('Tipo de Movimiento'), cMonto = idx('Monto');
  if (cN === -1 || cM === -1 || cA === -1) return { cierres: {}, importados: {} };

  const cierres = {};      // "Plataforma|AAAAMM" -> saldo final
  const importados = {};   // "Plataforma|AAAAMM" -> true
  for (let i = 1; i < values.length; i++) {
    const f = values[i] || [];
    const nombre = String(f[cN] || '').trim();
    const mes = parseInt(f[cM], 10), anio = parseInt(f[cA], 10);
    if (!nombre || !mes || !anio) continue;
    const clave = nombre + '|' + anio + (mes < 10 ? '0' : '') + mes;
    importados[clave] = true;
    if (cT !== -1 && core.norm(f[cT]) === core.norm('Saldo final')) {
      const n = parseFloat(String(f[cMonto] || '').replace(/[^0-9.\-]/g, ''));
      if (!isNaN(n)) cierres[clave] = n;
    }
  }
  return { cierres, importados };
}

// Mes anterior en formato AAAAMM
function mesAnterior(anio, mes) {
  const m = mes === 1 ? 12 : mes - 1;
  const a = mes === 1 ? anio - 1 : anio;
  return a + (m < 10 ? '0' : '') + m;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const body = await core.readBody(req);
    const sesion = core.verifyToken(body.token);
    if (!sesion) return res.status(401).json({ error: 'Sesión no válida.' });

    const archivos = body.archivos || [];
    if (!archivos.length) return res.status(400).json({ error: 'No llegó ningún archivo.' });
    if (archivos.length > 6) return res.status(400).json({ error: 'Máximo 6 estados de cuenta a la vez.' });

    const hist = await historial();
    const resultados = [];

    for (const a of archivos) {
      const salida = { nombre: a.nombre || 'estado.pdf' };
      try {
        const texto = await textoDelPDF(a.base64);
        let r = estados.leer(texto);
        // Si el PDF no trae saldo inicial, se hereda del cierre del mes anterior.
        if (r.saldoInicial === null) {
          const previo = hist.cierres[r.plataforma + '|' + mesAnterior(r.periodo.anio, r.periodo.mes)];
          if (previo !== undefined) r = estados.leer(texto, { saldoInicial: previo });
        }
        const clave = r.plataforma + '|' + r.periodo.anio +
                      (r.periodo.mes < 10 ? '0' : '') + r.periodo.mes;
        salida.plataforma = r.plataforma;
        salida.periodo = r.periodo;
        salida.mesTexto = estados.MESES[r.periodo.mes - 1] + ' ' + r.periodo.anio;
        salida.resumen = {
          saldoInicial: r.saldoInicial, saldoFinal: r.saldoFinal,
          intereses: r.intereses, ivaIntereses: r.ivaIntereses,
          moratorios: r.moratorios, ivaMoratorios: r.ivaMoratorios,
          retencionIVA: r.retencionIVA, retencionISR: r.retencionISR,
          comision: r.comision, ivaComision: r.ivaComision,
          retiros: r.retiros, fondos: r.fondos,
          rendimientoNeto: r.rendimientoNeto, ajuste: r.ajuste, cuadra: r.cuadra
        };
        salida.avisos = r.avisos;
        salida.yaImportado = !!hist.importados[clave];
        salida.ventas = estados.filasVentas(r);
        salida.movimientos = estados.filasInversiones(r);
        salida.ok = true;
      } catch (e) {
        salida.ok = false;
        salida.error = e.message;
      }
      resultados.push(salida);
    }

    // --- Vista previa: no escribe nada ---
    if (!body.confirmar) return res.status(200).json({ preview: true, resultados });

    // --- Confirmado: escribe en las hojas ---
    if (!core.verifyWriter(body.token)) {
      return res.status(401).json({ error: 'Tu usuario es de solo lectura.' });
    }
    let ventasEscritas = 0, movsEscritos = 0;
    for (const r of resultados) {
      if (!r.ok) continue;
      if (r.yaImportado && !body.forzar) { r.omitido = true; continue; }
      for (const fila of r.ventas) {
        await core.addRecord('ventas_registro', fila);
        ventasEscritas++;
      }
      movsEscritos += await core.agregarMovimientos(r.movimientos);
      r.escrito = true;
    }
    return res.status(200).json({ ok: true, ventasEscritas, movsEscritos, resultados });

  } catch (e) { return res.status(500).json({ error: e.message }); }
};
