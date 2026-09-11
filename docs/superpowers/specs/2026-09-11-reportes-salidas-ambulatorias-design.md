# Salidas ambulatorias en Estadísticas de Farmacia — diseño

**Fecha:** 2026-09-11 · **Estado:** aprobado, sin implementar
**Origen:** §0 del [`handoff-2026-09-11.md`](../../bitacora/handoff-2026-09-11.md) — lo único que
quedó afuera de las tandas del 2026-09-08, y a propósito.
**Contexto previo:** [`2026-09-08-dispensacion-ambulatoria-design.md`](2026-09-08-dispensacion-ambulatoria-design.md)
(la feature que creó las salidas, migración `0116`) y la `0083`, que creó las vistas de Estadísticas.

---

## El problema: el Balance no está incompleto, está MAL

El §0 y `TODOS.md` describen esto como una ausencia — las salidas ambulatorias "no aparecen" en
Estadísticas. Leyendo el código es peor que eso.

`v_pharma_report_receptions` (`0083`) **no filtra por `tipo`**, así que las recepciones
ambulatorias **sí entran** en el eje de ingresos. Las salidas ambulatorias no entran en el de
egresos, porque `v_pharma_report_items` arranca `from public.dispensations d`. La tarjeta hero
"Balance del período" (`Resumen.tsx:75`) y la hoja `BALANCE DEL PERÍODO` (`impresion.tsx:95`)
imprimen `Ingresadas − Dispensadas = Saldo`.

**Ese saldo hoy está inflado exactamente en las unidades que salieron por la farmacia ambulatoria.**
No falta una categoría: hay un papel que se firma afirmando algo falso. Eso mueve el trabajo de
"sumar un bloque" a "corregir un número", y es lo que fija su prioridad.

## El agujero de la receta original

El §0 y `TODOS.md` describen la solución como *"reescribir la vista `0083` para que salga del libro
en vez de `from dispensations`"*. **Esa reescritura, sola, rompe otra cosa.**

La decisión 3 de la `0083` dice que **los kits de producto de investigación no pasan por
`stock_movements`**: salen por `dispensations.ip_kits`, sin lote y sin asiento. Por eso la vista
tiene un `left join lateral` y no un `join` — una dispensación de sólo IP no tiene ninguna fila en
el libro. Una vista que arranque `from stock_movements` **pierde esas dispensaciones y sus kits**.

O sea: por el camino del libro, no es un cambio de `from` — es un `union all` que vuelve a traer lo
que el libro no tiene. Y una vez que decidimos (D1) que la ambulatoria es una categoría propia, ese
camino no compra nada y toca todo. Queda descartado.

## Decisiones (tomadas con el Director el 2026-09-11)

| # | Decisión | Alternativas descartadas |
|---|---|---|
| D1 | **Categoría propia, fuera del eje por protocolo.** Bloque propio, y el eje de dispensación —unidades, dispensaciones, pacientes, tiempos, cumplimiento, serie diaria, composición y las tablas por protocolo y por medicamento— no cambia ni un número. La única cifra que se mueve es el Balance (D4) | Un solo eje (la ambulatoria sumando en "Unidades dispensadas"): más honesto como inventario, pero cambia cifras ya impresas y obliga a revisar las 14 hojas una por una. Mínimo (sólo balance + CSV): deja las salidas sin ninguna lectura propia |
| D2 | **Tabla de detalle: una fila por salida**, con destinatario y autorizante | Agregado por medicamento (pierde el destinatario, que es el dato que la tabla existe para registrar); las dos tablas (con pocas salidas por período, la misma información contada dos veces) |
| D3 | **El bloque se oculta cuando hay un protocolo elegido** | Bloque visible y vacío con una nota (deja un bloque muerto en una pantalla de ocho); "Ambulatoria" como opción del filtro de protocolos (mezcla dos cosas distintas en un menú y obliga a cada agregado a entender un valor especial) |
| D4 | **El Balance gana una tercera barra** y el saldo pasa a `ingresadas − dispensadas − ambulatorias` | Dos mundos separados (sacar también las recepciones ambulatorias de "ingresadas": baja otro número ya impreso y obliga a decidir lo mismo para vencidos y para todo lo que venga); sumarla dentro de "Dispensadas" (mete en una barra las dos cosas que el resto de la pantalla separa) |
| D5 | **Extender `v_ambulatory_dispensations` con la fecha local**, y que Estadísticas lea la misma vista que Farmacia Ambulatoria | Vista propia `v_pharma_report_ambulatory` (duplica doce columnas y dos definiciones que hay que acordarse de mantener juntas); sin migración, filtrando `created_at` desde el front (se lleva al front la regla de zona horaria que la `0083` puso en la base a propósito) |

**El criterio detrás de D1 y D4, que es uno solo:** el eje por protocolo es lo que se le muestra al
sponsor y no se toca. El Balance no es del sponsor: es del estante, y el estante es uno solo — por
eso ahí sí entra.

## La base — migración `0118`

Un solo `create or replace view` sobre `v_ambulatory_dispensations` (`0116`) que le agrega **una
columna al final**:

```sql
(ad.created_at at time zone 'America/Argentina/Buenos_Aires')::date as fecha
```

Mismo criterio que `v_pharma_report_items` (`0083:62`) y `v_patient_visits` (`0004:30`): sin esto,
una entrega de las 21:30 cae al día siguiente y el recorte del período queda corrido.

Nada más. Ni tabla, ni FK, ni policy: la RLS de la `0116` ya dice que la ve `pharma` o `gerencia`,
y la vista es `security_invoker`.

**Orden de despliegue: la migración va PRIMERO.** Es puramente aditiva y el que no funciona sin
ella es el front nuevo (regla de `CLAUDE.md`: el orden no se decide por "agrega o quita" sino por si el cambio altera lo que el front YA pide). No puede
romper el front desplegado por dos razones independientes: `ambulatoria.ts` pide columnas
explícitas (`SALIDA_COLS`), y `create or replace view` agregando al final es legal y no reordena
nada. Tampoco agrega ninguna FK, así que no puede disparar el `PGRST201` de la `0076`.

## La capa de datos

`useReportAmbulatory(rango)` en `data/pharma/reports.ts`, calcado de los otros cuatro hooks:
`count: 'exact'`, `.limit(TECHO_FILAS)`, envuelto en `conTecho(...)`, errores por
`pharmaErrorMessage`. Filtra `gte('fecha', desde).lte('fecha', hasta)`.

**No recibe `protocolCodes`:** una salida ambulatoria no tiene protocolo que filtrar. Quien decide
qué hacer con el filtro es la pantalla (D3), no la consulta.

`ReportAmbulatoryRow` va a `reportModel.ts`, junto a los otros cuatro tipos de fila.

## La pantalla

**El bloque nuevo**, último antes de "Detalle de dispensaciones":

- Título **Salidas ambulatorias**, con su botón de imprimir.
- `sectionHint` con `N salidas · M unidades en el período` — mismo patrón que el bloque de detalle,
  sin tarjetas nuevas.
- Tabla de seis columnas: **Fecha · Medicamento · Lote · Unidades · Retiró · Autorizó**. El
  documento de quien retira va como segunda línea de su celda, cuando hay.
- **Se oculta entero si `protoSel.length > 0`** (D3). El encabezado impreso ya declara
  `Protocolo: X`, así que la hoja no oculta nada: dice de qué habla.

**La tarjeta de Balance** (`Resumen.tsx`) gana una tercera barra y el saldo pasa a
`ingresadas − dispensadas − ambulatorias`. `Resumen` recibe un prop nuevo
`ambulatorias: { unidades: number; salidas: number }`.

**Tres cosas que el bloque obliga a tocar, y que no se ven leyendo el diff:**

1. **`sinMovimientos`** (`ReportesView.tsx:262`) hoy es `dispensaciones === 0 && recepciones === 0`.
   Un período con **sólo** salidas ambulatorias mostraría "No hubo movimientos" y taparía
   justamente el bloque nuevo. Suma la tercera condición.
2. **`truncado`** tiene que incluir el techo de la consulta nueva, o se imprimiría una hoja con la
   tabla cortada y sin aviso.
3. **`invariantes()` NO se toca.** Chequea que serie, protocolos y medicamentos cierren contra el
   total de `items`; la ambulatoria no entra en ese eje. Meterla ahí rompería la verificación que
   bloquea la impresión — el candado que existe para que no se firme una hoja que no cierra.

## La hoja impresa

- Clave nueva `ambulatorias` en `REPORTES` (`impresion.tsx:60`), título `SALIDAS AMBULATORIAS`, con
  su tabla. `DefinicionReporte.tablas` gana el valor `'ambulatorias'`.
- La hoja `balance` pasa a cuatro renglones (Ingresadas / Dispensadas / Salidas ambulatorias /
  Saldo), con la nota que explica que el estante es uno solo.
- La hoja `todo` anexa la tabla nueva.

**Fuera de alcance, a propósito:** no hay CSV propio (son pocas filas y ya salen impresas), y el
renglón **no** abre el cajón de la salida en Farmacia Ambulatoria — sería navegación entre
submódulos por una fila que ya muestra todo salvo la nota y la hora exacta.

## Qué se testea

Lo que puede fallar **en silencio**, que es el criterio de `estados.test.ts`:

- `totalesAmbulatorias(filas)` — unidades y cantidad de salidas.
- **El saldo a tres términos.** Un signo al revés deja un número perfectamente razonable en
  pantalla: nada se ve mal, y es el número que se firma. Se extrae como función pura en
  `agregados.ts` y se testea con los tres casos (saldo positivo, negativo y con ambulatoria en
  cero).

La tabla, las barras y el ocultamiento por filtro se verifican **mirando**: fallan de manera
visible.

## QA

Hay salidas ambulatorias reales cargadas en prod (confirmado por el Director el 2026-09-11), así
que el QA va contra ellas. **Es la única forma:** una salida ambulatoria es inmutable por diseño
(`0116`: *"un error se corrige con un ajuste de stock"*), no tiene policy de `delete` y descuenta
stock real — **no se puede crear una `TEST-*` y borrarla después.**

Lo que hay que ver, con un período que contenga alguna:

1. El bloque aparece, y sus dos números coinciden con la tabla.
2. **El saldo del Balance bajó** respecto de lo que mostraba antes, exactamente en las unidades
   ambulatorias del período.
3. Con un protocolo elegido, el bloque desaparece **y** el saldo vuelve a ser de dos términos
   (porque las recepciones ambulatorias también se caen del recorte).
4. Un período sin ninguna salida ambulatoria: el bloque no rompe nada y el saldo queda como hoy.
5. Las hojas `balance`, `ambulatorias` y `todo` impresas.

Con una cuenta acotada no hace falta: la RLS de la `0116` ya estaba y no la toca esta tanda. (El
caso negativo de permisos que pide el §0.1 sigue abierto, y sigue siendo de la tanda de la `0116`,
no de ésta.)
