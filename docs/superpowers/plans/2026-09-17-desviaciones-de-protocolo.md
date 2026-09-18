# Desviaciones de protocolo — plan de implementación

> **Para quien lo ejecute:** los pasos van con checkbox (`- [ ]`). El spec que manda es
> [`docs/plan-desviaciones-de-protocolo.md`](../../plan-desviaciones-de-protocolo.md); acá está el
> paso a paso. Si algo de este plan contradice al spec, gana el spec y hay que avisar.

**Objetivo:** darle a la ventana vencida la salida que le falta —documentar la desviación de
protocolo— para que Pendientes drene en vez de sedimentar.

**Arquitectura:** una tabla nueva (`protocol_deviations`) con su RPC `security definer`, calcada
del patrón de descartes de la 0070; las reglas puras en su propio archivo con tests; y el filtrado
en `useActiveAlerts`, que es el único lugar por donde pasan las tres pantallas que muestran
alertas (la vista, el Resumen y la campana).

**Stack:** React + TypeScript strict, Supabase (PostgREST + RPC), vitest. Sin react-router, sin
react-query, sin Tailwind.

## Restricciones globales

- **Castellano rioplatense** en comentarios, nombres de dominio y copy de UI.
- **Comentarios densos y explicativos (el porqué, no el qué)** — igualar la densidad del código
  existente en los archivos que se tocan.
- **Tipos a mano** en `src/data/*.ts`, con comentario que cita la migración de cada columna.
- **Estilo:** tokens de `src/styles/tokens.css`, íconos Lucide vía `components/Icon.tsx`.
  **Realce = elevación (~1px + sombra), nunca borde de color.**
- **Errores de Postgres → mensajes serenos en castellano** (helpers `*ErrorMessage` en `data/`).
- **Migraciones inmutables y numeradas.** La `0131` es un archivo nuevo; no se edita ni se
  renumera nada. **No hay acceso SQL a producción:** el SQL se le pasa al Director para que lo
  corra a mano, y tiene que correr **tal cual**, sin placeholders.
- **El gate es `npm run build` verde** (typecheck + tests + build) **más verificación en el
  navegador**. Nada se da por hecho sin las dos cosas.
- **Commits por ruta** (`git add <archivos>`), nunca `git add -A`. Verificar la rama antes de cada
  commit: la de esta feature es `feat/desviaciones-de-protocolo`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0130_desviacion_de_protocolo.sql` | **Crear.** Tabla, RLS, auditoría y RPC. |
| `supabase/README.md` | **Modificar.** Registrar la 0131 en el índice. |
| `src/data/deviationModel.ts` | **Crear.** Reglas PURAS: catálogo, "ya documentada", "formulario listo", "inscripción cerrada". Sin imports de Supabase. |
| `src/data/deviationModel.test.ts` | **Crear.** Los tres casos que fallan en silencio. |
| `src/data/alertSignal.ts` | **Crear.** La señal compartida de "los archivos de alertas cambiaron", hoy privada dentro de `alertDismissals.ts`. |
| `src/data/alertDismissals.ts` | **Modificar.** Pasa a usar `alertSignal.ts` (misma API hacia afuera) y `useActiveAlerts` suma los dos filtros nuevos. |
| `src/data/deviations.ts` | **Crear.** Hook de lectura + mutación contra el RPC. |
| `src/views/DocumentarDesviacionModal.tsx` | **Crear.** El modal, calcado del de descarte. |
| `src/views/TrackAlertsView.tsx` | **Modificar.** Botón en el ítem de ventana vencida + panel de desviaciones. |
| `src/views/alertItem.ts` | **Modificar.** Una opción más de espaciado para el botón con nombre. |
| `src/views/track/VisitHeader.tsx` | **Modificar.** La marca "Desviación documentada". |

**Por qué las reglas puras van en `data/` y no en `views/`:** las consume la capa de datos
(`useActiveAlerts` filtra con ellas) y también el modal. `alertDismissalModel.ts` ya vive ahí por
exactamente el mismo motivo, y este archivo es su gemelo.

---

## Tarea 1 · La migración 0131

**Archivos:**
- Crear: `supabase/migrations/0130_desviacion_de_protocolo.sql`
- Modificar: `supabase/README.md` (el índice de migraciones)

**Interfaces:**
- Produce: tabla `public.protocol_deviations` y RPC
  `public.record_protocol_deviation(p_visit_id uuid, p_reason text, p_detail text) returns uuid`.
  Los motivos válidos son los seis valores del `check`, y son los mismos que la Tarea 2 escribe en
  TypeScript.

- [ ] **Paso 1: Escribir la migración**

Crear `supabase/migrations/0130_desviacion_de_protocolo.sql`:

```sql
-- Spira · Migración 0131 — Track: documentar una desviación de protocolo
-- ============================================================================
-- Una ventana vencida NO tenía salida. Sale de la lista de dos maneras: cargando la visita
-- (y entonces deja de estar vencida) o DESCARTANDO la alerta (0070) con un motivo de catálogo
-- que dice "esto no correspondía". Ninguna de las dos dice lo que de verdad pasó, que es una
-- DESVIACIÓN DE PROTOCOLO. Nadie silencia un desvío clínico — así que nadie vaciaba la lista y
-- el sedimento crecía sin techo (medido el 2026-09-17: 16 visitas cierran ventana por mes en los
-- cuatro protocolos, 231 en el año, y ninguna se va sola).
--
-- Esta migración agrega la salida honesta: documentar el desvío con motivo, detalle, autor y
-- fecha. NO cambia el estado de la visita ni borra nada — el hecho clínico sigue exactamente
-- donde estaba; lo que se agrega es el registro de por qué pasó, que es lo que un monitor pide.
--
-- CALCADA DE LA 0070 (descartes) en todo lo que comparte: RLS espejo de quién puede ver la
-- alerta, autor desnormalizado, auditoría con audit_row() y alta por RPC security definer que
-- calcula el ancla en el servidor. Se aparta en tres puntos, a propósito:
--   1. TABLA PROPIA y no un motivo más de alert_dismissals: el listado de desviaciones es un
--      entregable regulatorio, y sacarlo de una tabla llamada "descartes de alertas" es mentir
--      sobre qué es ese dato.
--   2. DETALLE OBLIGATORIO SIEMPRE (en 0070 sólo lo exige el motivo "otro"). Un motivo de
--      catálogo solo no le alcanza a quien lea esto dentro de ocho meses, y ese lector es un
--      monitor.
--   3. Sólo documenta VENTANA VENCIDA. La visita que se hizo fuera de ventana es la misma
--      desviación clínica y hoy se escapa sin registro, pero entra por otro flujo y quedó fuera
--      de alcance por decisión del Director (ver TODOS.md, P2).
--
-- EL ANCLA (window_end) es el punto fino, igual que la huella de la 0070: sin ella, documentar
-- una vez taparía la visita PARA SIEMPRE, incluso si se reprograma y vence una ventana NUEVA.
-- Con el ancla, la desviación vale para esa ventana; si la visita vuelve a vencerse con otra,
-- es otro desvío y vuelve a pedir su documentación.
--
-- ADITIVA y NO BREAKING: no toca ninguna tabla ni vista existente. Ningún front desplegado
-- consulta esta tabla ni este RPC, así que va PRIMERO y el deploy del front después.
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0128 (reposición
-- de corte a corte), la 0129 (guarda de Recepción) y la 0130 (limpieza de Reposición).
-- IDEMPOTENTE. Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

-- 1 · La desviación -----------------------------------------------------------------------
create table if not exists public.protocol_deviations (
  -- La columna `id` NO es opcional aunque la PK pudiera ser otra: audit_row() (0003) hace
  -- `case when tg_op = 'DELETE' then old.id else new.id end`, y Postgres resuelve `old.id` al
  -- PLANIFICAR, sin importar por qué rama vaya a pasar. Sin `id`, la primera escritura revienta
  -- con 42703 señalando el cuerpo de audit_row y no esta tabla (pasó con la 0111).
  id       uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.patient_visits(id) on delete cascade,
  -- El window_end de la ventana que se venció. `date` y no timestamptz: es el mismo tipo que
  -- patient_visits.window_end, y compararlos con casteos de por medio es cómo se cuelan los
  -- errores de borde de día (la vista ya arrastra una mezcla de current_date UTC y hora AR).
  anchor   date not null,
  -- Motivo de catálogo. Texto con check y no enum, por el mismo motivo que la 0070: un enum
  -- nuevo obligaría a `alter type ... add value` en su propio archivo (la trampa de la 0053)
  -- para sumar un motivo.
  reason   text not null check (reason in (
             'no_concurrio', 'pidio_otra_fecha', 'motivo_clinico',
             'centro_no_pudo', 'cronograma_mal_generado', 'otro')),
  -- OBLIGATORIO, y con check de no-vacío: un motivo de catálogo solo no explica nada dentro de
  -- ocho meses. Acá está la diferencia con alert_dismissals.detail, que es nullable.
  detail   text not null check (btrim(detail) <> ''),
  -- Autor: FK estable para la auditoría + nombre y puesto DESNORMALIZADOS, mismo motivo que
  -- author_name en la 0048 y dismissed_by_name en la 0070 — la RLS de `users` sólo deja ver la
  -- fila propia, así que un join ocultaría en silencio quién documentó el desvío para todo el
  -- que no sea gerencia. Y el snapshot es lo correcto en un sistema auditable: queda el puesto
  -- DE ENTONCES.
  recorded_by      uuid not null default auth.uid() references public.users(id),
  recorded_by_name text not null,
  recorded_by_role text not null,
  recorded_at      timestamptz not null default now()
);

comment on table public.protocol_deviations is
  'Desviaciones de protocolo documentadas sobre una visita que no se hizo dentro de su ventana. '
  'No cambia el estado de la visita ni borra nada: agrega el porqué, con autor y fecha. El ancla '
  '(window_end) hace que valga para ESA ventana: si la visita se reprograma y vuelve a vencerse, '
  'es otro desvío. 0131.';
comment on column public.protocol_deviations.anchor is
  'window_end de la ventana que se venció. Parte de la identidad del desvío. 0131.';
comment on column public.protocol_deviations.detail is
  'Explicación obligatoria (check de no-vacío). A diferencia de alert_dismissals.detail, acá se '
  'exige siempre: el lector de esto, meses después, es un monitor. 0131.';

-- Una desviación por visita y ventana.
create unique index if not exists ux_protocol_deviation_visita
  on public.protocol_deviations (visit_id, anchor);
create index if not exists ix_protocol_deviation_visit
  on public.protocol_deviations (visit_id);

-- 2 · RLS: espejo de quién puede VER la alerta (mismo criterio que la 0070) ----------------
alter table public.protocol_deviations enable row level security;

drop policy if exists "ver desviaciones" on public.protocol_deviations;
create policy "ver desviaciones" on public.protocol_deviations for select using (
  public.has_module('gerencia') or public.coordina_visita(visit_id));

-- El insert real pasa por el RPC (SECURITY DEFINER); la policy es la red de seguridad y deja el
-- `recorded_by` clavado al que escribe.
drop policy if exists "track documenta desviacion" on public.protocol_deviations;
create policy "track documenta desviacion" on public.protocol_deviations for insert with check (
  recorded_by = auth.uid() and (public.has_module('gerencia') or public.coordina_visita(visit_id)));

-- SIN policy de UPDATE, y CON delete: un registro auditable no se edita. Si alguien documentó
-- con el motivo equivocado, se borra y se vuelve a documentar — y el audit_log muestra las dos
-- decisiones en vez de una sobrescrita. Es el mismo criterio que la 0070 usa para restaurar.
drop policy if exists "track corrige desviacion" on public.protocol_deviations;
create policy "track corrige desviacion" on public.protocol_deviations for delete using (
  public.has_module('gerencia') or public.coordina_visita(visit_id));

revoke all on public.protocol_deviations from anon;
grant select, insert, delete on public.protocol_deviations to authenticated;

drop trigger if exists trg_audit_protocol_deviations on public.protocol_deviations;
create trigger trg_audit_protocol_deviations after insert or update or delete
  on public.protocol_deviations for each row execute function public.audit_row();

-- 3 · RPC: documentar ----------------------------------------------------------------------
-- El ancla se calcula ACÁ y no en el cliente: un anchor falseado podría tapar una ventana
-- futura. Y valida que la visita esté DE VERDAD con la ventana vencida — no se documenta un
-- desvío que no ocurrió. Authz espejo de la lectura, como dismiss_alert.
create or replace function public.record_protocol_deviation(
  p_visit_id uuid,
  p_reason   text,
  p_detail   text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_status     text;
  v_window_end date;
  v_name       text;
  v_role       text;
  v_id         uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not (public.has_module('gerencia') or public.coordina_visita(p_visit_id)) then
    raise exception 'No tenés permiso' using errcode = '42501';
  end if;
  if btrim(coalesce(p_detail, '')) = '' then
    raise exception 'Falta la explicación' using errcode = '23502';
  end if;

  -- Calificamos tv.* siempre: en PL/pgSQL los nombres sueltos compiten con las variables
  -- locales (el error de la 0056 y la 0058, dos veces el mismo).
  select tv.computed_status, tv.window_end
    into v_status, v_window_end
    from public.v_track_visits tv
   where tv.id = p_visit_id;

  if v_status is null then
    raise exception 'Visita inexistente' using errcode = '23503';
  end if;
  if v_status <> 'ventana_vencida' then
    raise exception 'Esa visita no tiene la ventana vencida' using errcode = 'check_violation';
  end if;
  -- No debería pasar (la vista calcula ventana_vencida comparando contra window_end, así que
  -- una vencida siempre lo tiene), pero el ancla es not null y preferimos el error nombrado
  -- antes que un 23502 crudo desde el insert.
  if v_window_end is null then
    raise exception 'Esa visita no tiene ventana definida' using errcode = '23502';
  end if;

  -- Snapshot de quién documenta: su propia fila de users (siempre visible para él; además esto
  -- es SECURITY DEFINER). Mismo criterio que add_visit_comment en la 0048.
  select u.full_name, coalesce(nullif(btrim(u.puesto), ''), 'Equipo')
    into v_name, v_role
    from public.users u where u.id = auth.uid();

  insert into public.protocol_deviations
    (visit_id, anchor, reason, detail, recorded_by, recorded_by_name, recorded_by_role)
  values
    (p_visit_id, v_window_end, p_reason, btrim(p_detail), auth.uid(),
     coalesce(v_name, 'Usuario'), coalesce(v_role, 'Equipo'))
  returning id into v_id;

  return v_id;
end $$;

comment on function public.record_protocol_deviation(uuid, text, text) is
  'Documenta una desviación de protocolo sobre una visita con la ventana vencida. Calcula el '
  'ancla (window_end) en el servidor para que un registro no pueda tapar una ventana futura. '
  'Authz: gerencia o coordinador de la visita. 0131.';

revoke all on function public.record_protocol_deviation(uuid, text, text) from anon, public;
grant execute on function public.record_protocol_deviation(uuid, text, text) to authenticated;
```

- [ ] **Paso 2: Contar los dollar-quotes (la trampa de la 0071)**

El editor SQL de Supabase rastrea el dollar-quoting **sin ignorar los comentarios**: un marcador
suelto dentro de un comentario le invierte la paridad y parte las funciones por sus `;` internos,
con un error desconcertante y lejísimo del comentario culpable. Se detecta contando.

```bash
node -e "const s=require('fs').readFileSync('supabase/migrations/0130_desviacion_de_protocolo.sql').toString(); const n=(s.match(/\\\$\\\$/g)||[]).length; console.log('marcadores:', n, n%2===0?'PAR (ok)':'IMPAR (ROTO)')"
```

Esperado: `marcadores: 2 PAR (ok)`

- [ ] **Paso 3: Registrar la migración en el índice**

En `supabase/README.md`, agregar la 0131 a la tabla de migraciones siguiendo el formato de las
filas vecinas, **sin** la marca de aplicada (todavía no lo está). CI lo vigila con
`scripts/check-migraciones.mjs`.

```bash
node scripts/check-migraciones.mjs
```

Esperado: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add supabase/migrations/0130_desviacion_de_protocolo.sql supabase/README.md
git commit -m "feat(db): 0131 — documentar una desviación de protocolo"
```

- [ ] **Paso 5: Pasarle el SQL al Director**

La 0131 **no se puede aplicar desde acá** (no hay acceso SQL a prod). Avisarle que está lista,
que va **después de la 0128, la 0129 y la 0130**, y que es aditiva (va antes del deploy del
front). Apenas
confirme "aplicada", anotarlo en el índice como **Aplicada en prod (fecha)**.

---

## Tarea 2 · Las reglas puras, con sus tests

**Archivos:**
- Crear: `src/data/deviationModel.ts`
- Crear: `src/data/deviationModel.test.ts`

**Interfaces:**
- Produce: `DEVIATION_REASONS`, `deviationReasonLabel(value)`, `desviacionLista(reason, detail)`,
  `ProtocolDeviationRow`, `isVisitDeviationRecorded(deviations, visit)`,
  `ESTADOS_DE_INSCRIPCION_CERRADOS`, `inscripcionCerrada(enrollmentStatus)`.

- [ ] **Paso 1: Escribir los tests (van primero)**

Crear `src/data/deviationModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  desviacionLista, inscripcionCerrada, isVisitDeviationRecorded,
  type ProtocolDeviationRow,
} from './deviationModel'

/* Qué se testea acá y por qué: las tres reglas de este archivo fallan EN SILENCIO.
   Un filtro al revés no rompe nada que se vea — la lista simplemente muestra de más o de menos,
   y en una app auditable una alerta que no aparece es peor que una de más. */

function dev(over: Partial<ProtocolDeviationRow> = {}): ProtocolDeviationRow {
  return {
    id: 'd1', visit_id: 'v1', anchor: '2026-08-14', reason: 'no_concurrio',
    detail: 'No vino y no avisó.', recorded_by: 'u1', recorded_by_name: 'Ana',
    recorded_by_role: 'Coordinadora', recorded_at: '2026-08-20T12:00:00Z',
    ...over,
  }
}

describe('isVisitDeviationRecorded', () => {
  it('reconoce la desviación de esa visita y esa ventana', () => {
    expect(isVisitDeviationRecorded([dev()], { id: 'v1', window_end: '2026-08-14' })).toBe(true)
  })

  it('NO aplica si la ventana es otra: una visita reprogramada que vuelve a vencerse es otro desvío', () => {
    expect(isVisitDeviationRecorded([dev()], { id: 'v1', window_end: '2026-09-30' })).toBe(false)
  })

  it('NO aplica a otra visita', () => {
    expect(isVisitDeviationRecorded([dev()], { id: 'v2', window_end: '2026-08-14' })).toBe(false)
  })

  it('sin ventana no hay desviación que aplicar', () => {
    expect(isVisitDeviationRecorded([dev()], { id: 'v1', window_end: null })).toBe(false)
  })
})

describe('inscripcionCerrada', () => {
  /* EL CASO QUE JUSTIFICA EL ARCHIVO. El enum tiene CUATRO valores y `screening` es una
     inscripción ABIERTA: un paciente en selección tiene visitas que sí hay que atender.
     Si esta regla se escribiera como `status === 'activo'`, desaparecerían en silencio los
     pendientes de todo paciente en selección — sin error, sin nada roto que mirar. */
  it('screening NO está cerrada: sus visitas siguen pidiendo acción', () => {
    expect(inscripcionCerrada('screening')).toBe(false)
  })

  it('activo NO está cerrada', () => {
    expect(inscripcionCerrada('activo')).toBe(false)
  })

  it('completado y discontinuado SÍ están cerradas (son las dos que escribe la 0127)', () => {
    expect(inscripcionCerrada('completado')).toBe(true)
    expect(inscripcionCerrada('discontinuado')).toBe(true)
  })

  it('un estado futuro que no conocemos NO se da por cerrado', () => {
    // Preferimos que una inscripción desconocida siga alertando a que se apague sola.
    expect(inscripcionCerrada('en_pausa')).toBe(false)
  })
})

describe('desviacionLista', () => {
  it('exige motivo', () => {
    expect(desviacionLista('', 'Algo pasó')).toBe(false)
  })

  it('exige explicación SIEMPRE, no sólo en "otro"', () => {
    expect(desviacionLista('no_concurrio', '')).toBe(false)
    expect(desviacionLista('no_concurrio', '   ')).toBe(false)
  })

  it('con motivo y explicación, está lista', () => {
    expect(desviacionLista('no_concurrio', 'No vino y no avisó.')).toBe(true)
  })
})
```

- [ ] **Paso 2: Correr los tests para verificar que fallan**

```bash
npx vitest run src/data/deviationModel.test.ts
```

Esperado: FAIL — `Failed to resolve import "./deviationModel"`.

- [ ] **Paso 3: Escribir el modelo**

Crear `src/data/deviationModel.ts`:

```ts
/* Las reglas PURAS de las desviaciones de protocolo (0131).
 *
 * Viven acá y no en `deviations.ts` por lo mismo que `alertDismissalModel.ts`: aquel archivo
 * importa el cliente de Supabase —que lee `window` al cargarse— y estas reglas son comparación
 * de cadenas. Separadas, se pueden testear sin montar nada.
 *
 * Lo que se testea es lo que puede quedar al revés SIN VERSE: las tres reglas de acá filtran
 * listas, y un filtro invertido no rompe nada que se mire — muestra de más o de menos. En un
 * sistema auditable, una alerta que no aparece es peor que una de más. */

/** Fila de `protocol_deviations` (0131). */
export interface ProtocolDeviationRow {
  id: string
  visit_id: string
  /** `window_end` de la ventana que se venció. Parte de la identidad del desvío. 0131. */
  anchor: string
  reason: string
  /** Obligatorio desde la base (check de no-vacío). 0131. */
  detail: string
  recorded_by: string
  /** Desnormalizados: la RLS de `users` sólo muestra la fila propia. 0131. */
  recorded_by_name: string
  recorded_by_role: string
  recorded_at: string
}

/**
 * Los seis motivos, definidos por el Director (2026-09-17).
 *
 * "Otro" va a secas y no "Otro (explicar)": acá la explicación se pide SIEMPRE, así que el
 * paréntesis prometía una distinción que no existe.
 */
export const DEVIATION_REASONS: { value: string; label: string }[] = [
  { value: 'no_concurrio',           label: 'El paciente no concurrió y no avisó' },
  { value: 'pidio_otra_fecha',       label: 'El paciente no pudo venir y pidió otra fecha' },
  { value: 'motivo_clinico',         label: 'Motivo clínico del paciente (internación, evento adverso, enfermedad intercurrente)' },
  { value: 'centro_no_pudo',         label: 'El centro no pudo (feriado, agenda, falta de producto)' },
  { value: 'cronograma_mal_generado', label: 'El cronograma estaba mal generado' },
  { value: 'otro',                   label: 'Otro' },
]

/** Etiqueta legible de un motivo guardado; el valor crudo si viniera uno desconocido. */
export function deviationReasonLabel(value: string): string {
  return DEVIATION_REASONS.find((r) => r.value === value)?.label ?? value
}

/**
 * ¿El formulario está listo para confirmarse? Motivo elegido y explicación con algo más que
 * espacios.
 *
 * A diferencia de `descarteListo` (0070), la explicación se exige SIEMPRE y no sólo con el
 * motivo "otro": el lector de esto, meses después, es un monitor, y un motivo de catálogo solo
 * no le dice nada. El check de la base lo exige igual; esta función es para que el botón no
 * prometa algo que la base va a rebotar.
 */
export function desviacionLista(reason: string, detail: string): boolean {
  return reason !== '' && detail.trim() !== ''
}

/**
 * Los estados de inscripción CERRADOS: los dos que escribe `close_enrollment` (0127).
 *
 * LA REGLA VA POR EXCLUSIÓN Y NO POR `=== 'activo'`, que es el error fácil y mudo. El enum
 * `enrollment_status` (0001) tiene CUATRO valores —`screening`, `activo`, `completado`,
 * `discontinuado`— y **una inscripción en `screening` está abierta**: ese paciente está en
 * selección y sus visitas hay que atenderlas. Filtrar por "activo" las haría desaparecer de la
 * lista sin un solo error en consola, y un quinto valor futuro se caería solo del tablero.
 */
export const ESTADOS_DE_INSCRIPCION_CERRADOS: readonly string[] = ['completado', 'discontinuado']

export function inscripcionCerrada(enrollmentStatus: string): boolean {
  return ESTADOS_DE_INSCRIPCION_CERRADOS.includes(enrollmentStatus)
}

/**
 * ¿Esta visita ya tiene documentada la desviación de ESTA ventana?
 *
 * El ancla es el punto fino, igual que la huella de los descartes: sin ella, documentar una vez
 * taparía la visita para siempre, incluso si se reprograma y vence una ventana NUEVA — que sería
 * un vencimiento oculto, exactamente lo que este módulo existe para evitar.
 */
export function isVisitDeviationRecorded(
  deviations: readonly ProtocolDeviationRow[],
  visit: { id: string; window_end: string | null },
): boolean {
  if (!visit.window_end) return false
  return deviations.some((d) => d.visit_id === visit.id && d.anchor === visit.window_end)
}
```

- [ ] **Paso 4: Correr los tests para verificar que pasan**

```bash
npx vitest run src/data/deviationModel.test.ts
```

Esperado: PASS, 11 tests.

- [ ] **Paso 5: Commit**

```bash
git add src/data/deviationModel.ts src/data/deviationModel.test.ts
git commit -m "feat(desviaciones): las reglas puras, con sus tests"
```

---

## Tarea 3 · La señal compartida y la capa de datos

**Archivos:**
- Crear: `src/data/alertSignal.ts`
- Modificar: `src/data/alertDismissals.ts` (pasa a usar la señal de `alertSignal.ts`)
- Crear: `src/data/deviations.ts`

**Interfaces:**
- Consume: `ProtocolDeviationRow`, `desviacionLista` (Tarea 2); el RPC de la Tarea 1.
- Produce: `bumpAlertArchives()`, `useAlertArchivesVersion()`, `useDeviations()`,
  `recordDeviation({ visitId, reason, detail })`, `deleteDeviation(id)`.

**Por qué la señal se muda:** sin react-query no hay caché compartida — la campana, el Resumen y
la vista tienen cada uno su consulta. Hoy `alertDismissals.ts` tiene un contador privado que
avisa "los descartes cambiaron" para que las tres relean a la vez; sin eso, la lista baja a 21 y
el badge sigue en 22 (ya pasó en QA). Las desviaciones necesitan **la misma** señal: si estrenan
una propia, documentar una desviación deja la campana con el número viejo.

- [ ] **Paso 1: Mover la señal a su propio archivo**

Crear `src/data/alertSignal.ts`:

```ts
import { useEffect, useState } from 'react'

/* Señal común de "lo que archiva alertas cambió" (descartes de la 0070 y desviaciones de la
   0131).
   Sin react-query no hay caché compartida: la campana, el resumen de Inicio y la vista de
   Pendientes tienen cada uno SU propia consulta. Si una pantalla refetchea sola después de
   archivar, la campana se queda con el número viejo — exactamente la incoherencia que este
   módulo existe para evitar (y que se vio en el QA: la lista bajó a 21 y el badge seguía en 22).
   Vive en su propio archivo desde la 0131: empezó privada dentro de `alertDismissals.ts` y las
   desviaciones necesitan LA MISMA señal, no una gemela — dos contadores dejarían a la campana
   enterándose de la mitad de las cosas. */
let version = 0
const subs = new Set<(v: number) => void>()

/** Avisa a todas las instancias montadas que tienen que releer lo archivado. */
export function bumpAlertArchives(): void {
  version += 1
  for (const notify of subs) notify(version)
}

export function useAlertArchivesVersion(): number {
  const [v, setV] = useState(version)
  useEffect(() => {
    subs.add(setV)
    return () => { subs.delete(setV) }
  }, [])
  return v
}
```

- [ ] **Paso 2: Hacer que `alertDismissals.ts` use la señal común**

En `src/data/alertDismissals.ts`: borrar el contador privado (`dismissalsVersion`,
`dismissalsSubs`, `bumpDismissals`, `useDismissalsVersion`) y reemplazar sus usos por
`bumpAlertArchives` / `useAlertArchivesVersion` importados de `./alertSignal`. El comentario que
explicaba la señal se va con ella (ya está copiado en el archivo nuevo); en su lugar queda una
línea que dice de dónde sale.

**No cambia ninguna API pública de `alertDismissals.ts`.** Verificarlo:

```bash
npm run typecheck
```

Esperado: sin errores.

- [ ] **Paso 3: Escribir la capa de datos de desviaciones**

Crear `src/data/deviations.ts`:

```ts
import { supabase } from '../lib/supabase'
import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import { bumpAlertArchives, useAlertArchivesVersion } from './alertSignal'
import { desviacionLista, type ProtocolDeviationRow } from './deviationModel'

export type { ProtocolDeviationRow } from './deviationModel'

/**
 * Las desviaciones documentadas que este usuario puede ver (la RLS de la 0131 las scopea igual
 * que la alerta: gerencia o coordinador de la visita).
 *
 * Se leen TODAS y el cruce lo hace el front, igual que los descartes: una vista de "alertas
 * vigentes" tendría que hacer `select v.*` sobre v_track_visits y quedaría con el juego de
 * columnas congelado — el problema que ya arrastran v_patient_visits/v_track_visits.
 */
export function useDeviations() {
  const v = useAlertArchivesVersion()
  return useSupabaseQuery<ProtocolDeviationRow[]>(
    (c) =>
      c
        .from('protocol_deviations')
        .select('id,visit_id,anchor,reason,detail,recorded_by,recorded_by_name,recorded_by_role,recorded_at')
        .order('recorded_at', { ascending: false })
        .returns<ProtocolDeviationRow[]>(),
    [v],
  )
}

/** Traduce el código de Postgres a un mensaje sereno. */
function deviationErrorMessage(code: string | undefined, raw: string): string {
  /* La 0131 todavía no está aplicada en esta base: PostgREST no encuentra la función (PGRST202)
     o la tabla (42P01/PGRST205). Es una condición de despliegue, no un error del usuario, así
     que se dice tal cual en vez de inventar una causa. */
  if (code === 'PGRST202' || code === '42P01' || code === 'PGRST205') {
    return 'Documentar desviaciones todavía no está disponible en esta base. Falta aplicar una actualización.'
  }
  if (code === '42501') return 'No tenés permiso para documentar esta desviación.'
  if (code === '23505') return 'Esta desviación ya estaba documentada. Actualizá la lista.'
  if (code === '23502') return 'Falta la explicación.'
  if (code === '23503') return 'La visita de esta alerta ya no existe.'
  if (code === '23514') return 'El motivo no es válido. Elegí uno de la lista.'
  return raw || 'No pudimos documentar la desviación. Probá de nuevo.'
}

export interface RecordDeviationInput {
  visitId: string
  reason: string
  detail: string
}

/**
 * Documenta una desviación vía RPC `record_protocol_deviation` (SECURITY DEFINER): el ancla la
 * calcula el servidor, así que un cliente no puede fabricar un registro que tape una ventana
 * futura. El RPC además rechaza documentar una visita que no tiene la ventana vencida.
 */
export async function recordDeviation(input: RecordDeviationInput): Promise<{ error: string | null }> {
  if (!input.visitId) return { error: 'No pudimos identificar la visita. Recargá la página.' }
  /* La MISMA regla que habilita el botón, no una copia parecida: si el guard de acá y el de la
     UI se separan, o el botón queda habilitado y rebota contra la base, o corta algo que la
     pantalla ya dio por válido. Los dos mensajes distinguen los dos casos que junta
     `desviacionLista`, porque el usuario no tiene por qué leer un texto genérico. */
  if (!input.reason) return { error: 'Elegí un motivo.' }
  if (!desviacionLista(input.reason, input.detail)) {
    return { error: 'Contanos qué pasó para poder documentarla.' }
  }
  const { error } = await supabase.rpc('record_protocol_deviation', {
    p_visit_id: input.visitId,
    p_reason: input.reason,
    p_detail: input.detail.trim(),
  })
  if (error) return { error: deviationErrorMessage(error.code, error.message) }
  bumpAlertArchives()
  return { error: null }
}

/**
 * Borra una desviación documentada (para corregir un motivo equivocado: se borra y se vuelve a
 * documentar, y el audit_log muestra las dos decisiones). La RLS decide; 0 filas afectadas = sin
 * permiso, no éxito.
 */
export async function deleteDeviation(deviationId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('protocol_deviations').delete().eq('id', deviationId).select('id')
  if (error) return { error: deviationErrorMessage(error.code, error.message) }
  if (!data || data.length === 0) return { error: 'No tenés permiso para borrar esta desviación.' }
  bumpAlertArchives()
  return { error: null }
}
```

- [ ] **Paso 4: Verificar que compila y que la suite sigue verde**

```bash
npm run typecheck && npx vitest run
```

Esperado: typecheck sin errores; los tests que ya había, más los 11 de la Tarea 2, en verde.
(Ojo: `vitest` corre también los tests de los worktrees, así que el conteo local puede venir
duplicado — no es un problema.)

- [ ] **Paso 5: Commit**

```bash
git add src/data/alertSignal.ts src/data/alertDismissals.ts src/data/deviations.ts
git commit -m "feat(desviaciones): capa de datos y señal común de archivado"
```

---

## Tarea 4 · `useActiveAlerts` filtra lo documentado y lo cerrado

**Archivos:**
- Modificar: `src/data/alertDismissals.ts` (la función `useActiveAlerts`)
- Crear: `src/data/activeAlertsFilter.ts` + `src/data/activeAlertsFilter.test.ts`

**Interfaces:**
- Consume: `isVisitDeviationRecorded`, `inscripcionCerrada` (Tarea 2); `useDeviations` (Tarea 3).
- Produce: `alertasVigentes(alertas, descartes, desviaciones)` y el campo `deviations` en el
  objeto que devuelve `useActiveAlerts`.

**Por qué el filtro sale a su propio archivo:** es la regla que decide qué se ve y qué no, con
tres entradas que se combinan. Adentro del `useMemo` no se puede testear, y es exactamente la
clase de cosa que este repo testea.

- [ ] **Paso 1: Escribir el test**

Crear `src/data/activeAlertsFilter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { alertasVigentes } from './activeAlertsFilter'
import type { ProtocolDeviationRow } from './deviationModel'
import type { TrackVisitRow } from './visits'

/* La regla que decide QUÉ SE VE en Pendientes, en la campana y en el Resumen. Falla en silencio
   en los dos sentidos: de más, y la lista sedimenta; de menos, y desaparece trabajo real sin un
   solo error en consola. */

function visita(over: Partial<TrackVisitRow> = {}): TrackVisitRow {
  // Sólo los campos que la regla mira; el resto no participa.
  return {
    id: 'v1', computed_status: 'ventana_vencida', window_end: '2026-08-14',
    estimated_date: '2026-08-10', enrollment_status: 'activo',
    ...over,
  } as TrackVisitRow
}

function desviacion(over: Partial<ProtocolDeviationRow> = {}): ProtocolDeviationRow {
  return {
    id: 'd1', visit_id: 'v1', anchor: '2026-08-14', reason: 'no_concurrio',
    detail: 'No vino.', recorded_by: 'u1', recorded_by_name: 'Ana',
    recorded_by_role: 'Coordinadora', recorded_at: '2026-08-20T12:00:00Z',
    ...over,
  }
}

describe('alertasVigentes', () => {
  it('sin nada archivado, pasan todas', () => {
    expect(alertasVigentes([visita()], [], [])).toHaveLength(1)
  })

  it('la desviación documentada de ESA ventana la saca de la lista', () => {
    expect(alertasVigentes([visita()], [], [desviacion()])).toHaveLength(0)
  })

  it('una desviación de OTRA ventana no la tapa: reprogramada y vencida de nuevo es otro desvío', () => {
    const otra = visita({ window_end: '2026-09-30' })
    expect(alertasVigentes([otra], [], [desviacion()])).toHaveLength(1)
  })

  it('una inscripción CERRADA deja de pedir acción', () => {
    expect(alertasVigentes([visita({ enrollment_status: 'discontinuado' })], [], [])).toHaveLength(0)
    expect(alertasVigentes([visita({ enrollment_status: 'completado' })], [], [])).toHaveLength(0)
  })

  it('una inscripción en SCREENING sigue pidiendo acción', () => {
    // El error fácil sería filtrar por `=== 'activo'`: apagaría en silencio a todo paciente en
    // selección.
    expect(alertasVigentes([visita({ enrollment_status: 'screening' })], [], [])).toHaveLength(1)
  })
})
```

- [ ] **Paso 2: Correr el test para verificar que falla**

```bash
npx vitest run src/data/activeAlertsFilter.test.ts
```

Esperado: FAIL — `Failed to resolve import "./activeAlertsFilter"`.

- [ ] **Paso 3: Escribir el filtro**

Crear `src/data/activeAlertsFilter.ts`:

```ts
import { isVisitAlertDismissed, type AlertDismissalRow } from './alertDismissalModel'
import { inscripcionCerrada, isVisitDeviationRecorded, type ProtocolDeviationRow } from './deviationModel'
import type { TrackVisitRow } from './visits'

/**
 * Qué alertas de visita siguen PIDIENDO ACCIÓN.
 *
 * Tres razones para que una alerta salga de la lista, y ninguna la borra:
 *   1. está descartada (0070) — "esta alerta no correspondía";
 *   2. está documentada (0131) — "el desvío ocurrió, y acá está el porqué";
 *   3. su inscripción está cerrada — el paciente ya no está en el estudio.
 *
 * LA TERCERA ES LA MENOS OBVIA y vale el comentario. Al cerrar una inscripción, la 0127 borra
 * las visitas pendientes FUTURAS (`window_end >= current_date`) y CONSERVA las ya vencidas — lo
 * cual está bien: son evidencia de algo que pasó mientras el paciente estaba en el estudio. Pero
 * sin este filtro seguían reclamando para siempre sobre alguien que ya no está, que es sedimento
 * puro: nadie las va a resolver porque no hay nada que hacer con ellas. Siguen consultables (la
 * pantalla las muestra en su panel, marcadas "sin documentar"); lo que dejan es de pedir acción.
 */
export function alertasVigentes(
  alertas: readonly TrackVisitRow[],
  /* Los descartes NO van `readonly`: `isVisitAlertDismissed` recibe `AlertDismissalRow[]`, y
     marcarlo acá obligaría a un cast en la llamada. Un cast para acomodar una firma propia es
     deuda, no un tipo. */
  descartes: AlertDismissalRow[],
  desviaciones: readonly ProtocolDeviationRow[],
): TrackVisitRow[] {
  return alertas.filter(
    (a) =>
      !inscripcionCerrada(a.enrollment_status) &&
      !isVisitDeviationRecorded(desviaciones, a) &&
      !isVisitAlertDismissed(descartes, a),
  )
}
```

- [ ] **Paso 4: Correr el test para verificar que pasa**

```bash
npx vitest run src/data/activeAlertsFilter.test.ts
```

Esperado: PASS, 6 tests.

- [ ] **Paso 5: Enchufarlo en `useActiveAlerts`**

En `src/data/alertDismissals.ts`, dentro de `useActiveAlerts`:

1. Sumar `const deviations = useDeviations()` (import desde `./deviations`).
2. Reemplazar el cuerpo del `useMemo` de `visitAlerts` por
   `alertasVigentes(rows ?? [], dRows ?? [], devRows ?? [])`, con `devRows = deviations.data` en
   las deps.
3. Devolver `deviations: devRows ?? []` en el objeto de retorno, junto a `dismissals`.
4. **No sumar `deviations.error` a `error`.** Va con el mismo comentario que ya explica por qué
   el error de los descartes no se propaga: mientras la 0131 no esté aplicada, esa consulta
   falla, y si el error subiera, la campana, el Resumen y la vista se romperían las tres por una
   tabla que todavía no existe. Sin desviaciones el resultado correcto es "no hay ninguna", que
   es exactamente lo que pasa. **Esto es lo que permite desplegar el front antes o después de la
   migración.**
5. `loading` sí suma `deviations.loading`.

- [ ] **Paso 6: Verificar**

```bash
npm run typecheck && npx vitest run
```

Esperado: verde.

- [ ] **Paso 7: Commit**

```bash
git add src/data/activeAlertsFilter.ts src/data/activeAlertsFilter.test.ts src/data/alertDismissals.ts
git commit -m "feat(desviaciones): la lista activa deja fuera lo documentado y lo cerrado"
```

---

## Tarea 5 · El modal

**Archivos:**
- Crear: `src/views/DocumentarDesviacionModal.tsx`
- Modificar: `src/views/alertItem.ts` (una opción de espaciado)

**Interfaces:**
- Consume: `DEVIATION_REASONS`, `desviacionLista` (Tarea 2); `recordDeviation` (Tarea 3).
- Produce: `<DocumentarDesviacionModal target={{ visitId, label }} accent onClose onDone onError />`.

- [ ] **Paso 1: Escribir el modal**

Crear `src/views/DocumentarDesviacionModal.tsx`. Es el gemelo del modal de descarte que ya vive
en `TrackAlertsView.tsx`, con tres diferencias: el catálogo es el de desviaciones, la explicación
**siempre** se muestra y es obligatoria, y el copy dice que esto registra en vez de silenciar.

```tsx
import { useState } from 'react'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { SearchableSelect } from '../components/SearchableSelect'
import { btnOutline } from '../components/buttons'
import { DEVIATION_REASONS, desviacionLista } from '../data/deviationModel'
import { recordDeviation } from '../data/deviations'

/** La visita que se está documentando (lo que necesita el RPC + cómo nombrarla). */
export interface DocumentandoTarget {
  visitId: string
  label: string
}

/**
 * Documentar la desviación de protocolo de una visita con la ventana vencida (0131).
 *
 * GEMELO del modal de descarte, y a propósito: el gesto es el mismo y las dos acciones viven en
 * el mismo ítem, así que verse distinto sería decir que son cosas de otra naturaleza. Lo que
 * cambia es lo que dicen. Descartar archiva un aviso ("esto no correspondía"); documentar
 * REGISTRA un hecho clínico ("el desvío ocurrió, y acá está el porqué"), que es lo que un
 * monitor va a leer meses después. Por eso acá la explicación no es opcional.
 */
export function DocumentarDesviacionModal({ target, accent, onClose, onDone, onError }: {
  target: DocumentandoTarget
  accent: string
  onClose: () => void
  onDone: () => void
  onError: (msg: string) => void
}) {
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const listo = desviacionLista(reason, detail)

  const confirmar = async () => {
    if (!listo || busy) return
    setBusy(true)
    setErr(null)
    const { error } = await recordDeviation({ visitId: target.visitId, reason, detail })
    setBusy(false)
    if (error) { setErr(error); onError(error); return }
    onDone()
  }

  return (
    <Modal title="Documentar la desviación" onClose={onClose} accent={accent}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--spira-ink)' }}>
          {target.label}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--spira-muted)' }}>
          Queda registrado <strong style={{ fontWeight: 600 }}>qué pasó con esta visita</strong>,
          con tu nombre y la fecha. La visita no cambia de estado y no se borra nada: sale de la
          lista de pendientes porque ya está explicada.
        </div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Motivo</div>
          <SearchableSelect
            value={reason}
            onChange={(v) => setReason(v)}
            options={DEVIATION_REASONS.map((r) => ({ value: r.value, label: r.label }))}
            placeholder="Elegí un motivo"
            searchPlaceholder="Buscar motivo…"
            entity="motivo"
          />
        </div>
        <div>
          {/* SIEMPRE visible, no sólo con "Otro": el motivo clasifica, esto explica. */}
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Qué pasó</div>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            placeholder="Lo va a leer un monitor dentro de unos meses."
            style={{
              width: '100%', resize: 'vertical', padding: '10px 12px', borderRadius: 10,
              borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
              fontFamily: 'var(--spira-font-text)', fontSize: 13.5, color: 'var(--spira-ink)',
              background: 'var(--spira-white)',
            }}
          />
        </div>
        {err && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--spira-acc-deep-danger)' }}>
            <Icon name="alertCircle" size={16} color="var(--spira-danger)" />
            {err}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!listo || busy}
            aria-disabled={!listo || busy}
            className={!listo || busy ? 'spira-no-press' : undefined}
            style={{
              ...btnOutline,
              background: listo && !busy ? accent : 'var(--spira-line)',
              borderColor: listo && !busy ? accent : 'var(--spira-line)',
              color: listo && !busy ? 'var(--spira-white)' : 'var(--spira-faint)',
              cursor: listo && !busy ? 'pointer' : 'default',
            }}
          >
            {busy ? 'Documentando…' : 'Documentar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Paso 2: Reservar el espacio del botón con nombre en el ítem**

En `src/views/alertItem.ts`, `alertItemStyle` recibe una opción más. El botón de documentar va
abajo a la derecha, con nombre, así que el texto necesita aire por abajo:

```ts
export function alertItemStyle(
  tone: string,
  opts: { conBotonDescartar?: boolean; conBotonDesviacion?: boolean } = {},
): CSSProperties {
  return {
    display: 'flex', gap: 11, width: '100%', padding: '12px 13px', borderRadius: 11,
    ...(opts.conBotonDescartar ? { paddingRight: 42 } : null),
    /* El botón "Documentar desviación" se superpone abajo a la derecha, como hermano absoluto
       —igual que el de descartar—, así que la segunda línea necesita aire para no correr por
       debajo. Va con nombre y no con ícono porque es la acción que RESUELVE: un segundo glifo
       mudo al lado de la X diría que las dos son lo mismo. */
    ...(opts.conBotonDesviacion ? { paddingBottom: 34 } : null),
    background: `color-mix(in srgb, ${tone} 5.5%, transparent)`,
    borderWidth: 1, borderStyle: 'solid',
    borderColor: `color-mix(in srgb, ${tone} 19%, transparent)`,
    textAlign: 'left', cursor: 'pointer',
    fontFamily: 'var(--spira-font-text)', color: 'var(--spira-ink)',
  }
}
```

Actualizar también el comentario de cabecera del archivo, que enumera quién lo usa.

- [ ] **Paso 3: Verificar que compila**

```bash
npm run typecheck
```

Esperado: sin errores. (El modal todavía no se usa en ningún lado; eso es la Tarea 6.)

- [ ] **Paso 4: Commit**

```bash
git add src/views/DocumentarDesviacionModal.tsx src/views/alertItem.ts
git commit -m "feat(desviaciones): el modal para documentar"
```

---

## Tarea 6 · El botón en el ítem y el panel de desviaciones

**Archivos:**
- Modificar: `src/views/TrackAlertsView.tsx`

**Interfaces:**
- Consume: `DocumentarDesviacionModal` (Tarea 5); `useActiveAlerts().deviations` (Tarea 4);
  `deviationReasonLabel` (Tarea 2); `deleteDeviation` (Tarea 3).

- [ ] **Paso 1: El botón, sólo en la ventana vencida**

En el `map` de las alertas de visita (el que hoy dibuja el `<button style={dismissBtn}>`), sumar
un hermano más dentro del mismo `<div style={{ position: 'relative' }}>`, **condicionado a
`a.computed_status === 'ventana_vencida'`** — las otras dos clases (no vino, pendiente vencido) no
son desviaciones de ventana y no lo llevan. Y pasarle `conBotonDesviacion` al estilo del ítem con
la misma condición.

```tsx
{a.computed_status === 'ventana_vencida' && (
  <button
    type="button"
    style={deviationBtn}
    className="spira-card-link"
    title="Registrar por qué esta visita no se hizo en su ventana"
    aria-label={`Documentar la desviación de ${a.patient_name}`}
    onClick={() => setDocumentando({
      visitId: a.id,
      label: `${VISIT_STATES[a.computed_status].label} · ${vName} · ${a.patient_name}`,
    })}
  >
    <Icon name="clipboardCheck" size={14} />
    Documentar desviación
  </button>
)}
```

Con su estilo, arriba junto a `dismissBtn`:

```tsx
/* Botón de documentar: hermano del que abre la visita, abajo a la derecha. CON NOMBRE y no un
   ícono suelto: es la acción que RESUELVE el pendiente, y un segundo glifo mudo al lado de la X
   diría que las dos hacen lo mismo. El realce es por ELEVACIÓN (`.spira-card-link`), nunca un
   borde de color: acá el color ya significa gravedad. */
const deviationBtn: CSSProperties = {
  position: 'absolute', bottom: 8, right: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '5px 10px', borderRadius: 9,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12,
  color: 'var(--spira-ink)',
}
```

Y el estado, junto a `dismissing`:

```tsx
const [documentando, setDocumentando] = useState<DocumentandoTarget | null>(null)
```

- [ ] **Paso 2: Montar el modal**

Al lado de donde hoy se monta el modal de descarte:

```tsx
{documentando && (
  <DocumentarDesviacionModal
    target={documentando}
    accent={accent}
    onClose={() => setDocumentando(null)}
    onDone={() => { setDocumentando(null); setActionError(null) }}
    onError={(msg) => setActionError(msg)}
  />
)}
```

- [ ] **Paso 3: El panel de desviaciones, gemelo del de descartados**

**Se calca el bloque que ya existe en este mismo archivo** —el botón `Ver descartados (N)` y el
`{showDismissed && dismissals.length > 0 && (...)}` que dibuja el panel "Descartados"— y se le
aplican exactamente estos cambios. Calcarlo y no inventar otra anatomía es la regla de la casa:
si dos pantallas ofrecen el mismo gesto, tienen que verse iguales.

| En el original | En el gemelo |
|---|---|
| `showDismissed` / `setShowDismissed`, URL `descartadas` | `showDeviations` / `setShowDeviations`, URL `desviaciones` (mismo `codecs.bool`) |
| `Ver descartados (N)` / `Ocultar descartados` | `Ver desviaciones (N)` / `Ocultar desviaciones` |
| Título "Descartados" | Título "Desviaciones" |
| `dismissals.map(...)` | las dos listas de abajo, concatenadas |
| `reasonLabel(d.reason)` | `deviationReasonLabel(d.reason)` |
| `d.dismissed_by_name` / `d.dismissed_by_role` / `fromNow(d.dismissed_at)` | `d.recorded_by_name` / `d.recorded_by_role` / `fromNow(d.recorded_at)` |
| Botón "Restaurar" → `restoreAlert(d.id)` | Botón "Borrar" → `deleteDeviation(d.id)` |
| `style={dismissedRow}` | el mismo `dismissedRow` (no se duplica el estilo) |

El panel lista dos cosas, con el mismo renglón y una marca que las distingue:

1. **Documentadas**: las filas de `deviations`, resueltas contra `alertsQ.allVisitAlerts` para
   saber de qué visita hablan — igual que hace hoy el panel de descartados.
2. **Sin documentar**: las alertas de `allVisitAlerts` con `computed_status === 'ventana_vencida'`
   cuya inscripción está cerrada (`inscripcionCerrada(a.enrollment_status)`) y que **no** tienen
   desviación (`!isVisitDeviationRecorded(deviations, a)`). Van con la etiqueta "Sin documentar"
   y sin botón de borrar.

La bajada del panel, en castellano y sin tecnicismos:

> No se borró nada: la visita sigue como está y esto es el registro de por qué no se hizo en su
> ventana. Las de pacientes que ya salieron del estudio aparecen acá sin pedir acción.

Cada fila documentada lleva un botón "Borrar" que llama a `deleteDeviation(d.id)` y, ante error,
escribe en `setActionError` — exactamente como "Restaurar" en el panel de descartados.

- [ ] **Paso 4: Verificar que compila y que la suite sigue verde**

```bash
npm run build
```

Esperado: typecheck + tests + build, todo verde.

- [ ] **Paso 5: Commit**

```bash
git add src/views/TrackAlertsView.tsx
git commit -m "feat(desviaciones): documentar desde el pendiente y el panel de lo registrado"
```

---

## Tarea 7 · La marca en la visita

**Archivos:**
- Modificar: `src/views/track/VisitHeader.tsx`

**Interfaces:**
- Consume: `useDeviations` (Tarea 3), `deviationReasonLabel`, `isVisitDeviationRecorded` (Tarea 2).

- [ ] **Paso 1: Mostrar la marca**

En `VisitHeader`, al lado de donde hoy se resuelve `fuera` (`fueraDeVentana(...)`), resolver la
desviación de ESA ventana:

```tsx
const deviations = useDeviations()
/* La de esta visita y esta ventana. El ancla es lo que evita que una desviación vieja siga
   mostrándose sobre una visita que se reprogramó y todavía no volvió a vencer. */
const desviacion = (deviations.data ?? []).find(
  (d) => d.visit_id === visit.id && d.anchor === visit.window_end,
)
```

Y donde se dibuja la pastilla "Fuera de ventana", sumar la marca con el motivo:

```tsx
{desviacion && (
  <span
    title={desviacion.detail}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
      color: 'var(--spira-acc-deep-warn)',
    }}
  >
    <Icon name="clipboardCheck" size={14} color="var(--spira-acc-deep-warn)" />
    Desviación documentada · {deviationReasonLabel(desviacion.reason)}
  </span>
)}
```

**El `title` lleva la explicación completa**: el motivo clasifica y entra en una línea; el detalle
es lo que un monitor necesita y no puede empujar el encabezado a dos renglones.

- [ ] **Paso 2: Verificar**

```bash
npm run build
```

Esperado: verde.

- [ ] **Paso 3: Commit**

```bash
git add src/views/track/VisitHeader.tsx
git commit -m "feat(desviaciones): la visita muestra que su desvío está documentado"
```

---

## Tarea 8 · Verificación en el navegador

**Requiere la 0131 aplicada en prod.** Hasta que el Director confirme, el front funciona con el
mensaje de "falta aplicar una actualización" al intentar documentar, que es lo correcto — pero no
se puede dar por verificado.

- [ ] **Paso 1: Levantar el preview**

Puerto **5250** (`.claude/launch.json`), no el 5173 del Director. El Director se loguea a mano una
vez; el agente no ingresa contraseñas.

- [ ] **Paso 2: Crear la condición sin tocar datos reales**

No hay ventanas vencidas en prod (medido el 2026-09-17). Crear una visita de prueba con prefijo
`TEST-*` y ventana pasada, y **borrar exactamente esa** al terminar. **Nunca** borrar en lote por
categoría.

- [ ] **Paso 3: Documentar la desviación y comprobar las cuatro cosas**

1. El ítem **sale de la lista** y el contador baja.
2. **La campana baja en el mismo gesto** (si no, la señal común de la Tarea 3 no está llegando:
   es el bug conocido de "la lista bajó a 21 y el badge seguía en 22").
3. Aparece en el panel de desviaciones con motivo, autor y fecha.
4. La visita muestra la marca.

Verificar por **snapshot / `javascript_tool` / estilos computados**, no por captura:
`preview_screenshot` se cuelga casi siempre en este proyecto. Y el panel oculto renderiza **lento**
(esperar 4-5 s después de un `navigate`); para apuntar, `element.click()` por selector, no por
coordenadas.

- [ ] **Paso 4: Borrar el dato de prueba y cerrar**

Borrar la visita `TEST-*` creada, y sólo esa.

```bash
npm run build
```

Esperado: verde. Recién con esto y la verificación de arriba se puede decir que anda.

---

## Antes de empezar, dos cosas para el Director

1. **El único dibujo nuevo es el botón "Documentar desviación" dentro del ítem** (abajo a la
   derecha, con nombre, realce por elevación). No hay mock para esto, y la regla de la casa es que
   el mock va al repo antes de implementar. Si querés verlo antes, es el momento de pedirlo — es
   la Tarea 5/6 y se cambia de lugar con una línea.
2. **El label del motivo 6 quedó "Otro" y no "Otro (explicar)"**: como la explicación ahora se
   pide siempre, el paréntesis prometía una distinción que no existe.
