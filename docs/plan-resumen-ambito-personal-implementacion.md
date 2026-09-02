# Resumen de Coordinación · ámbito personal — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development`
> (recomendada) o `superpowers:executing-plans` para ejecutar tarea por tarea. Los pasos usan
> checkbox (`- [ ]`) para el seguimiento.

**Objetivo:** que el Resumen de Coordinación abra mostrando **lo que a cada quien le toca**, con un
alternador **"Lo mío" / "Todo"** que filtra las cuatro tarjetas y los dos KPIs derivados.

**Enfoque:** las reglas de pertenencia salen a un módulo **puro y testeado**
(`src/views/resumen/ambito.ts`); la vista las aplica en **un solo punto por fuente** —las cinco
variables derivadas que ya existen en `TrackResumenView`— y el estado del alternador vive en la URL.
Una única migración aditiva agrega el campo que falta.

**Stack:** React 18 + TypeScript strict, Vite, Vitest, Supabase (PostgREST + RLS). Sin
react-router, sin react-query, sin Tailwind.

**Spec:** [`plan-resumen-ambito-personal.md`](plan-resumen-ambito-personal.md) — las decisiones se
citan como D1…D10.

---

## Restricciones globales

- **Comandos:** `npm run typecheck`, `npm run test`, `npm run build` (el gate = build verde +
  verificar en el navegador).
- **Idioma:** comentarios, nombres de dominio y copy de UI en **castellano rioplatense**. Comentarios
  densos y explicativos (el porqué, no el qué), igualando la densidad del código existente.
- **Realce = elevación**, nunca borde de color; nunca desde `onMouseEnter`.
- **Tipos a mano**, con comentario citando la migración que introdujo cada columna.
- **Migraciones inmutables y numeradas**: la 0104 es un archivo nuevo; no se edita ni renumera nada.
- **El working copy es COMPARTIDO**: verificar la rama antes de cada commit y stagear **por ruta**
  (`git add <archivos>`), nunca `git add -A`.
- **No se commitea en `main`** (hay hook). Trabajar en la rama de la feature.

## Orden de despliegue (D10)

La 0104 es **puramente aditiva** —ningún front desplegado pide esas columnas—, así que va
**migración PRIMERO, front después**. El que no funciona sin ella es el código nuevo.

Concretamente: la Tarea 2 entrega el `.sql` y **hay que avisarle al Director en el chat** que lo
aplique antes de mergear el front. (Un aviso dentro del `.sql` llega tarde: para cuando se lee, ya se
abrió el archivo para correrlo.)

## Antes de empezar

```bash
git fetch origin && git status --short
git checkout -b feat/resumen-ambito-personal
```

`git fetch` primero porque el Director mergea PRs mientras se trabaja y las refs locales quedan
viejas. Si el árbol trae cambios ajenos, **no tocarlos**: se stagea por ruta y punto.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/views/resumen/ambito.ts` | **Crear.** El tipo `Ambito` y las tres reglas puras de pertenencia + el aplicador. |
| `src/views/resumen/ambito.test.ts` | **Crear.** Los casos que fallan en silencio (sobre todo los `null`). |
| `supabase/migrations/0104_coordinador_en_estado_de_reportes.sql` | **Crear.** `coordinator_id`/`coordinator_name` al final de `v_protocol_report_status`. |
| `src/data/reportStatus.ts` | **Modificar.** Declarar las dos columnas nuevas en `ReportStatusRow`. |
| `src/data/pharma/dispensations.ts` | **Modificar.** `requested_by` al select y al tipo. |
| `src/views/TrackResumenView.tsx` | **Modificar.** El alternador, el `useUrlState` y el filtrado de las cinco fuentes. |
| `src/lib/version.ts` | **Modificar.** Entrada de novedades. |

---

## Tarea 1 · Las reglas de pertenencia (puras, con test)

**Archivos:**
- Crear: `src/views/resumen/ambito.ts`
- Crear (test): `src/views/resumen/ambito.test.ts`

**Interfaces:**
- Consume: nada (módulo hoja, sin imports del proyecto).
- Produce: `const AMBITOS = ['mio', 'todo'] as const` y `type Ambito = (typeof AMBITOS)[number]`;
  `loAtendiYo(fila: ConCoordinador, userId: string | null): boolean`,
  `esDeMisProtocolos(fila: ConProtocolo, misProtocolos: Set<string>): boolean`,
  `loPediYo(fila: ConAutor, userId: string | null): boolean` y
  `filtrarPorAmbito<T>(ambito: Ambito, filas: T[], esMia: (fila: T) => boolean): T[]`.
  Las tareas 3 y 4 dependen de estos nombres exactos.

> **Por qué esto va primero y con test:** es el criterio de la casa —se testea lo que puede fallar
> **en silencio**—. Si una regla queda invertida, la pantalla se dibuja impecable y te muestra lo
> ajeno. El precedente literal es `src/views/alertFilters.ts`, cuyo comentario dice: *"ES PURA Y
> TIENE TEST porque su modo de falla es el peor de un filtro: esconde filas sin decirlo."*

- [ ] **Paso 1: Escribir el test que falla**

Crear `src/views/resumen/ambito.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { esDeMisProtocolos, filtrarPorAmbito, loAtendiYo, loPediYo } from './ambito'

/**
 * Las reglas de "¿esta fila es mía?" del Resumen de Coordinación.
 *
 * SON PURAS Y TIENEN TEST por el mismo motivo que las de `alertFilters`: su modo de falla es
 * esconder filas sin decirlo. Una regla invertida no rompe nada visible — la pantalla se dibuja
 * perfecta y te muestra el trabajo de otro, o te esconde el tuyo.
 *
 * EL CASO QUE MÁS IMPORTA ES EL `null`, y por eso está en las tres. Dos nulls comparados con `===`
 * dan `true`: si la sesión todavía no resolvió (`userId === null`) y la visita no tiene coordinador
 * asignado (`coordinator_id === null`), una comparación ingenua declara TODAS esas filas "mías". El
 * resultado sería una pantalla llena de trabajo ajeno, en el primer render y sin ningún error.
 */

const UID = '11111111-1111-1111-1111-111111111111'
const OTRO = '22222222-2222-2222-2222-222222222222'

describe('loAtendiYo', () => {
  it('es mía cuando la atendí yo', () => {
    expect(loAtendiYo({ coordinator_id: UID }, UID)).toBe(true)
  })

  it('no es mía cuando la atendió otro', () => {
    expect(loAtendiYo({ coordinator_id: OTRO }, UID)).toBe(false)
  })

  it('una visita SIN coordinador no es de nadie', () => {
    expect(loAtendiYo({ coordinator_id: null }, UID)).toBe(false)
  })

  it('sin sesión resuelta no reclama nada', () => {
    // El caso null === null. Sin la guarda, esto devuelve true y llena la pantalla de trabajo ajeno.
    expect(loAtendiYo({ coordinator_id: null }, null)).toBe(false)
    expect(loAtendiYo({ coordinator_id: UID }, null)).toBe(false)
  })
})

describe('esDeMisProtocolos', () => {
  it('es mía cuando coordino ese protocolo', () => {
    expect(esDeMisProtocolos({ protocol_id: 'p1' }, new Set(['p1', 'p2']))).toBe(true)
  })

  it('no es mía cuando el protocolo es de otro', () => {
    expect(esDeMisProtocolos({ protocol_id: 'p9' }, new Set(['p1', 'p2']))).toBe(false)
  })

  it('sin coordinaciones no reclama nada', () => {
    // Importa porque `useMyCoordinations` devuelve [] mientras carga: durante ese render no puede
    // "adoptar" filas que después va a soltar.
    expect(esDeMisProtocolos({ protocol_id: 'p1' }, new Set())).toBe(false)
  })
})

describe('loPediYo', () => {
  it('es mía cuando la pedí yo', () => {
    expect(loPediYo({ requested_by: UID }, UID)).toBe(true)
  })

  it('no es mía cuando la pidió otro', () => {
    expect(loPediYo({ requested_by: OTRO }, UID)).toBe(false)
  })

  it('sin autor, o sin sesión, no es de nadie', () => {
    expect(loPediYo({ requested_by: null }, UID)).toBe(false)
    expect(loPediYo({ requested_by: null }, null)).toBe(false)
  })
})

describe('filtrarPorAmbito', () => {
  const filas = [{ coordinator_id: UID }, { coordinator_id: OTRO }, { coordinator_id: null }]

  it('en "todo" no filtra nada', () => {
    // El vacío del otro lado: "todo" tiene que devolver TODAS, nunca ninguna.
    expect(filtrarPorAmbito('todo', filas, (f) => loAtendiYo(f, UID))).toHaveLength(3)
  })

  it('en "mio" deja sólo las mías', () => {
    const r = filtrarPorAmbito('mio', filas, (f) => loAtendiYo(f, UID))
    expect(r).toEqual([{ coordinator_id: UID }])
  })

  it('no muta el arreglo original', () => {
    filtrarPorAmbito('mio', filas, (f) => loAtendiYo(f, UID))
    expect(filas).toHaveLength(3)
  })
})
```

- [ ] **Paso 2: Correr el test y verificar que falla**

```bash
npx vitest run src/views/resumen/ambito.test.ts
```

Esperado: **FAIL** — `Failed to resolve import "./ambito"`.

- [ ] **Paso 3: Escribir la implementación mínima**

Crear `src/views/resumen/ambito.ts`:

```ts
/**
 * ┌─ "¿Esta fila es mía?" — las reglas del alternador del Resumen de Coordinación ──────────────┐
 *
 * El Resumen abre filtrado a lo de cada quien ("Lo mío") y un alternador lo abre a todo lo que la
 * RLS deje ver ("Todo"). Estas son las reglas que deciden lo primero.
 *
 * POR QUÉ VIVEN ACÁ Y NO EN LA VISTA: son el punto donde este cambio puede fallar sin que se note.
 * Una regla invertida no tira ningún error — dibuja la pantalla entera, prolija, con las filas
 * equivocadas. Aisladas y puras se pueden testear; adentro de un `.filter()` en medio del JSX, no.
 *
 * HAY TRES Y NO UNA porque en la base hay tres cosas distintas que se parecen a "mío", y usar la
 * que no va rompe en silencio (spec, D2):
 *
 *   · `coordinator_id` (patient_visits) es RETROSPECTIVO: lo pisa `start_visit_attention` (0102)
 *     con quien apretó "iniciar atención". Dice quién ATENDIÓ, no a quién le toca. Una visita
 *     futura lo tiene en null — por eso NO sirve para "Próximas visitas", que quedaría vacía
 *     siempre.
 *   · `protocol_coordinators` es PROSPECTIVO y estable: qué te toca, incluso lo que no pasó.
 *   · `requested_by` (dispensation_requests) es AUTORÍA: quién pidió la medicación.
 *
 * CADA REGLA PIDE SÓLO EL CAMPO QUE MIRA, y no la fila entera: así una misma regla sirve para las
 * dos listas que comparten campo (alertas y reportes miran las dos `coordinator_id`) sin tener que
 * escribirla dos veces — y la segunda copia sería la que se olvide de un caso. Mismo criterio que
 * `Buscable` en `alertFilters.ts`.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * "Lo mío" (lo que me toca) o "Todo" (todo lo que la RLS me deja ver). Va en la URL: `?ambito=`.
 *
 * LA LISTA SE EXPORTA ADEMÁS DEL TIPO porque el codec `oneOf` de `lib/router` la necesita en
 * runtime para rechazar un `?ambito=inventado`. Derivar el tipo DE la lista —en vez de escribir los
 * dos a mano— es lo que evita que se separen el día que aparezca un tercer ámbito.
 */
export const AMBITOS = ['mio', 'todo'] as const
export type Ambito = (typeof AMBITOS)[number]

/** Una fila que sabe quién atendió su visita (`v_track_visits` 0065, `v_protocol_report_status` 0104). */
export interface ConCoordinador {
  coordinator_id: string | null
}

/** Una fila que sabe a qué protocolo pertenece. */
export interface ConProtocolo {
  protocol_id: string
}

/** Una fila que sabe quién la pidió (`dispensation_requests.requested_by`, 0006). */
export interface ConAutor {
  requested_by: string | null
}

/**
 * La atendí yo.
 *
 * LA GUARDA DEL `userId` NULO NO ES DEFENSIVA, ES EL BUG: sin ella, `null === null` declara MÍAS a
 * todas las visitas sin coordinador asignado durante el render en que la sesión todavía no resolvió.
 * La pantalla se llenaría de trabajo ajeno sin un solo error en consola.
 */
export function loAtendiYo(fila: ConCoordinador, userId: string | null): boolean {
  if (!userId) return false
  return fila.coordinator_id === userId
}

/**
 * Es de un protocolo que coordino.
 *
 * Recibe un `Set` y no un arreglo porque la vista lo evalúa una vez por fila de cuatro listas; con
 * un `includes` eso es cuadrático sin necesidad. El `Set` vacío —que es lo que hay mientras
 * `useMyCoordinations` carga— no reclama nada, que es la respuesta correcta: adoptar filas para
 * soltarlas en el render siguiente haría parpadear la lista.
 */
export function esDeMisProtocolos(fila: ConProtocolo, misProtocolos: Set<string>): boolean {
  return misProtocolos.has(fila.protocol_id)
}

/** La pedí yo. Misma guarda del nulo que `loAtendiYo`, y por el mismo motivo. */
export function loPediYo(fila: ConAutor, userId: string | null): boolean {
  if (!userId) return false
  return fila.requested_by === userId
}

/**
 * Aplica el ámbito a una lista. En "todo" devuelve TODAS —nunca ninguna—, que es el error clásico
 * del otro lado y el que vacía una pantalla sin decir por qué.
 */
export function filtrarPorAmbito<T>(ambito: Ambito, filas: T[], esMia: (fila: T) => boolean): T[] {
  return ambito === 'todo' ? filas : filas.filter(esMia)
}
```

- [ ] **Paso 4: Correr el test y verificar que pasa**

```bash
npx vitest run src/views/resumen/ambito.test.ts
```

Esperado: **PASS**, 12 tests.

- [ ] **Paso 5: Typecheck**

```bash
npm run typecheck
```

Esperado: sin salida (éxito).

- [ ] **Paso 6: Commit**

```bash
git add src/views/resumen/ambito.ts src/views/resumen/ambito.test.ts
git commit -m "feat(resumen): las reglas puras de 'esta fila es mia', con test"
```

---

## Tarea 2 · La migración 0104 y los tipos de datos

**Archivos:**
- Crear: `supabase/migrations/0104_coordinador_en_estado_de_reportes.sql`
- Modificar: `src/data/reportStatus.ts` (interface `ReportStatusRow`, después de la línea 60)
- Modificar: `src/data/pharma/dispensations.ts` (`SolicitudPendienteRow` y `SOLICITUD_PENDIENTE_COLS`)

**Interfaces:**
- Consume: nada de la Tarea 1.
- Produce: `ReportStatusRow.coordinator_id: string | null` y
  `SolicitudPendienteRow.requested_by: string | null`. La Tarea 3 los usa.

> **Esta tarea entrega SQL para correr a mano.** No hay acceso directo a prod: el Director lo aplica
> en el dashboard de Supabase. Tiene que correr **tal cual**, sin placeholders.

- [ ] **Paso 1: Escribir la migración**

Crear `supabase/migrations/0104_coordinador_en_estado_de_reportes.sql`:

```sql
-- ============================================================================
-- 0104 · Coordinador en el estado de reportes
--
-- QUÉ HACE: agrega dos columnas al final de `v_protocol_report_status` (0090)
--   · coordinator_id
--   · coordinator_name
--
-- PARA QUÉ: el Resumen de Coordinación pasa a abrir filtrado a lo de cada quien ("Lo mío"), y para
-- la tarjeta de Reportes pendientes "mío" significa las visitas que YO atendí. Las otras tres
-- tarjetas ya pueden decidirlo solas: las alertas y las próximas visitas salen de `v_track_visits`,
-- que expone el coordinador desde la 0065, y las dispensaciones tienen `requested_by` en su tabla.
-- Ésta era la única fuente sin el dato.
--
-- DE DÓNDE SALEN LOS DATOS: las dos columnas ya viven en `patient_visits` (0065) y la vista ya tiene
-- esa tabla joineada como `pv`. No se crea ni se backfillea nada: esto sólo las PROYECTA. Una visita
-- sin coordinador asignado devuelve null, que es la verdad — el front lo trata como "de nadie" y
-- nunca como "mía" (ver `views/resumen/ambito.ts`).
--
-- CREATE OR REPLACE Y NO DROP + CREATE: el select de la 0090 tiene las columnas EXPLÍCITAS, sin
-- ningún `*` re-expandido, así que las dos nuevas van al final sin correr el orden anterior — que es
-- el único cambio que `replace` acepta. (Es lo que obligó a la 0102 a hacer drop+create y lo que la
-- 0103 sí pudo evitar.) Se prefiere porque no deja ninguna ventana con la vista inexistente y porque
-- `replace` no pierde los grants, cosa que un drop sí haría.
--
-- EL `with (security_invoker = true)` SE REPITE, Y NO ES DECORATIVO: es lo que hace que la RLS de
-- las tablas de abajo filtre por usuario. Una vista sin eso corre con los permisos de su dueño, y
-- entonces CUALQUIERA vería los reportes de TODOS los protocolos. Esa fuga no se ve mirando la
-- pantalla, porque se ve MÁS dato y no menos.
--
-- QUÉ MÁS LEE ESTA VISTA, verificado antes de tocarla:
--   · el front, con `select('*')` en tres puntos de `src/data/reportStatus.ts` (:92, :110, :179) —
--     recibir dos campos de más es inofensivo: el tipo de TypeScript no los declara hasta usarlos;
--   · ninguna otra vista ni función SQL cuelga de ella.
--
-- ORDEN DE DESPLIEGUE: ADITIVA → esta migración va PRIMERO y el front después. Ningún front
-- desplegado pide estas columnas, así que el que no funciona sin ella es el código nuevo.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0103. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

create or replace view public.v_protocol_report_status with (security_invoker = true) as
select
  pv.id as visit_id,
  rd.id                as report_definition_id,
  rd.name              as report_name,
  rd.platform,
  rd.link,
  rd.eta_hours,
  rd.notes,
  rd.sort_order,
  pa.procedure_id,
  p.name               as procedure_name,
  p.code               as procedure_code,
  p.category           as procedure_category,
  pa.suggested_order   as procedure_order,
  vpc.completed_at,
  (vpc.id is not null)                                as completed,
  (pv.real_date is not null or vpc.id is not null)    as visita_iniciada,
  case when rd.eta_hours is null or vpc.completed_at is null then null
       else vpc.completed_at + (rd.eta_hours * interval '1 hour') end as due_at,
  coalesce(rs.stage, 'pendiente') as stage,
  rs.id                as report_status_id,
  rs.updated_at,
  rs.updated_by_name,
  e.protocol_id,
  e.patient_id,
  pv.visit_def_id,
  pr.code              as protocol_code,
  pac.code             as patient_code,
  pac.full_name        as patient_name,
  vd.code              as visit_code,
  vd.name              as visit_name,
  vd.sort_order        as visit_sort_order,
  (select count(*) from public.report_status_history h where h.report_status_id = rs.id) as history_count,
  -- ── 0104: las dos nuevas, al final para no alterar el orden anterior ──
  pv.coordinator_id,
  pv.coordinator_name
from public.patient_visits pv
join public.enrollments e             on e.id  = pv.enrollment_id
join public.protocol_activities pa    on pa.visit_def_id = pv.visit_def_id
join public.protocol_procedures pp    on pp.protocol_id = e.protocol_id and pp.procedure_id = pa.procedure_id
join public.report_definitions rd     on rd.protocol_procedure_id = pp.id
join public.procedures p              on p.id  = pa.procedure_id
join public.protocols pr              on pr.id = e.protocol_id
join public.patients pac              on pac.id = e.patient_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
left join public.visit_procedure_completions vpc
       on vpc.visit_id = pv.id and vpc.procedure_id = pa.procedure_id
left join public.report_status rs     on rs.visit_id = pv.id and rs.report_definition_id = rd.id;

comment on view public.v_protocol_report_status is
  'Una fila por reporte de una visita realizada: definición + etapa + vencimiento + paciente/visita desnormalizados. Alimenta el tablero de Reportes pendientes. 0090; ampliada por la 0104 con coordinator_id/coordinator_name, para que el Resumen pueda filtrar a "las visitas que yo atendí". La RLS sigue siendo la de las tablas de abajo (security_invoker).';

-- Los grants se repiten por prolijidad: `create or replace view` NO los pierde, pero un drop+create
-- sí, y este bloque tiene que seguir siendo correcto si algún día alguien lo convierte en uno.
revoke all on public.v_protocol_report_status from anon;
grant select on public.v_protocol_report_status to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_protocol_report_status from authenticated;
```

- [ ] **Paso 2: Verificar la paridad del dollar-quoting**

El editor SQL de Supabase rastrea el dollar-quoting **sin ignorar los comentarios**: un marcador
suelto invierte la paridad y parte el archivo por sus `;` internos, con un error desconcertante y
lejísimo del comentario culpable. Contar que la cantidad de marcadores en el texto crudo sea **par**
(acá tiene que dar **0**):

```bash
node -e "const s=require('fs').readFileSync('supabase/migrations/0104_coordinador_en_estado_de_reportes.sql','utf8');const m=s.match(/\\\$[A-Za-z_]*\\\$/g)||[];console.log('marcadores:',m.length, m.length%2===0?'OK (par)':'IMPAR — REVISAR')"
```

Esperado: `marcadores: 0 OK (par)`.

- [ ] **Paso 3: Declarar las columnas nuevas en `ReportStatusRow`**

En `src/data/reportStatus.ts`, dentro de `interface ReportStatusRow`, **después** de
`history_count: number` (línea 60):

```ts
  /** Quién ATENDIÓ la visita (0104; la columna es de `patient_visits`, 0065). `null` = sin
   *  coordinador asignado. Es retrospectivo: lo sella `start_visit_attention` (0102) con quien
   *  apretó "iniciar atención", así que dice quién la hizo y no a quién le toca. Lo usa el ámbito
   *  "Lo mío" del Resumen. */
  coordinator_id: string | null
  /** Nombre DESNORMALIZADO del coordinador (0104). La RLS de `users` sólo deja ver el perfil
   *  propio, así que joinear esa tabla habría devuelto null para todos los demás, en silencio. */
  coordinator_name: string | null
```

- [ ] **Paso 4: Sumar `requested_by` a las solicitudes**

En `src/data/pharma/dispensations.ts`, en `interface SolicitudPendienteRow`, después de
`visit_id: string | null`:

```ts
  /** Quién pidió la medicación (columna de la 0006; la usa su propia policy de INSERT). Lo usa el
   *  ámbito "Lo mío" del Resumen. `null` no debería ocurrir, pero el tipo lo admite: una fila sin
   *  autor no es de nadie, nunca "mía". */
  requested_by: string | null
```

Y en `SOLICITUD_PENDIENTE_COLS`, agregar el campo a la primera línea:

```ts
const SOLICITUD_PENDIENTE_COLS =
  'id, status, created_at, visit_id, requested_by, ' +
  'items:dispensation_request_items(medication:medications!medication_id(name)), ' +
  'enrollment:enrollments!enrollment_id(patient:patients(id, code, full_name)), ' +
  'protocol:protocols!protocol_id(id, code)'
```

> ⚠️ **No tocar el `medication:medications!medication_id(name)`.** Desde la 0076
> `dispensation_request_items` tiene DOS claves foráneas a `medications`; sin nombrar cuál, el embed
> queda ambiguo, PostgREST responde `PGRST201` y **voltea la consulta entera**. Es lo que tiró el
> tablero de Farmacia el 2026-08-13.

- [ ] **Paso 5: Typecheck y tests**

```bash
npm run typecheck && npx vitest run
```

Esperado: typecheck sin salida; los 598 tests existentes + los 12 de la Tarea 1 en verde.

- [ ] **Paso 6: Commit**

```bash
git add supabase/migrations/0104_coordinador_en_estado_de_reportes.sql src/data/reportStatus.ts src/data/pharma/dispensations.ts
git commit -m "feat(resumen): 0104 suma el coordinador al estado de reportes, y requested_by a las solicitudes"
```

- [ ] **Paso 7: Avisar en el CHAT que el SQL está listo**

Decirle al Director, **en el chat y no sólo en el archivo**, que la 0104 está lista y que es
**aditiva** (va antes del deploy del front). Cuando confirme "aplicada", registrarlo en el índice de
`supabase/README.md` con la fecha — CI lo vigila con `scripts/check-migraciones.mjs`.

---

## Tarea 3 · El alternador y el filtrado de la vista

**Archivos:**
- Modificar: `src/views/TrackResumenView.tsx`

**Interfaces:**
- Consume: `Ambito`, `loAtendiYo`, `esDeMisProtocolos`, `loPediYo`, `filtrarPorAmbito` (Tarea 1);
  `ReportStatusRow.coordinator_id` y `SolicitudPendienteRow.requested_by` (Tarea 2).
- Produce: la vista filtrada. Nada depende de ella.

> **El punto de inserción es único por fuente.** La vista ya deriva cinco variables de sus hooks
> (`allProtocols`, `allPatients`, `upcomingRows`, `alertRows`, `solicitudRows`) y todo lo demás
> —`groups`, los KPIs, las tarjetas— cuelga de ellas. Filtrando ahí, el resto se filtra solo.

- [ ] **Paso 1: Agregar los imports**

En el bloque de imports de `src/views/TrackResumenView.tsx`:

```ts
import { SegmentedControl } from '../components/SegmentedControl'
import { useAuth } from '../lib/auth'
import { useMyCoordinations } from '../data/protocols'
import { useUrlState } from '../lib/useUrlState'
import { oneOf } from '../lib/router'
import { AMBITOS, esDeMisProtocolos, filtrarPorAmbito, loAtendiYo, loPediYo } from './resumen/ambito'
import type { Ambito } from './resumen/ambito'
```

`useProtocols` ya se importa de `../data/protocols`: sumar `useMyCoordinations` a esa misma línea en
vez de agregar un import nuevo.

- [ ] **Paso 2: Resolver el usuario, sus coordinaciones y el ámbito**

En `TrackResumenView`, justo después de `const reportes = useReportesPendientes()` (línea 451):

```ts
  /* ┌─ El ámbito: "Lo mío" (por defecto) o "Todo" ────────────────────────────────────────────┐
     La pantalla YA venía filtrada por la RLS al nivel de protocolo, sin que ninguna palabra lo
     dijera (ver `data/reportStatus.ts` y `data/pharma/dispensations.ts`). Esto hace dos cosas: lo
     vuelve visible, y lo estrecha un paso más — de "mis protocolos" a "lo que yo hice".

     EL ALTERNADOR NO ES UN LUJO. Filtrar a "lo que yo atendí" es MÁS ANGOSTO que lo de hoy: si una
     compañera atendió una visita de mi protocolo, no cargó el reporte y se fue de licencia, sin
     escape ese pendiente no aparece en la pantalla de nadie. "Todo" es esa salida, y no expone ni
     un dato de más: muestra exactamente lo que la RLS ya deja ver.

     SE LLAMA "Todo" Y NO "Mi protocolo" porque para gerencia —que no coordina ninguno y ve el centro
     entero— lo segundo sería mentira. "Todo" es literal para los dos y evita una rama de copy por
     rol.

     VA EN LA URL con `mode: 'replace'` (el default): un filtro no es navegación, y si apilara,
     salir del Resumen después de un rato serían quince "atrás". Mismo criterio que el día y el
     buscador de Visitas del día.
     └──────────────────────────────────────────────────────────────────────────────────────────┘ */
  const { profile } = useAuth()
  const userId = profile?.id ?? null
  const coordinaciones = useMyCoordinations(userId)
  const [ambito, setAmbito] = useUrlState<Ambito>('ambito', 'mio', { codec: oneOf(AMBITOS) })

  const misProtocolos = useMemo(
    () => new Set((coordinaciones.data ?? []).map((c) => c.protocol_id)),
    [coordinaciones.data],
  )

  /* Quien no coordina NINGÚN protocolo (gerencia, farmacia) no ve el alternador y la pantalla le
     queda como siempre: para esa persona "Lo mío" no significa nada y sólo daría cuatro tarjetas
     vacías. Se deduce del dato, sin rol nuevo ni configuración.

     Mientras `useMyCoordinations` carga, `misProtocolos` está vacío — así que el alternador aparece
     recién cuando se sabe que hay coordinaciones, y no parpadea. */
  const esCoordinador = misProtocolos.size > 0
  const ambitoEfectivo: Ambito = esCoordinador ? ambito : 'todo'
```

Agregar `useMemo` al import de `react` (la línea 1 hoy importa sólo `useState`).

> **No se escribe ningún codec.** `lib/router.ts:224` ya exporta `oneOf<T>(valores)`, que es
> exactamente esto: *"cualquier valor fuera de la lista es inválido y cae al default"*. Sin él —o
> con el codec de string por default— un `?ambito=cualquiercosa` entraría **tipado como `Ambito`**
> sin pasar por ninguna validación, y filtraría la pantalla por un valor que nadie escribió; es el
> agujero que documenta el comentario de las dos sobrecargas de `useUrlState`.
>
> Y la URL limpia sale gratis: `writeParam` (`router.ts:272`) ya borra el parámetro cuando su
> `format` coincide con el del default, así que "Lo mío" no deja `?ambito=mio` colgado.

- [ ] **Paso 3: Filtrar las cinco fuentes**

Reemplazar el bloque de variables derivadas (hoy líneas ~480-486):

```ts
  const allProtocols = protocols.data ?? []
  const allPatients = patients.data ?? []
  const upcomingRows = upcoming.data ?? []
  const alertRows = alerts.visitAlerts
  const solicitudRows = solicitudes.data ?? []
```

por:

```ts
  /* Los KPIs de protocolos y pacientes NO se filtran, y no es un olvido: ya vienen scopeados por
     RLS (policies "ver protocolos asignados" 0006:92 y "ver pacientes de mis protocolos" 0006:128),
     y además un protocolo no se "atiende" — no tiene versión "lo que yo hice". */
  const allProtocols = protocols.data ?? []
  const allPatients = patients.data ?? []

  /* Las cuatro listas del mosaico, cada una con SU definición de "mío" (spec, D2). El ámbito manda
     sobre toda la pantalla —KPIs incluidos— porque un número y su lista tienen que contar lo mismo:
     si el KPI dijera 7 y la tarjeta listara 3, el que está mal es el que mira. */
  const upcomingRows = filtrarPorAmbito(ambitoEfectivo, upcoming.data ?? [], (v) =>
    esDeMisProtocolos(v, misProtocolos))
  const alertRows = filtrarPorAmbito(ambitoEfectivo, alerts.visitAlerts, (a) =>
    loAtendiYo(a, userId))
  const solicitudRows = filtrarPorAmbito(ambitoEfectivo, solicitudes.data ?? [], (s) =>
    loPediYo(s, userId))
  const reporteRows = filtrarPorAmbito(ambitoEfectivo, reportes.data ?? [], (r) =>
    loAtendiYo(r, userId))
```

> **Próximas visitas usa el protocolo y no `coordinator_id`**: ese campo se llena recién cuando la
> visita se atiende, así que filtrar por él dejaría la tarjeta **vacía siempre** (spec, D2).

- [ ] **Paso 4: Pasar los reportes ya filtrados a su tarjeta**

En la línea ~538, cambiar `rows={reportes.data ?? []}` por:

```tsx
            rows={reporteRows}
```

(`loading`, `error` y `onReintentar` siguen saliendo de `reportes`, sin cambios.)

- [ ] **Paso 5: Dibujar el alternador**

Arriba de la grilla de KPIs, dentro del `<div>` contenedor de la vista y antes del bloque
`{/* KPIs — ... */}`:

```tsx
      {/* El alternador sólo existe para quien coordina algo (ver `esCoordinador`). Se apoya en
          SegmentedControl, que ya resuelve el `role="radiogroup"` y el teclado; no se dibuja a mano
          para no repetir la accesibilidad. El realce del seleccionado es el del componente: borde y
          fondo teñidos con el acento del módulo, sin nada agregado desde un handler. */}
      {esCoordinador && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <SegmentedControl<Ambito>
            options={[{ value: 'mio', label: 'Lo mío' }, { value: 'todo', label: 'Todo' }]}
            value={ambito}
            onChange={setAmbito}
            accent={accent}
          />
        </div>
      )}
```

- [ ] **Paso 6: Typecheck y build**

```bash
npm run build
```

Esperado: typecheck + los tests en verde + build de producción sin errores.

- [ ] **Paso 7: Commit**

```bash
git add src/views/TrackResumenView.tsx
git commit -m "feat(resumen): el alternador Lo mio / Todo filtra las cuatro tarjetas y los KPIs"
```

---

## Tarea 4 · Los vacíos que dicen por qué (D8)

**Archivos:**
- Modificar: `src/views/TrackResumenView.tsx`

**Interfaces:**
- Consume: `ambitoEfectivo`, `setAmbito`, `esCoordinador` (Tarea 3).
- Produce: nada.

> **Por qué es su propia tarea:** un vacío mudo en esta pantalla se lee como "no hay nada que
> hacer", que puede ser exactamente lo contrario de lo que pasa. Es una decisión de honestidad, no
> cosmética, y merece su propio gate de revisión.

- [ ] **Paso 1: Escribir el aviso reusable**

A nivel de módulo en `TrackResumenView.tsx`, junto a las otras piezas:

```tsx
/**
 * El vacío de una tarjeta cuando el ámbito es "Lo mío".
 *
 * NO ES DECORACIÓN: sin esto, una tarjeta vacía dice "no hay nada que hacer", y acá puede
 * significar "no lo hiciste vos". La diferencia importa — del otro lado puede haber un reporte
 * venciendo. Por eso el texto nombra el motivo y ofrece la salida en el mismo lugar donde apareció
 * la duda, en vez de mandar a buscarla arriba.
 *
 * El botón es un `<button>` de verdad y no un span pulsable: es el único camino de teclado a "Todo"
 * desde acá, y mudarlo a un div lo dejaría sin foco sin que se note mirando la pantalla.
 */
function VacioDelAmbito({ texto, onVerTodo }: { texto: string; onVerTodo: () => void }) {
  return (
    <div style={{ padding: '14px 0 4px', fontSize: 13, color: 'var(--spira-muted)', lineHeight: 1.5 }}>
      {texto}{' '}
      <button
        type="button"
        onClick={onVerTodo}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          font: 'inherit', fontWeight: 700, color: 'var(--spira-acc-deep-track)',
          textDecoration: 'underline', textUnderlineOffset: 3,
        }}
      >
        Ver todo
      </button>
    </div>
  )
}
```

- [ ] **Paso 2: Darle a cada tarjeta una prop para su vacío**

Las cuatro tarjetas (`ReportesCard:257`, `AlertasCard:603`, `VisitasCard:694`,
`DispensacionesCard:757`) reciben sus filas por prop y resuelven el vacío adentro. Agregar a **cada
una** de las cuatro firmas la misma prop opcional:

```tsx
  /** Qué mostrar EN LUGAR del vacío propio. La tarjeta no sabe qué es un ámbito ni quién sos: sólo
   *  muestra lo que le den. Así el que decide es el único que tiene el dato para decidirlo —la
   *  vista— y no hay que pasarle a cuatro componentes un ámbito, un usuario y un setter. */
  vacioDelAmbito?: ReactNode
```

`ReactNode` ya está importado como tipo en la línea 2 del archivo.

Y en cada tarjeta, anteponer la prop al vacío que ya tiene, con `??` — cuatro cambios de una línea:

```tsx
// ReportesCard, línea ~299-301
      ) : pendientes.length === 0 ? (
        vacioDelAmbito ?? (
          <div style={vacioTexto}>
            {tarjetas.length === 0 ? 'Sin reportes en juego.' : 'Todos los reportes están cerrados.'}
          </div>
        )

// AlertasCard, línea ~623-625
      ) : rows.length === 0 ? (
        vacioDelAmbito ?? <div style={vacioTexto}>Sin alertas. Todo al día.</div>

// VisitasCard, línea ~717-719
      ) : groups.length === 0 ? (
        vacioDelAmbito ?? <div style={vacioTexto}>Sin visitas en los próximos 7 días.</div>

// DispensacionesCard, línea ~786-788
      ) : rows.length === 0 ? (
        vacioDelAmbito ?? <div style={vacioTexto}>Sin dispensaciones pendientes.</div>
```

> El `style` de cada vacío es el que ya tiene hoy — arriba está escrito como `vacioTexto` sólo para
> abreviar el diff. **No unificar esos estilos en esta tarea:** son cuatro tarjetas con paddings
> propios y tocarlos acá mezcla un cambio visual con uno de comportamiento.

- [ ] **Paso 3: Construir el vacío en la vista y pasarlo**

En `TrackResumenView`, después del bloque de filtrado (Tarea 3, paso 3):

```tsx
  /* El aviso sólo tiene sentido si hay algo del otro lado. Ofrecer "Ver todo" cuando "Todo" también
     está vacío manda a alguien a confirmar una nada — y en esta pantalla un viaje en falso cuesta
     confianza. Por eso se compara contra la lista SIN filtrar, que la vista ya tiene a mano.

     En ámbito "Todo" devuelve `undefined` y cada tarjeta cae a su vacío de siempre: ahí "no hay
     nada" es la verdad completa y no hay a dónde mandar a nadie. */
  const avisoDeAmbito = (texto: string, hayEnTodo: boolean) =>
    ambitoEfectivo === 'mio' && hayEnTodo
      ? <VacioDelAmbito texto={texto} onVerTodo={() => setAmbito('todo')} />
      : undefined
```

> Se llama `avisoDeAmbito` y no `vacioDelAmbito` a propósito: `vacioDelAmbito` es el nombre de la
> **prop**, y `vacioDelAmbito={vacioDelAmbito(...)}` compila pero se lee como un error.

Y pasarlo en las cuatro tarjetas, con el texto de cada una:

```tsx
  // ReportesCard
  vacioDelAmbito={avisoDeAmbito('No atendiste visitas con reportes pendientes.',
    (reportes.data ?? []).length > 0)}

  // AlertasCard
  vacioDelAmbito={avisoDeAmbito('Ninguna de tus visitas está en alerta.',
    alerts.visitAlerts.length > 0)}

  // VisitasCard
  vacioDelAmbito={avisoDeAmbito('No hay visitas próximas en tus protocolos.',
    (upcoming.data ?? []).length > 0)}

  // DispensacionesCard
  vacioDelAmbito={avisoDeAmbito('No pediste medicación que siga abierta.',
    (solicitudes.data ?? []).length > 0)}
```

- [ ] **Paso 4: Build**

```bash
npm run build
```

Esperado: verde.

- [ ] **Paso 5: Commit**

```bash
git add src/views/TrackResumenView.tsx
git commit -m "feat(resumen): los vacios de 'Lo mio' dicen por que, y ofrecen la salida a Todo"
```

---

## Tarea 5 · Novedades y verificación en el navegador

**Archivos:**
- Modificar: `src/lib/version.ts`

- [ ] **Paso 1: Agregar la entrada de novedades**

En `src/lib/version.ts`, en el arreglo de novedades y **arriba** de la entrada `'0.50'`, siguiendo el
formato y el tono de las que ya están (una oración por cambio, en castellano, contando qué ve el
usuario y no cómo se hizo):

```ts
    { version: '0.52', text: 'El Resumen de Coordinación abre mostrando lo tuyo: los reportes de las visitas que atendiste, tus alertas, la medicación que pediste y las visitas próximas de tus protocolos. Un alternador arriba a la derecha pasa a "Todo" cuando necesitás ver el panorama completo, y cuando una tarjeta queda vacía te dice por qué y te ofrece el salto. Si no coordinás protocolos, la pantalla no cambia.' },
```

> Ajustar el número de versión al que corresponda cuando se saque el release (lo maneja
> `scripts/release.mjs` vía la skill `cierre-jornada`).

- [ ] **Paso 2: Build completo**

```bash
npm run build
```

Esperado: typecheck + tests + build en verde.

- [ ] **Paso 3: Verificar en el preview**

Levantar el preview (puerto **5250**, fijado en `.claude/launch.json`; el 5173 suele estar ocupado
por el dev server del Director) y comprobar, **por snapshot/DOM y no por captura** —
`preview_screenshot` se cuelga casi siempre en este proyecto:

1. El alternador aparece con "Lo mío" seleccionado y `aria-checked="true"`.
2. Al pulsar "Todo", la URL suma `?ambito=todo` y **los KPIs derivados cambian junto con sus listas**
   (Pendientes vencidos y Próximas visitas). Que el número y su lista concuerden es el punto de D4.
3. Al volver a "Lo mío", la URL vuelve a quedar limpia (sin `?ambito=`).
4. Un `?ambito=cualquiercosa` escrito a mano cae en "Lo mío" y no rompe.
5. El foco con Tab llega al alternador y a los "Ver todo" de los vacíos.

> ⚠️ **La cuenta de QA tiene los cinco módulos, así que NO reproduce el scopeo por RLS.** Con esa
> cuenta, "Lo mío" y "Todo" pueden verse casi iguales y la feature parece correcta igual. Para
> verificar de verdad hace falta una cuenta **sólo de Coordinación**, asignada a un subconjunto de
> protocolos. Si no está disponible, **decirlo explícitamente al reportar** en vez de dar la
> verificación por hecha.

- [ ] **Paso 4: Commit y PR**

```bash
git add src/lib/version.ts
git commit -m "docs(resumen): novedades del ambito personal"
git push -u origin feat/resumen-ambito-personal
```

Crear la PR por API REST (no hay `gh` en esta máquina) y **dejar el working copy de vuelta en
`main`**: el árbol es compartido y dejarlo parado en la rama de la feature es como se cuela un
commit del Director donde no va.

---

## Verificación final

- [ ] `npm run build` verde.
- [ ] Los 12 tests de `ambito.test.ts` pasan, y los 598 previos siguen pasando.
- [ ] La 0104 está avisada **en el chat** como aditiva (va antes del deploy del front).
- [ ] `supabase/README.md` actualizado apenas el Director confirme "aplicada".
- [ ] Lo que **no** se verificó (cuenta acotada de Coordinación) queda dicho explícitamente, no
      dado por hecho.
