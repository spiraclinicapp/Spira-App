-- ============================================================================
-- 0111 · El catálogo de plataformas, configurable desde Ajustes
--
-- Plan: docs/plan-ajustes-capas-protocolos-plataformas.md (tanda 3, pieza E5).
--
-- ── EL PROBLEMA ──
-- Hoy el catálogo de plataformas está escrito DOS VECES: el check de la 0089
-- (`platform in ('iqvia','labcorp','clario','roche4g','otro')`) y el `Record` de
-- `src/views/track/procedimientos/reportes.ts`. Y el dato que de verdad hace falta —la URL del
-- portal— no está en ninguno de los dos: `reportes.ts` las tiene todas en `null` a propósito,
-- porque las direcciones varían por estudio y por sponsor, y en un sistema donde un click manda a
-- la coordinadora a cargar un resultado, un link inventado es peor que ninguno.
--
-- El mecanismo que las usa YA ESTÁ ENTERO y testeado desde la 0089: autocompletado del link al
-- elegir plataforma, respeto del link editado a mano, y botón de restablecer. Lo único que falta
-- es DÓNDE se cargan esas URLs sin necesidad de un dev.
--
-- ── LA DECISIÓN ──
-- La tabla pasa a ser la única fuente: el check se retira y en su lugar va una FK. Con eso, sumar
-- una CRO nueva deja de ser una migración + una línea de código y pasa a ser un formulario.
--
-- ── LAS URLS NACEN VACÍAS ──
-- Decisión del Director (2026-09-07): las cinco plataformas se siembran con `url` en null y las
-- carga él desde la pantalla nueva. La tabla NO puede nacer sin filas —la FK exige que existan las
-- cinco claves que `report_definitions` ya usa—, así que "vacía" significa sembrada y sin links.
--
-- ── LA FK NO ROMPE NINGÚN EMBED ──
-- Agregar una FK a una tabla YA EMBEBIDA en un `select` la vuelve ambigua y PostgREST devuelve
-- 300/PGRST201 volteando la consulta entera (pasó con la 0076 y tiró el tablero de Farmacia).
-- Verificado antes de escribir esto: `report_definitions` NO se embebe en ningún lado — se lee
-- directo con `.from('report_definitions')` en `data/protocolProcedures.ts:106` y nada más. Además
-- la ambigüedad necesita DOS FK entre el mismo par de tablas, y ésta es la primera hacia
-- `report_platforms`.
--
-- ⚠️ ORDEN DENTRO DEL ARCHIVO, Y NO ES NEGOCIABLE: primero la tabla, después el seed, y RECIÉN
-- ENTONCES retirar el check y agregar la FK. Al revés, las filas viejas de `report_definitions`
-- violan la constraint nueva y la migración falla a mitad de camino — y en el editor de Supabase
-- las sentencias NO comparten transacción, así que lo anterior queda committeado sin rollback.
--
-- ADITIVA para el front desplegado: sigue escribiendo los mismos cinco valores, todos sembrados, y
-- un valor desconocido ya cae a "otro" sin romper (`reportes.test.ts`). Va ANTES del front.
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0110. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · La tabla ---------------------------------------------------------------------------------
-- `key` es la PK y es TEXTO, no un uuid: es el valor que `report_definitions.platform` ya guarda
-- en producción ('clario', 'iqvia', …). Con un uuid habría que migrar esa columna entera y
-- reescribir el histórico; con texto, la FK cierra sobre lo que ya está escrito.
create table if not exists public.report_platforms (
  key        text primary key,
  label      text not null,
  -- Nullable a propósito: null = "todavía no cargada". Distinto de '' (que sería "no tiene"), y es
  -- lo que le permite a la pantalla mostrar el estado "sin cargar" sin inventar nada.
  url        text,
  -- Color de marca del proveedor. Vive en la base para que una plataforma nueva tenga el suyo,
  -- pero NO se edita desde Ajustes: es identidad del proveedor, no configuración operativa.
  color      text not null default '#7C8C87',
  sort_order integer not null default 100,
  -- Baja lógica y no `delete`: una plataforma retirada sigue siendo la de reportes históricos, y
  -- borrarla rompería la FK o —peor— obligaría a un `on delete set null` que perdería el dato.
  -- Inactiva = no se ofrece en el desplegable, pero sigue resolviendo las filas que la usan.
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $mig$ begin
  alter table public.report_platforms add constraint report_platforms_key_chk
    check (key ~ '^[a-z0-9_]+$');
exception when duplicate_object then null; end $mig$;
do $mig$ begin
  alter table public.report_platforms add constraint report_platforms_label_chk
    check (btrim(label) <> '');
exception when duplicate_object then null; end $mig$;
-- La URL, si está, tiene que ser una dirección de verdad. Es el punto entero de la tabla: un link
-- roto manda a la coordinadora a una pestaña en blanco en el momento en que necesita el resultado.
do $mig$ begin
  alter table public.report_platforms add constraint report_platforms_url_chk
    check (url is null or url ~* '^https?://.+');
exception when duplicate_object then null; end $mig$;

-- Dos plataformas no se llaman igual, sin importar mayúsculas ni espacios de más.
create unique index if not exists uq_report_platforms_label
  on public.report_platforms (lower(btrim(label)));

comment on table public.report_platforms is
  'Catálogo de portales donde aparecen los reportes (IQVIA, Clario, …) con su URL. Única fuente '
  'desde la 0111: reemplaza al check de report_definitions.platform (0089) y al Record del front. '
  'is_active false = no se ofrece, pero sigue resolviendo las filas viejas que la usan. 0111.';
comment on column public.report_platforms.url is
  'URL del portal. null = todavía no cargada (distinto de "no tiene"). Al elegir la plataforma en '
  'un reporte, el front autocompleta el link con esto. 0111.';

drop trigger if exists trg_report_platforms_updated_at on public.report_platforms;
create trigger trg_report_platforms_updated_at
  before update on public.report_platforms
  for each row execute function public.set_updated_at();

-- Configuración regulatoria: deja rastro, igual que report_definitions desde la 0089.
drop trigger if exists trg_audit_report_platforms on public.report_platforms;
create trigger trg_audit_report_platforms after insert or update or delete
  on public.report_platforms for each row execute function public.audit_row();


-- 2 · El seed — ANTES de la FK ------------------------------------------------------------------
-- Las cinco que hoy acepta el check de la 0089, con los colores que el front ya usaba. `url` en
-- null: las carga el Director desde Ajustes › Plataformas.
-- `on conflict do nothing` y no `do update`: reaplicar la migración no puede pisar las URLs que ya
-- se hayan cargado. Idempotente de verdad, no "idempotente si nadie tocó nada".
insert into public.report_platforms (key, label, color, sort_order) values
  ('iqvia',   'IQVIA',           '#3A6B8C', 10),
  ('labcorp', 'LabCorp',         '#5C8A5A', 20),
  ('clario',  'Clario',          '#B0823F', 30),
  ('roche4g', 'Roche 4G',        '#A6483B', 40),
  -- 'otro' va último y con el gris neutro: es la salida, no una opción más. Y es el valor por
  -- defecto de la columna en `report_definitions`, así que NO puede faltar nunca.
  ('otro',    'Otra plataforma', '#7C8C87', 999)
on conflict (key) do nothing;


-- 3 · El check se retira y la FK toma su lugar --------------------------------------------------
-- Recién acá, con las cinco claves ya sembradas: si esto corriera antes del insert, toda fila de
-- `report_definitions` violaría la FK.
alter table public.report_definitions drop constraint if exists report_definitions_platform_chk;

do $mig$ begin
  alter table public.report_definitions
    add constraint report_definitions_platform_fk
    foreign key (platform) references public.report_platforms(key)
    -- `on update cascade`: si alguna vez se renombra una clave, las definiciones la siguen solas.
    -- `on delete restrict`: una plataforma en uso NO se borra — para retirarla está `is_active`.
    on update cascade on delete restrict;
exception when duplicate_object then null; end $mig$;


-- 4 · RLS ---------------------------------------------------------------------------------------
-- VER es amplio, espejo de "ver definiciones de reporte" (0089 §4): sin esto el desplegable de
-- plataformas de un reporte no renderiza, y el chip de color del catálogo queda gris.
--
-- EDITAR pide track-leader o gerencia, y sigue la asimetría que la 0089 dejó escrita: armar el
-- cuadro de UN estudio es track-operator, pero el CATÁLOGO GLOBAL —que afecta a todos los
-- protocolos a la vez— pide un nivel más alto. Cambiar la URL de Clario le cambia el link a todos
-- los reportes de todos los estudios.
alter table public.report_platforms enable row level security;

drop policy if exists "ver plataformas" on public.report_platforms;
create policy "ver plataformas" on public.report_platforms for select using (
  public.has_module('track') or public.has_module('pharma') or public.has_module('gerencia')
);

drop policy if exists "editar plataformas" on public.report_platforms;
create policy "editar plataformas" on public.report_platforms for all
  using      (public.has_module('gerencia') or public.has_min_role('track', 'leader'))
  with check (public.has_module('gerencia') or public.has_min_role('track', 'leader'));

revoke all on public.report_platforms from anon;
grant select, insert, update on public.report_platforms to authenticated;
-- Sin `delete`: retirar una plataforma es `is_active = false`. Borrarla dejaría reportes históricos
-- apuntando a una clave que ya no existe, y la FK con `restrict` lo impediría igual — pero con un
-- error de Postgres en inglés en vez de una pantalla que explica qué hacer.

notify pgrst, 'reload schema';
