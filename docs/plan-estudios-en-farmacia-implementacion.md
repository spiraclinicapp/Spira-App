# Estudios en Farmacia · PR 1 — Plan de implementación

> **Para quien lo ejecute:** los pasos van con casilla (`- [ ]`) para ir tildando. Cada tarea
> termina en un commit y algo verificable. El **qué** y el **por qué** están en
> [`plan-estudios-en-farmacia.md`](plan-estudios-en-farmacia.md); esto es el **cómo**.

**Objetivo:** que gerencia pueda acotar a una persona de Farmacia a una lista cerrada de estudios,
con el recorte aplicado de verdad en la RLS sobre los estudios y sus pacientes.

**Arquitectura:** una columna en `user_module_roles` (el interruptor) + una tabla
`pharma_protocol_access` (la lista) + **ocho** funciones `security definer` que responden "¿este
protocolo está dentro del alcance?"; las policies de Farmacia **suman** una llamada a esas funciones
sin tocar la condición que ya tenían.

> **Ocho y no siete, como decía el spec.** Al escribir `pharma_alcanza_paciente` apareció que un
> paciente **sin ningún enrolamiento** daría `false` por el `exists`, y entonces dejaría de verlo
> también quien **no** tiene recorte: una regresión silenciosa para todo el mundo. La octava,
> `pharma_sin_recorte()`, es el atajo que va primero en las siete restantes y corta antes de tocar
> una tabla. De paso es lo que hace que el caso común —nadie acotado— no pague ni un join. La consola vive en Ajustes › Equipo y accesos, como una
tarjeta hermana de la de Coordinación.

**Stack:** Postgres 15 (Supabase), TypeScript strict, React 18 sin router ni react-query, Vite,
Vitest. CSS con variables de `src/styles/tokens.css`.

## Restricciones globales

Valen para **todas** las tareas. No se repiten en cada paso.

- **Migración `0138`**, nombre `0138_estudios_en_farmacia.sql`. Verificado libre: la última aplicada
  en prod es la 0137 y nadie reservó la 0138 en docs.
- **Las migraciones son inmutables una vez aplicadas.** Hasta que el Director confirme "aplicada",
  el archivo se puede editar. Después, **nunca**: todo cambio es un archivo nuevo.
- **La migración va PRIMERO**, antes del deploy del front. Todo lo de esta PR es aditivo mientras
  nadie esté acotado (`ve_todos_los_estudios` arranca en `true` para todos), así que no hay ventana
  de front roto.
- **No hay acceso SQL a producción.** El archivo tiene que correr **tal cual** en el editor de
  Supabase, sin placeholders `<...>`, y ser **idempotente** (se puede correr dos veces).
- **Las sentencias del editor de Supabase NO comparten sesión ni transacción.** Nada de
  `create temporary table` entre sentencias; si algo tiene que ser atómico, va adentro de una
  función `plpgsql`.
- **Nunca dos signos peso pegados dentro de un comentario SQL.** El editor de Supabase cuenta los
  dollar-quotes sin ignorar comentarios, y uno suelto le invierte la paridad. Usar tags con nombre
  (`$fn$`), y contar que los marcadores del texto crudo den número par.
- **Adentro de una función con `set search_path` acotado, calificar todo lo que no sea de `public`
  ni de `pg_catalog`.** Para uuid en runtime, `gen_random_uuid()` (de `pg_catalog`), nunca
  `uuid_generate_v4()`.
- **`create or replace view` PIERDE `security_invoker`.** Toda vista que se recree repite su
  `with (security_invoker = true)`, y el archivo termina con la sonda de `reloptions`.
- **Toda tabla con trigger de auditoría necesita una columna `id`**: `audit_row()` resuelve `old.id`
  al planificar.
- **Idioma:** comentarios, nombres de dominio y copy de UI en castellano rioplatense. En la UI los
  módulos se llaman **Coordinación** y **Farmacia**; en el código siguen siendo `track` y `pharma`.
- **Realce = elevación**, nunca borde de color. El color se reserva para significado.
- **El gate de verificación es `npm run build` verde** (`tsc --noEmit && vitest run && vite build`)
  **+ mirarlo en el navegador**. No se afirma que algo anda sin las dos cosas.
- **Rama:** `feat/estudios-en-farmacia`. Stagear **por ruta** (`git add <archivos>`), nunca `-A`.
- **Verificar la rama antes de cada commit.** Hay un hook que bloquea commits en `main`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0138_estudios_en_farmacia.sql` | **Crear.** Todo el SQL: modelo, funciones, auditoría, RPC y el recorte de 9 policies sobre 7 tablas. |
| `supabase/README.md` | **Modificar.** La fila del índice para la 0138 (CI lo vigila con `scripts/check-migraciones.mjs`). |
| `src/data/pharmaAccessModel.ts` | **Crear.** Lógica **pura** del borrador: de (vigente, borrador) a la lista ordenada de llamadas. Sin React ni Supabase. |
| `src/data/pharmaAccessModel.test.ts` | **Crear.** Sus tests. |
| `src/data/pharmaAccess.ts` | **Crear.** Capa de datos: hooks de lectura + las dos mutaciones + traducción de errores. |
| `src/lib/roles.ts` | **Modificar.** `PharmaAccessAuditRow`, `pharmaAuditLine`, y `mezclarHistorial` pasa a tres listas. |
| `src/lib/roles.test.ts` | **Modificar.** Tests de lo anterior. |
| `src/shell/settings/AccesoEditor.tsx` | **Modificar.** La tarjeta «Estudios en Farmacia», el borrador, el guardado y el bloque «Qué va a ver al entrar». |
| `src/shell/settings/EquipoYAccesosSection.tsx` | **Modificar.** Baja las dos consultas nuevas por prop, como ya hace con `asignaciones`. |

**Por qué `pharmaAccessModel.ts` está separado de `pharmaAccess.ts`:** es el mismo criterio que
`views/resumen/ambito.ts` y `pharma/dispensaciones/estados.ts`. La lógica que decide **qué llamadas
se mandan y en qué orden** falla en silencio —una llamada de menos deja un acceso sin revocar y la
pantalla se ve impecable—, así que vive pura y testeada. El archivo con `supabase` adentro no se
puede testear desde node.

---

## Tarea 1 · Migración 0138, parte A: el modelo y las siete funciones

**Archivos:**
- Crear: `supabase/migrations/0138_estudios_en_farmacia.sql`
- Banco de pruebas (descartable, **no se commitea**): `<scratchpad>/pglite-0138/`

**Interfaces que produce:**
- Tabla `public.pharma_protocol_access (id uuid, user_id uuid, protocol_id uuid, assigned_at timestamptz)`
- Columna `public.user_module_roles.ve_todos_los_estudios boolean not null default true`
- `public.pharma_sin_recorte() → boolean`
- `public.pharma_alcanza_protocolo(proto_id uuid) → boolean`
- `public.pharma_alcanza_paciente(p_patient_id uuid) → boolean`
- `public.pharma_alcanza_lote(p_lot_id uuid) → boolean`
- `public.pharma_alcanza_recepcion(p_reception_id uuid) → boolean`
- `public.pharma_alcanza_solicitud(p_request_id uuid) → boolean`
- `public.pharma_alcanza_dispensacion(p_dispensation_id uuid) → boolean`
- `public.pharma_alcanza_pedido(p_pedido_id uuid) → boolean`

- [ ] **Paso 1: Crear el archivo con la cabecera y la parte A**

Crear `supabase/migrations/0138_estudios_en_farmacia.sql` con esto:

```sql
-- ============================================================================
-- 0138 · Estudios en Farmacia: el recorte por protocolo
--
-- Plan: docs/plan-estudios-en-farmacia.md (PR 1).
--
-- ── QUÉ HACE ──
-- Farmacia es central desde el día uno: sus policies abren con has_module('pharma') a secas, sin
-- mirar de qué estudio es la fila. Esta migración le pone la perilla que Coordinación tiene desde
-- la 0002: gerencia puede acotar a una persona a una LISTA CERRADA de estudios.
--
-- Dos estados por persona, y la bandera es explícita a propósito:
--   · ve_todos_los_estudios = true  → ve todo (lo predeterminado, y como queda TODO EL MUNDO hoy)
--   · ve_todos_los_estudios = false → ve sólo los de pharma_protocol_access, y los estudios que se
--     creen más adelante TAMPOCO los ve hasta que alguien se los dé.
--
-- Sin la bandera, el estado se calcularía ("si no tiene filas, ve todo") y quitarle a alguien su
-- último estudio lo devolvería a ver el centro entero, sin que nadie lo decidiera y sin un solo
-- error. Una ampliación de permisos en silencio es lo que no puede pasar acá.
--
-- ── ADITIVA Y NO BREAKING ──
-- Mientras nadie esté acotado, ninguna policy nueva cambia una sola fila: pharma_sin_recorte()
-- devuelve true para todos. Por eso va ANTES del deploy del front. Lo que no funciona sin ella es
-- la consola nueva.
--
-- ── ALCANCE DE ESTE ARCHIVO ──
-- Recorta SÓLO los estudios y sus pacientes (PR 1). El stock, las recepciones, las dispensaciones,
-- la reposición y las estadísticas van en las PRs 2 a 4 (migraciones 0139 a 0141), que son puras
-- policies porque las siete funciones de alcance quedan definidas acá.
--
-- ⚠️ REGLA OPERATIVA: NO acotar a nadie en prod hasta que la 0141 esté aplicada. Entre medio el
-- recorte es parcial —la grilla filtra pero el stock no— y una restricción a medias promete un
-- candado que todavía no cierra.
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0137. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · El interruptor -----------------------------------------------------------------------------
-- Va en user_module_roles y no en una tabla propia: es un modificador DEL ROL, la tabla ya tiene
-- exactamente una fila por (persona, modulo) por su unique de la 0002, y ya la audita
-- trg_audit_module_roles (0003), así que el cambio queda registrado sin trigger nuevo.
--
-- CONSECUENCIA ASUMIDA (y documentada en el plan): si se le quita Farmacia a alguien y se le vuelve
-- a dar, la fila se borra y vuelve con true. El recorte se pierde. Queda en el audit_log y gerencia
-- ve la tarjeta en "ve todos" al momento de re-darle el módulo, pero hay que saberlo.
--
-- Coordinación NO lee esta columna: es lista cerrada siempre (protocol_coordinators + 0006).
alter table public.user_module_roles
  add column if not exists ve_todos_los_estudios boolean not null default true;

comment on column public.user_module_roles.ve_todos_los_estudios is
  'Farmacia: true = ve todos los estudios (predeterminado). false = ve solo los de '
  'pharma_protocol_access, y los que se creen despues TAMPOCO. Coordinacion no la lee. 0138.';


-- 2 · La lista cerrada ---------------------------------------------------------------------------
-- La columna `id` NO es decorativa: audit_row() (0003) hace
--   case when tg_op = 'DELETE' then old.id else new.id end
-- y Postgres resuelve old.id AL PLANIFICAR, sin importar por que rama vaya a pasar. Una tabla
-- auditada sin `id` revienta en la primera escritura con 42703, senalando el cuerpo de audit_row y
-- no esta tabla. Paso con la 0111.
--
-- El default es gen_random_uuid() (pg_catalog) y no uuid_generate_v4() (schema extensions): la
-- regla es una sola para todo el archivo, porque mas abajo hay funciones con search_path acotado
-- donde sin calificar aplica en verde y revienta en la primera llamada con 42883 (paso con la 0113).
create table if not exists public.pharma_protocol_access (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id)     on delete cascade,
  protocol_id uuid not null references public.protocols(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (user_id, protocol_id)
);

create index if not exists ix_ppa_user     on public.pharma_protocol_access (user_id);
create index if not exists ix_ppa_protocol on public.pharma_protocol_access (protocol_id);

comment on table public.pharma_protocol_access is
  'Que estudios ve en FARMACIA una persona acotada. Solo se lee cuando '
  'user_module_roles.ve_todos_los_estudios es false. Se escribe UNICAMENTE por '
  'set_pharma_protocol_access (security definer): no hay policy de escritura. 0138.';

alter table public.pharma_protocol_access enable row level security;

-- Lectura: lo propio, o todo si administra accesos. La consola de gerencia las necesita enteras
-- para pintar los chips de cualquiera.
--
-- NO HAY POLICY DE ESCRITURA, y es deliberado: una que aceptara a gerencia dejaria de paso que un
-- operator de Farmacia se auto-asigne estudios por PostgREST. Se escribe solo por el RPC, que lleva
-- la autorizacion adentro. Mismo criterio que la 0110 con protocol_coordinators.
drop policy if exists "ver alcance de farmacia" on public.pharma_protocol_access;
create policy "ver alcance de farmacia" on public.pharma_protocol_access for select
  using (user_id = auth.uid() or public.has_module('gerencia'));


-- 3 · Las funciones de alcance -------------------------------------------------------------------
-- OJO CON LOS NOMBRES: dicen "alcanza", no "ve". NINGUNA comprueba el modulo ni el nivel, y eso es
-- a proposito.
--
-- El barrido de las policies tiene que SUMAR esta condicion, nunca reemplazar la que ya estaba:
--   ANTES:   using (has_module('pharma') or has_module('gerencia'))
--   DESPUES: using ((has_module('pharma') and pharma_alcanza_protocolo(protocol_id))
--                   or has_module('gerencia'))
-- Once de las 42 policies a recortar comprueban NIVEL (has_min_role('pharma','operator')) y no
-- modulo. Si el barrido las sustituye, el recorte queda bien y el nivel se pierde: un viewer de
-- Farmacia ganaria escritura sobre los pedidos de reposicion. Un candado nuevo que abre otro.
--
-- Y la clausula de gerencia queda SIEMPRE afuera del and: gerencia ve todo el centro, igual que en
-- Coordinacion.

-- Esta persona, ¿NO tiene recorte? true = ve todos los estudios.
-- Separada de las demas porque es el atajo: para el 100% de la gente de hoy devuelve true y ninguna
-- de las otras seis llega a tocar una tabla.
create or replace function public.pharma_sin_recorte()
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select coalesce(
    (select r.ve_todos_los_estudios
       from public.user_module_roles r
      where r.user_id = auth.uid() and r.module = 'pharma'), true);
$fn$;

comment on function public.pharma_sin_recorte is
  'true = la persona ve todos los estudios en Farmacia (lo predeterminado, y lo que devuelve '
  'tambien para quien no tiene el modulo). 0138.';

-- ¿Este protocolo esta dentro del alcance de Farmacia de quien consulta?
create or replace function public.pharma_alcanza_protocolo(proto_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.pharma_protocol_access a
     where a.user_id = auth.uid() and a.protocol_id = proto_id);
$fn$;

comment on function public.pharma_alcanza_protocolo is
  'Alcance por protocolo en Farmacia. NO comprueba el modulo ni el nivel: se SUMA a la condicion '
  'que la policy ya tenia, nunca la reemplaza. 0138.';

-- ¿Alcanza a este paciente? Si alcanza ALGUNO de sus estudios.
--
-- EL `exists` NO ES COSMETICO: hay pacientes inscriptos en DOS protocolos en produccion. Con un `=`
-- contra el primer enrolamiento, uno de LTS17231 y ACT18301 apareceria o desapareceria segun el
-- orden que devolviera la consulta — la misma trampa que hace que todo enrollments[0] del front
-- este mal.
--
-- Y el atajo de pharma_sin_recorte() va PRIMERO por una razon de correccion, no de velocidad: un
-- paciente SIN ningun enrolamiento daria false por el exists, y sin el atajo dejaria de verlo
-- tambien quien no tiene recorte. Seria una regresion silenciosa para todo el mundo.
create or replace function public.pharma_alcanza_paciente(p_patient_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.enrollments e
     where e.patient_id = p_patient_id
       and public.pharma_alcanza_protocolo(e.protocol_id));
$fn$;

comment on function public.pharma_alcanza_paciente is
  'Alcanza al paciente si alcanza ALGUNO de sus estudios (hay pacientes en dos protocolos). 0138.';

-- Las cuatro transitivas que usan las PRs 2, 3 y 4. Se definen ACA para que esas migraciones sean
-- puras policies: un archivo que solo agrega condiciones es mucho mas facil de revisar que uno que
-- ademas estrena funciones.
create or replace function public.pharma_alcanza_lote(p_lot_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.medication_lots l
     where l.id = p_lot_id and public.pharma_alcanza_protocolo(l.protocol_id));
$fn$;

create or replace function public.pharma_alcanza_recepcion(p_reception_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.medication_receptions r
     where r.id = p_reception_id and public.pharma_alcanza_protocolo(r.protocol_id));
$fn$;

-- dispensation_requests.protocol_id lo sella create_dispensation_request desde la 0071, y esta
-- desnormalizado justamente porque Farmacia NO puede leer patient_visits: un join para llegar al
-- protocolo devolveria cero filas en silencio.
create or replace function public.pharma_alcanza_solicitud(p_request_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.dispensation_requests dr
     where dr.id = p_request_id and public.pharma_alcanza_protocolo(dr.protocol_id));
$fn$;

create or replace function public.pharma_alcanza_dispensacion(p_dispensation_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.dispensations d
     where d.id = p_dispensation_id and public.pharma_alcanza_solicitud(d.request_id));
$fn$;

create or replace function public.pharma_alcanza_pedido(p_pedido_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.pedidos_medicacion pm
     where pm.id = p_pedido_id and public.pharma_alcanza_protocolo(pm.protocol_id));
$fn$;

grant execute on function public.pharma_sin_recorte()                to authenticated;
grant execute on function public.pharma_alcanza_protocolo(uuid)      to authenticated;
grant execute on function public.pharma_alcanza_paciente(uuid)       to authenticated;
grant execute on function public.pharma_alcanza_lote(uuid)           to authenticated;
grant execute on function public.pharma_alcanza_recepcion(uuid)      to authenticated;
grant execute on function public.pharma_alcanza_solicitud(uuid)      to authenticated;
grant execute on function public.pharma_alcanza_dispensacion(uuid)   to authenticated;
grant execute on function public.pharma_alcanza_pedido(uuid)         to authenticated;
```

- [ ] **Paso 2: Contar los dollar-quotes del archivo**

El editor de Supabase rastrea el dollar-quoting **sin ignorar los comentarios**, así que un marcador
suelto le invierte la paridad y parte las funciones por sus `;` internos. El error que tira es
lejanísimo del comentario culpable. Se detecta contando sobre el texto crudo:

Run:
```bash
node -e 'const t=require("fs").readFileSync("supabase/migrations/0138_estudios_en_farmacia.sql","utf8");const m=t.match(/\$[a-zA-Z_]*\$/g)||[];console.log("marcadores:",m.length,m.length%2===0?"PAR ok":"IMPAR ROTO")'
```
Expected: `marcadores: 16 PAR ok` (8 funciones × 2). Si dice IMPAR, hay un `# Estudios en Farmacia · PR 1 — Plan de implementación

> **Para quien lo ejecute:** los pasos van con casilla (`- [ ]`) para ir tildando. Cada tarea
> termina en un commit y algo verificable. El **qué** y el **por qué** están en
> [`plan-estudios-en-farmacia.md`](plan-estudios-en-farmacia.md); esto es el **cómo**.

**Objetivo:** que gerencia pueda acotar a una persona de Farmacia a una lista cerrada de estudios,
con el recorte aplicado de verdad en la RLS sobre los estudios y sus pacientes.

**Arquitectura:** una columna en `user_module_roles` (el interruptor) + una tabla
`pharma_protocol_access` (la lista) + **ocho** funciones `security definer` que responden "¿este
protocolo está dentro del alcance?"; las policies de Farmacia **suman** una llamada a esas funciones
sin tocar la condición que ya tenían.

> **Ocho y no siete, como decía el spec.** Al escribir `pharma_alcanza_paciente` apareció que un
> paciente **sin ningún enrolamiento** daría `false` por el `exists`, y entonces dejaría de verlo
> también quien **no** tiene recorte: una regresión silenciosa para todo el mundo. La octava,
> `pharma_sin_recorte()`, es el atajo que va primero en las siete restantes y corta antes de tocar
> una tabla. De paso es lo que hace que el caso común —nadie acotado— no pague ni un join. La consola vive en Ajustes › Equipo y accesos, como una
tarjeta hermana de la de Coordinación.

**Stack:** Postgres 15 (Supabase), TypeScript strict, React 18 sin router ni react-query, Vite,
Vitest. CSS con variables de `src/styles/tokens.css`.

## Restricciones globales

Valen para **todas** las tareas. No se repiten en cada paso.

- **Migración `0138`**, nombre `0138_estudios_en_farmacia.sql`. Verificado libre: la última aplicada
  en prod es la 0137 y nadie reservó la 0138 en docs.
- **Las migraciones son inmutables una vez aplicadas.** Hasta que el Director confirme "aplicada",
  el archivo se puede editar. Después, **nunca**: todo cambio es un archivo nuevo.
- **La migración va PRIMERO**, antes del deploy del front. Todo lo de esta PR es aditivo mientras
  nadie esté acotado (`ve_todos_los_estudios` arranca en `true` para todos), así que no hay ventana
  de front roto.
- **No hay acceso SQL a producción.** El archivo tiene que correr **tal cual** en el editor de
  Supabase, sin placeholders `<...>`, y ser **idempotente** (se puede correr dos veces).
- **Las sentencias del editor de Supabase NO comparten sesión ni transacción.** Nada de
  `create temporary table` entre sentencias; si algo tiene que ser atómico, va adentro de una
  función `plpgsql`.
- **Nunca dos signos peso pegados dentro de un comentario SQL.** El editor de Supabase cuenta los
  dollar-quotes sin ignorar comentarios, y uno suelto le invierte la paridad. Usar tags con nombre
  (`$fn$`), y contar que los marcadores del texto crudo den número par.
- **Adentro de una función con `set search_path` acotado, calificar todo lo que no sea de `public`
  ni de `pg_catalog`.** Para uuid en runtime, `gen_random_uuid()` (de `pg_catalog`), nunca
  `uuid_generate_v4()`.
- **`create or replace view` PIERDE `security_invoker`.** Toda vista que se recree repite su
  `with (security_invoker = true)`, y el archivo termina con la sonda de `reloptions`.
- **Toda tabla con trigger de auditoría necesita una columna `id`**: `audit_row()` resuelve `old.id`
  al planificar.
- **Idioma:** comentarios, nombres de dominio y copy de UI en castellano rioplatense. En la UI los
  módulos se llaman **Coordinación** y **Farmacia**; en el código siguen siendo `track` y `pharma`.
- **Realce = elevación**, nunca borde de color. El color se reserva para significado.
- **El gate de verificación es `npm run build` verde** (`tsc --noEmit && vitest run && vite build`)
  **+ mirarlo en el navegador**. No se afirma que algo anda sin las dos cosas.
- **Rama:** `feat/estudios-en-farmacia`. Stagear **por ruta** (`git add <archivos>`), nunca `-A`.
- **Verificar la rama antes de cada commit.** Hay un hook que bloquea commits en `main`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0138_estudios_en_farmacia.sql` | **Crear.** Todo el SQL: modelo, funciones, auditoría, RPC y el recorte de 9 policies sobre 7 tablas. |
| `supabase/README.md` | **Modificar.** La fila del índice para la 0138 (CI lo vigila con `scripts/check-migraciones.mjs`). |
| `src/data/pharmaAccessModel.ts` | **Crear.** Lógica **pura** del borrador: de (vigente, borrador) a la lista ordenada de llamadas. Sin React ni Supabase. |
| `src/data/pharmaAccessModel.test.ts` | **Crear.** Sus tests. |
| `src/data/pharmaAccess.ts` | **Crear.** Capa de datos: hooks de lectura + las dos mutaciones + traducción de errores. |
| `src/lib/roles.ts` | **Modificar.** `PharmaAccessAuditRow`, `pharmaAuditLine`, y `mezclarHistorial` pasa a tres listas. |
| `src/lib/roles.test.ts` | **Modificar.** Tests de lo anterior. |
| `src/shell/settings/AccesoEditor.tsx` | **Modificar.** La tarjeta «Estudios en Farmacia», el borrador, el guardado y el bloque «Qué va a ver al entrar». |
| `src/shell/settings/EquipoYAccesosSection.tsx` | **Modificar.** Baja las dos consultas nuevas por prop, como ya hace con `asignaciones`. |

**Por qué `pharmaAccessModel.ts` está separado de `pharmaAccess.ts`:** es el mismo criterio que
`views/resumen/ambito.ts` y `pharma/dispensaciones/estados.ts`. La lógica que decide **qué llamadas
se mandan y en qué orden** falla en silencio —una llamada de menos deja un acceso sin revocar y la
pantalla se ve impecable—, así que vive pura y testeada. El archivo con `supabase` adentro no se
puede testear desde node.

---

## Tarea 1 · Migración 0138, parte A: el modelo y las siete funciones

**Archivos:**
- Crear: `supabase/migrations/0138_estudios_en_farmacia.sql`
- Banco de pruebas (descartable, **no se commitea**): `<scratchpad>/pglite-0138/`

**Interfaces que produce:**
- Tabla `public.pharma_protocol_access (id uuid, user_id uuid, protocol_id uuid, assigned_at timestamptz)`
- Columna `public.user_module_roles.ve_todos_los_estudios boolean not null default true`
- `public.pharma_sin_recorte() → boolean`
- `public.pharma_alcanza_protocolo(proto_id uuid) → boolean`
- `public.pharma_alcanza_paciente(p_patient_id uuid) → boolean`
- `public.pharma_alcanza_lote(p_lot_id uuid) → boolean`
- `public.pharma_alcanza_recepcion(p_reception_id uuid) → boolean`
- `public.pharma_alcanza_solicitud(p_request_id uuid) → boolean`
- `public.pharma_alcanza_dispensacion(p_dispensation_id uuid) → boolean`
- `public.pharma_alcanza_pedido(p_pedido_id uuid) → boolean`

- [ ] **Paso 1: Crear el archivo con la cabecera y la parte A**

Crear `supabase/migrations/0138_estudios_en_farmacia.sql` con esto:

```sql
-- ============================================================================
-- 0138 · Estudios en Farmacia: el recorte por protocolo
--
-- Plan: docs/plan-estudios-en-farmacia.md (PR 1).
--
-- ── QUÉ HACE ──
-- Farmacia es central desde el día uno: sus policies abren con has_module('pharma') a secas, sin
-- mirar de qué estudio es la fila. Esta migración le pone la perilla que Coordinación tiene desde
-- la 0002: gerencia puede acotar a una persona a una LISTA CERRADA de estudios.
--
-- Dos estados por persona, y la bandera es explícita a propósito:
--   · ve_todos_los_estudios = true  → ve todo (lo predeterminado, y como queda TODO EL MUNDO hoy)
--   · ve_todos_los_estudios = false → ve sólo los de pharma_protocol_access, y los estudios que se
--     creen más adelante TAMPOCO los ve hasta que alguien se los dé.
--
-- Sin la bandera, el estado se calcularía ("si no tiene filas, ve todo") y quitarle a alguien su
-- último estudio lo devolvería a ver el centro entero, sin que nadie lo decidiera y sin un solo
-- error. Una ampliación de permisos en silencio es lo que no puede pasar acá.
--
-- ── ADITIVA Y NO BREAKING ──
-- Mientras nadie esté acotado, ninguna policy nueva cambia una sola fila: pharma_sin_recorte()
-- devuelve true para todos. Por eso va ANTES del deploy del front. Lo que no funciona sin ella es
-- la consola nueva.
--
-- ── ALCANCE DE ESTE ARCHIVO ──
-- Recorta SÓLO los estudios y sus pacientes (PR 1). El stock, las recepciones, las dispensaciones,
-- la reposición y las estadísticas van en las PRs 2 a 4 (migraciones 0139 a 0141), que son puras
-- policies porque las siete funciones de alcance quedan definidas acá.
--
-- ⚠️ REGLA OPERATIVA: NO acotar a nadie en prod hasta que la 0141 esté aplicada. Entre medio el
-- recorte es parcial —la grilla filtra pero el stock no— y una restricción a medias promete un
-- candado que todavía no cierra.
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0137. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · El interruptor -----------------------------------------------------------------------------
-- Va en user_module_roles y no en una tabla propia: es un modificador DEL ROL, la tabla ya tiene
-- exactamente una fila por (persona, modulo) por su unique de la 0002, y ya la audita
-- trg_audit_module_roles (0003), así que el cambio queda registrado sin trigger nuevo.
--
-- CONSECUENCIA ASUMIDA (y documentada en el plan): si se le quita Farmacia a alguien y se le vuelve
-- a dar, la fila se borra y vuelve con true. El recorte se pierde. Queda en el audit_log y gerencia
-- ve la tarjeta en "ve todos" al momento de re-darle el módulo, pero hay que saberlo.
--
-- Coordinación NO lee esta columna: es lista cerrada siempre (protocol_coordinators + 0006).
alter table public.user_module_roles
  add column if not exists ve_todos_los_estudios boolean not null default true;

comment on column public.user_module_roles.ve_todos_los_estudios is
  'Farmacia: true = ve todos los estudios (predeterminado). false = ve solo los de '
  'pharma_protocol_access, y los que se creen despues TAMPOCO. Coordinacion no la lee. 0138.';


-- 2 · La lista cerrada ---------------------------------------------------------------------------
-- La columna `id` NO es decorativa: audit_row() (0003) hace
--   case when tg_op = 'DELETE' then old.id else new.id end
-- y Postgres resuelve old.id AL PLANIFICAR, sin importar por que rama vaya a pasar. Una tabla
-- auditada sin `id` revienta en la primera escritura con 42703, senalando el cuerpo de audit_row y
-- no esta tabla. Paso con la 0111.
--
-- El default es gen_random_uuid() (pg_catalog) y no uuid_generate_v4() (schema extensions): la
-- regla es una sola para todo el archivo, porque mas abajo hay funciones con search_path acotado
-- donde sin calificar aplica en verde y revienta en la primera llamada con 42883 (paso con la 0113).
create table if not exists public.pharma_protocol_access (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id)     on delete cascade,
  protocol_id uuid not null references public.protocols(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (user_id, protocol_id)
);

create index if not exists ix_ppa_user     on public.pharma_protocol_access (user_id);
create index if not exists ix_ppa_protocol on public.pharma_protocol_access (protocol_id);

comment on table public.pharma_protocol_access is
  'Que estudios ve en FARMACIA una persona acotada. Solo se lee cuando '
  'user_module_roles.ve_todos_los_estudios es false. Se escribe UNICAMENTE por '
  'set_pharma_protocol_access (security definer): no hay policy de escritura. 0138.';

alter table public.pharma_protocol_access enable row level security;

-- Lectura: lo propio, o todo si administra accesos. La consola de gerencia las necesita enteras
-- para pintar los chips de cualquiera.
--
-- NO HAY POLICY DE ESCRITURA, y es deliberado: una que aceptara a gerencia dejaria de paso que un
-- operator de Farmacia se auto-asigne estudios por PostgREST. Se escribe solo por el RPC, que lleva
-- la autorizacion adentro. Mismo criterio que la 0110 con protocol_coordinators.
drop policy if exists "ver alcance de farmacia" on public.pharma_protocol_access;
create policy "ver alcance de farmacia" on public.pharma_protocol_access for select
  using (user_id = auth.uid() or public.has_module('gerencia'));


-- 3 · Las funciones de alcance -------------------------------------------------------------------
-- OJO CON LOS NOMBRES: dicen "alcanza", no "ve". NINGUNA comprueba el modulo ni el nivel, y eso es
-- a proposito.
--
-- El barrido de las policies tiene que SUMAR esta condicion, nunca reemplazar la que ya estaba:
--   ANTES:   using (has_module('pharma') or has_module('gerencia'))
--   DESPUES: using ((has_module('pharma') and pharma_alcanza_protocolo(protocol_id))
--                   or has_module('gerencia'))
-- Once de las 42 policies a recortar comprueban NIVEL (has_min_role('pharma','operator')) y no
-- modulo. Si el barrido las sustituye, el recorte queda bien y el nivel se pierde: un viewer de
-- Farmacia ganaria escritura sobre los pedidos de reposicion. Un candado nuevo que abre otro.
--
-- Y la clausula de gerencia queda SIEMPRE afuera del and: gerencia ve todo el centro, igual que en
-- Coordinacion.

-- Esta persona, ¿NO tiene recorte? true = ve todos los estudios.
-- Separada de las demas porque es el atajo: para el 100% de la gente de hoy devuelve true y ninguna
-- de las otras seis llega a tocar una tabla.
create or replace function public.pharma_sin_recorte()
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select coalesce(
    (select r.ve_todos_los_estudios
       from public.user_module_roles r
      where r.user_id = auth.uid() and r.module = 'pharma'), true);
$fn$;

comment on function public.pharma_sin_recorte is
  'true = la persona ve todos los estudios en Farmacia (lo predeterminado, y lo que devuelve '
  'tambien para quien no tiene el modulo). 0138.';

-- ¿Este protocolo esta dentro del alcance de Farmacia de quien consulta?
create or replace function public.pharma_alcanza_protocolo(proto_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.pharma_protocol_access a
     where a.user_id = auth.uid() and a.protocol_id = proto_id);
$fn$;

comment on function public.pharma_alcanza_protocolo is
  'Alcance por protocolo en Farmacia. NO comprueba el modulo ni el nivel: se SUMA a la condicion '
  'que la policy ya tenia, nunca la reemplaza. 0138.';

-- ¿Alcanza a este paciente? Si alcanza ALGUNO de sus estudios.
--
-- EL `exists` NO ES COSMETICO: hay pacientes inscriptos en DOS protocolos en produccion. Con un `=`
-- contra el primer enrolamiento, uno de LTS17231 y ACT18301 apareceria o desapareceria segun el
-- orden que devolviera la consulta — la misma trampa que hace que todo enrollments[0] del front
-- este mal.
--
-- Y el atajo de pharma_sin_recorte() va PRIMERO por una razon de correccion, no de velocidad: un
-- paciente SIN ningun enrolamiento daria false por el exists, y sin el atajo dejaria de verlo
-- tambien quien no tiene recorte. Seria una regresion silenciosa para todo el mundo.
create or replace function public.pharma_alcanza_paciente(p_patient_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.enrollments e
     where e.patient_id = p_patient_id
       and public.pharma_alcanza_protocolo(e.protocol_id));
$fn$;

comment on function public.pharma_alcanza_paciente is
  'Alcanza al paciente si alcanza ALGUNO de sus estudios (hay pacientes en dos protocolos). 0138.';

-- Las cuatro transitivas que usan las PRs 2, 3 y 4. Se definen ACA para que esas migraciones sean
-- puras policies: un archivo que solo agrega condiciones es mucho mas facil de revisar que uno que
-- ademas estrena funciones.
create or replace function public.pharma_alcanza_lote(p_lot_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.medication_lots l
     where l.id = p_lot_id and public.pharma_alcanza_protocolo(l.protocol_id));
$fn$;

create or replace function public.pharma_alcanza_recepcion(p_reception_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.medication_receptions r
     where r.id = p_reception_id and public.pharma_alcanza_protocolo(r.protocol_id));
$fn$;

-- dispensation_requests.protocol_id lo sella create_dispensation_request desde la 0071, y esta
-- desnormalizado justamente porque Farmacia NO puede leer patient_visits: un join para llegar al
-- protocolo devolveria cero filas en silencio.
create or replace function public.pharma_alcanza_solicitud(p_request_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.dispensation_requests dr
     where dr.id = p_request_id and public.pharma_alcanza_protocolo(dr.protocol_id));
$fn$;

create or replace function public.pharma_alcanza_dispensacion(p_dispensation_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.dispensations d
     where d.id = p_dispensation_id and public.pharma_alcanza_solicitud(d.request_id));
$fn$;

create or replace function public.pharma_alcanza_pedido(p_pedido_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.pedidos_medicacion pm
     where pm.id = p_pedido_id and public.pharma_alcanza_protocolo(pm.protocol_id));
$fn$;

grant execute on function public.pharma_sin_recorte()                to authenticated;
grant execute on function public.pharma_alcanza_protocolo(uuid)      to authenticated;
grant execute on function public.pharma_alcanza_paciente(uuid)       to authenticated;
grant execute on function public.pharma_alcanza_lote(uuid)           to authenticated;
grant execute on function public.pharma_alcanza_recepcion(uuid)      to authenticated;
grant execute on function public.pharma_alcanza_solicitud(uuid)      to authenticated;
grant execute on function public.pharma_alcanza_dispensacion(uuid)   to authenticated;
grant execute on function public.pharma_alcanza_pedido(uuid)         to authenticated;
```

- [ ] **Paso 2: Contar los dollar-quotes del archivo**

El editor de Supabase rastrea el dollar-quoting **sin ignorar los comentarios**, así que un marcador
suelto le invierte la paridad y parte las funciones por sus `;` internos. El error que tira es
lejanísimo del comentario culpable. Se detecta contando sobre el texto crudo:

Run:
```bash
node -e 'const t=require("fs").readFileSync("supabase/migrations/0138_estudios_en_farmacia.sql","utf8");const m=t.match(/\$[a-zA-Z_]*\$/g)||[];console.log("marcadores:",m.length,m.length%2===0?"PAR ok":"IMPAR ROTO")'
```
 suelto en un
comentario: buscarlo y sacarlo.

⚠️ **Las comillas simples alrededor del script no son opcionales.** Con comillas dobles, bash expande
el `\# Estudios en Farmacia · PR 1 — Plan de implementación

> **Para quien lo ejecute:** los pasos van con casilla (`- [ ]`) para ir tildando. Cada tarea
> termina en un commit y algo verificable. El **qué** y el **por qué** están en
> [`plan-estudios-en-farmacia.md`](plan-estudios-en-farmacia.md); esto es el **cómo**.

**Objetivo:** que gerencia pueda acotar a una persona de Farmacia a una lista cerrada de estudios,
con el recorte aplicado de verdad en la RLS sobre los estudios y sus pacientes.

**Arquitectura:** una columna en `user_module_roles` (el interruptor) + una tabla
`pharma_protocol_access` (la lista) + **ocho** funciones `security definer` que responden "¿este
protocolo está dentro del alcance?"; las policies de Farmacia **suman** una llamada a esas funciones
sin tocar la condición que ya tenían.

> **Ocho y no siete, como decía el spec.** Al escribir `pharma_alcanza_paciente` apareció que un
> paciente **sin ningún enrolamiento** daría `false` por el `exists`, y entonces dejaría de verlo
> también quien **no** tiene recorte: una regresión silenciosa para todo el mundo. La octava,
> `pharma_sin_recorte()`, es el atajo que va primero en las siete restantes y corta antes de tocar
> una tabla. De paso es lo que hace que el caso común —nadie acotado— no pague ni un join. La consola vive en Ajustes › Equipo y accesos, como una
tarjeta hermana de la de Coordinación.

**Stack:** Postgres 15 (Supabase), TypeScript strict, React 18 sin router ni react-query, Vite,
Vitest. CSS con variables de `src/styles/tokens.css`.

## Restricciones globales

Valen para **todas** las tareas. No se repiten en cada paso.

- **Migración `0138`**, nombre `0138_estudios_en_farmacia.sql`. Verificado libre: la última aplicada
  en prod es la 0137 y nadie reservó la 0138 en docs.
- **Las migraciones son inmutables una vez aplicadas.** Hasta que el Director confirme "aplicada",
  el archivo se puede editar. Después, **nunca**: todo cambio es un archivo nuevo.
- **La migración va PRIMERO**, antes del deploy del front. Todo lo de esta PR es aditivo mientras
  nadie esté acotado (`ve_todos_los_estudios` arranca en `true` para todos), así que no hay ventana
  de front roto.
- **No hay acceso SQL a producción.** El archivo tiene que correr **tal cual** en el editor de
  Supabase, sin placeholders `<...>`, y ser **idempotente** (se puede correr dos veces).
- **Las sentencias del editor de Supabase NO comparten sesión ni transacción.** Nada de
  `create temporary table` entre sentencias; si algo tiene que ser atómico, va adentro de una
  función `plpgsql`.
- **Nunca dos signos peso pegados dentro de un comentario SQL.** El editor de Supabase cuenta los
  dollar-quotes sin ignorar comentarios, y uno suelto le invierte la paridad. Usar tags con nombre
  (`$fn$`), y contar que los marcadores del texto crudo den número par.
- **Adentro de una función con `set search_path` acotado, calificar todo lo que no sea de `public`
  ni de `pg_catalog`.** Para uuid en runtime, `gen_random_uuid()` (de `pg_catalog`), nunca
  `uuid_generate_v4()`.
- **`create or replace view` PIERDE `security_invoker`.** Toda vista que se recree repite su
  `with (security_invoker = true)`, y el archivo termina con la sonda de `reloptions`.
- **Toda tabla con trigger de auditoría necesita una columna `id`**: `audit_row()` resuelve `old.id`
  al planificar.
- **Idioma:** comentarios, nombres de dominio y copy de UI en castellano rioplatense. En la UI los
  módulos se llaman **Coordinación** y **Farmacia**; en el código siguen siendo `track` y `pharma`.
- **Realce = elevación**, nunca borde de color. El color se reserva para significado.
- **El gate de verificación es `npm run build` verde** (`tsc --noEmit && vitest run && vite build`)
  **+ mirarlo en el navegador**. No se afirma que algo anda sin las dos cosas.
- **Rama:** `feat/estudios-en-farmacia`. Stagear **por ruta** (`git add <archivos>`), nunca `-A`.
- **Verificar la rama antes de cada commit.** Hay un hook que bloquea commits en `main`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0138_estudios_en_farmacia.sql` | **Crear.** Todo el SQL: modelo, funciones, auditoría, RPC y el recorte de 9 policies sobre 7 tablas. |
| `supabase/README.md` | **Modificar.** La fila del índice para la 0138 (CI lo vigila con `scripts/check-migraciones.mjs`). |
| `src/data/pharmaAccessModel.ts` | **Crear.** Lógica **pura** del borrador: de (vigente, borrador) a la lista ordenada de llamadas. Sin React ni Supabase. |
| `src/data/pharmaAccessModel.test.ts` | **Crear.** Sus tests. |
| `src/data/pharmaAccess.ts` | **Crear.** Capa de datos: hooks de lectura + las dos mutaciones + traducción de errores. |
| `src/lib/roles.ts` | **Modificar.** `PharmaAccessAuditRow`, `pharmaAuditLine`, y `mezclarHistorial` pasa a tres listas. |
| `src/lib/roles.test.ts` | **Modificar.** Tests de lo anterior. |
| `src/shell/settings/AccesoEditor.tsx` | **Modificar.** La tarjeta «Estudios en Farmacia», el borrador, el guardado y el bloque «Qué va a ver al entrar». |
| `src/shell/settings/EquipoYAccesosSection.tsx` | **Modificar.** Baja las dos consultas nuevas por prop, como ya hace con `asignaciones`. |

**Por qué `pharmaAccessModel.ts` está separado de `pharmaAccess.ts`:** es el mismo criterio que
`views/resumen/ambito.ts` y `pharma/dispensaciones/estados.ts`. La lógica que decide **qué llamadas
se mandan y en qué orden** falla en silencio —una llamada de menos deja un acceso sin revocar y la
pantalla se ve impecable—, así que vive pura y testeada. El archivo con `supabase` adentro no se
puede testear desde node.

---

## Tarea 1 · Migración 0138, parte A: el modelo y las siete funciones

**Archivos:**
- Crear: `supabase/migrations/0138_estudios_en_farmacia.sql`
- Banco de pruebas (descartable, **no se commitea**): `<scratchpad>/pglite-0138/`

**Interfaces que produce:**
- Tabla `public.pharma_protocol_access (id uuid, user_id uuid, protocol_id uuid, assigned_at timestamptz)`
- Columna `public.user_module_roles.ve_todos_los_estudios boolean not null default true`
- `public.pharma_sin_recorte() → boolean`
- `public.pharma_alcanza_protocolo(proto_id uuid) → boolean`
- `public.pharma_alcanza_paciente(p_patient_id uuid) → boolean`
- `public.pharma_alcanza_lote(p_lot_id uuid) → boolean`
- `public.pharma_alcanza_recepcion(p_reception_id uuid) → boolean`
- `public.pharma_alcanza_solicitud(p_request_id uuid) → boolean`
- `public.pharma_alcanza_dispensacion(p_dispensation_id uuid) → boolean`
- `public.pharma_alcanza_pedido(p_pedido_id uuid) → boolean`

- [ ] **Paso 1: Crear el archivo con la cabecera y la parte A**

Crear `supabase/migrations/0138_estudios_en_farmacia.sql` con esto:

```sql
-- ============================================================================
-- 0138 · Estudios en Farmacia: el recorte por protocolo
--
-- Plan: docs/plan-estudios-en-farmacia.md (PR 1).
--
-- ── QUÉ HACE ──
-- Farmacia es central desde el día uno: sus policies abren con has_module('pharma') a secas, sin
-- mirar de qué estudio es la fila. Esta migración le pone la perilla que Coordinación tiene desde
-- la 0002: gerencia puede acotar a una persona a una LISTA CERRADA de estudios.
--
-- Dos estados por persona, y la bandera es explícita a propósito:
--   · ve_todos_los_estudios = true  → ve todo (lo predeterminado, y como queda TODO EL MUNDO hoy)
--   · ve_todos_los_estudios = false → ve sólo los de pharma_protocol_access, y los estudios que se
--     creen más adelante TAMPOCO los ve hasta que alguien se los dé.
--
-- Sin la bandera, el estado se calcularía ("si no tiene filas, ve todo") y quitarle a alguien su
-- último estudio lo devolvería a ver el centro entero, sin que nadie lo decidiera y sin un solo
-- error. Una ampliación de permisos en silencio es lo que no puede pasar acá.
--
-- ── ADITIVA Y NO BREAKING ──
-- Mientras nadie esté acotado, ninguna policy nueva cambia una sola fila: pharma_sin_recorte()
-- devuelve true para todos. Por eso va ANTES del deploy del front. Lo que no funciona sin ella es
-- la consola nueva.
--
-- ── ALCANCE DE ESTE ARCHIVO ──
-- Recorta SÓLO los estudios y sus pacientes (PR 1). El stock, las recepciones, las dispensaciones,
-- la reposición y las estadísticas van en las PRs 2 a 4 (migraciones 0139 a 0141), que son puras
-- policies porque las siete funciones de alcance quedan definidas acá.
--
-- ⚠️ REGLA OPERATIVA: NO acotar a nadie en prod hasta que la 0141 esté aplicada. Entre medio el
-- recorte es parcial —la grilla filtra pero el stock no— y una restricción a medias promete un
-- candado que todavía no cierra.
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0137. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · El interruptor -----------------------------------------------------------------------------
-- Va en user_module_roles y no en una tabla propia: es un modificador DEL ROL, la tabla ya tiene
-- exactamente una fila por (persona, modulo) por su unique de la 0002, y ya la audita
-- trg_audit_module_roles (0003), así que el cambio queda registrado sin trigger nuevo.
--
-- CONSECUENCIA ASUMIDA (y documentada en el plan): si se le quita Farmacia a alguien y se le vuelve
-- a dar, la fila se borra y vuelve con true. El recorte se pierde. Queda en el audit_log y gerencia
-- ve la tarjeta en "ve todos" al momento de re-darle el módulo, pero hay que saberlo.
--
-- Coordinación NO lee esta columna: es lista cerrada siempre (protocol_coordinators + 0006).
alter table public.user_module_roles
  add column if not exists ve_todos_los_estudios boolean not null default true;

comment on column public.user_module_roles.ve_todos_los_estudios is
  'Farmacia: true = ve todos los estudios (predeterminado). false = ve solo los de '
  'pharma_protocol_access, y los que se creen despues TAMPOCO. Coordinacion no la lee. 0138.';


-- 2 · La lista cerrada ---------------------------------------------------------------------------
-- La columna `id` NO es decorativa: audit_row() (0003) hace
--   case when tg_op = 'DELETE' then old.id else new.id end
-- y Postgres resuelve old.id AL PLANIFICAR, sin importar por que rama vaya a pasar. Una tabla
-- auditada sin `id` revienta en la primera escritura con 42703, senalando el cuerpo de audit_row y
-- no esta tabla. Paso con la 0111.
--
-- El default es gen_random_uuid() (pg_catalog) y no uuid_generate_v4() (schema extensions): la
-- regla es una sola para todo el archivo, porque mas abajo hay funciones con search_path acotado
-- donde sin calificar aplica en verde y revienta en la primera llamada con 42883 (paso con la 0113).
create table if not exists public.pharma_protocol_access (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id)     on delete cascade,
  protocol_id uuid not null references public.protocols(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (user_id, protocol_id)
);

create index if not exists ix_ppa_user     on public.pharma_protocol_access (user_id);
create index if not exists ix_ppa_protocol on public.pharma_protocol_access (protocol_id);

comment on table public.pharma_protocol_access is
  'Que estudios ve en FARMACIA una persona acotada. Solo se lee cuando '
  'user_module_roles.ve_todos_los_estudios es false. Se escribe UNICAMENTE por '
  'set_pharma_protocol_access (security definer): no hay policy de escritura. 0138.';

alter table public.pharma_protocol_access enable row level security;

-- Lectura: lo propio, o todo si administra accesos. La consola de gerencia las necesita enteras
-- para pintar los chips de cualquiera.
--
-- NO HAY POLICY DE ESCRITURA, y es deliberado: una que aceptara a gerencia dejaria de paso que un
-- operator de Farmacia se auto-asigne estudios por PostgREST. Se escribe solo por el RPC, que lleva
-- la autorizacion adentro. Mismo criterio que la 0110 con protocol_coordinators.
drop policy if exists "ver alcance de farmacia" on public.pharma_protocol_access;
create policy "ver alcance de farmacia" on public.pharma_protocol_access for select
  using (user_id = auth.uid() or public.has_module('gerencia'));


-- 3 · Las funciones de alcance -------------------------------------------------------------------
-- OJO CON LOS NOMBRES: dicen "alcanza", no "ve". NINGUNA comprueba el modulo ni el nivel, y eso es
-- a proposito.
--
-- El barrido de las policies tiene que SUMAR esta condicion, nunca reemplazar la que ya estaba:
--   ANTES:   using (has_module('pharma') or has_module('gerencia'))
--   DESPUES: using ((has_module('pharma') and pharma_alcanza_protocolo(protocol_id))
--                   or has_module('gerencia'))
-- Once de las 42 policies a recortar comprueban NIVEL (has_min_role('pharma','operator')) y no
-- modulo. Si el barrido las sustituye, el recorte queda bien y el nivel se pierde: un viewer de
-- Farmacia ganaria escritura sobre los pedidos de reposicion. Un candado nuevo que abre otro.
--
-- Y la clausula de gerencia queda SIEMPRE afuera del and: gerencia ve todo el centro, igual que en
-- Coordinacion.

-- Esta persona, ¿NO tiene recorte? true = ve todos los estudios.
-- Separada de las demas porque es el atajo: para el 100% de la gente de hoy devuelve true y ninguna
-- de las otras seis llega a tocar una tabla.
create or replace function public.pharma_sin_recorte()
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select coalesce(
    (select r.ve_todos_los_estudios
       from public.user_module_roles r
      where r.user_id = auth.uid() and r.module = 'pharma'), true);
$fn$;

comment on function public.pharma_sin_recorte is
  'true = la persona ve todos los estudios en Farmacia (lo predeterminado, y lo que devuelve '
  'tambien para quien no tiene el modulo). 0138.';

-- ¿Este protocolo esta dentro del alcance de Farmacia de quien consulta?
create or replace function public.pharma_alcanza_protocolo(proto_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.pharma_protocol_access a
     where a.user_id = auth.uid() and a.protocol_id = proto_id);
$fn$;

comment on function public.pharma_alcanza_protocolo is
  'Alcance por protocolo en Farmacia. NO comprueba el modulo ni el nivel: se SUMA a la condicion '
  'que la policy ya tenia, nunca la reemplaza. 0138.';

-- ¿Alcanza a este paciente? Si alcanza ALGUNO de sus estudios.
--
-- EL `exists` NO ES COSMETICO: hay pacientes inscriptos en DOS protocolos en produccion. Con un `=`
-- contra el primer enrolamiento, uno de LTS17231 y ACT18301 apareceria o desapareceria segun el
-- orden que devolviera la consulta — la misma trampa que hace que todo enrollments[0] del front
-- este mal.
--
-- Y el atajo de pharma_sin_recorte() va PRIMERO por una razon de correccion, no de velocidad: un
-- paciente SIN ningun enrolamiento daria false por el exists, y sin el atajo dejaria de verlo
-- tambien quien no tiene recorte. Seria una regresion silenciosa para todo el mundo.
create or replace function public.pharma_alcanza_paciente(p_patient_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.enrollments e
     where e.patient_id = p_patient_id
       and public.pharma_alcanza_protocolo(e.protocol_id));
$fn$;

comment on function public.pharma_alcanza_paciente is
  'Alcanza al paciente si alcanza ALGUNO de sus estudios (hay pacientes en dos protocolos). 0138.';

-- Las cuatro transitivas que usan las PRs 2, 3 y 4. Se definen ACA para que esas migraciones sean
-- puras policies: un archivo que solo agrega condiciones es mucho mas facil de revisar que uno que
-- ademas estrena funciones.
create or replace function public.pharma_alcanza_lote(p_lot_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.medication_lots l
     where l.id = p_lot_id and public.pharma_alcanza_protocolo(l.protocol_id));
$fn$;

create or replace function public.pharma_alcanza_recepcion(p_reception_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.medication_receptions r
     where r.id = p_reception_id and public.pharma_alcanza_protocolo(r.protocol_id));
$fn$;

-- dispensation_requests.protocol_id lo sella create_dispensation_request desde la 0071, y esta
-- desnormalizado justamente porque Farmacia NO puede leer patient_visits: un join para llegar al
-- protocolo devolveria cero filas en silencio.
create or replace function public.pharma_alcanza_solicitud(p_request_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.dispensation_requests dr
     where dr.id = p_request_id and public.pharma_alcanza_protocolo(dr.protocol_id));
$fn$;

create or replace function public.pharma_alcanza_dispensacion(p_dispensation_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.dispensations d
     where d.id = p_dispensation_id and public.pharma_alcanza_solicitud(d.request_id));
$fn$;

create or replace function public.pharma_alcanza_pedido(p_pedido_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.pedidos_medicacion pm
     where pm.id = p_pedido_id and public.pharma_alcanza_protocolo(pm.protocol_id));
$fn$;

grant execute on function public.pharma_sin_recorte()                to authenticated;
grant execute on function public.pharma_alcanza_protocolo(uuid)      to authenticated;
grant execute on function public.pharma_alcanza_paciente(uuid)       to authenticated;
grant execute on function public.pharma_alcanza_lote(uuid)           to authenticated;
grant execute on function public.pharma_alcanza_recepcion(uuid)      to authenticated;
grant execute on function public.pharma_alcanza_solicitud(uuid)      to authenticated;
grant execute on function public.pharma_alcanza_dispensacion(uuid)   to authenticated;
grant execute on function public.pharma_alcanza_pedido(uuid)         to authenticated;
```

- [ ] **Paso 2: Contar los dollar-quotes del archivo**

El editor de Supabase rastrea el dollar-quoting **sin ignorar los comentarios**, así que un marcador
suelto le invierte la paridad y parte las funciones por sus `;` internos. El error que tira es
lejanísimo del comentario culpable. Se detecta contando sobre el texto crudo:

Run:
```bash
node -e 'const t=require("fs").readFileSync("supabase/migrations/0138_estudios_en_farmacia.sql","utf8");const m=t.match(/\$[a-zA-Z_]*\$/g)||[];console.log("marcadores:",m.length,m.length%2===0?"PAR ok":"IMPAR ROTO")'
```
 antes de que node lo vea y el regex cuenta cualquier cosa — la primera corrida de esto dio
`32` sobre un archivo de 16 marcadores. Un chequeo que informa un número inventado es peor que no
tenerlo.

- [ ] **Paso 3: Montar el banco de pruebas PGlite**

PGlite **no** es dependencia del repo (no está en `package.json`) y no se agrega: es un banco
descartable que vive **fuera** del repo, como se hizo con la 0136 y la 0137. El esquema es de
juguete — sólo las tablas que la migración toca.

Definir dos variables y dejarlas exportadas para toda la tarea: `$REPO` es la raíz del worktree y
`$BANCO` el directorio del banco, en el scratchpad de la sesión.

Run:
```bash
export REPO="$(git rev-parse --show-toplevel)" && export BANCO="$(dirname "$(mktemp -u)")/pglite-0138" && mkdir -p "$BANCO" && cd "$BANCO" && npm init -y >/dev/null && npm i @electric-sql/pglite --no-save && echo "BANCO=$BANCO"
```
Expected: instala sin errores e imprime la ruta del banco. Anotarla: si la shell se reinicia, hay
que volver a exportar `$REPO` y `$BANCO`.

- [ ] **Paso 4: Escribir el esquema de juguete**

Crear `$BANCO/esquema.sql`:

```sql
create schema if not exists public;

-- Los roles que Supabase trae de fábrica y PGlite no. Sin ellos, el primer
-- `grant ... to authenticated` de la migración corta con
-- `role "authenticated" does not exist` y no llega a correr nada — el `exec` de PGlite
-- aborta el bloque entero, así que el síntoma es "no se creó ninguna función".
create role anon;
create role authenticated;

create type spira_module as enum ('track','pharma','lab','contable','gerencia');
create type module_role  as enum ('viewer','operator','leader','admin');

create table public.users (id uuid primary key, full_name text not null);
create table public.protocols (
  id uuid primary key, code text not null, name text not null, status text not null default 'activo');
create table public.patients (id uuid primary key, full_name text not null);
create table public.enrollments (
  id uuid primary key, patient_id uuid not null references public.patients(id),
  protocol_id uuid not null references public.protocols(id));
create table public.user_module_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  module spira_module not null, role module_role not null,
  unique (user_id, module));
create table public.medication_lots (id uuid primary key, protocol_id uuid not null);
create table public.medication_receptions (id uuid primary key, protocol_id uuid not null);
create table public.dispensation_requests (id uuid primary key, protocol_id uuid);
create table public.dispensations (id uuid primary key, request_id uuid not null);
create table public.pedidos_medicacion (id uuid primary key, protocol_id uuid not null);

-- auth.uid() de mentira: se apunta con set_config('spira.uid', ...).
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $f$
  select nullif(current_setting('spira.uid', true), '')::uuid;
$f$;

-- has_module() de mentira, con la misma forma que el de la 0006.
create or replace function public.has_module(m text) returns boolean language sql stable as $f$
  select exists (select 1 from public.user_module_roles r
                  where r.user_id = auth.uid() and r.module::text = m);
$f$;
```

- [ ] **Paso 5: Escribir el guion de verificación**

Crear `$BANCO/verificar.mjs`. La ruta del repo llega por `argv` y el corte de la migración también,
así que el mismo guion sirve tal cual en las cuatro tareas — sólo cambia el marcador:

```js
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// node verificar.mjs <ruta-del-repo> [marcador-de-corte]
const repo = process.argv[2]
if (!repo) { console.error('Falta la ruta del repo: node verificar.mjs "$REPO" "-- 4 ·"'); process.exit(2) }
const corte = process.argv[3] ?? '-- 4 ·'

const db = new PGlite()
await db.exec(readFileSync('esquema.sql', 'utf8'))

// Sólo la parte del archivo que ya está escrita: se corta por el marcador de la sección siguiente.
const full = readFileSync(resolve(repo, 'supabase/migrations/0138_estudios_en_farmacia.sql'), 'utf8')
const parteA = full.split(corte)[0]
await db.exec(parteA)

const U = { ana: '11111111-1111-1111-1111-111111111111', bea: '22222222-2222-2222-2222-222222222222' }
const P = { lts: 'aaaaaaaa-0000-0000-0000-000000000001', act: 'aaaaaaaa-0000-0000-0000-000000000002' }
const PA = { dos: 'bbbbbbbb-0000-0000-0000-000000000001', sin: 'bbbbbbbb-0000-0000-0000-000000000002' }

await db.exec(`
  insert into public.users values ('${U.ana}','Ana'), ('${U.bea}','Bea');
  insert into public.protocols values ('${P.lts}','LTS17231','Lipoproteina'), ('${P.act}','ACT18301','Actuate');
  insert into public.patients values ('${PA.dos}','Paciente en dos'), ('${PA.sin}','Paciente sin enrolar');
  insert into public.enrollments values
    ('cccccccc-0000-0000-0000-000000000001','${PA.dos}','${P.lts}'),
    ('cccccccc-0000-0000-0000-000000000002','${PA.dos}','${P.act}');
  insert into public.user_module_roles (user_id, module, role) values
    ('${U.ana}','pharma','operator'), ('${U.bea}','pharma','operator');
  -- Bea queda acotada a LTS17231.
  update public.user_module_roles set ve_todos_los_estudios = false
   where user_id = '${U.bea}' and module = 'pharma';
  insert into public.pharma_protocol_access (user_id, protocol_id) values ('${U.bea}','${P.lts}');
`)

const como = async (uid, sql) => {
  await db.query(`select set_config('spira.uid', '${uid}', false)`)
  return (await db.query(sql)).rows[0].v
}

const casos = [
  ['Ana (sin recorte) alcanza LTS',      U.ana, `select public.pharma_alcanza_protocolo('${P.lts}') v`, true],
  ['Ana (sin recorte) alcanza ACT',      U.ana, `select public.pharma_alcanza_protocolo('${P.act}') v`, true],
  ['Bea (acotada) alcanza LTS',          U.bea, `select public.pharma_alcanza_protocolo('${P.lts}') v`, true],
  ['Bea (acotada) NO alcanza ACT',       U.bea, `select public.pharma_alcanza_protocolo('${P.act}') v`, false],
  ['Ana ve al paciente de dos',          U.ana, `select public.pharma_alcanza_paciente('${PA.dos}') v`, true],
  ['Bea ve al paciente de dos (por LTS)',U.bea, `select public.pharma_alcanza_paciente('${PA.dos}') v`, true],
  ['Ana ve al paciente SIN enrolar',     U.ana, `select public.pharma_alcanza_paciente('${PA.sin}') v`, true],
  ['Bea NO ve al paciente sin enrolar',  U.bea, `select public.pharma_alcanza_paciente('${PA.sin}') v`, false],
  ['sin fila de rol: sin recorte',       '33333333-3333-3333-3333-333333333333',
                                                `select public.pharma_sin_recorte() v`, true],
]

let fallos = 0
for (const [nombre, uid, sql, esperado] of casos) {
  const got = await como(uid, sql)
  const ok = got === esperado
  if (!ok) fallos++
  console.log(`${ok ? 'ok  ' : 'FALLA'} ${nombre} → ${got} (esperaba ${esperado})`)
}

// Idempotencia: correr la parte A dos veces no puede romper.
await db.exec(parteA)
console.log('ok   segunda corrida (idempotente)')

console.log(fallos === 0 ? '\nTODO VERDE' : `\n${fallos} FALLO(S)`)
process.exit(fallos === 0 ? 0 : 1)
```

- [ ] **Paso 6: Correr la verificación**

Run: `cd "$BANCO" && node verificar.mjs "$REPO" "-- 4 ·"`
Expected: las 9 líneas en `ok`, la de idempotencia, y `TODO VERDE`.

El caso que más importa es **«Ana ve al paciente SIN enrolar»**: sin el atajo de
`pharma_sin_recorte()` al principio de `pharma_alcanza_paciente`, ese `exists` daría false y la
gente sin recorte dejaría de ver pacientes que hoy ve. Es la regresión silenciosa que este test
existe para atrapar.

- [ ] **Paso 7: Commit**

```bash
git add supabase/migrations/0138_estudios_en_farmacia.sql
git commit -m "feat(db): 0138 parte A - modelo y funciones de alcance de Farmacia"
```

---

## Tarea 2 · Migración 0138, parte B: la auditoría

**Archivos:**
- Modificar: `supabase/migrations/0138_estudios_en_farmacia.sql` (agregar al final)

**Interfaces:**
- Consume: `public.pharma_protocol_access` (Tarea 1)
- Produce: vista `public.v_pharma_protocol_access_audit` con columnas
  `id, occurred_at, action, clase, target_user_id, protocol_code, protocol_name, ve_todos, actor_name, target_name`

- [ ] **Paso 1: Agregar el trigger y las dos vistas**

Pegar al final del archivo:

```sql
-- 4 · Auditoría ----------------------------------------------------------------------------------
-- El audit_row() generico de la 0003, el mismo que ya usan las otras ocho tablas auditadas.
drop trigger if exists trg_audit_pharma_protocol_access on public.pharma_protocol_access;
create trigger trg_audit_pharma_protocol_access
  after insert or update or delete on public.pharma_protocol_access
  for each row execute function public.audit_row();

-- El interruptor NO necesita trigger propio: vive en user_module_roles, que ya esta auditada.


-- 5 · El historial legible -----------------------------------------------------------------------
-- VISTA NUEVA, no una extension de v_protocol_access_audit. El motivo lo dejo escrito la 0110 para
-- el caso identico: si las filas de Farmacia entran por la vista de Coordinacion, el front que esta
-- HOY en produccion las redacta como "le dio acceso a los pacientes del estudio X" — una frase
-- impecable que dice algo que no paso. Con vista aparte la migracion queda puramente aditiva.
--
-- Junta las DOS fuentes porque para gerencia son un solo hecho ("que le paso al alcance de esta
-- persona en Farmacia"): los estudios que entran o salen de la lista, y el interruptor.
--
-- security_invoker = true: hereda la policy "gerencia ve auditoria" de audit_log (0006), asi que
-- quien no es gerencia recibe cero filas. La vista NO decide permisos; solo traduce.
--
-- Los LEFT JOIN a protocols y users son a proposito: un protocolo o una cuenta borrados dejan sus
-- lineas de auditoria en pie —audit_log es inmutable— y perderlas al leer seria recortar el
-- registro. El front redacta esos casos con el codigo o el nombre en null.
create or replace view public.v_pharma_protocol_access_audit
with (security_invoker = true) as

-- (a) un estudio que entra o sale de la lista
select
  l.id,
  l.occurred_at,
  l.action,
  'estudio'::text as clase,
  coalesce(l.after_data ->> 'user_id', l.before_data ->> 'user_id')::uuid as target_user_id,
  p.code           as protocol_code,
  p.name           as protocol_name,
  null::boolean    as ve_todos,
  l.actor_id,
  actor.full_name  as actor_name,
  target.full_name as target_name
from public.audit_log l
left join public.users actor  on actor.id = l.actor_id
left join public.users target
       on target.id = coalesce(l.after_data ->> 'user_id', l.before_data ->> 'user_id')::uuid
left join public.protocols p
       on p.id = coalesce(l.after_data ->> 'protocol_id', l.before_data ->> 'protocol_id')::uuid
where l.entity_type = 'pharma_protocol_access'

union all

-- (b) el interruptor. Solo las lineas de user_module_roles donde la bandera CAMBIO y el modulo es
-- Farmacia: un cambio de nivel no es un cambio de alcance y ya lo cuenta v_access_audit.
select
  l.id,
  l.occurred_at,
  l.action,
  'interruptor'::text as clase,
  coalesce(l.after_data ->> 'user_id', l.before_data ->> 'user_id')::uuid as target_user_id,
  null::text          as protocol_code,
  null::text          as protocol_name,
  (l.after_data ->> 've_todos_los_estudios')::boolean as ve_todos,
  l.actor_id,
  actor.full_name  as actor_name,
  target.full_name as target_name
from public.audit_log l
left join public.users actor  on actor.id = l.actor_id
left join public.users target
       on target.id = coalesce(l.after_data ->> 'user_id', l.before_data ->> 'user_id')::uuid
where l.entity_type = 'user_module_roles'
  and l.action = 'UPDATE'
  and coalesce(l.after_data ->> 'module', l.before_data ->> 'module') = 'pharma'
  and (l.before_data ->> 've_todos_los_estudios')
      is distinct from (l.after_data ->> 've_todos_los_estudios');

comment on view public.v_pharma_protocol_access_audit is
  'Historial legible del alcance por estudio en Farmacia: los estudios que entran o salen de la '
  'lista (trg_audit_pharma_protocol_access) mas los cambios del interruptor (user_module_roles). '
  'Vista APARTE de v_protocol_access_audit a proposito: sumarlas habria sido breaking para el front '
  'desplegado, que redactaria estas lineas como si fueran de Coordinacion. security_invoker → solo '
  'gerencia. 0138.';

revoke all on public.v_pharma_protocol_access_audit from anon;
grant select on public.v_pharma_protocol_access_audit to authenticated;


-- 6 · v_access_audit deja de contar los cambios de SOLO el interruptor ---------------------------
-- Sin esto, apagar el interruptor produciria en el historial de modulos la linea "volvio a guardar
-- el acceso de X a Farmacia, sin cambiar el nivel" — tecnicamente cierta y completamente engañosa,
-- porque esconde lo unico que si cambio. Y ademas duplicada, porque la vista de arriba ya la cuenta
-- bien.
--
-- Es un cambio SEGURO aunque toque una vista vieja: hoy no existe ni una sola fila que pueda
-- matchear, porque la columna ve_todos_los_estudios se crea en esta misma migracion.
--
-- ⚠️ EL `with (security_invoker = true)` VA SI O SI: create or replace VIEW reemplaza las opciones,
-- y sin repetirlo la vista se saltearia la RLS de audit_log en silencio. Se sondea al final.
create or replace view public.v_access_audit
with (security_invoker = true) as
select
  l.id,
  l.occurred_at,
  l.action,
  case
    when l.entity_type = 'users' then l.entity_id
    else coalesce(l.after_data ->> 'user_id', l.before_data ->> 'user_id')::uuid
  end as target_user_id,
  case when l.entity_type = 'users' then null
       else coalesce(l.after_data ->> 'module', l.before_data ->> 'module') end as module,
  case when l.entity_type = 'users' then null else l.before_data ->> 'role' end as role_before,
  case when l.entity_type = 'users' then null else l.after_data  ->> 'role' end as role_after,
  l.actor_id,
  actor.full_name as actor_name,
  coalesce(
    target.full_name,
    l.before_data ->> 'full_name',
    l.after_data  ->> 'full_name'
  ) as target_name
from public.audit_log l
left join public.users actor
       on actor.id = l.actor_id
left join public.users target
       on target.id = case
            when l.entity_type = 'users' then l.entity_id
            else coalesce(l.after_data ->> 'user_id', l.before_data ->> 'user_id')::uuid
          end
where (
        l.entity_type = 'user_module_roles'
        -- NUEVO en la 0138: fuera los updates que solo movieron el interruptor.
        and not (
          l.action = 'UPDATE'
          and (l.before_data ->> 'role') is not distinct from (l.after_data ->> 'role')
          and (l.before_data ->> 've_todos_los_estudios')
              is distinct from (l.after_data ->> 've_todos_los_estudios')
        )
      )
   or (l.entity_type = 'users' and l.action in ('ALTA', 'BAJA', 'ELIMINACION'));

comment on view public.v_access_audit is
  'Historial legible de accesos: los cambios de modulo (trg_audit_module_roles, 0003) mas el alta, '
  'la baja y la eliminacion de la cuenta (0098, 0099). Desde la 0138 EXCLUYE los updates que solo '
  'movieron ve_todos_los_estudios: esos los cuenta v_pharma_protocol_access_audit. '
  'Solo gerencia, por la policy "gerencia ve auditoria" (0006). 0096, 0100, 0138.';
```

- [ ] **Paso 2: Ampliar el guion de verificación**

En `verificar.mjs` el corte no se toca (llega por argv, ahora `"-- 7 ·"`) y el esquema de juguete necesita `audit_log` y
`audit_row()`. Agregar a `esquema.sql`:

```sql
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_id uuid, entity_type text not null, entity_id uuid,
  action text not null, before_data jsonb, after_data jsonb);

create or replace function public.audit_row() returns trigger language plpgsql as $f$
begin
  insert into public.audit_log (actor_id, entity_type, entity_id, action, before_data, after_data)
  values (auth.uid(), tg_table_name,
          case when tg_op = 'DELETE' then old.id else new.id end,
          tg_op,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return case when tg_op = 'DELETE' then old else new end;
end;
$f$;

create trigger trg_audit_module_roles
  after insert or update or delete on public.user_module_roles
  for each row execute function public.audit_row();
```

Y agregar estos casos a `verificar.mjs`, **antes** del bloque de idempotencia (el `await db.exec(parteA)`
del final), envueltos en el `if` para que la corrida de la Tarea 1 los saltee:

```js
// ── Auditoría ────────────────────────────────────────────────────────────────────────────────
// Se compara el CONJUNTO de líneas, NO su orden. Dos motivos, y los dos muerden:
//   · un `exec` multi-sentencia de PGlite comparte transacción, así que `now()` queda FIJO y todas
//     las líneas salen con el mismo `occurred_at`;
//   · el desempate caería entonces en el `id`, que es un uuid aleatorio — el test pasaría o fallaría
//     según la corrida. Es exactamente el problema que `mezclarHistorial` documenta.
// El orden se testea donde importa, en `mezclarHistorial` (vitest). Y las escrituras van de a una
// con `db.query`, no con un `exec` de tres: cada una en su transacción.
if (!corte.startsWith('-- 4')) {
  await db.query(`select set_config('spira.uid', '${U.ana}', false)`)
  await db.query(`insert into public.pharma_protocol_access (user_id, protocol_id) values ('${U.bea}','${P.act}')`)
  await db.query(`delete from public.pharma_protocol_access where user_id = '${U.bea}' and protocol_id = '${P.act}'`)
  await db.query(`update public.user_module_roles set ve_todos_los_estudios = true where user_id = '${U.bea}' and module = 'pharma'`)

  const hist = (await db.query(
    `select action, clase, protocol_code, ve_todos from public.v_pharma_protocol_access_audit
      where target_user_id = '${U.bea}'`)).rows
  const clave = (r) => `${r.clase}|${r.action}|${r.protocol_code}|${r.ve_todos}`
  const got = hist.map(clave).sort()
  const esperado = [
    // las dos del armado de arriba, hechas con la uid sin setear
    'interruptor|UPDATE|null|false',
    'estudio|INSERT|LTS17231|null',
    // las tres de este bloque
    'estudio|INSERT|ACT18301|null',
    'estudio|DELETE|ACT18301|null',
    'interruptor|UPDATE|null|true',
  ].sort()
  if (JSON.stringify(got) !== JSON.stringify(esperado)) {
    fallos++
    console.log('FALLA historial de Farmacia:\n  got      ', got, '\n  esperaba ', esperado)
  } else {
    console.log('ok   historial de Farmacia: 5 líneas, las dos clases')
  }

  // v_access_audit NO cuenta los updates que sólo movieron el interruptor.
  const enModulos = (await db.query(
    `select count(*)::int n from public.v_access_audit
      where target_user_id = '${U.bea}' and action = 'UPDATE'`)).rows[0].n
  if (enModulos !== 0) { fallos++; console.log(`FALLA v_access_audit cuenta ${enModulos} update(s), esperaba 0`) }
  else console.log('ok   v_access_audit ignora el cambio de sólo el interruptor')

  // La sonda de security_invoker en las dos vistas.
  const opts = (await db.query(
    `select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('v_access_audit','v_pharma_protocol_access_audit')
      order by c.relname`)).rows
  if (opts.length !== 2) { fallos++; console.log(`FALLA esperaba 2 vistas, encontré ${opts.length}`) }
  for (const r of opts) {
    const ok = (r.reloptions || []).some((o) => o === 'security_invoker=true')
    if (!ok) { fallos++; console.log(`FALLA ${r.relname} perdió security_invoker: ${r.reloptions}`) }
    else console.log(`ok   ${r.relname} conserva security_invoker`)
  }
}
```

- [ ] **Paso 3: Correr la verificación**

Run: `cd "$BANCO" && node verificar.mjs "$REPO" "-- 7 ·"`
Expected: los 9 casos de la Tarea 1 en `ok`, las 3 líneas del historial, el 0 de `v_access_audit`,
las dos sondas de `security_invoker`, y `TODO VERDE`.

- [ ] **Paso 4: Contar los dollar-quotes de nuevo**

Run:
```bash
node -e 'const t=require("fs").readFileSync("supabase/migrations/0138_estudios_en_farmacia.sql","utf8");const m=t.match(/\$[a-zA-Z_]*\$/g)||[];console.log("marcadores:",m.length,m.length%2===0?"PAR ok":"IMPAR ROTO")'
```
Expected: `marcadores: 16 PAR ok` — la parte B no agrega funciones, así que el número no se mueve.

- [ ] **Paso 5: Commit**

```bash
git add supabase/migrations/0138_estudios_en_farmacia.sql
git commit -m "feat(db): 0138 parte B - auditoria del alcance de Farmacia"
```

---

## Tarea 3 · Migración 0138, parte C: los dos RPC

**Archivos:**
- Modificar: `supabase/migrations/0138_estudios_en_farmacia.sql` (agregar al final)

**Interfaces que produce:**
- `public.set_pharma_todos_los_estudios(p_user_id uuid, p_todos boolean, p_expected boolean) → void`
- `public.set_pharma_protocol_access(p_user_id uuid, p_protocol_id uuid, p_asignado boolean, p_expected boolean) → void`

- [ ] **Paso 1: Agregar los dos RPC**

Pegar al final del archivo:

```sql
-- 7 · Escribir el alcance ------------------------------------------------------------------------
-- Dos RPC y ninguna escritura directa, por la misma razon que la 0110: la consola es de GERENCIA, y
-- una policy de escritura que la aceptara dejaria de paso que un operator de Farmacia se
-- auto-asigne estudios por PostgREST. Ademas, un insert directo afectaria CERO FILAS EN SILENCIO —
-- la RLS filtra callada, y 0 filas no es exito, es falta de permiso.
--
-- Los dos llevan compare-and-swap contra p_expected. No es ceremonia: sin el, dos gerencias
-- editando a la vez se pisan y gana la ultima en silencio — y en permisos "en silencio" significa
-- que alguien conserva un acceso que se creyo revocado.

-- 7.1 · El interruptor
create or replace function public.set_pharma_todos_los_estudios(
  p_user_id  uuid,
  p_todos    boolean,
  p_expected boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_actual boolean;
begin
  if v_uid is null then
    raise exception 'Tu sesión venció.' using errcode = '28000';
  end if;

  -- VA ACA Y NO EN UNA POLICY: la funcion es security definer, corre con los permisos del dueño y
  -- la RLS no la mira.
  if not public.has_module('gerencia') then
    raise exception 'No tenés permiso para cambiar accesos.' using errcode = '42501';
  end if;

  select r.ve_todos_los_estudios into v_actual
    from public.user_module_roles r
   where r.user_id = p_user_id and r.module = 'pharma';

  -- Sin fila de rol no hay interruptor que mover: el alcance es un modificador DEL ROL y sin el
  -- modulo no significa nada. Mensaje propio para que no llegue un error de Postgres en ingles.
  if not found then
    raise exception 'Primero dale acceso a Farmacia y después elegí los estudios.'
      using errcode = 'P0001';
  end if;

  if v_actual is distinct from p_expected then
    raise exception 'Alguien más cambió este acceso mientras lo editabas. Refrescá y volvé a mirar.'
      using errcode = 'P0001';
  end if;

  -- Nada que cambiar: se sale sin escribir. Un historial con lineas de cambios que no ocurrieron es
  -- un historial que nadie lee.
  if v_actual = p_todos then
    return;
  end if;

  update public.user_module_roles
     set ve_todos_los_estudios = p_todos
   where user_id = p_user_id and module = 'pharma';

  -- Volver a "ve todos" NO borra la lista a proposito: si gerencia se arrepiente y vuelve a
  -- acotarla, encuentra los estudios que habia elegido. La lista sin el interruptor no da acceso a
  -- nada — pharma_sin_recorte() corta antes.
end;
$fn$;

comment on function public.set_pharma_todos_los_estudios is
  'Prende (p_todos true = ve todos) o apaga el recorte por estudio en Farmacia. Solo gerencia, '
  'verificado adentro porque es security definer. Con compare-and-swap contra p_expected. La '
  'auditoria la escribe trg_audit_module_roles. 0138.';

grant execute on function public.set_pharma_todos_los_estudios(uuid, boolean, boolean) to authenticated;


-- 7.2 · Un estudio, espejo exacto de set_protocol_access (0110 §3)
create or replace function public.set_pharma_protocol_access(
  p_user_id     uuid,
  p_protocol_id uuid,
  p_asignado    boolean,
  p_expected    boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_actual boolean;
begin
  if v_uid is null then
    raise exception 'Tu sesión venció.' using errcode = '28000';
  end if;

  if not public.has_module('gerencia') then
    raise exception 'No tenés permiso para cambiar accesos.' using errcode = '42501';
  end if;

  -- Que existan las dos puntas. Sin esto fallaria igual por la FK, pero con un mensaje de Postgres
  -- en ingles nombrando una constraint.
  if not exists (select 1 from public.users u where u.id = p_user_id) then
    raise exception 'Esa cuenta ya no existe. Refrescá la lista.' using errcode = '23503';
  end if;
  if not exists (select 1 from public.protocols pr where pr.id = p_protocol_id) then
    raise exception 'Ese estudio ya no existe. Refrescá la lista.' using errcode = '23503';
  end if;

  select exists (
    select 1 from public.pharma_protocol_access a
     where a.user_id = p_user_id and a.protocol_id = p_protocol_id
  ) into v_actual;

  if v_actual is distinct from p_expected then
    raise exception 'Alguien más cambió este acceso mientras lo editabas. Refrescá y volvé a mirar.'
      using errcode = 'P0001';
  end if;

  if v_actual = p_asignado then
    return;
  end if;

  if p_asignado then
    insert into public.pharma_protocol_access (user_id, protocol_id)
    values (p_user_id, p_protocol_id)
    on conflict (user_id, protocol_id) do nothing;
  else
    delete from public.pharma_protocol_access a
     where a.user_id = p_user_id and a.protocol_id = p_protocol_id;
  end if;
end;
$fn$;

comment on function public.set_pharma_protocol_access is
  'Da (p_asignado true) o quita UN estudio del alcance de Farmacia de una persona. Solo gerencia, '
  'verificado adentro porque es security definer. Con compare-and-swap. Existe porque '
  'pharma_protocol_access no tiene policy de escritura a proposito. 0138.';

grant execute on function public.set_pharma_protocol_access(uuid, uuid, boolean, boolean) to authenticated;
```

- [ ] **Paso 2: Verificar los RPC en PGlite**

El corte pasa a `"-- 8 ·"` (es el segundo argumento, no hay que tocar el guion). Agregar estos casos antes del resumen:

`CARO` se declara **fuera** del `if`: la Tarea 4 lo necesita para el caso de gerencia.

```js
// ── Los RPC ──────────────────────────────────────────────────────────────────────────────────
// Ana no es gerencia; Caro sí.
const CARO = '44444444-4444-4444-4444-444444444444'
if (!corte.startsWith('-- 4') && !corte.startsWith('-- 7')) {
  await db.exec(`
    insert into public.users values ('${CARO}','Caro');
    insert into public.user_module_roles (user_id, module, role) values ('${CARO}','gerencia','admin');
  `)

  const debeFallar = async (uid, sql, parte) => {
    await db.query(`select set_config('spira.uid', '${uid}', false)`)
    try { await db.query(sql); return 'no falló' }
    catch (e) { return String(e.message).includes(parte) ? null : `falló con "${e.message}"` }
  }

  const rpcCasos = [
    ['sin gerencia, el interruptor se niega', await debeFallar(U.ana,
      `select public.set_pharma_todos_los_estudios('${U.bea}', true, false)`, 'No tenés permiso')],
    ['sin gerencia, el estudio se niega', await debeFallar(U.ana,
      `select public.set_pharma_protocol_access('${U.bea}','${P.act}', true, false)`, 'No tenés permiso')],
    ['compare-and-swap: expected equivocado', await debeFallar(CARO,
      `select public.set_pharma_protocol_access('${U.bea}','${P.act}', true, true)`, 'Alguien más cambió')],
    ['estudio inexistente', await debeFallar(CARO,
      `select public.set_pharma_protocol_access('${U.bea}','aaaaaaaa-0000-0000-0000-000000000009', true, false)`,
      'Ese estudio ya no existe')],
    // Caro tiene gerencia pero NO Farmacia: no hay fila de rol, así que no hay interruptor que
    // mover. Sin este guard llegaría un error de Postgres en inglés, o peor, un update de 0 filas
    // que parece éxito.
    ['sin fila de rol en Farmacia, el interruptor avisa', await debeFallar(CARO,
      `select public.set_pharma_todos_los_estudios('${CARO}', false, true)`,
      'Primero dale acceso a Farmacia')],
  ]
  for (const [nombre, err] of rpcCasos) {
    if (err) { fallos++; console.log(`FALLA ${nombre}: ${err}`) } else console.log(`ok   ${nombre}`)
  }

  // El camino feliz: Caro acota a Bea (que el bloque de auditoría dejó en "ve todos") y le da ACT.
  await db.query(`select set_config('spira.uid', '${CARO}', false)`)
  await db.query(`select public.set_pharma_todos_los_estudios('${U.bea}', false, true)`)
  await db.query(`select public.set_pharma_protocol_access('${U.bea}','${P.act}', true, false)`)
  await db.query(`select set_config('spira.uid', '${U.bea}', false)`)
  const beaVeAct = (await db.query(`select public.pharma_alcanza_protocolo('${P.act}') v`)).rows[0].v
  if (beaVeAct !== true) { fallos++; console.log('FALLA Bea no alcanza ACT después de dárselo') }
  else console.log('ok   camino feliz: acotar + dar un estudio')

  // Idempotencia del RPC: darlo de nuevo no escribe ni rompe.
  await db.query(`select set_config('spira.uid', '${CARO}', false)`)
  await db.query(`select public.set_pharma_protocol_access('${U.bea}','${P.act}', true, true)`)
  console.log('ok   dar dos veces el mismo estudio no rompe')
}
```

- [ ] **Paso 3: Correr la verificación**

Run: `cd "$BANCO" && node verificar.mjs "$REPO" "-- 8 ·"`
Expected: todo en `ok` y `TODO VERDE`.

- [ ] **Paso 4: Contar los dollar-quotes**

Run:
```bash
node -e 'const t=require("fs").readFileSync("supabase/migrations/0138_estudios_en_farmacia.sql","utf8");const m=t.match(/\$[a-zA-Z_]*\$/g)||[];console.log("marcadores:",m.length,m.length%2===0?"PAR ok":"IMPAR ROTO")'
```
Expected: `marcadores: 20 PAR ok` (16 + los dos RPC nuevos × 2).

- [ ] **Paso 5: Commit**

```bash
git add supabase/migrations/0138_estudios_en_farmacia.sql
git commit -m "feat(db): 0138 parte C - los dos RPC de alcance, con compare-and-swap"
```

---

## Tarea 4 · Migración 0138, parte D: el recorte de nueve policies

**Archivos:**
- Modificar: `supabase/migrations/0138_estudios_en_farmacia.sql` (agregar al final)
- Modificar: `supabase/README.md` (fila del índice)

**Interfaces:** consume las funciones de la Tarea 1. No produce nada nuevo.

- [ ] **Paso 1: Agregar el recorte**

Pegar al final del archivo. **Cada policy se reescribe entera** a partir de su definición VIVA
(varias se redefinieron después de la 0006), y el único cambio es el `and` que se suma:

```sql
-- 8 · El recorte: estudios y pacientes -----------------------------------------------------------
-- NUEVE policies sobre SIETE tablas: siete de SELECT mas las dos de escritura de protocol_alerts
-- y protocol_medications, que comprueban NIVEL. La transformacion es SIEMPRE aditiva:
--   has_module('pharma')  →  (has_module('pharma') and pharma_alcanza_*(...))
-- y la clausula de gerencia queda AFUERA del and.
--
-- Cada una se reescribe entera a partir de su definicion VIVA, no de la primera: "ver protocolos
-- asignados" se redefinio en la 0028, "ver enrolamientos" en la 0010, "ver procedimientos del
-- estudio" en la 0089 y "ver asignacion" en la 0032. Copiar la version de la 0006 habria REVERTIDO
-- esas migraciones en silencio.

-- 8.1 · protocols (viva: 0028). El protocolo ES la fila, asi que el alcance va sobre `id`.
drop policy if exists "ver protocolos asignados" on public.protocols;
create policy "ver protocolos asignados" on public.protocols for select using (
  public.has_module('gerencia')
  or public.is_assigned_coordinator(id)
  or public.has_role('track','leader')
  or public.has_min_role('track','admin')
  or (public.has_module('pharma') and public.pharma_alcanza_protocolo(id))
  or public.has_module('contable')
);

-- 8.2 · enrollments (viva: 0010, que amplio la de la 0006 con `alter policy`).
alter policy "ver enrolamientos de mis protocolos" on public.enrollments
  using (
    public.has_module('gerencia')
    or (public.has_module('pharma') and public.pharma_alcanza_protocolo(protocol_id))
    or public.is_assigned_coordinator(protocol_id)
  );

-- 8.3 · patients (viva: 0006). Un paciente puede estar en DOS protocolos: pharma_alcanza_paciente
-- usa exists, no un `=` contra el primer enrolamiento.
drop policy if exists "ver pacientes de mis protocolos" on public.patients;
create policy "ver pacientes de mis protocolos" on public.patients for select using (
  public.has_module('gerencia')
  or (public.has_module('pharma') and public.pharma_alcanza_paciente(patients.id))
  or exists (
    select 1 from public.enrollments e
    join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
    where e.patient_id = patients.id and pc.user_id = auth.uid()
  )
);

-- 8.4 · protocol_activities (viva: 0006).
drop policy if exists "ver config protocolo (activities)" on public.protocol_activities;
create policy "ver config protocolo (activities)" on public.protocol_activities for select using (
  public.has_module('gerencia')
  or (public.has_module('pharma') and public.pharma_alcanza_protocolo(protocol_activities.protocol_id))
  or exists (select 1 from public.protocol_coordinators pc
             where pc.protocol_id = protocol_activities.protocol_id and pc.user_id = auth.uid())
);

-- 8.5 · protocol_procedures (viva: 0089).
drop policy if exists "ver procedimientos del estudio" on public.protocol_procedures;
create policy "ver procedimientos del estudio" on public.protocol_procedures for select using (
  public.has_module('track')
  or (public.has_module('pharma') and public.pharma_alcanza_protocolo(protocol_procedures.protocol_id))
  or public.has_module('gerencia')
);

-- 8.6 · protocol_alerts (viva: 0006). Son DOS: la de lectura y la de escritura de lideres.
-- La de escritura comprueba NIVEL (has_role('pharma','leader')), asi que el and se SUMA sin tocarlo
-- — si se reemplazara, un viewer de Farmacia ganaria escritura.
drop policy if exists "ver alertas" on public.protocol_alerts;
create policy "ver alertas" on public.protocol_alerts for select using (
  public.has_module('track')
  or (public.has_module('pharma') and public.pharma_alcanza_protocolo(protocol_alerts.protocol_id))
  or public.has_module('gerencia')
);
drop policy if exists "lideres administran alertas" on public.protocol_alerts;
create policy "lideres administran alertas" on public.protocol_alerts for all
  using (
    public.has_role('track','leader')
    or (public.has_role('pharma','leader')
        and public.pharma_alcanza_protocolo(protocol_alerts.protocol_id))
  )
  with check (
    public.has_role('track','leader')
    or (public.has_role('pharma','leader')
        and public.pharma_alcanza_protocolo(protocol_alerts.protocol_id))
  );

-- 8.7 · protocol_medications (viva: 0032). Tambien son dos, y la de escritura comprueba nivel.
drop policy if exists "ver asignacion" on public.protocol_medications;
create policy "ver asignacion" on public.protocol_medications for select using (
  (public.has_module('pharma') and public.pharma_alcanza_protocolo(protocol_medications.protocol_id))
  or public.has_module('gerencia')
);
drop policy if exists "pharma leader asigna" on public.protocol_medications;
create policy "pharma leader asigna" on public.protocol_medications for all
  using (
    public.has_min_role('pharma','leader')
    and public.pharma_alcanza_protocolo(protocol_medications.protocol_id)
  )
  with check (
    public.has_min_role('pharma','leader')
    and public.pharma_alcanza_protocolo(protocol_medications.protocol_id)
  );


-- 9 · Sonda de security_invoker ------------------------------------------------------------------
-- Las dos vistas que esta migracion recrea tienen que seguir con security_invoker. Si alguna
-- devuelve NULL o vacio, la vista se saltea la RLS y hay que volver a correr su bloque.
select c.relname, c.reloptions
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('v_access_audit', 'v_pharma_protocol_access_audit');

notify pgrst, 'reload schema';
```

- [ ] **Paso 2: Verificar el recorte con RLS de verdad en PGlite**

Dos cosas le faltan al esquema de juguete: la RLS, y **las cuatro tablas sobre las que la parte D
hace `drop policy if exists`**. Sin ellas, `drop policy if exists … on public.protocol_activities`
no se saltea: el `if exists` cubre la policy, no la tabla, y Postgres corta con
`42P01: relation "protocol_activities" does not exist`.

Agregar al final de `esquema.sql`:

```sql
-- Las cuatro tablas que la parte D recorta y que hasta ahora no hacían falta. Sólo la columna por
-- la que se llega al protocolo: el banco es de juguete, no un clon del schema.
create table public.protocol_activities (
  id uuid primary key default gen_random_uuid(), protocol_id uuid not null);
create table public.protocol_procedures (
  id uuid primary key default gen_random_uuid(), protocol_id uuid not null);
create table public.protocol_alerts (
  id uuid primary key default gen_random_uuid(), protocol_id uuid not null);
create table public.protocol_medications (
  id uuid primary key default gen_random_uuid(), protocol_id uuid not null, medication_id uuid);

create table public.protocol_coordinators (
  protocol_id uuid not null, user_id uuid not null, primary key (protocol_id, user_id));
create or replace function public.is_assigned_coordinator(proto_id uuid) returns boolean
  language sql stable as $f$
  select exists (select 1 from public.protocol_coordinators
                  where protocol_id = proto_id and user_id = auth.uid());
$f$;
create or replace function public.has_role(m text, r text) returns boolean language sql stable as $f$
  select exists (select 1 from public.user_module_roles x
                  where x.user_id = auth.uid() and x.module::text = m and x.role::text = r);
$f$;
create or replace function public.has_min_role(m text, r text) returns boolean language sql stable as $f$
  select exists (
    select 1 from public.user_module_roles x
     where x.user_id = auth.uid() and x.module::text = m
       and array_position(array['viewer','operator','leader','admin'], x.role::text)
           >= array_position(array['viewer','operator','leader','admin'], r));
$f$;
alter table public.protocols  enable row level security;
alter table public.patients   enable row level security;
alter table public.enrollments enable row level security;
create policy "ver enrolamientos de mis protocolos" on public.enrollments for select
  using (public.has_module('gerencia') or public.has_module('pharma')
         or public.is_assigned_coordinator(protocol_id));
```

Y agregar estos casos a `verificar.mjs` (el corte pasa a `"-- 9 ·"`), corriendo como un rol
no privilegiado para que la RLS se aplique:

```js
// ── El recorte de verdad ─────────────────────────────────────────────────────────────────────
// ⚠️ PGlite corre como SUPERUSUARIO, y un superusuario saltea la RLS entera. `force row level
// security` NO alcanza: eso sólo somete al DUEÑO de la tabla, y el atributo BYPASSRLS del
// superusuario le gana igual. Sin un rol normal estas comprobaciones no prueban nada.
// Por eso cada lectura va con `set role app_user`. Las funciones security definer siguen
// corriendo como su dueño, que es exactamente lo que pasa en producción.
if (corte.startsWith('-- 9')) {
  await db.exec(`
    create role app_user nologin;
    grant usage on schema public, auth to app_user;
    grant select on all tables in schema public to app_user;
    grant execute on all functions in schema public to app_user;
    grant execute on all functions in schema auth   to app_user;
    alter table public.protocols   force row level security;
    alter table public.patients    force row level security;
    alter table public.enrollments force row level security;
  `)

  const filas = async (uid, sql) => {
    await db.query(`select set_config('spira.uid', '${uid}', false)`)
    await db.query('set role app_user')
    try { return (await db.query(sql)).rows.length }
    finally { await db.query('reset role') }
  }

// Bea quedó acotada a LTS + ACT por el camino feliz de la Tarea 3; se la deja sólo con LTS.
await db.query(`select set_config('spira.uid', '${CARO}', false)`)
await db.query(`select public.set_pharma_protocol_access('${U.bea}','${P.act}', false, true)`)

  // Bea quedó acotada a LTS + ACT por el camino feliz de los RPC; se la deja sólo con LTS.
  await db.query(`select set_config('spira.uid', '${CARO}', false)`)
  await db.query(`select public.set_pharma_protocol_access('${U.bea}','${P.act}', false, true)`)

  const recorte = [
    ['Ana (sin recorte) ve los 2 estudios', await filas(U.ana, 'select id from public.protocols'), 2],
    ['Bea (acotada) ve 1 estudio',          await filas(U.bea, 'select id from public.protocols'), 1],
    ['Ana ve al paciente de dos',           await filas(U.ana, `select id from public.patients where id = '${PA.dos}'`), 1],
    ['Bea ve al paciente de dos (por LTS)', await filas(U.bea, `select id from public.patients where id = '${PA.dos}'`), 1],
    ['Ana ve al paciente sin enrolar',      await filas(U.ana, `select id from public.patients where id = '${PA.sin}'`), 1],
    ['Bea NO ve al paciente sin enrolar',   await filas(U.bea, `select id from public.patients where id = '${PA.sin}'`), 0],
    ['Ana ve los 2 enrolamientos',          await filas(U.ana, 'select id from public.enrollments'), 2],
    ['Bea ve 1 enrolamiento',               await filas(U.bea, 'select id from public.enrollments'), 1],
    ['Caro (gerencia) ve los 2 estudios',   await filas(CARO, 'select id from public.protocols'), 2],
  ]
  for (const [nombre, got, esperado] of recorte) {
    if (got !== esperado) { fallos++; console.log(`FALLA ${nombre} → ${got} (esperaba ${esperado})`) }
    else console.log(`ok   ${nombre}`)
  }
}
```

- [ ] **Paso 3: Correr la verificación completa**

Run: `cd "$BANCO" && node verificar.mjs "$REPO" "-- 9 ·"`
Expected: todo en `ok` y `TODO VERDE`.

El caso **«Caro (gerencia) ve los 2 estudios»** es el que prueba que la cláusula de gerencia quedó
fuera del `and`. Si se hubiera metido adentro, gerencia se recortaría a sí misma.

- [ ] **Paso 4: Registrar la 0138 en el índice del README**

CI lo vigila con `scripts/check-migraciones.mjs`: un archivo sin fila hace fallar la PR. Agregar al
final de la tabla de `supabase/README.md`, después de la fila de la 0137:

```markdown
| 0138 | `estudios_en_farmacia.sql` — **Farmacia se puede acotar por estudio** (`docs/plan-estudios-en-farmacia.md`, PR 1). **ADITIVA**, va **antes** del deploy del front: mientras nadie esté acotado no cambia una sola fila. Agrega `user_module_roles.ve_todos_los_estudios` (el interruptor, default `true`) y la tabla `pharma_protocol_access` (la lista cerrada, sin policy de escritura a propósito). Siete funciones `pharma_alcanza_*` mas `pharma_sin_recorte()` (el atajo que evita que un paciente sin enrolamientos desaparezca para quien NO tiene recorte), que **no comprueban el módulo**: el barrido SUMA la condición y nunca reemplaza la que ya estaba (once de las 42 policies a recortar comprueban NIVEL, y sustituirlas le daría escritura a un viewer). Auditoría con `audit_row()` + vista nueva `v_pharma_protocol_access_audit` (junta los estudios y el interruptor); `v_access_audit` deja de contar los updates que sólo movieron el interruptor. Dos RPC `security definer` con compare-and-swap. Recorta **9 policies sobre 7 tablas** (7 de SELECT + las 2 de escritura de `protocol_alerts` y `protocol_medications`, que comprueban nivel y por eso se les SUMA el alcance en vez de reemplazarlo): `protocols` (0028), `enrollments` (0010), `patients` (0006), `protocol_activities`, `protocol_procedures` (0089), `protocol_alerts` y `protocol_medications` (0032) — cada una reescrita desde su definición **viva**, no desde la 0006. Las dos vistas repiten su `with (security_invoker = true)` y el archivo termina con la sonda de `reloptions`. Probada con PGlite. ⚠️ **No acotar a nadie en prod hasta aplicar la 0141**: entre medio el recorte es parcial. |
```

- [ ] **Paso 5: Correr el chequeo de migraciones**

Run: `node scripts/check-migraciones.mjs`
Expected: sale sin errores (código 0). Si dice "Falta en el índice", la fila quedó mal formada.

- [ ] **Paso 6: Commit**

```bash
git add supabase/migrations/0138_estudios_en_farmacia.sql supabase/README.md
git commit -m "feat(db): 0138 parte D - recorte de estudios y pacientes en Farmacia"
```

---

## Tarea 5 · La lógica pura del borrador

**Archivos:**
- Crear: `src/data/pharmaAccessModel.ts`
- Crear: `src/data/pharmaAccessModel.test.ts`

**Interfaces que produce:**
- `interface AlcancePharma { veTodos: boolean; estudios: string[] }`
- `type LlamadaDeAlcance = { tipo: 'interruptor'; todos: boolean; expected: boolean } | { tipo: 'estudio'; protocolId: string; asignado: boolean; expected: boolean }`
- `function cambiosDeAlcance(vigente: AlcancePharma, borrador: AlcancePharma): LlamadaDeAlcance[]`

- [ ] **Paso 1: Escribir los tests que fallan**

Crear `src/data/pharmaAccessModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cambiosDeAlcance } from './pharmaAccessModel'

/* De (lo vigente, lo que quedó en el borrador) a la lista de llamadas al servidor.
 *
 * Se testea porque falla EN SILENCIO y de la peor manera: una llamada de menos deja un acceso sin
 * revocar y la pantalla se dibuja impecable, mostrando el estado que el usuario eligió y no el que
 * quedó en la base. El orden tampoco es cosmético — el interruptor va primero, porque al revés el
 * historial se lee como si le hubieran dado estudios a alguien que todavía ve todos.
 */

const vacio = { veTodos: true, estudios: [] }

describe('cambiosDeAlcance', () => {
  it('sin cambios, no manda nada', () => {
    expect(cambiosDeAlcance(vacio, vacio)).toEqual([])
    expect(cambiosDeAlcance({ veTodos: false, estudios: ['a'] }, { veTodos: false, estudios: ['a'] }))
      .toEqual([])
  })

  it('apagar el interruptor manda una sola llamada, con el expected de lo vigente', () => {
    expect(cambiosDeAlcance(vacio, { veTodos: false, estudios: [] })).toEqual([
      { tipo: 'interruptor', todos: false, expected: true },
    ])
  })

  it('el interruptor va SIEMPRE antes que los estudios', () => {
    const out = cambiosDeAlcance(vacio, { veTodos: false, estudios: ['p1'] })
    expect(out).toEqual([
      { tipo: 'interruptor', todos: false, expected: true },
      { tipo: 'estudio', protocolId: 'p1', asignado: true, expected: false },
    ])
  })

  it('un estudio que entra y otro que sale, cada uno con su expected', () => {
    const out = cambiosDeAlcance(
      { veTodos: false, estudios: ['p1', 'p2'] },
      { veTodos: false, estudios: ['p2', 'p3'] },
    )
    expect(out).toContainEqual({ tipo: 'estudio', protocolId: 'p1', asignado: false, expected: true })
    expect(out).toContainEqual({ tipo: 'estudio', protocolId: 'p3', asignado: true, expected: false })
    expect(out).toHaveLength(2)
  })

  /* Volver a "ve todos" NO manda bajas de estudios: la lista se conserva a propósito para que
     gerencia la encuentre si se arrepiente, y sin el interruptor no da acceso a nada. Mandar las
     bajas borraría el trabajo de elegirlos, en silencio. */
  it('volver a "ve todos" no borra la lista', () => {
    expect(cambiosDeAlcance({ veTodos: false, estudios: ['p1', 'p2'] }, { veTodos: true, estudios: ['p1', 'p2'] }))
      .toEqual([{ tipo: 'interruptor', todos: true, expected: false }])
  })

  /* Con el interruptor prendido los estudios no se pueden tocar desde la pantalla (la tarjeta es un
     renglón solo), pero el borrador podría traerlos si alguien prendió y apagó. No se mandan. */
  it('con "ve todos" prendido en el borrador, ignora los cambios de estudios', () => {
    expect(cambiosDeAlcance({ veTodos: true, estudios: [] }, { veTodos: true, estudios: ['p1'] }))
      .toEqual([])
  })

  it('el orden de la lista no cambia el resultado', () => {
    const a = cambiosDeAlcance({ veTodos: false, estudios: ['p1', 'p2'] }, { veTodos: false, estudios: ['p2', 'p1'] })
    expect(a).toEqual([])
  })
})
```

- [ ] **Paso 2: Correr los tests y ver que fallan**

Run: `npx vitest run src/data/pharmaAccessModel.test.ts`
Expected: FAIL — `Failed to resolve import "./pharmaAccessModel"`.

- [ ] **Paso 3: Escribir la implementación**

Crear `src/data/pharmaAccessModel.ts`:

```ts
/* ============================================================================
   De lo que quedó en el borrador a las llamadas que hay que mandar.

   VIVE ACÁ Y PURO —sin React, sin Supabase— porque es el punto donde esta pantalla puede fallar sin
   que se note. Una llamada de menos deja un acceso sin revocar y la pantalla se dibuja impecable:
   muestra lo que el usuario eligió, no lo que quedó en la base. Aislado se testea desde node;
   adentro de un `for` en el handler de guardar, no.
   ============================================================================ */

/** El alcance de una persona en Farmacia: el interruptor y, si está apagado, la lista. */
export interface AlcancePharma {
  /** true = ve todos los estudios (lo predeterminado). Espejo de
   *  `user_module_roles.ve_todos_los_estudios` (0138). */
  veTodos: boolean
  /** Ids de los estudios de `pharma_protocol_access`. Sólo rinde con `veTodos` en false. */
  estudios: string[]
}

/** Una llamada al servidor. `expected` es siempre lo que el navegador creía vigente: es el
 *  compare-and-swap de los dos RPC de la 0138. */
export type LlamadaDeAlcance =
  | { tipo: 'interruptor'; todos: boolean; expected: boolean }
  | { tipo: 'estudio'; protocolId: string; asignado: boolean; expected: boolean }

/**
 * Las llamadas que hacen falta para llevar `vigente` a `borrador`, en el orden en que se mandan.
 *
 * EL ORDEN NO ES COSMÉTICO: el interruptor va primero. Al revés, el historial se lee como si le
 * hubieran dado estudios a alguien que todavía ve todos — el mismo criterio por el que en
 * `AccesoEditor` los módulos van antes que los estudios.
 *
 * CON `veTodos` PRENDIDO EN EL BORRADOR NO SE MANDAN CAMBIOS DE ESTUDIOS, y eso es una decisión, no
 * un olvido: la lista se conserva para que gerencia la encuentre si se arrepiente, y sin el
 * interruptor no da acceso a nada porque `pharma_sin_recorte()` corta antes. Mandar las bajas
 * borraría el trabajo de elegirlos, en silencio.
 */
export function cambiosDeAlcance(
  vigente: AlcancePharma,
  borrador: AlcancePharma,
): LlamadaDeAlcance[] {
  const out: LlamadaDeAlcance[] = []

  if (vigente.veTodos !== borrador.veTodos) {
    out.push({ tipo: 'interruptor', todos: borrador.veTodos, expected: vigente.veTodos })
  }

  if (borrador.veTodos) return out

  const antes = new Set(vigente.estudios)
  const ahora = new Set(borrador.estudios)
  for (const id of new Set([...antes, ...ahora])) {
    if (antes.has(id) === ahora.has(id)) continue
    out.push({ tipo: 'estudio', protocolId: id, asignado: ahora.has(id), expected: antes.has(id) })
  }
  return out
}
```

- [ ] **Paso 4: Correr los tests**

Run: `npx vitest run src/data/pharmaAccessModel.test.ts`
Expected: PASS, 7 tests.

- [ ] **Paso 5: Commit**

```bash
git add src/data/pharmaAccessModel.ts src/data/pharmaAccessModel.test.ts
git commit -m "feat(data): la logica pura del alcance de Farmacia, con tests"
```

---

## Tarea 6 · La capa de datos

**Archivos:**
- Crear: `src/data/pharmaAccess.ts`

**Interfaces:**
- Consume: `AlcancePharma`, `LlamadaDeAlcance` (Tarea 5); los RPC de la Tarea 3.
- Produce:
  - `interface PharmaScopeRow { user_id: string; ve_todos_los_estudios: boolean }`
  - `interface PharmaAsignacionRow { user_id: string; protocol_id: string }`
  - `function usePharmaScopes(): QueryResult<PharmaScopeRow[]>`
  - `function useAllPharmaAssignments(): QueryResult<PharmaAsignacionRow[]>`
  - `function usePharmaAccessAudit(userId: string | null): QueryResult<PharmaAccessAuditRow[]>`
  - `function aplicarAlcance(userId: string, llamadas: LlamadaDeAlcance[]): Promise<{ errores: string[] }>`

- [ ] **Paso 1: Escribir el archivo**

Crear `src/data/pharmaAccess.ts`:

```ts
import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'
import type { PostgrestError } from '@supabase/supabase-js'
import type { PharmaAccessAuditRow } from '../lib/roles'
import type { LlamadaDeAlcance } from './pharmaAccessModel'

/* ============================================================================
   Qué estudios ve cada persona EN FARMACIA — la contracara de `protocolAccess.ts`.

   Son dos mecanismos distintos a propósito y por eso viven en archivos distintos: Coordinación es
   lista blanca SIEMPRE (`protocol_coordinators`, 0006) y Farmacia arranca viendo todo y se puede
   acotar (`user_module_roles.ve_todos_los_estudios` + `pharma_protocol_access`, 0138). Meterlos en
   un archivo con un `if` invitaba a que una lectura cayera en la rama equivocada y devolviera lo
   contrario, prolijamente.

   Se lee directo de las tablas —las dos tienen policy de SELECT para gerencia— y se escribe SÓLO
   por RPC: `pharma_protocol_access` NO tiene policy de escritura, así que un `.insert()` directo
   afectaría cero filas EN SILENCIO.
   ========================================================================== */

/** Traduce los errores de LECTURA, con el mismo criterio que `protocolAccess.ts`. */
function leerErrorMessage(e: PostgrestError): string {
  const code = e.code ?? ''
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01') {
    return 'Falta aplicar una actualización del sistema para ver los estudios de Farmacia. Avisale al administrador.'
  }
  if (code === '42501') return 'No tenés permiso para ver los estudios de Farmacia.'
  return 'No pudimos traer los estudios de Farmacia. Probá de nuevo en un momento.'
}

/** El interruptor de una persona. `ve_todos_los_estudios` lo agregó la 0138. */
export interface PharmaScopeRow {
  user_id: string
  ve_todos_los_estudios: boolean
}

/**
 * El interruptor de TODO el centro, en una consulta.
 *
 * Se filtra por `module = 'pharma'` porque la columna vive en `user_module_roles`, que tiene una
 * fila por módulo: sin el filtro llegarían también las de Coordinación, que no la leen, y habría
 * dos filas por persona con valores distintos.
 *
 * ⚠️ QUIEN NO TIENE FILA VE TODO. No tener acceso a Farmacia no es "está acotado a cero": es no
 * tener el módulo. Quien llama tiene que resolver la ausencia con `true`, igual que el `coalesce`
 * de `pharma_sin_recorte()` en la base.
 */
export function usePharmaScopes(): QueryResult<PharmaScopeRow[]> {
  return useSupabaseQuery<PharmaScopeRow[]>(
    (c) =>
      c
        .from('user_module_roles')
        .select('user_id, ve_todos_los_estudios')
        .eq('module', 'pharma')
        .returns<PharmaScopeRow[]>(),
    [],
    leerErrorMessage,
  )
}

/** Una fila de la lista cerrada. */
export interface PharmaAsignacionRow {
  user_id: string
  protocol_id: string
}

/**
 * TODAS las asignaciones de Farmacia del centro, sin filtrar por persona.
 *
 * Enteras y no filtradas por el mismo motivo que `useAllProtocolAssignments`: son unidades de
 * protocolos por unidades de personas, la policy de SELECT ya deja a gerencia leerlas todas, y
 * `useSupabaseQuery` no cachea — pedirlas por persona las reconsultaría en cada entrada y salida de
 * una ficha.
 *
 * ⚠️ CERO FILAS NO ES UN ERROR: es el estado normal de un centro donde nadie está acotado.
 */
export function useAllPharmaAssignments(): QueryResult<PharmaAsignacionRow[]> {
  return useSupabaseQuery<PharmaAsignacionRow[]>(
    (c) =>
      c
        .from('pharma_protocol_access')
        .select('user_id, protocol_id')
        .returns<PharmaAsignacionRow[]>(),
    [],
    leerErrorMessage,
  )
}

/**
 * El historial de alcance de UNA persona (vista `v_pharma_protocol_access_audit`, 0138).
 *
 * Limitado a 20 por el mismo motivo que los otros dos: `audit_log` crece sin techo y en la ficha
 * importa lo último que pasó. El tope se aplica de nuevo DESPUÉS de mezclar las tres listas — ver
 * `mezclarHistorial` en `lib/roles.ts`.
 */
export function usePharmaAccessAudit(userId: string | null): QueryResult<PharmaAccessAuditRow[]> {
  return useSupabaseQuery<PharmaAccessAuditRow[]>(
    (c) =>
      c
        .from('v_pharma_protocol_access_audit')
        .select('id, occurred_at, action, clase, protocol_code, protocol_name, ve_todos, actor_name, target_name')
        .eq('target_user_id', userId ?? '00000000-0000-0000-0000-000000000000')
        .order('occurred_at', { ascending: false })
        .limit(20)
        .returns<PharmaAccessAuditRow[]>(),
    [userId],
    leerErrorMessage,
  )
}

/**
 * Traduce los errores de ESCRITURA de los dos RPC.
 *
 * Los mensajes de los guards ya vienen en castellano desde el servidor («Alguien más cambió este
 * acceso mientras lo editabas»), así que se dejan pasar tal cual — mismo criterio que `team.ts` y
 * `protocolAccess.ts`. Sólo se traducen los códigos crudos de Postgres.
 */
function escribirErrorMessage(e: PostgrestError): string {
  const code = e.code ?? ''
  if (code === 'PGRST202' || code === '42883') {
    return 'Falta aplicar una actualización del sistema para cambiar los estudios de Farmacia.'
  }
  if (code === '42501') return 'No tenés permiso para cambiar accesos.'
  const m = (e.message ?? '').trim()
  return m || 'No pudimos guardar el cambio. Probá de nuevo en un momento.'
}

/**
 * Manda las llamadas de `cambiosDeAlcance`, EN ORDEN y de a una.
 *
 * Secuencial y no en paralelo, igual que `AccesoEditor.guardar`: son escrituras sobre la misma
 * persona y cada una lleva su compare-and-swap. En paralelo, dos que tocaran lo mismo se pisarían —
 * y además el orden importa para leer después el historial.
 *
 * Devuelve TODOS los errores y no corta en el primero: el resto de las llamadas sí se aplicó, y la
 * pantalla tiene que poder decir cuáles fallaron. Mismo criterio que «Mi cuenta».
 */
export async function aplicarAlcance(
  userId: string,
  llamadas: LlamadaDeAlcance[],
): Promise<{ errores: string[] }> {
  const errores: string[] = []
  for (const l of llamadas) {
    const { error } =
      l.tipo === 'interruptor'
        ? await supabase.rpc('set_pharma_todos_los_estudios', {
            p_user_id: userId,
            p_todos: l.todos,
            p_expected: l.expected,
          })
        : await supabase.rpc('set_pharma_protocol_access', {
            p_user_id: userId,
            p_protocol_id: l.protocolId,
            p_asignado: l.asignado,
            p_expected: l.expected,
          })
    if (error) errores.push(escribirErrorMessage(error))
  }
  return { errores }
}
```

- [ ] **Paso 2: Verificar que compila**

Run: `npm run typecheck`
Expected: falla **sólo** con `Module '"../lib/roles"' has no exported member 'PharmaAccessAuditRow'`
— ese tipo lo crea la Tarea 7. Cualquier otro error es un problema de este archivo.

- [ ] **Paso 3: Commit**

```bash
git add src/data/pharmaAccess.ts
git commit -m "feat(data): capa de datos del alcance de Farmacia"
```

---

## Tarea 7 · El historial: la tercera lista

**Archivos:**
- Modificar: `src/lib/roles.ts` (agregar después de `protocolAuditLine`, y cambiar `mezclarHistorial`)
- Modificar: `src/lib/roles.test.ts`

**Interfaces:**
- Consume: nada nuevo.
- Produce:
  - `interface PharmaAccessAuditRow { id, occurred_at, action, clase: 'estudio' | 'interruptor', protocol_code, protocol_name, ve_todos, actor_name, target_name }`
  - `function pharmaAuditLine(row: PharmaAccessAuditRow): string`
  - `mezclarHistorial(modulos, protocolos, farmacia, nombreModulo, tope?)` — **un parámetro más, en tercer lugar**

- [ ] **Paso 1: Escribir los tests que fallan**

Agregar al final de `src/lib/roles.test.ts`:

```ts
describe('pharmaAuditLine', () => {
  const base = {
    id: 'x', occurred_at: '2026-09-20T10:00:00Z',
    actor_name: 'Caro', target_name: 'Bea',
    protocol_code: 'LTS17231', protocol_name: 'Lipoproteína', ve_todos: null,
  }

  it('dar un estudio dice quién a quién, y nombra Farmacia', () => {
    expect(pharmaAuditLine({ ...base, action: 'INSERT', clase: 'estudio' }))
      .toBe('Caro le dio el estudio LTS17231 en Farmacia a Bea')
  })

  it('quitar un estudio NO se confunde con darlo', () => {
    expect(pharmaAuditLine({ ...base, action: 'DELETE', clase: 'estudio' }))
      .toBe('Caro le quitó el estudio LTS17231 en Farmacia a Bea')
  })

  it('apagar el interruptor dice que lo acotó', () => {
    expect(pharmaAuditLine({ ...base, action: 'UPDATE', clase: 'interruptor', ve_todos: false, protocol_code: null, protocol_name: null }))
      .toBe('Caro acotó a Bea a una lista de estudios en Farmacia')
  })

  it('prenderlo dice que le devolvió todos', () => {
    expect(pharmaAuditLine({ ...base, action: 'UPDATE', clase: 'interruptor', ve_todos: true, protocol_code: null, protocol_name: null }))
      .toBe('Caro le devolvió a Bea todos los estudios en Farmacia')
  })

  /* audit_log es inmutable: sus líneas sobreviven al borrado del estudio y de la cuenta. La línea
     tiene que decirlo en vez de quedar coja. */
  it('con el estudio borrado, cae al nombre y después al texto genérico', () => {
    expect(pharmaAuditLine({ ...base, action: 'INSERT', clase: 'estudio', protocol_code: null }))
      .toBe('Caro le dio el estudio Lipoproteína en Farmacia a Bea')
    expect(pharmaAuditLine({ ...base, action: 'INSERT', clase: 'estudio', protocol_code: null, protocol_name: null }))
      .toBe('Caro le dio el estudio un estudio que ya no existe en Farmacia a Bea')
  })

  it('sin actor ni objetivo, no inventa nombres', () => {
    expect(pharmaAuditLine({ ...base, action: 'DELETE', clase: 'estudio', actor_name: null, target_name: null }))
      .toBe('El sistema le quitó el estudio LTS17231 en Farmacia a una cuenta que ya no existe')
  })
})

describe('mezclarHistorial con las tres listas', () => {
  const nombreModulo = (k: string) => k
  const farmacia = (id: string, occurred_at: string): PharmaAccessAuditRow => ({
    id, occurred_at, action: 'INSERT', clase: 'estudio',
    protocol_code: 'LTS17231', protocol_name: null, ve_todos: null,
    actor_name: 'Caro', target_name: 'Bea',
  })

  it('las tres fuentes entran en una sola lista, de lo más nuevo a lo más viejo', () => {
    const out = mezclarHistorial(
      [mod('m1', '2026-09-20T09:00:00Z')],
      [proto('p1', '2026-09-20T11:00:00Z')],
      [farmacia('f1', '2026-09-20T10:00:00Z')],
      nombreModulo,
    )
    expect(out.map((l) => l.id)).toEqual(['p1', 'f1', 'm1'])
  })

  it('el tope se aplica DESPUÉS de mezclar', () => {
    const out = mezclarHistorial(
      [mod('m1', '2026-09-20T09:00:00Z')],
      [proto('p1', '2026-09-20T11:00:00Z')],
      [farmacia('f1', '2026-09-20T10:00:00Z')],
      nombreModulo,
      2,
    )
    expect(out.map((l) => l.id)).toEqual(['p1', 'f1'])
  })

  it('sin filas de Farmacia se comporta igual que antes', () => {
    const out = mezclarHistorial(
      [mod('m1', '2026-09-20T09:00:00Z')],
      [proto('p1', '2026-09-20T11:00:00Z')],
      [],
      nombreModulo,
    )
    expect(out.map((l) => l.id)).toEqual(['p1', 'm1'])
  })
})
```

Agregar `pharmaAuditLine` al `import` de la cabecera del archivo y `PharmaAccessAuditRow` al
`import type`. Los helpers `mod` y `proto` ya existen en el `describe('mezclarHistorial')` de más
arriba: **subirlos al alcance del módulo** (moverlos fuera del `describe`, justo antes de él) para
que los dos bloques los usen. Si quedaran duplicados, la copia sería la que se olvide de un caso.

- [ ] **Paso 2: Correr los tests y ver que fallan**

Run: `npx vitest run src/lib/roles.test.ts`
Expected: FAIL — `pharmaAuditLine is not a function` y `Expected 4 arguments, but got 5`.

- [ ] **Paso 3: Escribir la implementación**

En `src/lib/roles.ts`, agregar después de `protocolAuditLine` (antes del bloque
`/* ─── Los dos historiales, en una sola lista ─── */`):

```ts
/* ─── El historial del alcance en Farmacia (migración 0138) ─── */

/** Una fila de `v_pharma_protocol_access_audit` (0138), tal como llega. */
export interface PharmaAccessAuditRow {
  id: string
  occurred_at: string
  action: string
  /** `'estudio'` = entró o salió de la lista. `'interruptor'` = se prendió o apagó el recorte. */
  clase: string
  /** `null` si el protocolo se borró, o si la línea es del interruptor. */
  protocol_code: string | null
  protocol_name: string | null
  /** Sólo en las del interruptor: el valor que quedó. `true` = volvió a ver todos. */
  ve_todos: boolean | null
  actor_name: string | null
  target_name: string | null
}

/**
 * Una línea del historial de Farmacia, en castellano.
 *
 * Vive aparte de `protocolAuditLine` por lo mismo que la vista es aparte: son dos hechos distintos
 * —el alcance en Coordinación y el alcance en Farmacia— y la frase tiene que nombrar el módulo, o
 * en el historial mezclado «le dio el estudio LTS17231» no dice para dónde.
 *
 * Se testea porque invertir dar y quitar, o el sentido del interruptor, produce una frase impecable
 * que dice exactamente lo contrario de lo que pasó.
 */
export function pharmaAuditLine(row: PharmaAccessAuditRow): string {
  const quien = row.actor_name ?? 'El sistema'
  const aQuien = row.target_name ?? 'una cuenta que ya no existe'

  if (row.clase === 'interruptor') {
    return row.ve_todos
      ? `${quien} le devolvió a ${aQuien} todos los estudios en Farmacia`
      : `${quien} acotó a ${aQuien} a una lista de estudios en Farmacia`
  }

  /* El código es la identidad del estudio en toda la app; el nombre es el respaldo. Si no hay
     ninguno de los dos, el protocolo se borró — y la línea lo dice en vez de quedar coja. */
  const estudio = row.protocol_code ?? row.protocol_name ?? 'un estudio que ya no existe'
  if (row.action === 'INSERT') return `${quien} le dio el estudio ${estudio} en Farmacia a ${aQuien}`
  if (row.action === 'DELETE') return `${quien} le quitó el estudio ${estudio} en Farmacia a ${aQuien}`
  return `${quien} volvió a guardar el estudio ${estudio} en Farmacia para ${aQuien}, sin cambiarlo`
}
```

Y cambiar la firma y el cuerpo de `mezclarHistorial`:

```ts
export function mezclarHistorial(
  modulos: readonly AccessAuditRow[],
  protocolos: readonly ProtocolAccessAuditRow[],
  farmacia: readonly PharmaAccessAuditRow[],
  nombreModulo: (key: string) => string,
  tope = 20,
): LineaDeHistorial[] {
  const lineas: LineaDeHistorial[] = [
    ...modulos.map((r) => ({ id: r.id, occurred_at: r.occurred_at, texto: auditLine(r, nombreModulo) })),
    ...protocolos.map((r) => ({ id: r.id, occurred_at: r.occurred_at, texto: protocolAuditLine(r) })),
    ...farmacia.map((r) => ({ id: r.id, occurred_at: r.occurred_at, texto: pharmaAuditLine(r) })),
  ]
  lineas.sort((a, b) => (b.occurred_at.localeCompare(a.occurred_at)) || b.id.localeCompare(a.id))
  return lineas.slice(0, tope)
}
```

Y actualizar el comentario de cabecera de `mezclarHistorial`: donde dice «dos listas» y «las 20 más
nuevas de cada lado», que diga **tres**. El argumento no cambia —vale igual para N listas— pero un
comentario que cuenta mal es el que hace dudar del código que describe.

- [ ] **Paso 4: Correr los tests**

Run: `npx vitest run src/lib/roles.test.ts`
Expected: PASS, todos.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/roles.ts src/lib/roles.test.ts
git commit -m "feat(roles): pharmaAuditLine y el historial a tres listas"
```

---

## Tarea 8 · La tarjeta «Estudios en Farmacia»

**Archivos:**
- Modificar: `src/shell/settings/AccesoEditor.tsx`
- Modificar: `src/shell/settings/EquipoYAccesosSection.tsx`

**Interfaces:**
- Consume: `usePharmaScopes`, `useAllPharmaAssignments`, `usePharmaAccessAudit`, `aplicarAlcance`
  (Tarea 6); `cambiosDeAlcance`, `AlcancePharma` (Tarea 5); `pharmaAuditLine`, `mezclarHistorial`
  (Tarea 7).
- Produce: nada que consuman otras tareas.

- [ ] **Paso 1: Bajar las dos consultas nuevas por prop**

En `src/shell/settings/EquipoYAccesosSection.tsx`:

```tsx
// junto a los imports de protocolAccess
import { useAllPharmaAssignments, usePharmaScopes } from '../../data/pharmaAccess'
```

```tsx
// junto a `const asignaciones = useAllProtocolAssignments()`
/* Las dos de Farmacia bajan por prop por el mismo motivo que las de Coordinación:
   `useSupabaseQuery` no cachea, así que pedirlas adentro del editor las reconsultaría en cada
   entrada y salida de una ficha, siendo siempre la misma lista del centro entero. */
const scopesPharma = usePharmaScopes()
const asignacionesPharma = useAllPharmaAssignments()
```

Y en el `<AccesoEditor …>`, agregar:

```tsx
scopesPharma={scopesPharma.data ?? []}
asignacionesPharma={asignacionesPharma.data ?? []}
pharmaCargando={scopesPharma.loading || asignacionesPharma.loading}
onPharmaCambiado={() => { scopesPharma.refetch(); asignacionesPharma.refetch() }}
```

- [ ] **Paso 2: Recibir las props y armar el borrador**

En `src/shell/settings/AccesoEditor.tsx`, agregar a los imports:

```tsx
import { aplicarAlcance, usePharmaAccessAudit } from '../../data/pharmaAccess'
import type { PharmaAsignacionRow, PharmaScopeRow } from '../../data/pharmaAccess'
import { cambiosDeAlcance } from '../../data/pharmaAccessModel'
```

Agregar a `interface Props`:

```tsx
  /** El interruptor de cada persona del centro (`ve_todos_los_estudios`, 0138). Bajan por prop
   *  desde la sección por el mismo motivo que `asignaciones`. */
  scopesPharma: PharmaScopeRow[]
  /** La lista cerrada de cada persona. Enteras: no hacen falta sólo las de ésta. */
  asignacionesPharma: PharmaAsignacionRow[]
  pharmaCargando: boolean
  /** Para que la sección vuelva a pedirlas después de guardar. */
  onPharmaCambiado: () => void
```

Y al desestructurado del componente. Después, junto a `protocolosVigentes`:

```tsx
  const auditPharma = usePharmaAccessAudit(persona.id)

  /* Lo que la base dice hoy del alcance en Farmacia.
     SIN FILA = VE TODOS, y no es una guarda defensiva: quien no tiene el módulo no tiene fila, y
     tratarlo como "acotado a cero" mostraría el ámbar de "no ve nada" a alguien que ni siquiera
     entra a Farmacia. Es el mismo `coalesce(..., true)` que hace `pharma_sin_recorte()` en la base. */
  const alcancePharmaVigente = useMemo(
    () => ({
      veTodos: scopesPharma.find((s) => s.user_id === persona.id)?.ve_todos_los_estudios ?? true,
      estudios: asignacionesPharma.filter((a) => a.user_id === persona.id).map((a) => a.protocol_id),
    }),
    [scopesPharma, asignacionesPharma, persona.id],
  )

  /* Mismo patrón que `borradorProtos`: `null` = "todavía no lo tocaron". Con un
     `useState(vigente)` el estado inicial se congelaría en el `{veTodos: true, estudios: []}` del
     primer render —la consulta todavía viaja— y la persona aparecería sin recorte hasta que alguien
     tocara algo. El `??` lo resuelve sin efecto de sincronización. */
  const [borradorPharma, setBorradorPharma] = useState<AlcancePharma | null>(null)
  const alcancePharma = borradorPharma ?? alcancePharmaVigente

  const cambiosPharma = useMemo(
    () => cambiosDeAlcance(alcancePharmaVigente, alcancePharma),
    [alcancePharmaVigente, alcancePharma],
  )
```

Agregar `import type { AlcancePharma } from '../../data/pharmaAccessModel'` y sumar
`cambiosPharma.length` a `totalCambios`:

```tsx
  const totalCambios = cambios.length + cambiosProtocolos.length + cambiosPharma.length
```

Y la condición de la tarjeta, junto a `tieneCoordinacion`:

```tsx
  /* La tarjeta de Farmacia sólo existe si la persona tiene Farmacia EN EL BORRADOR, igual que la de
     Coordinación: así aparece en el acto al darle el módulo, sin obligar a guardar y volver a
     entrar. */
  const tieneFarmacia = borrador.pharma != null
```

- [ ] **Paso 3: Mandar los cambios al guardar**

En `guardar()`, después del `for (const c of cambiosProtocolos) { … }` y antes de
`setGuardando(false)`:

```tsx
    /* El alcance de Farmacia va al final y en el orden que fija `cambiosDeAlcance`: el interruptor
       antes que los estudios. Al revés, el historial se lee como si le hubieran dado estudios a
       alguien que todavía ve todos. */
    if (cambiosPharma.length > 0) {
      const { errores } = await aplicarAlcance(persona.id, cambiosPharma)
      for (const e of errores) fallas.push(`Farmacia: ${e}`)
    }
```

Y en la línea que refresca, sumar el callback nuevo:

```tsx
    onAsignacionesCambiadas()
    onPharmaCambiado()
```

- [ ] **Paso 4: Renombrar el título de la tarjeta de Coordinación**

Con las dos visibles, «Estudios que ve» repetido dos veces no distingue nada. Cambiar:

```tsx
        <StCard title="Estudios que ve" desc="Sobre qué pacientes puede trabajar en Coordinación">
```

por:

```tsx
        <StCard title="Estudios en Coordinación" desc="Sobre qué pacientes puede trabajar">
```

- [ ] **Paso 5: Escribir la tarjeta de Farmacia**

Pegar inmediatamente después del `)}` que cierra `{tieneCoordinacion && ( … )}`:

```tsx
      {/* 2b · estudios en Farmacia — la misma pregunta, con el predeterminado al revés.
             Coordinación es lista blanca SIEMPRE (`protocol_coordinators`, 0006): sin estudios no
             ve un paciente. Farmacia arranca viendo todo y se puede acotar (0138). Por eso son dos
             tarjetas y no dos renglones de una: tienen predeterminados opuestos, y un cuadro que
             dice "Estudios que ve" donde vacío significa "todos" en una mitad y "ninguno" en la
             otra se lee mal sí o sí. */}
      {tieneFarmacia && (
        <StCard title="Estudios en Farmacia" desc="Sobre qué estudios puede trabajar">
          <StRow
            label="Ve todos los estudios"
            sub={
              alcancePharma.veTodos
                ? 'Incluidos los que se den de alta más adelante'
                : 'Apagado: ve sólo los que elijas acá abajo'
            }
            last={alcancePharma.veTodos}
          >
            <StToggle
              on={alcancePharma.veTodos}
              onClick={() =>
                setBorradorPharma({ ...alcancePharma, veTodos: !alcancePharma.veTodos })
              }
              label="Ve todos los estudios en Farmacia"
            />
          </StRow>

          {/* Con el interruptor prendido la tarjeta es un renglón solo: ofrecer el selector sería
              ofrecer una decisión que no rinde, porque `pharma_sin_recorte()` corta antes. */}
          {!alcancePharma.veTodos && (
            <>
              <StRow
                label="Estudios asignados"
                sub={
                  alcancePharma.estudios.length === 0
                    ? 'Sin ninguno no va a ver stock, recepciones ni dispensaciones'
                    : `Trabaja sobre ${alcancePharma.estudios.length === 1 ? 'este estudio' : `estos ${alcancePharma.estudios.length} estudios`}`
                }
              >
                <SearchableSelect
                  id="acceso-protocolos-pharma"
                  multiple
                  modo="sumar"
                  variant="boton"
                  leadingIcon="plus"
                  mono
                  value={alcancePharma.estudios}
                  onChange={(ids) => setBorradorPharma({ ...alcancePharma, estudios: ids })}
                  options={protocolos.map((p) => ({
                    value: p.id,
                    label: p.code,
                    desc: p.status === 'activo' ? p.name : `${p.name} · ${p.status}`,
                  }))}
                  placeholder={protocolosCargando ? 'Cargando estudios…' : 'Añadir estudio'}
                  sinRestantes={{ label: 'Todos asignados', mensaje: 'Ya están todos los estudios asignados.' }}
                  searchPlaceholder="Buscar estudio…"
                  entity="estudio"
                  pluralLabel="estudios"
                  disabled={protocolosCargando || pharmaCargando}
                  searchable="always"
                  menuWidth="auto"
                />
              </StRow>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, padding: '6px 0 12px' }}>
                {protocolos
                  .filter((p) => alcancePharma.estudios.includes(p.id))
                  .map((p) => (
                    <EstudioChip
                      key={p.id}
                      codigo={p.code}
                      nombre={p.name}
                      onQuitar={() =>
                        setBorradorPharma({
                          ...alcancePharma,
                          estudios: alcancePharma.estudios.filter((id) => id !== p.id),
                        })
                      }
                    />
                  ))}
              </div>

              {/* La contracara de la lista cerrada, y va acá porque es el único lugar donde alguien
                  puede enterarse ANTES de que pase. Con la administración puesta no aplica: las
                  policies de la 0138 abren con `has_module('gerencia') or …`, así que gerencia ve
                  todo igual. Mira el BORRADOR, así que el aviso cambia en el acto. */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13, padding: '0 0 14px' }}>
                <Icon
                  name={esAdminAhora ? 'check' : 'alert'}
                  size={15}
                  color={esAdminAhora ? 'var(--spira-acc-deep-good)' : 'var(--spira-acc-deep-warn)'}
                />
                <span style={{ color: esAdminAhora ? 'var(--spira-muted)' : 'var(--spira-acc-deep-warn)' }}>
                  {esAdminAhora
                    ? 'Como administra los accesos, igual ve todos los estudios del centro.'
                    : 'Los estudios que se creen más adelante tampoco los va a ver.'}
                </span>
              </div>
            </>
          )}
        </StCard>
      )}
```

- [ ] **Paso 6: Sumar Farmacia al bloque «Qué va a ver al entrar»**

Es el bloque que evita los dos errores caros de esta pantalla: hay que poder leer la consecuencia
antes de guardar. Pegar justo después del `{tieneCoordinacion && ( … )}` de ese bloque (el del ⓘ de
pacientes), y antes del `{!tieneCoordinacion && …}`:

```tsx
          {tieneFarmacia && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13.5 }}>
              <Icon
                name={!alcancePharma.veTodos && alcancePharma.estudios.length === 0 && !esAdminAhora ? 'clock' : 'check'}
                size={14}
                color={!alcancePharma.veTodos && alcancePharma.estudios.length === 0 && !esAdminAhora
                  ? 'var(--spira-acc-deep-warn)' : 'var(--spira-acc-deep-good)'}
              />
              <span style={{ color: !alcancePharma.veTodos && alcancePharma.estudios.length === 0 && !esAdminAhora
                ? 'var(--spira-acc-deep-warn)' : 'var(--spira-ink)' }}>
                {alcancePharma.veTodos ? (
                  <>En Farmacia, <strong style={{ fontWeight: 600 }}>todos los estudios</strong></>
                ) : alcancePharma.estudios.length === 0 && esAdminAhora ? (
                  <>Todos los estudios en Farmacia, <strong style={{ fontWeight: 600 }}>porque administra los accesos</strong></>
                ) : alcancePharma.estudios.length === 0 ? (
                  <>Sin ningún estudio: entra a Farmacia pero <strong style={{ fontWeight: 600 }}>no ve stock ni dispensaciones</strong></>
                ) : (
                  <>
                    En Farmacia, sólo{' '}
                    <strong style={{ fontWeight: 600 }}>
                      {protocolos.filter((p) => alcancePharma.estudios.includes(p.id)).map((p) => p.code).join(' · ')}
                    </strong>
                  </>
                )}
              </span>
            </div>
          )}
```

- [ ] **Paso 7: Conectar el historial**

Cambiar la llamada a `mezclarHistorial`:

```tsx
  const historial = useMemo(
    () => mezclarHistorial(audit.data ?? [], auditProtocolos.data ?? [], auditPharma.data ?? [], nombreModulo),
    [audit.data, auditProtocolos.data, auditPharma.data],
  )
```

- [ ] **Paso 8: Actualizar el comentario de cabecera del archivo**

El comentario de bloque de `AccesoEditor.tsx` enumera los seis bloques y dice, del 2:

> *"Sólo aparece si el borrador tiene Coordinación — Farmacia es central y ve todos los protocolos."*

Eso dejó de ser cierto. Reemplazar ese renglón por:

```
     2. ESTUDIOS — sobre qué PACIENTES (Coordinación) y sobre qué ESTUDIOS (Farmacia). La otra
        mitad del acceso, y va pegada a la primera porque una sin la otra no sirve. Son DOS
        tarjetas, cada una si su módulo está en el borrador, y tienen predeterminados OPUESTOS:
        Coordinación es lista blanca siempre (`protocol_coordinators`, 0006 — sin estudios no ve un
        paciente) y Farmacia arranca viendo todo y se puede acotar (`ve_todos_los_estudios` +
        `pharma_protocol_access`, 0138). Por eso no son dos renglones de un mismo cuadro: un
        "Estudios que ve" donde vacío significa "todos" en una mitad y "ninguno" en la otra se lee
        mal sí o sí.
```

Y en el bloque 6, donde dice «Lo escriben dos triggers (módulos en la 0003, estudios en la 0110)»,
que diga **tres** fuentes, sumando la 0138.

- [ ] **Paso 9: Verificar que compila y los tests pasan**

Run: `npm run build`
Expected: `tsc --noEmit` sin errores, vitest en verde, y el build de Vite termina.

- [ ] **Paso 10: Commit**

```bash
git add src/shell/settings/AccesoEditor.tsx src/shell/settings/EquipoYAccesosSection.tsx
git commit -m "feat(ajustes): tarjeta Estudios en Farmacia, con interruptor y lista cerrada"
```

---

## Tarea 9 · Verificar en el navegador y abrir la PR

**Archivos:** ninguno nuevo.

- [ ] **Paso 1: Levantar el preview**

El dev server del Director ocupa el **5173**; el preview usa el **5250**, fijado en
`.claude/launch.json`. No competir por el puerto.

Arrancar el preview con el nombre de `launch.json` y esperar a que cargue.

- [ ] **Paso 2: Entrar a Ajustes › Equipo y accesos**

`preview_screenshot` se cuelga casi siempre en este proyecto: la verificación va por
snapshot / `read_page` / estilos computados. Y el preview oculto **renderiza lento** — esperar 4-5 s
después de navegar antes de leer, o la lectura devuelve «Cargando…» y parece un cuelgue. Para
apuntar, `element.click()` por selector desde `javascript_tool`, no `ref_N` calculados antes de que
la lista termine de renderizar.

Las credenciales de QA están en `.claude/qa-creds.local.md` (git-ignored). **Nunca** pedirlas ni
aceptarlas por el chat.

- [ ] **Paso 3: Comprobar las cinco cosas que la pantalla promete**

Sobre una cuenta de prueba, leyendo el DOM:

1. Con el borrador **sin** Farmacia, la tarjeta «Estudios en Farmacia» **no existe**.
2. Al elegir un nivel en Farmacia, la tarjeta aparece **en el acto**, con el interruptor prendido y
   un solo renglón.
3. Al apagar el interruptor, aparecen el botón «Añadir estudio», los chips y el aviso ámbar.
4. El bloque «Qué va a ver al entrar» dice «En Farmacia, todos los estudios» con el interruptor
   prendido, y cambia al listar los códigos al elegir estudios.
5. Con la administración puesta en el borrador, el aviso ámbar se reemplaza por la aclaración de
   gerencia, **sin guardar**.

- [ ] **Paso 4: Comprobar que el guardado escribe**

El preview es una sesión de navegador **aparte** de la del Director: no se le pueden precargar
formularios ni ver su estado. Las escrituras se verifican recargando la propia instancia.

Guardar un recorte sobre la cuenta de prueba, recargar, y confirmar que el interruptor vuelve
apagado con los mismos chips. Después revertirlo a «ve todos» y volver a guardar.

**Sobre datos de prueba:** el demo tiene **datos reales**. No crear ni borrar pacientes ni estudios.
Acotar y desacotar una cuenta de prueba no deja rastro salvo en el `audit_log`, que es lo esperado.

- [ ] **Paso 5: Correr el gate completo**

Run: `npm run build`
Expected: verde. `vitest` cuenta también los tests de los worktrees, así que el número local puede
verse duplicado — lo que importa es que no haya fallas.

- [ ] **Paso 6: Abrir la PR**

No hay `gh` en esta máquina: la PR se crea por la **API REST de GitHub** con `git credential fill` +
un script Node. No se puede self-mergear — se crea la PR y la mergea el Director.

`git fetch` antes de razonar sobre el estado del remoto: el Director mergea PRs mientras tanto y las
refs locales quedan viejas.

Cuerpo de la PR: qué hace, el link a `docs/plan-estudios-en-farmacia.md`, y **arriba de todo** el
aviso de orden:

> **La migración `0138` va PRIMERO, antes del deploy.** Es aditiva: mientras nadie esté acotado no
> cambia una sola fila. Y **no acotar a nadie en prod hasta aplicar la `0141`** — entre medio el
> recorte es parcial.

- [ ] **Paso 7: Pasarle el SQL al Director**

El SQL tiene que correr **tal cual**, sin placeholders. Avisarle en el chat que la 0138 está lista,
que va antes del deploy, y que al final devuelve la sonda de `reloptions`: las dos vistas tienen que
salir con `{security_invoker=true}`. Si alguna sale vacía, hay que volver a correr su bloque.

Apenas confirme «aplicada», registrarlo en el índice de `supabase/README.md` con
**Aplicada en prod (fecha)** — `scripts/check-migraciones.mjs` lo vigila.
