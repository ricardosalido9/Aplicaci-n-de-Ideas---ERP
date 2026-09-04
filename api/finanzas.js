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

// ------------------------------------------------------------- catálogos ---
// Los valores que ya se usan en la hoja, para que el formulario ofrezca listas
// en vez de que alguien vuelva a teclear "Cuotas y suscripciones" con otra
// ortografía y se rompa el agrupado.
//
// Además arma una memoria: contraparte -> cómo se clasificó la última vez.
// No adivina: solo repite lo que ya se decidió antes, y solo cuando esa
// contraparte siempre se clasificó igual.
async function catalogos() {
  const out = { lados: {} };
  for (const clave of Object.keys(F.CFG.PESTANAS)) {
    const pestana = F.CFG.PESTANAS[clave];
    const info = { pestana, conceptos: [], categorias: [], subcategorias: [],
                   cuentas: [], contrapartes: [], memoria: {}, columnas: [] };
    try {
      const hoja = await F.leer(pestana);
      const { columnas: c } = F.mapaDeColumnas(hoja.encabezados);
      info.columnas = hoja.encabezados;
      const sets = { conceptos: {}, categorias: {}, subcategorias: {}, cuentas: {}, contrapartes: {} };
      const vistas = {};   // contraparte -> { "concepto|cat|sub": veces }
      hoja.renglones.forEach(r => {
        const add = (bolsa, valor) => { const v = F.txt(valor); if (v) bolsa[v] = (bolsa[v] || 0) + 1; };
        add(sets.conceptos, r[c.concepto]);
        add(sets.categorias, r[c.categoria]);
        add(sets.subcategorias, r[c.subcategoria]);
        add(sets.cuentas, r[c.cuenta]);
        add(sets.contrapartes, r[c.contraparte]);
        const quien = F.norm(r[c.contraparte]);
        if (!quien) return;
        const combo = [F.txt(r[c.concepto]), F.txt(r[c.categoria]), F.txt(r[c.subcategoria])].join('|');
        if (combo === '||') return;
        vistas[quien] = vistas[quien] || {};
        vistas[quien][combo] = (vistas[quien][combo] || 0) + 1;
      });
      // Ordenadas por uso: lo más frecuente primero
      Object.keys(sets).forEach(k => {
        info[k] = Object.keys(sets[k]).sort((a, b) => sets[k][b] - sets[k][a]);
      });
      // Solo se recuerda a quien SIEMPRE se clasificó igual. Si una contraparte
      // tiene dos clasificaciones distintas en el histórico, no se sugiere nada:
      // sugerir la más frecuente escondería la decisión que falta tomar.
      Object.keys(vistas).forEach(quien => {
        const combos = Object.keys(vistas[quien]);
        if (combos.length !== 1) return;
        const p = combos[0].split('|');
        info.memoria[quien] = { concepto: p[0], categoria: p[1], subcategoria: p[2] };
      });
      info.recordadas = Object.keys(info.memoria).length;
      info.contrapartesDistintas = info.contrapartes.length;
    } catch (e) {
      info.error = e.message; info.pista = e.pista || '';
    }
    out.lados[clave] = info;
  }
  return out;
}

// -------------------------------------------------------------- agregar ----
// Escribe un movimiento en la pestaña que toque, respetando el orden de los
// encabezados de la fila 1. Si mañana se mueve una columna, sigue funcionando.
async function agregar(body) {
  const clave = String(body.lado || '').toLowerCase() === 'egresos' ? 'egresos' : 'ingresos';

  // El movimiento va a la hoja del AÑO de su fecha, no al consolidado.
  // El consolidado (INGRESOS / EGRESOS) es puro espejo de fórmulas: escribir
  // ahí borraría la fórmula y el renglón quedaría suelto, fuera de su año.
  const d = F.fechaNum((body.campos || {})[Object.keys(body.campos || {})
              .find(k => F.norm(k) === 'fecha')] || '');
  if (!d) throw new Error('Falta la fecha, o no la pude leer.');
  const anio = Math.floor(d / 10000);
  const pestana = F.pestanaDeAlta(clave, anio);

  let hoja;
  try { hoja = await F.leer(pestana); }
  catch (e) {
    throw new Error('No existe la pestaña "' + pestana + '" en el archivo. ' +
      'Créala (o cambia el año del movimiento) antes de guardar: el consolidado ' +
      'no se puede escribir porque son fórmulas.');
  }
  if (!hoja.encabezados.length) {
    throw new Error('La pestaña "' + pestana + '" no tiene encabezados en la fila 1.');
  }
  const { columnas: c } = F.mapaDeColumnas(hoja.encabezados);
  const campos = body.campos || {};
  if (!F.num(campos[c.monto])) throw new Error('Falta el monto.');

  const fila = hoja.encabezados.map(h => {
    const k = Object.keys(campos).find(x => F.norm(x) === F.norm(h));
    if (k) return campos[k];
    // El Mes y el Año se rellenan solos a partir de la fecha
    const d = F.fechaNum(campos[c.fecha]);
    if (d && F.norm(h) === 'mes') return Math.floor(d / 100) % 100;
    if (d && F.norm(h) === 'ano') return Math.floor(d / 10000);
    return '';
  });
  await core.appendRow(F.CFG.ARCHIVO, pestana, fila);
  return { ok: true, pestana, escrito: 1 };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = await core.readBody(req);
    if (!core.verifyToken(body.token)) return res.status(401).json({ error: 'Sesión no válida.' });
    const accion = String(body.accion || 'movimientos').toLowerCase();
    if (accion === 'diagnostico') return res.status(200).json(await diagnostico());
    if (accion === 'movimientos') return res.status(200).json(await movimientos(body));
    if (accion === 'catalogos') return res.status(200).json(await catalogos());
    if (accion === 'agregar') {
      if (!core.verifyWriter(body.token)) {
        return res.status(401).json({ error: 'Tu usuario es de solo lectura.' });
      }
      return res.status(200).json(await agregar(body));
    }
    return res.status(404).json({ error: 'No existe la acción "' + accion + '".',
                                  disponibles: ['diagnostico', 'movimientos', 'catalogos', 'agregar'] });
  } catch (e) {
    return res.status(500).json({ error: (e && e.message) || String(e), pista: e && e.pista });
  }
};
