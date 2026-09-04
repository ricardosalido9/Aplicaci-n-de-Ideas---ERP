# Aplicación de Ideas — Panel de datos (ERP)

**Versión 2026.08.24-011**

El número de versión sale en dos lados del panel: abajo del menú, arriba de "Cerrar Sesión",
y también en la pantalla de login. Sirve para confirmar de un vistazo que el ZIP que subiste
es el que crees.

Vive en dos archivos y **los dos tienen que decir lo mismo**: la constante `VERSION` al inicio
de `lib/core.js` (servidor) y la constante `VERSION` dentro del `<script>` de `index.html`
(pantalla). Al entrar, el panel las compara: si no coinciden, el pie del menú se pone en rojo
y avisa que el despliegue quedó a medias — que es justo lo que pasa cuando se sube el
`index.html` nuevo pero Vercel se quedó con las funciones viejas, o al revés.

Formato: `AAAA.MM.DD-NNN`, donde los tres dígitos finales son la entrega del día.

Panel web conectado a tus Google Sheets. Frontend estático + funciones serverless en Vercel.
Las hojas se leen y escriben con la **API de Google Sheets** usando una **cuenta de servicio**.

Cada área del menú es una pestaña de una hoja de cálculo. El panel lee los encabezados de la
fila 1 y arma solo la tabla, los filtros y el formulario de alta. **No hay que programar nada
para agregar un área nueva**: se agrega una línea en `lib/core.js` y listo.

---

## Estructura

```
index.html            Interfaz completa (login, menú, inicio, dashboard, tablas, altas)
vercel.json           Config de despliegue
package.json          Dependencias

assets/logo-ideasyc.png     Logotipo limpio, fondo transparente (el que se ve va embebido en index.html)
assets/favicon-ideasyc.png  Solo el ícono, para la pestaña del navegador
assets/logo-original.png    Archivo original que enviaste, por si hay que regenerar

lib/core.js           ⭐ EL ÚNICO ARCHIVO QUE VAS A EDITAR SEGUIDO
                      MENU, SHEETS, filtros, columnas calculadas y autocompletados

api/login.js          Valida usuario contra la hoja "Usuarios ERP"
api/menu.js           Devuelve el menú de áreas
api/data.js           Lee una hoja
api/add.js            Agrega una fila
api/update.js         Edita una fila existente
api/categories.js     Listas desplegables (pestaña CATEGORIAS de cada archivo)
api/lookup.js         Autocompletado entre hojas
api/inicio.js         Avisos y pendientes de la pantalla de Inicio
api/dashboard.js      Agregados y gráficas del Dashboard
api/importar.js       Lee los PDF de estados de cuenta y los manda a las hojas
api/inversiones.js    Indicadores de rendimiento por plataforma de inversión
api/finanzas.js       Ingresos y egresos (diagnóstico + movimientos)

lib/finanzas.js       Lectura del archivo Ingresos-Egresos

lib/estados.js        Lector de estados de cuenta (Prestadero, Briq, Yo te Presto)
```

---

## Lo primero que tienes que hacer

La hoja de usuarios **ya está conectada** (`1C2-5HbgpKWGeGwgyL2ov0_7KTD5nYAFQ69UpNjFUTQE`,
pestaña `Usuarios ERP`). Falta:

1. Compartir esa hoja **como Editor** con el `client_email` de la cuenta de servicio. Sin esto
   el panel no la puede leer, aunque el ID esté bien.
2. En `lib/core.js` → `SHEETS`, descomentar las áreas que ya existan y pegarles su ID.

Si la pestaña llegara a cambiar de nombre, el panel busca sola la primera que diga "usuario",
así que no se rompe el login.

---

## Puesta en marcha

### 1) Cuenta de servicio de Google

1. Entra a **console.cloud.google.com** y crea un proyecto (por ejemplo, `ideasyc-erp`).
2. **APIs y servicios → Biblioteca →** habilita **Google Sheets API**.
3. **APIs y servicios → Credenciales → Crear credenciales → Cuenta de servicio**.
4. Abre la cuenta creada → **Claves → Agregar clave → JSON**. Se descarga un archivo con
   `client_email` y `private_key`. **Ese archivo nunca se sube a GitHub.**

### 2) Comparte las hojas con la cuenta de servicio

Sin este paso la app no puede leer nada. Copia el `client_email` del JSON (termina en
`.iam.gserviceaccount.com`) y compártele **como Editor** cada hoja de cálculo que vayas a
conectar, incluida la de usuarios.

### 3) Hoja de usuarios — ya lista

La hoja ya existe y ya está apuntada desde `lib/core.js`. Sus encabezados de la
fila 1 se leen **por nombre, no por posición**, así que puedes agregar, mover o quitar columnas
(Correo, Comentarios, Teléfono) sin tocar el código. Solo `usuario` y `contraseña` son
obligatorias; `nombre` y `rol` son opcionales.

Encabezados mínimos:

| usuario | contraseña | nombre | rol |
|---|---|---|---|
| ric | (tu contraseña) | Ricardo Salido | Admin |
| recepcion | OtraClave | Recepción | lector |

- El **usuario** no distingue mayúsculas; la **contraseña** sí.
- **rol**: `admin` y `staff` pueden capturar y editar. `lector` solo consulta.
- Las contraseñas viven en texto plano dentro de la hoja: quien tenga acceso a esa hoja las ve.
  Compártela únicamente con quien administre el sistema.
- Para dar de alta o de baja a alguien, editas la hoja. No hay que tocar código.

Para agregar a alguien más, agrega su fila. Para sacarlo, borra su fila: queda fuera en el
siguiente login, sin tocar código.

### 4) Conecta tus áreas

Abre `lib/core.js` y descomenta las líneas del objeto `SHEETS` de las áreas que ya tengas:

```js
const SHEETS = {
  cli_directorio:  { id: '1AbC...XyZ', sheetName: 'Lista de Clientes' },
  proy_cartera:    { id: '1DeF...UvW', sheetName: 'Proyectos' },
};
```

- `id` → el ID de la hoja de cálculo.
- `sheetName` → el nombre exacto de la pestaña (respeta acentos y mayúsculas).

Las áreas del menú que **no** estén en `SHEETS` se ven pero no abren. Eso es intencional:
el menú te sirve de mapa de lo que falta conectar.

### 5) Sube el proyecto a GitHub

Sin consola: en **github.com → New repository** (privado) y con *"uploading an existing file"*
arrastra toda la carpeta.

Con consola:

```bash
git init && git add . && git commit -m "Panel Aplicación de Ideas"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/ideasyc-erp.git
git push -u origin main
```

### 6) Despliega en Vercel

1. **vercel.com → Add New → Project**, importa el repo. Framework preset: **Other**. Deploy.
2. **Settings → Environment Variables**, carga estas tres:

| Variable | Valor |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | el `client_email` del JSON |
| `GOOGLE_PRIVATE_KEY` | la `private_key` del JSON, pegada tal cual (con los `\n`) |
| `SESSION_SECRET` | una frase larga e inventada por ti |
| `USERS_SHEET_ID` | *(opcional)* el ID ya está en `lib/core.js`; úsala solo si quieres cambiarlo sin tocar código |

   Alternativa más simple para las dos primeras: una sola variable `GOOGLE_CREDENTIALS` con el
   JSON completo pegado adentro.

3. **Deployments → ⋯ → Redeploy** para que tome las variables.
4. Abre la URL. Entra con un usuario de la hoja.

---

## Cómo se preparan las hojas

**Fila 1 = encabezados.** El panel arma todo a partir de ahí. Reglas prácticas:

- Un encabezado por columna, sin celdas combinadas y sin filas vacías arriba.
- Nombres cortos y consistentes entre hojas (`Fecha`, `Cliente`, `Status`, `Total`).
- Fechas en `AAAA-MM-DD` o `DD/MM/AAAA`. Ambas se entienden.
- Montos en número. Si la celda trae `$` o comas, también se interpreta.

### Listas desplegables

Agrega al mismo archivo una pestaña llamada **`CATEGORIAS`**. Cada encabezado de esa pestaña
debe llamarse igual que el campo que quieres convertir en lista, y debajo van las opciones:

| Status | Categoría | Tipo de contrato |
|---|---|---|
| Activo | Consultoría | Anual |
| Inactivo | Capacitación | Por proyecto |

En el formulario de alta ese campo aparece como desplegable, con una opción
**"+ Agregar opción..."** que escribe la nueva opción de regreso en la hoja.

### Columnas que calcula la hoja

Si tienes columnas con fórmula (por ejemplo `Por Cobrar = Total − Cobrado`), decláralas en
`FORMULA_FIELDS` dentro de `lib/core.js`. El panel las muestra pero no las pisa al guardar:

```js
const FORMULA_FIELDS = {
  ventas_registro: ['Por Cobrar'],
  proy_horas:      ['Importe']
};
```

### Autocompletado entre hojas

`LOOKUPS` permite que al elegir un valor se llenen otros campos solos. Ejemplo: al elegir un
proyecto en Horas, que se traigan su Cliente y su Responsable desde la hoja de Proyectos:

```js
const LOOKUPS = {
  proy_horas: {
    sheetName: 'Proyectos',
    keyField: 'Proyecto',
    keyAliases: ['Proyecto', 'Nombre del proyecto', 'Clave'],
    fills: ['Cliente', 'Responsable', 'Tarifa']
  }
};
```

### Áreas filtradas

`AREA_ROW_FILTERS` hace que un área muestre solo parte de una hoja. Cuentas por Cobrar ya viene
configurada así: lee la hoja de Ventas y muestra únicamente las filas con saldo pendiente.

---

## Dos secciones distintas: Ingresos e Inversiones

Se separaron a propósito, porque son cosas distintas aunque se toquen:

- **Ingresos** es lo que la empresa factura y cobra. Cada ítem es la hoja `Ventas 2026`
  filtrada por su línea de negocio. Ahí, "Rendimientos" son los intereses que ya se cobraron
  y entran como ingreso del mes.
- **Inversiones** es el patrimonio que vive en las plataformas: el capital, la cartera, la
  morosidad y los estados de cuenta que llegan cada mes. Ese PDF no registra una venta —
  registra el estado de una inversión— así que vive aquí y no en Ingresos.

El puente entre las dos es el importador: de cada estado de cuenta salen dos renglones a
Ventas (los intereses cobrados, que sí son ingreso) y quince o veinte a Inversiones (saldos,
retenciones, comisiones y estatus de la cartera, que no lo son).

## Ingresos: cuatro fuentes en una sola hoja

Todo vive en `Ventas 2026` (archivo `181v9VGg...P3Zs`), una tabla plana con la columna
**`Línea de Negocio`**. El panel no duplica datos: las cinco áreas del menú leen la misma
pestaña y solo cambia el filtro.

| Área del menú | Filtro |
|---|---|
| Todas las fuentes | sin filtro |
| Consultoría | `Línea de Negocio = Consultoría` |
| Inversiones | `= Inversiones` (Prestadero, Briq, Yo te presto) |
| Préstamos | `= Préstamos` |
| Puerto Escondido | `= Dividendos` |
| Cuentas por Cobrar | `Cuentas por Cobrar > 0` |

Se configura en `lib/core.js` → `AREA_ROW_FILTERS`. Si aparece una fuente nueva, agregas
el ítem al `MENU`, la línea al `SHEETS` y su filtro. Nada más.

**Ingresos = Subtotal, sin IVA.** Así es como cuadra tu Resumen Ejecutivo
($1,241,271.47 en 2026). El total con IVA se muestra aparte, en su propio KPI.

**Columnas calculadas**: `Mes`, `Año`, `Total` y `Cuentas por Cobrar` se declaran en
`FORMULA_FIELDS`, así que el panel las muestra pero nunca las pisa. `Cobrado` se dejó
**fuera** a propósito para poder registrar pagos parciales desde el panel — para eso hay que
quitarle la fórmula `=J3` en la hoja.

### Pestaña pendiente: Puerto Escondido

En `Ventas 2026` solo entra el retorno mensual. El seguimiento de la recuperación vive en
`Call Mary`, que es un tablero de celdas sueltas y el panel no puede leerlo. Crea una pestaña
nueva llamada **`Puerto Escondido`** con estos encabezados en la fila 1:

| Fecha | Concepto | Tipo | Monto | Comentarios |
|---|---|---|---|---|
| 2024-04-12 | Pago de deuda | Recuperación | 15000 | |
| 2024-07-18 | Aportación inicial | Aportación | 8058857.50 | Equity + deuda |

`Tipo` toma dos valores: `Aportación` y `Recuperación`. Con eso el panel puede mostrar cuánto
se aportó, cuánto se lleva recuperado y el porcentaje, sin que nadie actualice nada a mano.

---

## Importar estados de cuenta de las plataformas

Menú → **Inversiones → Importar estados de cuenta**. Arrastras los PDF de Prestadero, Briq y
Yo te Presto (hasta 6 a la vez), el panel los lee y te enseña **qué va a escribir antes de
escribirlo**. Nada toca la hoja hasta que aprietas "Guardar en la hoja".

De cada estado de cuenta salen:

- **2 renglones a `Ventas 2026`** — Intereses e Intereses moratorios, con su subtotal e IVA,
  ya clasificados como línea de negocio *Inversiones*.
- **15 a 20 renglones a `Inversiones`** — saldos, principal, retenciones, comisiones, retiros,
  ajustes y el estatus de la cartera al cierre.

### Cómo lee cada plataforma

| Dato | Prestadero | Briq | Yo te Presto |
|---|---|---|---|
| Saldo inicial | no lo trae · se hereda del cierre anterior | sí | sí |
| Saldo final | Valor de la Cuenta | Valor de inversiones | sí |
| Intereses | Interés Recibido | intereses | sí, desglosado |
| IVA de intereses | no lo trae · se calcula al 16% | no lo trae · 16% | sí, desglosado |
| Retenciones | no las desglosa | IVA e ISR retenido | IVA e ISR |
| Estatus de cartera | Al corriente, En mora, Pagado, Vencido | — | + En tránsito, Atrasado |

Los archivos se procesan en memoria durante la petición; el PDF no se guarda en ningún lado.

### Los tres controles que trae

1. **Cuadre automático.** Suma saldo inicial + entradas − salidas y lo compara contra el saldo
   final del PDF. Si cuadra, lo dice en verde. Si no, la diferencia se registra como `Ajustes`,
   igual que se venía haciendo a mano, y te avisa de cuánto fue.
2. **Antiduplicados.** Si ese mes de esa plataforma ya está en la hoja, lo marca y lo omite.
   Hay una casilla para forzarlo si de plano quieres reescribirlo.
3. **Avisos honestos.** Cuando un dato se estimó en vez de leerse (el IVA de Prestadero, por
   ejemplo), lo dice en pantalla. Nunca inventa un número en silencio.

### Cuando el PDF no cuadra: el caso Prestadero

Prestadero no desglosa IVA ni retenciones, y su "Valor de la Cuenta" se mueve también por
préstamos nuevos y cartera castigada. Por eso su renglón de `Ajustes` casi nunca es cero —
en marzo 2026 fue de $1,400.92. No es un error del lector: es la misma diferencia que ya
absorbía la captura manual. Si algún mes ese ajuste se dispara, es señal de que hay que abrir
el estado de cuenta a mano.

### Si prefieres CSV

Las tres plataformas dejan exportar movimientos en CSV o Excel, y eso siempre es más estable
que leer un PDF (si mañana cambian el diseño del estado de cuenta, el lector se puede romper;
un CSV no). El lector de PDF está pensado para el cierre mensual rápido. Si quieres el detalle
movimiento por movimiento, el CSV es el camino y se puede agregar como una segunda entrada
del mismo importador.

---

## Análisis de inversiones

Menú → **Inversiones → Rendimiento y cartera**. Lee la pestaña `Inversiones` (31 meses de
historia desde 2024) y calcula lo que el estado de cuenta no te dice de frente.

**Rendimiento anualizado** — rendimiento neto del mes ÷ capital promedio del mes, llevado a
12 meses con interés compuesto. Es el único número que permite comparar las plataformas entre
sí: sin él gana siempre la que tiene más dinero adentro, no la que trabaja mejor.

**Se va en costos** — qué porcentaje del interés bruto se quedan la plataforma y el SAT entre
comisiones y retenciones. El panel lo desglosa en tres barras: lo que queda para ti, las
retenciones y la comisión.

**Morosidad** — cuánto de la cartera *activa* (sin contar lo ya pagado) está vencido, en mora
o atrasado. Si pasa del 25% sale una alerta roja, porque ese dinero dejó de generar y una
parte puede no volver.

La tabla de abajo trae mes a mes el capital, el interés bruto, los costos, el neto y el
anualizado, para ver si la cosa mejora o se deteriora.

Todo sale de los mismos renglones que escribe el importador de PDF, así que cada mes que
importes un estado de cuenta, esta pantalla se actualiza sola.

---

## Ingresos y egresos

Menú → **Finanzas → Ingresos y Egresos**. Lee las pestañas `INGRESOS` y `EGRESOS` del archivo
`1YMP_ZtP…` (Dashboard Ingresos-Egresos). Salió del módulo `ingresos-egresos`, adaptado para
vivir aquí: usa la misma cuenta de servicio y **pide token**, porque estos números no deben
quedar en una ruta abierta.

Se configura por variables de entorno; si no están, usa los valores por defecto:

| Variable | Por defecto |
|---|---|
| `SHEET_FINANZAS` | el id del archivo de Aplicación de Ideas |
| `TAB_INGRESOS` / `TAB_EGRESOS` | `INGRESOS` / `EGRESOS` |
| `CONCEPTOS_NO_FLUJO` | traspasos y pagos de tarjeta |
| `CONCEPTOS_NO_OPERACION` | aportaciones, retiros de inversión, deuda |
| `SIGNO_EGRESOS` | `auto` |

### Las tres decisiones que trae el módulo

**Los nombres de columna se buscan por varios candidatos.** Buscar uno solo hace que el dato se
lea como cero sin avisar, y un cero se ve igual que "no hubo movimientos". Esta hoja usa
`Método de cobro` en INGRESOS y `Método de pago` en EGRESOS: se agregaron los dos.

**Los traspasos no cuentan.** Mueven dinero de un bolsillo a otro. Si se cuentan, los dos lados
del mes salen inflados por el mismo monto. Hay una casilla para incluirlos cuando toque cuadrar
contra el estado de cuenta del banco, donde sí aparecen.

**El signo se deduce.** Si el total de un lado sale negativo, se voltea el lado completo y se
avisa en `lectura.seVolteoElSigno`.

### Lo que se le agregó

**Separación entre flujo y operación.** Una aportación de capital del socio, un retiro de
principal de Prestadero y un préstamo contratado son dinero que entra, pero no son ventas. El
panel los lee y los muestra, y con la casilla **"Solo operación"** los quita para ver el negocio
sin ellos. La diferencia no es menor: en 2026, $381,998 de los ingresos y $270,000 de los
egresos no vienen de la operación.

**El bloque "De dónde salió este número"**, desplegable debajo de cada desglose. Es lo que
permite explicar una diferencia en vez de discutirla: cuántos renglones tiene la hoja, cuántos
entraron, cuántos se quedaron fuera por fecha ilegible, por año, por traspaso. Cuando el total
no coincide con el que se ve en la pestaña, la diferencia está casi siempre ahí.

### Capturar un movimiento

El botón **"+ Agregar movimiento"** escribe directo en `INGRESOS` o `EGRESOS`. Los desplegables
de Concepto, Categoría, Subcategoría y Cuenta salen del propio histórico ordenados por uso, para
que nadie vuelva a teclear "Cuotas y suscripciones" con otra ortografía y rompa el agrupado.
`Mes` y `Año` se llenan solos con la fecha.

Al escribir el cliente o proveedor, si esa contraparte **siempre** se clasificó igual en el
histórico, el formulario propone esa clasificación y lo avisa. Si tiene dos clasificaciones
distintas no propone nada: sugerir la más frecuente escondería justo la decisión que hay que
tomar. Este modo requiere permiso de **Editor** en el archivo, no solo de lector.

### Ojo con el vercel.json del módulo

El módulo original traía `"rewrites": [{ "source": "/api/(.*)", "destination": "/api/finanzas" }]`.
**No se copió a propósito**: mandaría *todas* las rutas del panel —login, menu, data— a finanzas
y tumbaría el sistema completo. Aquí la acción va en el cuerpo (`accion: 'diagnostico'` o
`'movimientos'`) y el ruteo normal de Vercel por archivo sigue funcionando.

---

## Agregar un área nueva

1. En `lib/core.js` → `MENU`, agrega el ítem con su `key`, `label` e `icon`.
   Iconos disponibles: `home`, `grid`, `chart`, `clipboard`, `tag`, `users`, `cart`, `box`,
   `briefcase`, `dollar`, `book`, `card`, `factory`.
2. En `lib/core.js` → `SHEETS`, agrega la línea con `id` y `sheetName`.
3. Comparte esa hoja con la cuenta de servicio.
4. `git push`. Vercel vuelve a desplegar solo.

---

## Qué trae ya armado

- **Inicio**: saludo, accesos rápidos y avisos automáticos (cuentas por cobrar pendientes,
  incidencias del mes, colaboradores sin RFC/NSS/CURP, proveedores sin RFC).
- **Dashboard**: KPIs, ventas por mes / vendedor / tipo de servicio, contratos por tipo,
  colaboradores por área, incidencias, activos y últimos movimientos, con filtro por periodo.
- **Tablas**: búsqueda, filtros por valor y por rango de fechas, tarjetas de resumen,
  descarga a CSV y a PDF (vía el diálogo de impresión del navegador).
- **Altas y edición** con campos obligatorios, desplegables, cálculo automático de IVA al 16%
  y autocompletados.
- **Roles**: `lector` no ve los botones de guardar y el servidor también se lo impide.

---

## Notas de seguridad

- Los secretos viven solo en las variables de entorno de Vercel, nunca en GitHub.
- La sesión es un token firmado (HMAC) que dura 6 horas.
- El repositorio debe ser **privado**: aunque no tiene credenciales, sí tiene los IDs de tus hojas.
- Si alguien deja la empresa, borras su fila en la hoja de usuarios y queda fuera al siguiente login.

## Diseño

Sistema visual "lujo minimalista", ahora sobre la paleta del logotipo de IdeasyC.

- **Tipografía**: Jost en toda la plataforma, cargada desde Google Fonts. Es una geométrica
  emparentada con la del logotipo, así que el wordmark y la interfaz hablan el mismo idioma.
  Si el equipo está sin internet, cae en la tipografía del sistema sin romper el layout.
- **Barra lateral**: fija en escritorio (≥900px, sin hamburguesa) y deslizable en móvil. La marca
  va en texto, no en imagen. El área activa se marca con una pastilla en el color de acento.
- **Alta de registros**: pop-up que se abre con "+ Agregar". Se cierra con la ×, con clic fuera,
  con Escape, y solo al guardar bien.
- **Áreas de ingreso**: la tarjetería de arriba se arma con dinero, no con conteos —
  ingresos sin IVA, con IVA, cobrado (con su % de avance), por cobrar, y una tarjeta por fuente
  con su porcentaje del total. En la tabla, el cliente lleva su inicial en un círculo, la línea
  de negocio tiene color fijo (Consultoría azul, Inversiones verde, Préstamos morado, Dividendos
  ámbar), los montos van en cifras tabulares con el signo de pesos atenuado, y la columna de
  Cuentas por Cobrar muestra una barra de avance con el saldo en rojo — o una pastilla "Pagado"
  cuando ya no debe nada.
- **Registros en tarjetas**: las áreas abren en tarjetas, una por movimiento, con el nombre y su
  pastilla arriba, el concepto abajo, la fecha y un par de datos de contexto en gris, y el monto
  grande a la derecha. Se tocan para abrirlas y ver el resto de las columnas. El botón
  **Tarjetas / Tabla** en la barra cambia de vista: la tabla sigue ahí para comparar columnas y
  para editar en línea, y "Editar este registro" desde una tarjeta lleva directo a ella.
  Qué columna hace de título, de pastilla y de monto se resuelve por nombre, así que funciona
  igual en Ventas, Clientes, Proveedores o Colaboradores sin configurar nada.
- **Pastillas**: los valores de catálogo (Status, Tipo, Categoría…) salen como pastillas de color.
  Verde para activo/pagado/vigente, rojo para cancelado/baja/vencido, ámbar para pendiente/en proceso;
  el resto recibe un tono estable derivado del texto. Las descargas CSV y PDF exportan texto plano.

Para cambiar el subtítulo bajo el wordmark, busca `class="btag"` en `index.html`.

## Marca

Paleta **grafito sobre papel cálido**, derivada del logotipo, que es monocromo. El grafito del
logotipo (`#23282B`) sí tiene contraste suficiente para texto y botones, así que se usa tal cual
como color de acento; no hizo falta inventar una versión "legible" aparte. El resto son neutros
tibios: barra lateral `#F3F2EF`, papel `#FAF9F7`, tinta `#1E2225`, líneas `#E7E6E2`. Todos los
pares de texto y fondo pasan el contraste AA de WCAG.

Como el acento es el mismo grafito del logotipo, las barras del Dashboard salen del mismo color
que el ícono de la marca: la gráfica del logotipo y las gráficas del panel se ven como la misma
familia.

Están declaradas como variables CSS al inicio de `index.html`, en `:root`. Para reteñir la
app completa basta con cambiarlas ahí: no hay colores sueltos repartidos por el archivo.

El logotipo va incrustado en base64 dentro de `index.html` (completo en el login, y solo el
ícono como favicon). Los originales están en `assets/` por si hace falta regenerarlos: el que
enviaste venía como captura de pantalla con fondo blanco y algo de grano, así que se limpió,
se recortó y se pasó a fondo transparente.
