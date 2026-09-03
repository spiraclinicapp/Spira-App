# Plan — Resumen de Coordinación: ámbito personal ("Lo mío" / "Todo")

Origen: conversación con el Director del **2026-09-01**. El pedido entró como un cambio de rótulo
—"«Resumen» no me cierra, algo tipo «Mi día»"— y salió convertido en otra cosa: **el rótulo se
queda como está y lo que se construye es el filtro que ese nombre prometía.**

Sin handoff de diseño. La pantalla es `src/views/TrackResumenView.tsx`, ya rediseñada por
[`plan-resumen-coordinacion-enfoque.md`](plan-resumen-coordinacion-enfoque.md) (release v0.50.0).

---

## El hallazgo que dio vuelta el pedido

**La pantalla YA es personal, y ninguna palabra en ella lo dice.** Las cuatro fuentes del Resumen
están scopeadas por RLS del lado del servidor, en silencio:

| Fuente | Policy | Efecto |
|---|---|---|
| `protocols` | `0006:92` — "ver protocolos asignados" | ves los que coordinás |
| `patients` | `0006:128` — "ver pacientes de mis protocolos" | los de esos protocolos |
| `v_protocol_report_status` | RLS de las tablas de abajo (`security_invoker`) | los reportes de esos protocolos |
| `dispensation_requests` | `0006:252` — o `pharma`/`gerencia`, o `coordina_visita()` | las solicitudes de esas visitas |

Está escrito textual en el código, y en los dos lugares se señala como algo que el copy debería
asumir y no asume:

> *"NO HACE FALTA FILTRAR POR PERMISO acá: la RLS ya scopea la vista por protocolo coordinado, en
> silencio y del lado del servidor. Quien coordina dos estudios ve los reportes de esos dos;
> gerencia los ve todos."* — `src/data/reportStatus.ts:158`

> *"la misma tarjeta cuenta cosas distintas según quién mire, sin error ni aviso. El copy de la
> tarjeta tiene que ser honesto con eso."* — `src/data/pharma/dispensations.ts:744`

O sea que el "si lo abre un ajeno ve todo, si lo abre un coordinador ve lo suyo" que pidió el
Director **ya ocurre hoy**, al nivel de protocolo. Lo que falta es (a) hacerlo visible y (b)
estrecharlo de *"mis protocolos"* a *"lo que yo hice"*, que es más fino y es lo que se pidió.

Corolario para el QA: la cuenta de prueba tiene los cinco módulos, así que **no reproduce ninguno de
estos scopeos**. Verificar esto exige una cuenta sólo de Coordinación, asignada a un subconjunto de
protocolos. (Es el mismo muro que ya advierten la 0090 y `dispensations.ts`.)

---

## Decisiones

**D1 · El rótulo NO cambia.** Sigue siendo **Resumen**, con su `hint` "Cómo viene el día". Con el
alternador puesto, "Resumen" es literal: resume lo tuyo. Y no cambiarlo evita tocar breadcrumbs, el
buscador (`searchIndex.ts`), las rutas guardadas y el `volver: 'Volver al resumen'` de
`TrackResumenView.tsx:473`. Se descartaron "Mi día", "A mi cargo", "Mi trabajo" y "Mis pendientes".

**D2 · "Mío" se define distinto en cada tarjeta**, porque en la base hay tres cosas distintas que
se le parecen y sólo una sirve en cada lugar:

- `patient_visits.coordinator_id` es **retrospectivo**: lo pisa `start_visit_attention` (RPC de la
  0102) con quien apretó "iniciar atención". Registra **quién atendió**, no a quién le toca. Una
  visita futura lo tiene en `null`.
- `protocol_coordinators` es **prospectivo y estable**: dice qué te toca, incluso lo que no pasó
  todavía. Ya expuesto por `useMyCoordinations(userId)` (`src/data/protocols.ts:90`).
- `dispensation_requests.requested_by` es **autoría**: quién pidió la medicación.

Usar `coordinator_id` para "Próximas visitas" dejaría esa tarjeta **vacía siempre**, porque el campo
recién se llena cuando la visita se atiende. Por eso cada tarjeta usa el suyo:

| Tarjeta | "Mío" significa | Campo |
|---|---|---|
| Reportes pendientes | visitas que **yo atendí** | `coordinator_id` de la visita |
| Alertas | visitas que **yo atendí** | `TrackVisitRow.coordinator_id` |
| Próximas visitas | **mis protocolos** | `protocol_id` ∈ `useMyCoordinations()` |
| Dispensaciones solicitadas | las que **yo pedí** | `requested_by` |

**D3 · Un alternador de dos estados: "Lo mío" (por defecto) / "Todo".**

Se evaluó el filtro duro sin escape y se descartó por un riesgo concreto: estrechar reportes y
alertas de *"mi protocolo"* a *"lo que yo atendí"* es **más angosto que lo de hoy** y esconde el
trabajo del compañero. Dos coordinadoras en un protocolo; Ana atiende una visita, no carga el
reporte, se va de licencia. Con filtro duro **María deja de ver ese pendiente** — hoy lo ve. El
reporte vence sin aparecer en la pantalla de nadie que esté trabajando.

El segundo estado se llama **"Todo"** y no "Mi protocolo" (que fue como se discutió) por una razón
de honestidad: el comportamiento es idéntico —muestra lo que la RLS ya te deja ver, ni un dato
más— pero "Mi protocolo" es mentira para gerencia, que no coordina ninguno y ve el centro entero.
"Todo" es literal para los dos y evita una rama de copy por rol.

**D4 · El alternador manda sobre TODA la pantalla, KPIs incluidos.** Si sólo tocara las tarjetas,
el KPI diría 7 y su tarjeta listaría 3. Un número y su lista tienen que contar lo mismo.

Los KPIs *Protocolos activos* y *Pacientes activos* no necesitan trabajo: **ya salen scopeados por
RLS**, y no tienen versión "lo que yo atendí" — un protocolo no se atiende. En modo "Lo mío" se
quedan como están.

**D5 · Quien no coordina ningún protocolo no ve el alternador**, y la pantalla queda exactamente
como hoy. Detección automática: `useMyCoordinations()` devuelve cero filas. Sin rol nuevo y sin
configuración — gerencia y farmacia entran a la pantalla de siempre, sin un "Lo mío" vacío que no
significa nada para ellos.

**D6 · El filtrado va en el FRONT**, sobre arrays que ya están en memoria. Las cuatro consultas ya
traen las filas; el alternador no agrega ni una consulta y cambia sin ida al servidor. La RLS ya
acotó el conjunto antes de que llegue, así que el volumen es el de hoy (decenas de filas).

**D7 · El estado va en la URL**: `?ambito=todo`, vía `useUrlState('ambito', 'mio')` con
`mode: 'replace'` (el default). Es lo que ya hacen los filtros de la casa, y el comentario de
`useUrlState` fija el criterio: *"los filtros, la búsqueda y el día no son navegación, y si
apilaran, salir de Visitas del día después de un rato trabajando serían quince «atrás»"*.

**D8 · Los vacíos dicen por qué.** Cuando "Lo mío" da cero en una tarjeta, el vacío nombra el motivo
("No atendiste visitas con reportes pendientes") y ofrece el salto a "Todo". Un vacío mudo acá se
lee como "no hay nada que hacer", que puede ser lo contrario de lo que está pasando.

**D9 · Las reglas de pertenencia salen a un módulo propio con test:**
`src/views/resumen/ambito.ts` + `ambito.test.ts`. Es exactamente el criterio de la casa —lo que
falla **en silencio**— y tiene precedente literal en `src/views/alertFilters.ts`, cuyo comentario de
cabecera dice: *"ES PURA Y TIENE TEST porque su modo de falla es el peor de un filtro: esconde filas
sin decirlo."* Si una de las cuatro reglas queda invertida, la pantalla se dibuja impecable y te
muestra lo ajeno.

**D10 · Una migración, la 0104, aditiva → migración PRIMERO, front después.** Ver abajo.

---

## Lo que YA existe (y no se reimplementa)

- `useMyCoordinations(userId)` — `src/data/protocols.ts:90`. Ya la usa Visitas del día.
- `TrackVisitRow.coordinator_id` / `coordinator_name` — los emite `v_track_visits` **desde la
  0065**. Cubre Alertas y Próximas visitas sin tocar la base.
  (⚠️ `plan-resumen-coordinacion-enfoque.md` afirma que falta; está desactualizado. Y no alcanza con
  mirar el `interface`: en este repo **los tipos son a mano**, así que la prueba es el `.sql`.)
- `dispensation_requests.requested_by` — existe en la tabla; lo usa la propia policy de INSERT
  (`0006:257`). Sólo falta agregarlo a `SOLICITUD_PENDIENTE_COLS`.
- `useUrlState` — `src/lib/useUrlState.ts:112`, con codec de string por default.
- `useAuth().profile.id` — el uuid del usuario.
- El patrón de filtros puros con test: `src/views/alertFilters.ts` + `alertFilters.test.ts`.

---

## Migración 0104 — coordinador en el estado de reportes

**Qué hace:** agrega `pv.coordinator_id` y `pv.coordinator_name` **al final** de
`v_protocol_report_status` (0090). Es lo único que la base no puede dar hoy.

**Por qué se puede con `create or replace` (sin `drop`):** el select de la 0090 tiene **columnas
explícitas, sin ningún `*` re-expandido**, así que las nuevas van al final sin correr el orden —
el único cambio que `replace` acepta. Es lo que impidió hacerlo así en la 0102 y lo que sí permitió
la 0103. Evitar el `drop` importa: no deja ninguna ventana con la vista inexistente y **no pierde
los grants**.

**⚠️ El `with (security_invoker = true)` se repite SIEMPRE.** Es lo que hace que la RLS filtre por
usuario; una vista sin eso corre con los permisos de su dueño y **todos verían los reportes de todos
los protocolos**. En una app auditada eso es una fuga, y es del tipo que no se ve mirando la
pantalla: se ve *más* dato, no menos. La 0103 lo repite explícitamente — copiar ese molde.

**`patient_visits` ya está joineada como `pv`**: no se agrega ningún join, sólo se proyectan dos
columnas que ya están ahí. No se crea ni se backfillea nada. Una visita sin coordinador devuelve
`null`, que es la verdad.

**Quién más lee esta vista** (verificado, igual que hizo la 0103 antes de tocar la suya): sólo el
front, con `select('*')` en tres puntos de `src/data/reportStatus.ts` (`:92`, `:110`, `:179`).
**Ninguna otra vista ni función SQL cuelga de ella.** Recibir dos campos de más es inofensivo: el
tipo de TypeScript no los declara hasta que el front nuevo los use.

**Orden de despliegue: la migración va PRIMERO.** Es puramente aditiva —ningún front desplegado
pide esas columnas—, así que el que no funciona sin ella es el código nuevo. Es el caso descripto en
`CLAUDE.md`: el orden no se decide por "agrega o quita" sino por si el cambio altera lo que el front
**ya** pide. Acá no altera nada.

Registrar en el índice de `supabase/README.md` apenas el Director confirme "aplicada"
(`scripts/check-migraciones.mjs` lo vigila en CI).

---

## Trabajo de front

1. **`src/views/resumen/ambito.ts`** — el tipo `Ambito = 'mio' | 'todo'` y las cuatro reglas puras,
   cada una pidiendo sólo los campos que necesita (mismo criterio que `Buscable` en
   `alertFilters.ts`: si pidieran la fila entera habría que escribirlas dos veces, y la segunda
   copia sería la que se olvide de un campo).
2. **`ambito.test.ts`** — las cuatro reglas, con el caso `null` explícito en cada una (visita sin
   coordinador asignado, solicitud sin autor). Un `null` que se cuela como "mío" es justo la falla
   silenciosa que el test existe para atajar.
3. **`TrackResumenView.tsx`** — el alternador, el `useUrlState`, y aplicar las reglas a las cuatro
   listas y a los dos KPIs derivados. El realce del control, por **elevación** (`.spira-card-link` y
   los tokens `--spira-shadow-sm/md`), nunca borde de color: el color se reserva para significado.
4. **`src/data/pharma/dispensations.ts`** — sumar `requested_by` a `SOLICITUD_PENDIENTE_COLS` y a
   `SolicitudPendienteRow`. **No tocar el `medication:medications!medication_id(name)`**: sin ese
   `!medication_id` el embed queda ambiguo y PostgREST voltea la consulta entera (PGRST201) — es lo
   que tiró el tablero de Farmacia el 2026-08-13.
5. **`src/data/reportStatus.ts`** — declarar las dos columnas nuevas en `ReportStatusRow`, citando
   la 0104 en el comentario (convención de la casa).
6. **Vacíos por tarjeta** (D8), con la salida a "Todo".
7. **`src/lib/version.ts`** — entrada de novedades.

---

## Fuera de alcance

- **Renombrar el submódulo.** D1. Queda "Resumen".
- **El choque de los dos "Resumen"** — Inicio › Resumen (la home) y Coordinación › Resumen siguen
  llamándose igual en la navegación. Era la mitad de la molestia original y este plan **no lo
  resuelve**. Si algún día molesta, el que conviene renombrar es el de Inicio, que podría llamarse
  simplemente "Inicio". Anotado a propósito y con fecha: una postergación sin vencimiento es
  indistinguible de un olvido.
- **Filtrar del lado del servidor.** D6. Si algún día el volumen lo pide, la regla ya está aislada
  en `ambito.ts` y se puede empujar a la consulta sin tocar la vista.
- **Recordar la preferencia entre sesiones.** La URL alcanza; un `localStorage` es estado nuevo que
  todavía nadie pidió.
- **"Tareas personales"** y todo lo demás que el handoff de enfoque dejó afuera por no tener base.

---

## Riesgos

- **El pozo ciego** (D3) queda mitigado por el alternador, no eliminado: alguien que nunca toque
  "Todo" no ve el pendiente de su compañero desde esta pantalla. La vista de **Alertas** sigue
  mostrando todo el protocolo y es la red de contención. Vale revisarlo después de unas semanas de
  uso real.
- **El QA no reproduce el scopeo** con la cuenta de los cinco módulos. Sin una cuenta acotada, esta
  feature se "verifica" mostrando siempre todo y pareciendo correcta.
- **`coordinator_id` se pisa en cada inicio de atención** (0102, decisión del 2026-08-29). Si dos
  personas inician la atención de la misma visita, la última gana y la primera pierde esa fila de su
  "Lo mío". Es el comportamiento definido de ese campo, no un defecto de este plan, pero conviene
  tenerlo escrito.
