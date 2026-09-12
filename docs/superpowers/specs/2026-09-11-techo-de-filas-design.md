# El techo de filas, completo — diseño

**Fecha:** 2026-09-11 · **Estado:** aprobado, sin implementar
**Origen:** §0 del [`handoff-2026-09-11.md`](../../bitacora/handoff-2026-09-11.md), anotado en
`TODOS.md` como decisión del Director porque **cambia cuándo se bloquea la impresión**.
**Contexto previo:** [`2026-09-11-reportes-salidas-ambulatorias-design.md`](2026-09-11-reportes-salidas-ambulatorias-design.md)
— esa tanda reescribió el aviso de truncamiento y dejó este hueco a la vista sin taparlo.

---

## El problema

Las cinco consultas de Estadísticas piden `count: 'exact'` con `.limit(TECHO_FILAS)` (5.000) y se
envuelven en `conTecho(...)`, que compara lo que llegó contra lo que hay y levanta `truncado`. El
motivo está escrito en la cabecera de `reports.ts`: **PostgREST corta por `max-rows` devolviendo
200 OK**, así que un rango largo daría totales truncados **sin ningún error**, y esos totales se
imprimen y se firman.

Pero sólo **tres** de las cinco entran en el cálculo de `truncado` que bloquea la impresión:
`items`, `recepciones` y `salidas`. **`rechazados` y `vencidos` quedaron afuera** — en `main` el
cálculo ya era sólo `items || recepciones`, así que el hueco es preexistente y la tanda de salidas
ambulatorias lo heredó.

Y los dos números **se imprimen**:

| Consulta | Dónde sale impresa |
|---|---|
| `rechazados` | La hoja `RESUMEN DEL PERÍODO` ("Pedidos rechazados o cancelados"), la hoja `PEDIDOS RECHAZADOS O CANCELADOS`, el informe `todo`, y la tira de indicadores en pantalla |
| `vencidos` | La hoja `RESUMEN DEL PERÍODO` ("Stock vencido sin usar"), la hoja `STOCK VENCIDO SIN USAR`, el informe `todo`, y la tira |

Si alguna de las dos alcanza el techo, **sale un número corto en una hoja firmada y nada lo dice.**
Es la misma clase de defecto que la tanda anterior arregló para el saldo: no se ve mal, está bien
formateado, y nadie tiene con qué compararlo.

**No es un caso que ocurra hoy** —5.000 pedidos rechazados en un período, o 5.000 lotes vencidos con
stock— y por eso se difirió. Se toma ahora como seguro, no como urgencia.

## Cada consulta responde a un control distinto

Es el hecho que define la forma del arreglo, y no es simétrico:

| Consulta | ¿La achica acotar el rango? | ¿La achica filtrar por protocolo? |
|---|---|---|
| `items` (dispensaciones) | sí | sí |
| `recepciones` | sí | sí |
| `rechazados` | sí | sí |
| `salidas` (ambulatorias) | sí | **no** — no tienen protocolo (`0116`) |
| `vencidos` | **no** — es un corte AL DÍA DE HOY, no del período | sí |

De ahí sale el caso incómodo: si truncan **`salidas` y `vencidos` a la vez**, ningún control por
separado alcanza. Hay que usar los dos.

## Decisiones (tomadas con el Director el 2026-09-11)

| # | Decisión | Alternativas descartadas |
|---|---|---|
| D1 | **Portón único: cualquiera de las cinco bloquea las 15 hojas.** Las dos consultas entran a la cadena que ya existe | **Portón por hoja** (cada entrada de `REPORTES` declara de qué consultas depende y sólo se bloquea lo afectado): más preciso y encaja con el registro declarativo, pero son 15 entradas anotadas a mano y **una anotada de menos imprime una hoja corta en silencio** — el mismo defecto, movido de lugar. **No bloquear y declararlo en la hoja** ("5.000 — cortado por el techo"): honesto, pero contradice el criterio que ya rige acá, que una hoja firmada con datos inconsistentes es peor que no tener hoja |
| D2 | **El aviso enumera TODAS las fuentes que truncaron**, no la primera | Nombrar sólo la primera (lo de hoy): con tres fuentes era tolerable; con cinco, achicás por lo que dice el aviso y recién entonces te enterás de la segunda |
| D3 | **El consejo se deriva de la UNIÓN de lo que truncó**, con cuatro ramas | Un consejo fijo: es lo que hay hoy y es lo que hace el daño — "acotá el rango" no achica `vencidos` en absoluto, así que manda a tocar un control inerte con la impresión bloqueada |

**El costo aceptado de D1, dicho en voz alta:** un `vencidos` truncado bloquea el reporte de
dispensaciones, que no lo usa. Se paga el día que pase, y a cambio no hay que mantener un mapa de
hoja → consultas que se desactualiza en silencio.

Lo más incómodo, que todavía no estaba dicho: a `vencidos` no la achica el rango, así que si algún
día trunca no hay período que destrabe la impresión — o alcanza con filtrar por un protocolo, o la
pantalla queda sin poder imprimir.

## La forma

**Un archivo nuevo: `src/views/pharma/reportes/truncamiento.ts`.** Una función pura, sin React y sin
Supabase, que recibe las cinco candidatas y devuelve `null` si ninguna truncó, o el aviso ya
resuelto.

Cada candidata lleva cuatro cosas: **cómo se llama** en el texto del aviso, **cuántas filas dice la
base que hay**, **si la achica el rango** y **si la achica el filtro por protocolo**. Las dos últimas
son propiedades de la consulta, no del estado: viajan como dato al lado del rótulo, donde se pueden
leer y corregir juntas, en vez de estar implícitas en un ternario.

El resultado trae dos strings ya armados:

- **`detalle`** — la enumeración: *"5.000 en dispensaciones y 5.000 en recepciones"*. Con tres o
  más, coma entre todas y **`y`** antes de la última. El total nunca es `null` acá: `conTecho` sólo
  levanta `truncado` cuando el conteo exacto llegó y superó el techo, así que si una fuente está en
  esta lista, su número existe.
- **`consejo`** — derivado de la unión de lo que truncó:

| Lo que truncó | Consejo |
|---|---|
| Todo lo truncado se achica por rango **y** por protocolo | Acotá el rango o filtrá por protocolo |
| Sólo por rango (p. ej. salidas ambulatorias) | Acotá el rango — el filtro por protocolo no achica esta lista, porque una salida ambulatoria no tiene protocolo |
| Sólo por protocolo (p. ej. vencidos) | Filtrá por protocolo — acotar el rango no achica esta lista, porque un lote está vencido hoy, no durante el período |
| Mixto: cada una responde a un control distinto | Acotá el rango **y** filtrá por protocolo: cada una de estas listas responde a uno de los dos |

**`ReportesView` arma las cinco candidatas y usa el resultado** para el `Aviso` y para `truncado`,
que sigue alimentando `puedeImprimir` exactamente como hoy. La escalera de ternarios desaparece y el
bloque queda más corto que ahora.

## Qué se testea

La función pura, y sólo ella. Es justo lo que falla **en silencio**: un consejo equivocado se lee
perfecto, está bien redactado, y manda a la farmacéutica a tocar un control que no achica nada
mientras la impresión sigue bloqueada. No hay error, no hay nada torcido en pantalla.

Los casos: ninguna truncada devuelve `null`; las **cuatro ramas** del consejo; y la enumeración con
una fuente y con dos (que es donde se ve si el "y" está puesto).

El aviso en pantalla se verifica **mirando**, no con tests: falla de manera visible.

## Fuera de alcance, a propósito

- **No se toca `TECHO_FILAS`.** El número (5.000) no está en discusión acá.
- **No se toca `invariantes()`** ni la línea de consistencia: son otra cosa —que los agregados
  cierren entre sí— y no tienen relación con el techo.
- **No se declara por hoja qué consulta usa** (D1). Si algún día se quiere, la función de este
  diseño es el lugar natural para colgarlo.
- **No se toca la base.** Sin migración.
