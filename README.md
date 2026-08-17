# Aplicación de Ideas — Panel de datos (ERP)

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
```

---

## Lo primero que tienes que hacer

Este proyecto salió del panel de otra empresa, así que la marca ya está cambiada pero **las
hojas todavía no están conectadas**. Faltan exactamente dos cosas:

1. En `lib/core.js` → `USERS_SHEET`, cambiar `PEGA_EL_ID_DE_LA_HOJA_DE_USUARIOS` por el ID real
   (o cargar la variable de entorno `USERS_SHEET_ID` en Vercel).
2. En `lib/core.js` → `SHEETS`, descomentar las áreas que ya existan y pegarles su ID.

Mientras eso no se haga, el login responde con un mensaje que te dice justo qué falta.

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

### 3) Hoja de usuarios

Crea una hoja de cálculo con una pestaña llamada **`Usuarios ERP`**. Los encabezados de la
fila 1 se leen **por nombre, no por posición**, así que puedes agregar, mover o quitar columnas
(Correo, Comentarios, Teléfono) sin tocar el código. Solo `usuario` y `contraseña` son
obligatorias; `nombre` y `rol` son opcionales.

Encabezados mínimos:

| usuario | contraseña | nombre | rol |
|---|---|---|---|
| admin | LaClaveQueElijas | Administrador | admin |
| recepcion | OtraClave | Recepción | lector |

- El **usuario** no distingue mayúsculas; la **contraseña** sí.
- **rol**: `admin` y `staff` pueden capturar y editar. `lector` solo consulta.
- Las contraseñas viven en texto plano dentro de la hoja: quien tenga acceso a esa hoja las ve.
  Compártela únicamente con quien administre el sistema.
- Para dar de alta o de baja a alguien, editas la hoja. No hay que tocar código.

Copia el ID de esa hoja (lo que va entre `/d/` y `/edit` en la URL) y pégalo en
`lib/core.js` → `USERS_SHEET`, o cárgalo como variable de entorno `USERS_SHEET_ID`.

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
2. **Settings → Environment Variables**, carga estas cuatro:

| Variable | Valor |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | el `client_email` del JSON |
| `GOOGLE_PRIVATE_KEY` | la `private_key` del JSON, pegada tal cual (con los `\n`) |
| `SESSION_SECRET` | una frase larga e inventada por ti |
| `USERS_SHEET_ID` | el ID de la hoja de usuarios |

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
