# Pendientes — Panel de Aplicación de Ideas

Actualizado en la versión **2026.08.24-008**.

---

## 🔴 Bloquean el uso — son de tu lado

| # | Qué falta | Por qué importa |
|---|---|---|
| 1 | Crear la **cuenta de servicio** de Google y cargar `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` y `SESSION_SECRET` en Vercel | Sin esto el panel no puede leer ninguna hoja |
| 2 | Compartir como **Editor** la hoja de usuarios (`1C2-5Hbg…`) con esa cuenta de servicio | Sin esto no se puede ni entrar |
| 3 | Compartir como **Editor** el archivo de ventas (`181v9VGg…`) con la misma cuenta | Sin esto no cargan ingresos, dashboard ni análisis |
| 4 | Cambiar la contraseña del usuario `ric` | Hoy es `ric`, en texto plano, y es cuenta de administrador |

---

## 🟡 Decisiones tuyas que destraban trabajo

| # | Qué falta | Detalle |
|---|---|---|
| 5 | Quitarle la fórmula `=J3` a la columna **`Cobrado`** de `Ventas 2026` | Mientras sea fórmula, nadie puede registrar un pago parcial desde el panel |
| 6 | Crear la pestaña **`Puerto Escondido`** | Columnas: `Fecha ǀ Concepto ǀ Tipo ǀ Monto ǀ Comentarios`, donde Tipo es *Aportación* o *Recuperación*. Con eso el panel calcula cuánto llevas recuperado de los $8,058,857 y el % de avance. Ofrecí vaciarte los movimientos de `Call Mary` a ese formato |
| 7 | Borrar las filas **50 y 51** de `Ventas 2026` | Están vacías con un 0 arrastrado |
| 8 | Decidir si se usa la columna **`Tipo de Venta`** | Está vacía en los 68 registros; hoy no aparece en el formulario |
| 9 | Compartir el archivo **Ingresos-Egresos** (`1YMP_ZtP…`) con la cuenta de servicio | Basta con permiso de lector |
| 10 | Revisar los renglones **sin fecha** de INGRESOS (33) y EGRESOS (83) | Son filas arrastradas con solo el `Mes`; no cuentan en ningún total. Si alguna sí traía datos, se está perdiendo |

---

## 🟢 Hecho

| Versión | Qué se entregó |
|---|---|
| 005 | Rebranding completo a IdeasyC: logotipo limpio y en transparente, paleta grafito sobre papel cálido, favicon, wordmark |
| 005 | Menú adaptado a consultoría (Proyectos, Ingresos, Clientes, Compras, Activos, RRHH, Finanzas, Contabilidad) |
| 005 | Hoja de usuarios conectada, con respaldo por si cambia el nombre de la pestaña |
| 005 | Sello de versión en la barra lateral y en el login, con alerta de despliegue mezclado |
| 006 | Hoja de ventas conectada con 5 pestañas filtradas por `Línea de Negocio` + Cuentas por Cobrar |
| 006 | Dashboard por fuente de ingreso, con pestañas y comparativo. Cuadra al centavo con el Resumen Ejecutivo |
| 006 | Importador de estados de cuenta en PDF (Prestadero, Briq, Yo te Presto) con vista previa, cuadre automático y antiduplicados |
| 006 | Ventas visual: tarjetas de dinero, pastillas de color fijo por línea, cliente con inicial, barra de avance de cobranza |
| 007 | Análisis de inversiones: rendimiento anualizado, costos, morosidad y serie de 31 meses por plataforma |
| 008 | Ingresos y Egresos conectado, con el módulo que mandaste integrado: traspasos fuera, signo deducido, separación entre flujo y operación, y el bloque "de dónde salió este número" |

---

## 🔵 Propuesto, todavía sin arrancar

| # | Qué | Nota |
|---|---|---|
| 11 | Importar movimientos por **CSV** de las tres plataformas | Más estable que el PDF: si cambian el diseño del estado de cuenta, el lector de PDF se puede romper y un CSV no. El PDF queda para el cierre rápido; el CSV para el detalle movimiento a movimiento |
| 12 | Conectar las áreas que siguen en gris | Prospectos, Cotizaciones, Clientes, Contratos, Proyectos, Compras, Activos, RRHH, Finanzas y Contabilidad ya están en el menú pero sin hoja |
| 13 | Alerta de **capital ocioso** | El importador ya guarda el "Dinero disponible" de cada plataforma; falta el aviso en Inicio cuando pase de cierto monto |
| 14 | Revisar la **cartera de Prestadero** | 81% de la cartera activa está vencida o en mora. Es dato, no bug: vale la pena verlo con calma |
