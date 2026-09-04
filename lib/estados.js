// ============================================================================
//  Lector de estados de cuenta de las plataformas de inversión.
//
//  Recibe el TEXTO de un PDF (ya extraído) y devuelve los mismos datos que hoy
//  se capturan a mano: los renglones de "Ventas 2026" y los de "Inversiones".
//
//  Soporta las tres plataformas: Prestadero, Briq y Yo te Presto.
//  Cada una publica su estado de cuenta con un formato distinto, así que hay
//  un lector por plataforma. Todos regresan la MISMA estructura, para que el
//  resto del código no tenga que saber de dónde vino el archivo.
// ============================================================================

const IVA = 0.16;

// --------------------------------------------------------------- utilidades --
// Los PDFs traen los montos como "$1,770.46" o "-$0.09".
function money(s) {
  if (s === null || s === undefined) return null;
  const m = String(s).replace(/\s/g, '').match(/-?\$?-?[\d,]+\.?\d*/);
  if (!m) return null;
  const neg = /-/.test(m[0]);
  const n = parseFloat(m[0].replace(/[-$,]/g, ''));
  if (isNaN(n)) return null;
  return neg ? -n : n;
}

// Busca "Etiqueta: $123.45" tolerando saltos de línea y acentos perdidos.
function buscar(texto, etiqueta, opciones) {
  opciones = opciones || {};
  const esc = etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
  const re = new RegExp(esc + '\\s*:?\\s*(-?\\$?\\s*-?[\\d,]+\\.?\\d*)', 'i');
  const m = texto.match(re);
  if (!m) return opciones.porDefecto !== undefined ? opciones.porDefecto : null;
  return money(m[1]);
}

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];

function normaliza(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Último día del mes, que es la fecha de corte de todos los estados de cuenta.
function ultimoDia(anio, mes) { return new Date(anio, mes, 0).getDate(); }

// Fecha en el formato que ya usa la hoja: DD/MM/AAAA
function fecha(anio, mes, dia) {
  const p = n => (n < 10 ? '0' : '') + n;
  return p(dia) + '/' + p(mes) + '/' + anio;
}

// ------------------------------------------------------- ¿qué plataforma es? --
function detectar(texto) {
  const t = normaliza(texto);
  if (t.indexOf('prestadero') !== -1 || t.indexOf('communitas aurum') !== -1) return 'prestadero';
  if (t.indexOf('briq') !== -1) return 'briq';
  if (t.indexOf('yotepresto') !== -1 || t.indexOf('yo te presto') !== -1 ||
      t.indexOf('comunidad de prestamos') !== -1) return 'ytp';
  return null;
}

// ------------------------------------------------------------------ periodo --
function periodoPrestadero(t) {
  // "Periodo:Del 2026­03­01 al 2026­03­31"  (ojo: guion tipográfico, no guion normal)
  const m = t.replace(/[\u00ad\u2010-\u2015]/g, '-')
             .match(/Del\s*(\d{4})-(\d{2})-(\d{2})\s*al\s*(\d{4})-(\d{2})-(\d{2})/i);
  if (!m) return null;
  return { anio: +m[1], mes: +m[2] };
}
function periodoBriq(t) {
  // "01 mar 2026 a 31 mar 2026"  /  "Marzo 2026"
  let m = t.match(/\b(\d{1,2})\s+([a-záéíóúñ]{3,})\.?\s+(\d{4})\s+a\s+\d{1,2}/i);
  if (m) {
    const i = MESES.findIndex(x => x.indexOf(normaliza(m[2]).slice(0, 3)) === 0);
    if (i !== -1) return { anio: +m[3], mes: i + 1 };
  }
  m = t.match(/\b([a-záéíóúñ]{4,})\s+(\d{4})\b/i);
  if (m) {
    const i = MESES.indexOf(normaliza(m[1]));
    if (i !== -1) return { anio: +m[2], mes: i + 1 };
  }
  return null;
}
function periodoYTP(t) {
  // "Del 01 Marzo 2026 Al 31 Marzo 2026, 31 días"
  const m = t.match(/Del\s+\d{1,2}\s+([A-Za-záéíóúÁÉÍÓÚ]+)\s+(\d{4})/i);
  if (!m) return null;
  const i = MESES.indexOf(normaliza(m[1]));
  if (i === -1) return null;
  return { anio: +m[2], mes: i + 1 };
}

// =================================================== lectores por plataforma ==

// --- PRESTADERO -------------------------------------------------------------
// El estado no desglosa IVA de intereses ni retenciones: solo el interés neto
// recibido. El IVA se calcula al 16%, igual que se venía haciendo a mano.
function leerPrestadero(t) {
  const p = periodoPrestadero(t);
  const intereses = buscar(t, 'Interés Recibido', { porDefecto: 0 });
  const comision  = buscar(t, 'Comisión por Éxito', { porDefecto: 0 });
  return {
    plataforma: 'Prestadero',
    periodo: p,
    saldoInicial:   null,           // no viene en el PDF: se toma del mes anterior
    saldoFinal:     buscar(t, 'Valor de la Cuenta', { porDefecto: null }),
    principal:      buscar(t, 'Principal Recibido', { porDefecto: 0 }),
    intereses:      intereses,
    ivaIntereses:   null,           // no viene en el PDF: se estima al 16%
    moratorios:     0,              // Prestadero no los separa
    ivaMoratorios:  0,
    retencionIVA:   0,              // no vienen desglosadas
    retencionISR:   0,
    comision:       comision,
    ivaComision:    buscar(t, 'IVA', { porDefecto: 0 }),
    fondos:         buscar(t, 'Fondeos', { porDefecto: 0 }),
    retiros:        buscar(t, 'Retiros', { porDefecto: 0 }),
    estatus: {
      'Al Corriente': buscar(t, 'Al Corriente', { porDefecto: null }),
      'En Mora':      buscar(t, 'En Mora', { porDefecto: null }),
      'Pagado':       buscar(t, 'Pagado', { porDefecto: null }),
      'Vencido':      buscar(t, 'Vencido', { porDefecto: null })
    }
  };
}

// --- BRIQ -------------------------------------------------------------------
// Briq reporta valor de inversiones al inicio y al final, más pagos recibidos
// separados en capital, rentas e intereses.
function leerBriq(t) {
  const saldos = t.match(/Al inicio del periodo:?\s*\$?([\d,]+\.?\d*)[\s\S]{0,80}?Al final del periodo:?\s*\$?([\d,]+\.?\d*)/i);
  return {
    plataforma: 'Cuenta Briq',
    periodo: periodoBriq(t),
    saldoInicial: saldos ? money(saldos[1]) : null,
    saldoFinal:   saldos ? money(saldos[2]) : null,
    principal:    buscar(t, 'de capital', { porDefecto: 0 }),
    intereses:    buscar(t, 'intereses', { porDefecto: 0 }),
    ivaIntereses: null,
    moratorios:   0,
    ivaMoratorios: 0,
    retencionIVA: buscar(t, 'IVA retenido', { porDefecto: 0 }),
    retencionISR: buscar(t, 'ISR retenido', { porDefecto: 0 }),
    comision:     buscar(t, 'Comisiones cobradas', { porDefecto: 0 }),
    ivaComision:  0,
    fondos:       buscar(t, '+ entradas', { porDefecto: 0 }),
    retiros:      buscar(t, '- salidas', { porDefecto: 0 }),
    estatus: {}
  };
}

// --- YO TE PRESTO -----------------------------------------------------------
// El más completo: desglosa todo en la primera página. Las 180+ páginas de
// movimientos individuales no hacen falta, el resumen del mes ya cuadra.
function leerYTP(t) {
  // "Intereses\n$18,500.88" — el monto va en la línea siguiente a la etiqueta.
  function bajoEtiqueta(etiqueta) {
    const esc = etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = t.match(new RegExp('\\n' + esc + '\\s*\\n\\s*(\\$[\\d,]+\\.?\\d*)'));
    return m ? money(m[1]) : null;
  }
  function estatus(nombre) {
    const m = t.match(new RegExp('\\n' + nombre + '\\s*(?:\\d+|--)\\s*[\\d.]+%\\s*(\\$[\\d,]+\\.?\\d*)', 'i'));
    return m ? money(m[1]) : null;
  }
  return {
    plataforma: 'Yo te presto',
    periodo: periodoYTP(t),
    saldoInicial:  buscar(t, 'Saldo inicial del periodo', { porDefecto: null }),
    saldoFinal:    buscar(t, 'Saldo final del periodo', { porDefecto: null }),
    principal:     0,
    intereses:     bajoEtiqueta('Intereses'),
    ivaIntereses:  bajoEtiqueta('IVA de Intereses'),
    moratorios:    bajoEtiqueta('Intereses Moratorios'),
    ivaMoratorios: bajoEtiqueta('IVA de Intereses Moratorios'),
    retencionIVA:  bajoEtiqueta('Retenciones IVA'),
    retencionISR:  bajoEtiqueta('Retenciones ISR'),
    comision:      bajoEtiqueta('Comisión'),
    ivaComision:   bajoEtiqueta('IVA Comisión'),
    fondos:        buscar(t, '(+) Fondos Agregados', { porDefecto: 0 }),
    retiros:       buscar(t, '(-) Retiros', { porDefecto: 0 }),
    estatus: {
      'Al corriente': estatus('Al corriente'),
      'En tránsito':  estatus('En tránsito'),
      'Atrasado':     estatus('Atrasado'),
      'Vencido':      estatus('Vencido'),
      'Pagado':       estatus('Pagado')
    }
  };
}

// ============================================================== lectura ======
// opciones.saldoInicial: saldo de cierre del mes anterior, para los estados
// de cuenta que no lo traen (Prestadero).
function leer(textoPDF, opciones) {
  opciones = opciones || {};
  const cual = detectar(textoPDF);
  if (!cual) {
    throw new Error('No reconocí de qué plataforma es este estado de cuenta. ' +
                    'Se aceptan Prestadero, Briq y Yo te Presto.');
  }
  const r = cual === 'prestadero' ? leerPrestadero(textoPDF)
          : cual === 'briq'       ? leerBriq(textoPDF)
          :                         leerYTP(textoPDF);

  if (!r.periodo) throw new Error('No pude leer el periodo del estado de cuenta de ' + r.plataforma + '.');

  if ((r.saldoInicial === null || r.saldoInicial === undefined) &&
      opciones.saldoInicial !== null && opciones.saldoInicial !== undefined) {
    r.saldoInicial = opciones.saldoInicial;
    r.saldoInicialHeredado = true;
  }
  if (r.saldoInicial === undefined) r.saldoInicial = null;

  const n = v => (v === null || v === undefined || isNaN(v)) ? 0 : v;

  // Si el PDF no desglosa el IVA, se calcula al 16%.
  r.ivaEstimado = (r.ivaIntereses === null);
  if (r.ivaIntereses === null)  r.ivaIntereses  = +(n(r.intereses) * IVA).toFixed(2);
  if (r.ivaMoratorios === null) r.ivaMoratorios = +(n(r.moratorios) * IVA).toFixed(2);

  // Rendimiento neto del mes = lo cobrado menos lo que cobró la plataforma.
  r.rendimientoNeto = +(n(r.intereses) + n(r.ivaIntereses) + n(r.moratorios) + n(r.ivaMoratorios)
                        - n(r.comision) - n(r.ivaComision)).toFixed(2);

  // Cuadre: saldo inicial + entradas - salidas debe dar el saldo final.
  // Lo que sobre o falte se registra como "Ajustes", igual que se hace a mano.
  r.avisos = [];
  if (r.saldoInicial !== null && r.saldoFinal !== null) {
    const calculado = n(r.saldoInicial) + n(r.intereses) + n(r.ivaIntereses) +
                      n(r.moratorios) + n(r.ivaMoratorios) + n(r.fondos) -
                      n(r.retencionIVA) - n(r.retencionISR) -
                      n(r.comision) - n(r.ivaComision) - n(r.retiros);
    r.ajuste = +(n(r.saldoFinal) - calculado).toFixed(2);
    if (Math.abs(r.ajuste) < 0.01) {
      r.ajuste = 0;
      r.cuadra = true;
    } else {
      r.cuadra = false;
      r.avisos.push('El saldo final no cuadra por $' + Math.abs(r.ajuste).toFixed(2) +
                    '. Se registra como "Ajustes" para que la cuenta cierre.');
    }
  } else {
    r.ajuste = 0;
    r.cuadra = null;
    r.avisos.push('Este estado de cuenta no trae saldo inicial y no encontré el cierre del mes anterior en la hoja. Captúralo a mano para que cuadre.');
  }
  if (r.saldoInicialHeredado) {
    r.avisos.push('El saldo inicial se tomó del cierre del mes anterior que ya está en la hoja.');
  }
  if (r.ivaEstimado) {
    r.avisos.push('El PDF no desglosa el IVA de intereses: se calculó al 16%.');
  }
  return r;
}

// =================================== renglones listos para pegar en la hoja ==

// Orden en que se escriben los conceptos en la pestaña "Inversiones".
// El día es solo para conservar el orden dentro del mes, igual que la captura
// manual que ya existe desde 2024.
const CONCEPTOS = [
  ['Saldo inicial',        'Cuenta',  r => r.saldoInicial],
  ['Principal Pagado',     'Cuenta',  r => r.principal],
  ['Intereses',            'Ingreso', r => r.intereses],
  ['IVA Intereses',        'Ingreso', r => r.ivaIntereses],
  ['Intereses moratorios', 'Ingreso', r => r.moratorios],
  ['IVA Moratorios',       'Ingreso', r => r.ivaMoratorios],
  ['Retenciones IVA',      'Egreso',  r => r.retencionIVA],
  ['Retenciones ISR',      'Egreso',  r => r.retencionISR],
  ['Comisión éxito',       'Egreso',  r => r.comision],
  ['IVA Comisión',         'Egreso',  r => r.ivaComision],
  ['Fondos agregados',     'Ingreso', r => r.fondos],
  ['Retiros',              'Egreso',  r => r.retiros],
  ['Ajustes',              'Egreso',  r => r.ajuste],
  ['Saldo final',          'Cuenta',  r => r.saldoFinal],
  ['Rendimiento neto',     'Cuenta',  r => r.rendimientoNeto]
];

// Renglones para la pestaña "Inversiones" (el detalle mes a mes por plataforma).
function filasInversiones(r) {
  const { anio, mes } = r.periodo;
  const filas = [];
  CONCEPTOS.forEach((c, i) => {
    const valor = c[2](r);
    if (valor === null || valor === undefined) return;
    filas.push({
      'Fecha': fecha(anio, mes, Math.min(i + 1, ultimoDia(anio, mes))),
      'Mes': mes,
      'Año': anio,
      'Nombre': r.plataforma,
      'Tipo de Movimiento': c[0],
      'Ingreso / Egreso': c[1],
      'Monto': valor
    });
  });
  // Estatus de la cartera al cierre (Al corriente, Vencido, Pagado…)
  let d = CONCEPTOS.length;
  Object.keys(r.estatus || {}).forEach(k => {
    const v = r.estatus[k];
    if (v === null || v === undefined) return;
    d++;
    filas.push({
      'Fecha': fecha(anio, mes, Math.min(d, ultimoDia(anio, mes))),
      'Mes': mes, 'Año': anio,
      'Nombre': r.plataforma,
      'Tipo de Movimiento': k,
      'Ingreso / Egreso': 'Total',
      'Monto': v
    });
  });
  return filas;
}

// Renglones para "Ventas 2026": solo lo que es ingreso facturable.
// Las columnas calculadas de la hoja (Mes, Año, Total, Cuentas por Cobrar)
// se dejan vacías a propósito: las llena la fórmula.
function filasVentas(r) {
  const { anio, mes } = r.periodo;
  const fila = (dia, descripcion, subtotal, iva) => ({
    'Fecha': fecha(anio, mes, Math.min(dia, ultimoDia(anio, mes))),
    'Cliente': r.plataforma,
    'Descripción': descripcion,
    'Línea de Negocio': 'Inversiones',
    'Subtotal': subtotal,
    'IVA': iva,
    'Cobrado': +(subtotal + iva).toFixed(2)   // los intereses se cobran solos
  });
  return [
    fila(3, 'Intereses', r.intereses || 0, r.ivaIntereses || 0),
    fila(5, 'Intereses moratorios', r.moratorios || 0, r.ivaMoratorios || 0)
  ];
}

module.exports = { leer, filasVentas, filasInversiones, detectar, money, MESES };
