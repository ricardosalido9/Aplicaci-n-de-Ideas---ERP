// Ingresos y egresos. Dos acciones en un solo endpoint:
//
//   POST /api/finanzas  { token, accion:'diagnostico' }
//   POST /api/finanzas  { token, accion:'movimientos', anio, desde, hasta, agrupar,
//                         incluirTraspasos, soloOperacion }
//
// A diferencia del módulo original, aquí se pide token: estos números son de la
// empresa y la ruta no debe quedar abierta.
const core = require('../lib/core');
const F = require('../lib/finanzas');

// ------------------------------------------------------------- diagnóstico --
// Se corre primero, antes de pelearse con los números: distingue las tres cosas
// que desde afuera se ven igual y son distintas —no hay credenciales, el archivo
// no está compartido, o la pestaña se llama de otra forma— y dice cuál es.
async function diagnostico() {
  const out = {
    archivo: F.CFG.ARCHIVO || 'FALTA',
    liga: F.CFG.ARCHIVO ? 'https://docs.google.com/spreadsheets/d/' + F.CFG.ARCHIVO + '/edit' : '',
    pestanas: [], problemas: []
  };
  if (!F.CFG.ARCHIVO) {
    out.problemas.push('No hay archivo. Pon SHEET_FINANZAS con el id del archivo de Google.');
    out.ok = false; return out;
  }
  for (const clave of Object.keys(F.CFG.PESTANAS)) {
    const pestana = F.CFG.PESTANAS[clave];
    const info = { clave, pestana };
    try {
      const hoja = await F.leer(pestana);
      const { columnas, faltan } = F.mapaDeColumnas(hoja.encabezados);
      info.renglones = hoja.renglones.length;
      info.encabezados = hoja.encabezados;
      info.columnasUsadas = columnas;
      info.estado = hoja.renglones.length ? 'lee bien' : 'se abre pero está vacía';
      if (!columnas.fecha || !columnas.monto) {
        info.estado = 'le faltan columnas indispensables';
        out.problemas.push(pestana + ': no encontré ' +
          [!columnas.fecha ? 'una columna de fecha' : null,
           !columnas.monto ? 'una columna de monto' : null].filter(Boolean).join(' ni ') +
          '. La hoja tiene: ' + hoja.encabezados.join(' · '));
      } else if (faltan.length) {
        info.aviso = 'Sin estas columnas se puede leer, pero se pierde detalle: ' + faltan.join(', ');
      }
      // Se prueba a leer una fecha de verdad: es donde más falla en silencio.
      if (columnas.fecha && hoja.renglones.length) {
        const malas = hoja.renglones.filter(r => F.fechaNum(r[columnas.fecha]) === null).length;
        info.fechasIlegibles = malas;
        if (malas) {
          out.problemas.push(pestana + ': ' + malas + ' de ' + hoja.renglones.length +
            ' renglones tienen una fecha que no se puede leer. Esos no cuentan en ningún ' +
            'total y no se nota, porque el total sigue saliendo.');
        }
      }
    } catch (e) {
      info.estado = 'no se pudo leer';
      info.error = e.message; info.pista = e.pista || '';
      out.problemas.push(pestana + ': ' + e.message + (e.pista ? ' ' + e.pista : ''));
    }
    out.pestanas.push(info);
  }
  out.ok = out.problemas.length === 0;
  out.resumen = out.ok
    ? 'Todo conectado: las dos pestañas se abren y traen las columnas que hacen falta.'
    : out.problemas.length + ' cosa(s) por resolver.';
  return out;
}

// ------------------------------------------------------------- movimientos --
async function movimientos(q) {
  const anio = +q.anio || new Date().getFullYear();
  const desde = Math.min(12, Math.max(1, +q.desde || 1));
  const hasta = Math.min(12, Math.max(desde, +q.hasta || 12));
  const conTraspasos = !!q.incluirTraspasos;
  const soloOperacion = !!q.soloOperacion;
  const porQue = ['concepto', 'categoria', 'subcategoria'].indexOf(q.agrupar) !== -1
                 ? q.agrupar : 'concepto';

  const salida = { ok: true, anio, desde, hasta, agrupadoPor: porQue,
                   soloOperacion: soloOperacion, lados: [], anios: {} };

  for (const lado of [
    { nombre: 'Ingresos', pestana: F.CFG.PESTANAS.ingresos, signo: 1 },
    { nombre: 'Egresos',  pestana: F.CFG.PESTANAS.egresos,  signo: -1 }
  ]) {
    let hoja;
    try { hoja = await F.leer(lado.pestana); }
    catch (e) {
      salida.lados.push({ lado: lado.nombre, pestana: lado.pestana,
                          error: e.message, pista: e.pista || '' });
      continue;
    }
    const { columnas: c, faltan } = F.mapaDeColumnas(hoja.encabezados);
    if (!c.fecha || !c.monto) {
      salida.lados.push({
        lado: lado.nombre, pestana: lado.pestana,
        error: 'Faltan columnas indispensables.',
        pista: 'Se necesitan una de fecha y una de monto. La hoja tiene: ' +
               hoja.encabezados.join(' · ')
      });
      continue;
    }

    const porMes = new Array(13).fill(0);
    const grupos = {};
    let total = 0, contados = 0, noOperacion = 0, montoNoOperacion = 0;
    let sinFecha = 0, otroAnio = 0, fueraDeRango = 0, sinMonto = 0, traspasos = 0;
    let negativos = 0, montoNegativo = 0;

    hoja.renglones.forEach(r => {
      const d = F.fechaNum(r[c.fecha]);
      if (d === null) { sinFecha++; return; }
      const a = Math.floor(d / 10000);
      // Años disponibles, para poder ofrecerlos en el selector
      salida.anios[a] = true;
      if (a !== anio) { otroAnio++; return; }
      const mes = Math.floor(d / 100) % 100;
      if (mes < desde || mes > hasta) { fueraDeRango++; return; }
      const monto = F.num(r[c.monto]);
      if (!monto) { sinMonto++; return; }
      if (!conTraspasos && !F.esFlujo(r, c)) { traspasos++; return; }
      const operativo = F.esOperacion(r, c);
      if (!operativo) { noOperacion++; montoNoOperacion += monto; }
      if (soloOperacion && !operativo) return;
      if (monto < 0) { negativos++; montoNegativo += monto; }

      total += monto;
      porMes[mes] += monto;
      contados++;
      const k = F.txt(r[c[porQue]]) || F.txt(r[c.concepto]) ||
                F.txt(r[c.categoria]) || 'Sin clasificar';
      const g = grupos[k] = grupos[k] || { grupo: k, monto: 0, movimientos: 0, operativo: operativo };
      g.monto += monto; g.movimientos++;
      if (!operativo) g.operativo = false;
    });

    // Hay hojas que guardan los egresos en negativo y otras en positivo. Si el
    // total salió negativo se voltea el lado completo, para que los dos lados se
    // puedan comparar en magnitud sin que quien lee tenga que saberlo.
    let volteado = false;
    const debeVoltear = F.CFG.SIGNO_EGRESOS === 'auto'
      ? (total < 0)
      : (lado.signo < 0 && F.CFG.SIGNO_EGRESOS === 'negativo');
    if (debeVoltear) {
      volteado = true;
      total = -total;
      for (let m = 1; m <= 12; m++) porMes[m] = -porMes[m];
      Object.keys(grupos).forEach(k => { grupos[k].monto = -grupos[k].monto; });
    }

    const red = (x) => Math.round(x * 100) / 100;
    salida.lados.push({
      lado: lado.nombre,
      pestana: lado.pestana,
      total: red(total),
      movimientos: contados,
      porMes: porMes.map((x, i) => ({ mes: i, monto: red(x) }))
                    .filter(x => x.mes >= desde && x.mes <= hasta),
      grupos: Object.keys(grupos).map(k => ({
                grupo: grupos[k].grupo, monto: red(grupos[k].monto),
                movimientos: grupos[k].movimientos, operativo: grupos[k].operativo
              })).sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto)),
      // De dónde salió el número. Sirve para compararlo contra el total que se
      // ve en la pestaña: si no coinciden, la diferencia está aquí.
      lectura: {
        renglones: hoja.renglones.length,
        entraron: contados,
        sinFechaLegible: sinFecha,
        deOtroAnio: otroAnio,
        fueraDelRango: fueraDeRango,
        sinMonto: sinMonto,
        traspasosExcluidos: traspasos,
        noOperativos: noOperacion,
        montoNoOperativo: red(montoNoOperacion),
        renglonesNegativos: negativos,
        montoNegativo: red(montoNegativo),
        seVolteoElSigno: volteado,
        columnasUsadas: c,
        columnasQueNoSeEncontraron: faltan
      }
    });
  }

  const ing = salida.lados.filter(x => x.lado === 'Ingresos')[0] || {};
  const egr = salida.lados.filter(x => x.lado === 'Egresos')[0] || {};
  if (ing.total != null && egr.total != null) {
    salida.resultado = {
      ingresos: ing.total,
      egresos: egr.total,
      diferencia: Math.round((ing.total - egr.total) * 100) / 100
    };
  }
  salida.anios = Object.keys(salida.anios).map(Number).sort();
  salida.nota = 'Los traspasos entre cuentas propias y los pagos de tarjeta no cuentan: ' +
                'mueven dinero de un bolsillo a otro.';
  return salida;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = await core.readBody(req);
    if (!core.verifyToken(body.token)) return res.status(401).json({ error: 'Sesión no válida.' });
    const accion = String(body.accion || 'movimientos').toLowerCase();
    if (accion === 'diagnostico') return res.status(200).json(await diagnostico());
    if (accion === 'movimientos') return res.status(200).json(await movimientos(body));
    return res.status(404).json({ error: 'No existe la acción "' + accion + '".',
                                  disponibles: ['diagnostico', 'movimientos'] });
  } catch (e) {
    return res.status(500).json({ error: (e && e.message) || String(e), pista: e && e.pista });
  }
};
