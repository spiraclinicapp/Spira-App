-- Spira · Migración 0071 — Dispensación de Producto en Investigación (IP).
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0070. IDEMPOTENTE.
--
-- REQUISITO PREVIO: el bucket privado `ip-docs` tiene que existir (Storage → New bucket,
-- 10 MB, PDF/imagen). Las políticas de §6 no fallan si no existe — fallan las subidas.
--
-- QUÉ HABILITA: la visita entrega IP (además de, o en vez de, medicación concomitante). La
-- constancia del IRT se adjunta desde Coordinación y la farmacéutica la ve, la imprime y declara
-- cuántos kits salieron. Todo en UN solo pedido y UN solo comprobante.
--
-- PRINCIPIO HEREDADO DE LA 0038 (Director Médico): "la trazabilidad por kit la provee el
-- sponsor/IRT; Spira no la duplica". Por eso NO se modela kit por kit: se registra que se entregó,
-- cuántos kits y con qué constancia.
-- ============================================================================

-- 1 · El candado del cronograma para IP.
--     `dispenses` es uno solo y lo valida el servidor (0050). Sin este flag aparte, la visita
--     típica de protocolo —que entrega IP y ninguna concomitante— quedaría diciendo "esta visita
--     no entrega medicación", que es lo contrario de la verdad.
alter table public.visit_definitions
  add column if not exists dispenses_ip boolean not null default false;
comment on column public.visit_definitions.dispenses_ip is
  'true = esta visita entrega producto en investigación. Independiente de `dispenses` (base). 0071.';


-- 2 · La vista del día expone el flag nuevo. Aditivo: el front viejo ignora la columna, así que
--     NO hay orden de deploy que respetar (a diferencia de la 0068, que sí fue breaking).
--     El cuerpo es el VIGENTE (0069, byte a byte idéntico al de la 0068 salvo un comentario) más
--     una sola línea. `v_patient_visits` no se toca: `dispenses` nunca vivió ahí.
drop view if exists public.v_track_visits;
create view public.v_track_visits with (security_invoker = true) as
select
  v.id, v.enrollment_id, v.visit_def_id, v.estimated_date, v.real_date,
  v.window_start, v.window_end, v.notes, v.computed_status,
  vd.code as visit_code, vd.name as visit_name,
  coalesce(vd.visit_type, 'presencial') as visit_type, vd.sort_order,
  e.protocol_id, e.patient_id, e.status as enrollment_status,
  e.randomization_date as enrollment_randomization_date,
  pr.code as protocol_code, pr.name as protocol_name,
  pa.code as patient_code, pa.full_name as patient_name,
  pa.sex, pa.birth_date,
  vd.offset_days, e.enrollment_date, pa.treating_physician,
  v.coordinator_id, v.coordinator_name,                   -- 0065
  v.kind,
  v.arrived_at, v.ready_at, v.left_at, v.no_show_at,      -- no_show_at: 0067
  v.wants_doctor,
  v.doctor_seen_at,
  v.doctor_motivo,
  v.wants_doctor_at, v.doctor_marked_by,
  coalesce(vd.dispenses, false) as dispenses,
  coalesce(vd.dispenses_ip, false) as dispenses_ip,       -- nueva (0071)
  v.operational_stage,
  vd.role, vd.date_mode,
  (select count(*) from public.visit_comments vc where vc.visit_id = v.id) as comments_count
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id;
comment on view public.v_track_visits is
  'v_track_visits (0065/0068/0069) recreada por 0071 con dispenses_ip (el resto, verbatim).';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;


-- 3 · La marca de IP, los kits y la excepción.
alter table public.dispensation_requests
  add column if not exists includes_ip         boolean not null default false,
  add column if not exists off_schedule        boolean not null default false,
  add column if not exists off_schedule_reason text;

alter table public.dispensations
  add column if not exists ip_kits integer;

comment on column public.dispensation_requests.includes_ip is
  'true = el pedido lleva IP. Lo sella el servidor copiando visit_definitions.dispenses_ip al crear:
   NO lo declara el cliente. Se guarda en vez de mirarse en vivo porque el cronograma puede cambiar
   después y el pedido tiene que recordar lo que era cierto cuando se pidió. 0071.';
comment on column public.dispensation_requests.off_schedule is
  'true = dispensación fuera de cronograma (la visita no dispensaba). Exige motivo. 0071.';
comment on column public.dispensations.ip_kits is
  'Kits de IP efectivamente entregados. NULL hasta la entrega; lo sella deliver_dispensation. 0071.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'dispensations_ip_kits_chk') then
    alter table public.dispensations
      add constraint dispensations_ip_kits_chk check (ip_kits is null or ip_kits > 0);
  end if;
end $$;

-- El punto de este check: NO EXISTE una dispensación fuera de cronograma sin motivo. Que el
-- desplegable de la UI sea obligatorio no alcanza; el candado va donde no se puede saltear.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'dispensation_requests_off_schedule_chk') then
    alter table public.dispensation_requests
      add constraint dispensation_requests_off_schedule_chk
      check (not off_schedule or (off_schedule_reason is not null and btrim(off_schedule_reason) <> ''));
  end if;
end $$;


-- 3.1 · El protocolo del pedido, DESNORMALIZADO en la propia fila.
--     POR QUÉ una columna y no un join: `v_ip_stock` (§10) es `security_invoker` y la lee
--     FARMACIA, que NO tiene policy de select sobre `patient_visits` — la única, en la 0006,
--     cubre gerencia y a los coordinadores del protocolo (Track se aísla por protocolo, Pharma es
--     central; el repo ya lo documenta en `src/data/pharma/dispensations.ts:321`). Un join a
--     patient_visits para llegar al protocolo NO da error: la RLS filtra en silencio y devuelve
--     cero filas, con lo cual la vista le mostraría a la farmacéutica "kits entregados = 0" y
--     "disponibles = todo el stock" para siempre. En un sistema auditable un número falso es peor
--     que un error, y encima no se detecta probando con un usuario de QA que tiene los cinco
--     módulos. Es el mismo patrón que ya usan `patient_visits.coordinator_name` (0065) y
--     `visit_comments.author_name` (0048): el dato que la vista necesita viaja en la fila.
alter table public.dispensation_requests
  add column if not exists protocol_id uuid references public.protocols(id) on delete restrict;
comment on column public.dispensation_requests.protocol_id is
  'Protocolo del enrolamiento de la visita, sellado por create_dispensation_request al crear.
   Desnormalizado a propósito: Pharma no puede leer patient_visits, así que sin esta columna las
   vistas de IP no tendrían por dónde llegar al protocolo. 0071.';
create index if not exists idx_dispensation_requests_protocol
  on public.dispensation_requests(protocol_id);

-- Backfill de las filas existentes, con el trigger de `updated_at` APAGADO mientras corre.
-- El porqué del apagado: `trg_requests_updated_at` (0003:29) sella `updated_at = now()` en CADA
-- update, y tanto el tablero de Farmacia como el historial paginado filtran y ordenan las
-- solicitudes atendidas POR updated_at ("el día en que la farmacéutica la trabajó"). Un backfill
-- con el trigger vivo arrastraría el histórico ENTERO a la columna "Entregadas" del día en que se
-- aplique la migración y aplanaría el orden del historial: una corrupción silenciosa de datos
-- reales. El apagado es transaccional — si algo falla más abajo, el trigger vuelve solo.
-- `trg_audit_requests` queda ENCENDIDO a propósito: que el backfill quede registrado en el
-- audit_log es exactamente lo que corresponde en un sistema ANMAT / ICH-GCP.
alter table public.dispensation_requests disable trigger trg_requests_updated_at;
update public.dispensation_requests dr
   set protocol_id = e.protocol_id
  from public.patient_visits pv
  join public.enrollments e on e.id = pv.enrollment_id
 where pv.id = dr.visit_id
   and dr.protocol_id is null;          -- idempotente: en la segunda corrida no toca ninguna fila
alter table public.dispensation_requests enable trigger trg_requests_updated_at;


-- 3.2 · El seguro de la columna: un trigger la sella sola.
--     El backfill de arriba arregla el pasado y `create_dispensation_request` (§8) sella el futuro,
--     pero `protocol_id` es NULLABLE y la policy "track crea solicitudes" (0006/0009) permite
--     insertar en la tabla SIN pasar por el RPC. Una sola fila con el protocolo en null se cae en
--     silencio de `v_ip_stock` (§10 descarta `dr.protocol_id is null`): sus kits entregados no se
--     restarían nunca y la vista sobrestimaría el disponible — la misma clase de número falso que la
--     desnormalización vino a cerrar, y de nuevo sin ningún error a la vista. Un dato desnormalizado
--     que depende de que TODOS los caminos de escritura se acuerden de llenarlo no se sostiene solo;
--     con el trigger sí, venga de donde venga el insert.
--     SECURITY DEFINER a propósito: Farmacia no tiene policy de select sobre `patient_visits`, así
--     que el lookup con los privilegios de quien inserta devolvería NULL en silencio justo en el
--     caso que se quiere blindar. `before insert` y solo si viene null: para el RPC —que ya lo
--     sella— es un no-op, y ninguna fila existente se toca.
create or replace function public.seal_request_protocol()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_protocol_id uuid;
begin
  if new.protocol_id is null then
    select e.protocol_id into v_protocol_id
      from public.patient_visits pv
      join public.enrollments e on e.id = pv.enrollment_id
      where pv.id = new.visit_id;
    -- Si la visita no existe, la columna queda en null y el insert muere igual un instante después
    -- en la FK de `visit_id`: acá no hace falta (ni conviene) un mensaje propio.
    new.protocol_id := v_protocol_id;
  end if;
  return new;
end; $$;
comment on function public.seal_request_protocol() is
  'Sella dispensation_requests.protocol_id desde la visita cuando el insert no lo trae (p. ej. una
   escritura directa por la policy de Track, sin pasar por el RPC). Sin esto, una fila con el
   protocolo en null desaparece de v_ip_stock y la vista sobrestima el stock disponible. 0071.';
drop trigger if exists trg_seal_request_protocol on public.dispensation_requests;
create trigger trg_seal_request_protocol
  before insert on public.dispensation_requests
  for each row execute function public.seal_request_protocol();


-- 4 · La constancia. Filas INMUTABLES y sin borrado: es nota fuente. Reemplazar inserta una fila
--     nueva y sella `superseded_at` en la anterior. El índice parcial garantiza UNA sola vigente
--     por pedido a nivel base, no a nivel UI.
create table if not exists public.dispensation_ip_documents (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.dispensation_requests(id) on delete restrict,
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text not null,
  size_bytes    integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by   uuid not null references public.users(id) on delete restrict,
  uploaded_at   timestamptz not null default now(),
  superseded_at timestamptz
);
comment on table public.dispensation_ip_documents is
  'Constancia del IRT adjunta a un pedido de dispensación. Filas inmutables, sin borrado: nota fuente. 0071.';

create unique index if not exists dispensation_ip_documents_vigente_uq
  on public.dispensation_ip_documents(request_id) where superseded_at is null;
create index if not exists idx_ip_documents_request
  on public.dispensation_ip_documents(request_id);

alter table public.dispensation_ip_documents enable row level security;

-- Gerencia entra en la lectura por convención del schema y por regulación: `ver solicitudes`,
-- `ver dispensaciones` y `ver recepciones` (0006) la incluyen todas, y en un sistema
-- ANMAT / ICH-GCP la Dirección es justamente quien tiene que poder auditar la cadena de
-- evidencia de punta a punta. Dejarla afuera acá sería el único agujero del recorrido.
drop policy if exists "ver constancias de IP" on public.dispensation_ip_documents;
create policy "ver constancias de IP" on public.dispensation_ip_documents for select using (
  public.has_min_role('pharma','viewer')
  or public.has_module('gerencia')
  or exists (
    select 1 from public.dispensation_requests r
    where r.id = dispensation_ip_documents.request_id
      and public.coordina_visita(r.visit_id)
  )
);
-- Sin policies de insert/update/delete: todo pasa por attach_ip_document (security definer).

-- Los privilegios acompañan a la RLS: sin insert/update/delete la inmutabilidad no depende
-- solo de que "no haya policy", que es un candado más blando de lo que parece cuando Supabase
-- reparte privilegios por default a `authenticated` en cada tabla nueva del schema public.
revoke all on public.dispensation_ip_documents from anon;
revoke insert, update, delete, truncate on public.dispensation_ip_documents from authenticated;
grant select on public.dispensation_ip_documents to authenticated;


-- 5 · Ruta de los objetos: {protocol_id}/{request_id}/{uuid}.{ext}. El protocolo va PRIMERO
--     porque es lo que la política necesita leer del path sin salir a consultar otras tablas.
--     El helper devuelve NULL si el path no tiene la forma esperada: así un path malformado
--     DENIEGA en vez de reventar con un error de cast.
--     La regex es la forma CANÓNICA del UUID (8-4-4-4-12), no "36 caracteres de [0-9a-f-]": con
--     la laxa, un nombre como `------------------------------------/x` pasaba el filtro y el
--     cast tiraba 22P02 ADENTRO de la policy — o sea, el helper prometía denegar y reventaba,
--     que es justo lo que su comentario dice que no pasa. `set search_path` va por la misma razón
--     que en el resto de las funciones del archivo: que la resolución de nombres no dependa de
--     quién la invoque.
create or replace function public.ip_doc_protocol(p_name text)
returns uuid language sql immutable set search_path = public as $$
  select case
           when p_name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
           then substring(p_name from 1 for 36)::uuid
         end;
$$;

-- 6 · Políticas sobre el bucket. Sin update ni delete: la inmutabilidad de la evidencia queda
--     garantizada en la capa de storage, no solo en la tabla.
--
--     EL BLOQUE ENTERO VA ADENTRO DE UN `do $$` CON MANEJADOR DE EXCEPCIÓN: es la primera vez que
--     el repo toca `storage.objects`, cuyo dueño en Supabase es `supabase_storage_admin`. Según el
--     proyecto, `create policy` ahí puede devolver `42501: must be owner of table objects`; y como
--     el SQL Editor corre todo en una transacción implícita, ese error se llevaría puesta la
--     migración ENTERA. La subtransacción del bloque absorbe el fallo, avisa por NOTICE y deja
--     entrar el resto. Si aparece el aviso, las dos policies se crean idénticas a mano desde
--     Storage → Policies (bucket `ip-docs`, una de SELECT y una de INSERT). Nada más de la
--     migración depende de ellas.
--
--     ⚠️ EL "Success" DEL SQL EDITOR NO PRUEBA QUE LAS POLICIES SE HAYAN CREADO. El editor muestra
--     el RESULTADO de la consulta, y el NOTICE viaja por el canal de mensajes del servidor, que no
--     siempre se ve. O sea: el caso malo —policies no creadas, aviso invisible— se ve exactamente
--     igual que el bueno, y el problema recién aparece después, en la UI, cuando falla la primera
--     subida. La ÚNICA prueba es la consulta por catálogo del pie de este archivo (verificación 9).
do $$
begin
  drop policy if exists "ip docs lectura" on storage.objects;
  create policy "ip docs lectura" on storage.objects for select using (
    bucket_id = 'ip-docs' and (
      public.has_min_role('pharma','viewer')
      or public.has_module('gerencia')   -- la Dirección audita la evidencia, igual que en la tabla
      or public.is_assigned_coordinator(public.ip_doc_protocol(name))
    )
  );

  drop policy if exists "ip docs alta" on storage.objects;
  create policy "ip docs alta" on storage.objects for insert with check (
    bucket_id = 'ip-docs' and (
      public.has_min_role('pharma','operator')
      or public.is_assigned_coordinator(public.ip_doc_protocol(name))
    )
  );
exception when insufficient_privilege then
  raise notice 'PENDIENTE A MANO: no se pudieron crear las policies del bucket `ip-docs` sobre storage.objects (%). El resto de la migración 0071 se aplicó igual. Crealas desde Storage → Policies: una de SELECT y una de INSERT sobre el bucket `ip-docs`, con las mismas expresiones que están comentadas en este archivo.', sqlerrm;
end $$;


-- 7 · Adjuntar la constancia. Marca superada la vigente e inserta la nueva, en una transacción.
--     Fuera de cronograma, esta función es además el lugar donde el pedido APRENDE que lleva IP
--     (ver §8: la excepción por sí sola no lo declara; la constancia sí).
create or replace function public.attach_ip_document(
  p_request_id uuid,
  p_path       text,
  p_file_name  text,
  p_mime       text,
  p_size       int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_status      request_status;
  v_includes_ip boolean;
  v_off         boolean;
  v_visit_id    uuid;
  v_protocol_id uuid;
  v_id          uuid;
begin
  -- Se joinea la cadena visita → enrolamiento para tener el protocolo aunque `r.protocol_id`
  -- venga en null (una fila insertada por fuera del RPC, vía la policy "track crea solicitudes").
  -- `for update of r` lockea SOLO la solicitud: el join es para leer, no para bloquear la agenda.
  select r.status, r.includes_ip, r.off_schedule, r.visit_id, coalesce(r.protocol_id, e.protocol_id)
    into v_status, v_includes_ip, v_off, v_visit_id, v_protocol_id
  from public.dispensation_requests r
  join public.patient_visits pv on pv.id = r.visit_id
  join public.enrollments e     on e.id  = pv.enrollment_id
  where r.id = p_request_id
  for update of r;

  if not found then
    raise exception 'No se encontró la solicitud' using errcode = 'check_violation';
  end if;
  if not (public.has_min_role('pharma','operator') or public.coordina_visita(v_visit_id)) then
    raise exception 'Sin permiso para adjuntar la constancia' using errcode = '42501';
  end if;
  -- Dos puertas para adjuntar, no una: el pedido ya sabe que lleva IP (lo dedujo del cronograma
  -- al crearse), O es una dispensación fuera de cronograma, donde el cronograma no dice nada y la
  -- constancia es JUSTAMENTE lo que declara que hay IP (decisión del Director, 2026-08-09: la
  -- excepción no implica IP). Lo que no se puede es adjuntar a un pedido de una visita que no
  -- dispensa IP y que tampoco es una excepción: ahí la constancia no tendría a qué referirse.
  if not v_includes_ip and not v_off then
    raise exception 'Esta solicitud no lleva producto en investigación' using errcode = 'check_violation';
  end if;
  if v_status not in ('solicitada','preparando') then
    raise exception 'La solicitud ya está cerrada: no se puede cambiar la constancia' using errcode = 'check_violation';
  end if;
  -- El estado del PEDIDO no alcanza para saber si el comprobante ya salió: `mark_dispensation_ready`
  -- deja la dispensación en 'lista' pero NO mueve el status de la solicitud, que sigue en
  -- 'preparando' hasta que la entrega la pasa a 'atendida'. O sea: hay una ventana en la que el
  -- pedido está abierto y el comprobante ya está emitido y el correlativo sellado. Sumarle IP ahí
  -- saltearía en silencio la regla "no se emite comprobante sin constancia" (§8.1) y dejaría en la
  -- auditoría un comprobante ANTERIOR a la nota fuente que lo justifica, que es exactamente lo que
  -- un sistema ANMAT / ICH-GCP no puede permitirse. Y hay un agravante mecánico: como no hay unique
  -- sobre `dispensations.request_id`, el reflejo obvio después de adjuntar ("marco lista de nuevo")
  -- no reusa la dispensación —el select de §8.1 busca una en 'en_preparacion' y la vigente está en
  -- 'lista'— sino que INSERTA UNA SEGUNDA, con correlativo nuevo y descuento de stock repetido.
  -- Se frena SOLO la rama que prende `includes_ip`: adjuntar o reemplazar la constancia de un
  -- pedido que YA era de IP tiene que seguir funcionando mientras el pedido esté abierto (la de
  -- §8.1 ya se exigió antes de emitir, así que ahí no se saltea nada).
  if not v_includes_ip and exists (
       select 1 from public.dispensations d
       where d.request_id = p_request_id and d.status in ('lista','entregada')
     ) then
    raise exception 'El comprobante de esta dispensación ya se emitió: no se le puede sumar producto en investigación. Si hay que incluirlo, Farmacia tiene que cancelar la preparación primero.'
      using errcode = 'check_violation';
  end if;
  -- El path tiene que caer en la carpeta del protocolo de ESTA visita. Sin este check, la policy
  -- de storage (que autoriza por el prefijo del path) y la nota fuente (que autoriza por el
  -- pedido) podrían apuntar a estudios distintos: un coordinador de dos protocolos subiría el
  -- archivo bajo el protocolo A y lo colgaría de un pedido del protocolo B, dejando la evidencia
  -- del paciente apuntando a otro estudio. En un sistema auditable eso es una nota fuente rota.
  if v_protocol_id is null or public.ip_doc_protocol(p_path) is distinct from v_protocol_id then
    raise exception 'La constancia no corresponde al protocolo de esta visita' using errcode = 'check_violation';
  end if;

  update public.dispensation_ip_documents
     set superseded_at = now()
   where request_id = p_request_id and superseded_at is null;

  insert into public.dispensation_ip_documents
    (request_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  values (p_request_id, p_path, p_file_name, p_mime, p_size, auth.uid())
  returning id into v_id;

  -- Fuera de cronograma: la constancia es la declaración de que el pedido lleva IP. Recién acá
  -- `includes_ip` se prende, y con eso quedan activas las dos consecuencias aguas abajo — la
  -- exigencia de constancia en mark_dispensation_ready y la de kits en deliver_dispensation.
  -- Esta rama es la que custodia la guarda de arriba (misma condición): si el comprobante ya
  -- estuviera emitido, la función ya habría cortado y no se llega hasta acá.
  if not v_includes_ip then
    update public.dispensation_requests set includes_ip = true where id = p_request_id;
  end if;

  return v_id;
end;
$$;
revoke all on function public.attach_ip_document(uuid, text, text, text, int) from public;
grant execute on function public.attach_ip_document(uuid, text, text, text, int) to authenticated;


-- 8 · La creación del pedido aprende dos cosas: el IP (que deduce del cronograma) y la excepción
--     (que exige motivo). El parámetro nuevo va con default → el front viejo sigue resolviendo
--     contra esta función y no hay orden de deploy que respetar.
-- Los DOS drops son necesarios para que el archivo sea de verdad IDEMPOTENTE: el de la firma
-- vieja (la que está en prod hoy) y el de la firma NUEVA (la que deja esta corrida). Sin el
-- segundo, una segunda pasada encuentra el drop viejo como no-op y el `create` falla con
-- "function already exists" — el encabezado prometía idempotencia y no la cumplía.
drop function if exists public.create_dispensation_request(uuid, jsonb, text, text);
drop function if exists public.create_dispensation_request(uuid, jsonb, text, text, text);

create function public.create_dispensation_request(
  p_visit_id uuid,
  p_items    jsonb,
  p_notes    text default null,
  p_origen   text default 'track',
  p_off_schedule_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_request_id uuid;
  v_item       jsonb;
  v_dispenses  boolean;
  v_dispenses_ip boolean;
  v_off        boolean;   -- BYPASS del cronograma, no marca de IP (ver más abajo)
  v_protocol_id uuid;
  v_puede_track boolean;
  v_puede_pharma boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  if p_origen is null or p_origen not in ('track','pharma') then
    raise exception 'Origen de solicitud inválido' using errcode = 'check_violation';
  end if;

  -- authz de Track espeja la RLS de "track crea solicitudes" (0009): admin ve cualquier
  -- visita; operator solo las que coordina. coordina_visita "pelado" dejaría entrar a un
  -- viewer coordinador.
  v_puede_track := public.has_module('gerencia')
                   or public.has_min_role('track','admin')
                   or (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id));
  v_puede_pharma := public.has_min_role('pharma','operator');

  if not (v_puede_track or v_puede_pharma) then
    raise exception 'No tenés permiso para solicitar dispensación de esta visita' using errcode = '42501';
  end if;

  -- El origen se declara, pero hay que poder respaldarlo: nadie registra una solicitud
  -- como venida de un módulo en el que no puede operar.
  if p_origen = 'pharma' and not v_puede_pharma then
    raise exception 'No podés registrar una solicitud como alta de farmacia' using errcode = '42501';
  end if;
  if p_origen = 'track' and not v_puede_track then
    raise exception 'No podés registrar una solicitud como pedido de coordinación' using errcode = '42501';
  end if;

  -- Se suma el enrolamiento (join interno: `patient_visits.enrollment_id` es NOT NULL) para
  -- sellar el protocolo en la fila. `visit_definitions` sigue con left join: una visita libre
  -- no tiene definición y eso no es un error.
  select coalesce(vd.dispenses, false), coalesce(vd.dispenses_ip, false), e.protocol_id
    into v_dispenses, v_dispenses_ip, v_protocol_id
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
    left join public.visit_definitions vd on vd.id = pv.visit_def_id
    where pv.id = p_visit_id;
  if not found then
    raise exception 'Visita inexistente' using errcode = '23503';
  end if;

  -- La FORMA de p_items se sigue validando, pero la lista VACÍA ya no es motivo de rechazo:
  -- con IP el pedido sin renglones es el caso típico (el kit no tiene lote ni cantidad acá).
  -- Se adelanta a las validaciones de abajo porque ellas ya miran jsonb_array_length y un jsonb
  -- que no sea array reventaría con un error crudo en vez del mensaje sereno.
  if p_items is not null and jsonb_typeof(p_items) <> 'array' then
    raise exception 'La solicitud tiene ítems con un formato inválido' using errcode = 'check_violation';
  end if;

  v_off := p_off_schedule_reason is not null and btrim(p_off_schedule_reason) <> '';

  -- Fuera de cronograma: el motivo saltea la VALIDACIÓN del cronograma, y nada más. `v_off` es un
  -- bypass, NO una marca de contenido.
  --
  -- DECISIÓN DEL DIRECTOR (2026-08-09): la excepción no implica IP. Una dispensación excepcional
  -- puede ser de pura medicación concomitante, y sellar `includes_ip = true` ahí exigiría después
  -- una constancia del IRT que no existe (mark_dispensation_ready la pediría) y descontaría kits
  -- fantasma del stock de IP (deliver_dispensation los exigiría). Por eso `includes_ip` sale del
  -- cronograma igual que en el caso normal — fuera de cronograma eso da FALSO — y el pedido pasa
  -- a llevar IP recién cuando el coordinador adjunta la constancia (attach_ip_document, §7).
  if not v_off then
    if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 and not v_dispenses then
      raise exception 'Esta visita no entrega medicación' using errcode = 'check_violation';
    end if;
    if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 and not v_dispenses_ip then
      raise exception 'Un pedido sin renglones y sin producto en investigación no es un pedido'
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.dispensation_requests
      (visit_id, protocol_id, requested_by, status, source, notes, requested_by_module,
       includes_ip, off_schedule, off_schedule_reason)
    values
      (p_visit_id, v_protocol_id, auth.uid(), 'solicitada', 'manual',
       nullif(btrim(coalesce(p_notes,'')),''), p_origen,
       v_dispenses_ip, v_off, nullif(btrim(coalesce(p_off_schedule_reason,'')),''))
    returning id into v_request_id;

  -- coalesce defensivo: antes p_items null era imposible (lo rechazaba la validación de arriba);
  -- ahora es el pedido de IP solo, así que el bucle tiene que poder no iterar.
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    -- validar forma ANTES del cast: una key ausente daría NULL y el check de cantidad no
    -- dispararía, cayendo en un 23502 crudo en vez del mensaje sereno.
    if jsonb_typeof(v_item) <> 'object'
       or nullif(btrim(coalesce(v_item->>'medication_id','')),'') is null
       or nullif(btrim(coalesce(v_item->>'quantity','')),'') is null then
      raise exception 'Cada ítem necesita medicamento y cantidad' using errcode = 'check_violation';
    end if;
    if (v_item->>'quantity')::integer <= 0 then
      raise exception 'La cantidad debe ser mayor a cero' using errcode = 'check_violation';
    end if;
    insert into public.dispensation_request_items (request_id, medication_id, quantity)
      values (v_request_id, (v_item->>'medication_id')::uuid, (v_item->>'quantity')::integer);
    -- trg check_request_item_protocol valida asignación de protocolo + patient_medications
  end loop;

  return v_request_id;
end; $$;
revoke all on function public.create_dispensation_request(uuid, jsonb, text, text, text) from public;
grant execute on function public.create_dispensation_request(uuid, jsonb, text, text, text) to authenticated;


-- 8.1 · Marcar lista exige la constancia cuando el pedido lleva IP.
--       Cuerpo verbatim de la 0058 (la vigente: 0059-0070 no la tocaron) + un solo bloque nuevo.
--       Conserva firma y returns table, así que va con `create or replace`.
create or replace function public.mark_dispensation_ready(p_request_id uuid)
returns table (dispensation_id uuid, correlative_number integer, dispensation_code text)
language plpgsql security definer set search_path = public as $$
declare
  v_status      request_status;
  v_protocol_id uuid;
  v_pending     integer;
  v_disp_id     uuid;
  v_corr        integer;
  v_code        text;
  v_daily       integer;
  v_item        record;
  v_lot         record;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede marcar lista una dispensación' using errcode = '42501';
  end if;

  select dr.status, e.protocol_id
    into v_status, v_protocol_id
  from public.dispensation_requests dr
  join public.patient_visits pv on pv.id = dr.visit_id
  join public.enrollments e     on e.id  = pv.enrollment_id
  where dr.id = p_request_id
  for update of dr;
  if not found then raise exception 'Solicitud inexistente' using errcode = '23503'; end if;
  if v_status <> 'preparando' then
    raise exception 'Esta solicitud no está en preparación (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  select count(*)::integer into v_pending
  from public.dispensation_request_items
  where request_id = p_request_id and scanned_at is null;
  if v_pending > 0 then
    raise exception 'Faltan % ítems por escanear', v_pending using errcode = 'check_violation';
  end if;

  -- Con IP, no se emite comprobante sin constancia: el papel que la farmacéutica imprime y
  -- entrega junto con la medicación tiene que existir antes de que exista el comprobante.
  if (select r.includes_ip from public.dispensation_requests r where r.id = p_request_id) then
    if not exists (
      select 1 from public.dispensation_ip_documents d
      where d.request_id = p_request_id and d.superseded_at is null
    ) then
      raise exception 'Falta la constancia del producto en investigación' using errcode = 'check_violation';
    end if;
  end if;

  -- El espejo del bloque de arriba: pedido SIN renglones y SIN IP, o sea sin nada que dispensar.
  -- Frenarlo ya lo frena el trigger `apply_dispensation_stock` (§8.2) un par de statements después,
  -- pero con el mensaje "sin renglones (dispensation_items)", que no nombra la constancia y manda a
  -- la farmacéutica a buscar medicación donde el problema es otro: el camino que en la práctica
  -- llega hasta acá vacío es el pedido FUERA DE CRONOGRAMA (el de cronograma sin renglones exige
  -- `dispenses_ip` al crearse, §8, y eso ya prende `includes_ip`; el otro caso posible es que le
  -- hayan borrado los renglones después), y ahí lo que falta casi siempre es la constancia del
  -- IRT — que es justamente la que prende `includes_ip` (§7). El pre-check va acá y no en el
  -- trigger: el mensaje se arregla donde ya estamos escribiendo, sin recrear otro objeto de
  -- producción por una cuestión de copy. Bonus: corta antes de tocar el correlativo diario.
  if not exists (select 1 from public.dispensation_request_items i where i.request_id = p_request_id)
     and not (select r.includes_ip from public.dispensation_requests r where r.id = p_request_id) then
    raise exception 'Este pedido no tiene medicación cargada ni constancia de producto en investigación: no hay nada que dispensar. Adjuntá la constancia del IRT o cargá la medicación.'
      using errcode = 'check_violation';
  end if;

  -- Reusar la dispensación si ya existe. Conserva el correlativo (numeración legal
  -- sin huecos); el código puede venir en null si se liberó al cancelar (0057), y en
  -- ese caso se sella de nuevo más abajo con quien dispensa ahora.
  select d.id, d.correlative_number, d.dispensation_code
    into v_disp_id, v_corr, v_code
  from public.dispensations d
  where d.request_id = p_request_id and d.status = 'en_preparacion'
  for update;

  if not found then
    insert into public.dispensations (request_id, executed_by, status)
      values (p_request_id, auth.uid(), 'en_preparacion')
      returning dispensations.id, dispensations.correlative_number
      into v_disp_id, v_corr;
  else
    -- ALIAS EXPLÍCITO (fix 0058): sin `di.`, `dispensation_id` choca con la variable
    -- de salida homónima del returns table.
    delete from public.dispensation_items di where di.dispensation_id = v_disp_id;
  end if;

  -- Sellar el código solo si no lo tiene (primera vez, o se liberó al cancelar).
  if v_code is null then
    insert into public.dispensation_daily_counters (day, last_number)
      values (current_date, 1)
      on conflict (day) do update
        set last_number = public.dispensation_daily_counters.last_number + 1
      returning last_number into v_daily;

    v_code := 'D-' || v_daily
           || '-' || to_char(current_date, 'DDMMYY')
           || '-' || public.user_initials(auth.uid());

    update public.dispensations
      set daily_number = v_daily, dispensation_code = v_code
      where id = v_disp_id;
  end if;

  for v_item in
    select medication_id, sum(quantity)::integer as quantity
    from public.dispensation_request_items
    where request_id = p_request_id
    group by medication_id
  loop
    -- FEFO: el lote que vence antes, del protocolo, no vencido, con stock suficiente. Lock del lote.
    select ml.id, ml.lot_number, ml.expiry_date into v_lot
    from public.medication_lots ml
    where ml.medication_id = v_item.medication_id
      and ml.protocol_id   = v_protocol_id
      and ml.quantity_on_hand >= v_item.quantity
      and (ml.expiry_date is null or ml.expiry_date >= current_date)
    order by ml.expiry_date asc nulls last, ml.created_at asc, ml.lot_number asc  -- desempate determinístico/auditable
    limit 1
    for update of ml;

    if not found then
      raise exception 'No hay stock suficiente en un solo lote para el medicamento % (cantidad %). Reducí la cantidad (la partición entre lotes llega en v1.1).',
        v_item.medication_id, v_item.quantity using errcode = 'check_violation';
    end if;

    insert into public.dispensation_items
      (dispensation_id, medication_id, lot_id, quantity, lot_number, expiry_date)
    values
      (v_disp_id, v_item.medication_id, v_lot.id, v_item.quantity, v_lot.lot_number, v_lot.expiry_date);
  end loop;

  update public.dispensations set status = 'lista' where id = v_disp_id;

  return query select v_disp_id, v_corr, v_code;
end; $$;
revoke all on function public.mark_dispensation_ready(uuid) from public;
grant execute on function public.mark_dispensation_ready(uuid) to authenticated;


-- 8.2 · El trigger de stock deja de exigir renglones cuando el pedido lleva IP.
--       HALLAZGO al implementar: el candado de "sin renglones" que el paso anterior tenía que
--       acotar NO vive en mark_dispensation_ready, vive en el trigger apply_dispensation_stock
--       (0054 §3.1), que corre justo en el `update ... set status = 'lista'` del final. Sin este
--       ajuste el pedido de IP solo —el caso típico de una visita de protocolo— nunca podría
--       marcarse listo: la función pasaría todas sus validaciones y reventaría en el trigger.
--       Se recrea el cuerpo VERBATIM de la 0054 y se cambia UNA condición. El resto del trigger
--       (descuento FEFO, devolución al cancelar, lista→entregada sin movimiento) queda igual: el
--       IP no tiene lote ni stock_movements, así que no hay nada que descontar para él acá.
create or replace function public.apply_dispensation_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare it record; v_stock integer;
begin
  -- 3.1 · en_preparacion → lista : DESCUENTA
  if new.status = 'lista' and old.status is distinct from 'lista' then
    -- Un comprobante sin renglones sigue siendo un error… salvo que el pedido lleve IP, donde
    -- el renglón no existe por diseño (la unidad la provee el IRT, no el stock de Spira).
    if not exists (select 1 from public.dispensation_items where dispensation_id = new.id)
       and not exists (select 1 from public.dispensation_requests r
                        where r.id = new.request_id and r.includes_ip) then
      raise exception 'No se puede marcar lista la dispensación % sin renglones (dispensation_items)',
        new.id using errcode = 'check_violation';
    end if;

    for it in select * from public.dispensation_items where dispensation_id = new.id loop
      -- lockear el lote para evitar carrera entre dispensaciones simultáneas del mismo lote
      select quantity_on_hand into v_stock
        from public.medication_lots where id = it.lot_id for update;
      if v_stock is null then
        raise exception 'Lote % inexistente', it.lot_id using errcode = 'foreign_key_violation';
      end if;
      if v_stock < it.quantity then
        raise exception 'Stock insuficiente en lote % (% disponible, % requerido)',
          it.lot_id, v_stock, it.quantity using errcode = 'check_violation';
      end if;

      update public.medication_lots
        set quantity_on_hand = quantity_on_hand - it.quantity
        where id = it.lot_id;

      insert into public.stock_movements
        (medication_id, lot_id, movement_type, quantity_delta, reference_id, reference_type, created_by)
      values
        (it.medication_id, it.lot_id, 'dispensacion', -it.quantity, new.id, 'dispensation', new.executed_by);
    end loop;
  end if;

  -- 3.2 · lista → en_preparacion : DEVUELVE (se canceló la preparación)
  -- Los renglones todavía existen acá; cancel_dispensation_preparation los borra
  -- DESPUÉS de este update, justamente para que el trigger sepa qué devolver.
  if old.status = 'lista' and new.status = 'en_preparacion' then
    for it in select * from public.dispensation_items where dispensation_id = new.id loop
      update public.medication_lots
        set quantity_on_hand = quantity_on_hand + it.quantity
        where id = it.lot_id;

      insert into public.stock_movements
        (medication_id, lot_id, movement_type, quantity_delta, reference_id, reference_type, created_by)
      values
        (it.medication_id, it.lot_id, 'devolucion', it.quantity, new.id, 'dispensation', auth.uid());
    end loop;
  end if;

  -- 3.3 · lista → entregada : NO mueve stock. Ya salió al marcar lista.
  -- (set_delivered_at, 0003:136, sella delivered_at en esta misma transición)

  return new;
end;
$$;


-- 9 · La entrega sella los kits. Es el ÚNICO momento en que el IP sale del stock: en el IP no hay
--     lote ni FEFO, así que no hay nada que reservar antes, y `entregada` es el paso irreversible
--     — el lugar donde corresponde congelar un dato que después no se corrige.
-- Los dos drops, por lo mismo que en §8: sin el de la firma nueva, la segunda corrida del archivo
-- falla con "function already exists".
drop function if exists public.deliver_dispensation(uuid);
drop function if exists public.deliver_dispensation(uuid, integer);

create function public.deliver_dispensation(p_dispensation_id uuid, p_ip_kits integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_status dispensation_status; v_request_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede entregar' using errcode = '42501';
  end if;

  select status, request_id into v_status, v_request_id
  from public.dispensations where id = p_dispensation_id for update;
  if not found then raise exception 'Dispensación inexistente' using errcode = '23503'; end if;
  if v_status = 'entregada' then
    raise exception 'Esta dispensación ya fue entregada' using errcode = 'check_violation';
  end if;
  if v_status <> 'lista' then
    raise exception 'Solo se puede entregar una dispensación lista (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  if (select r.includes_ip
        from public.dispensation_requests r
        join public.dispensations d on d.request_id = r.id
       where d.id = p_dispensation_id) then
    if p_ip_kits is null or p_ip_kits < 1 then
      raise exception 'Indicá cuántos kits de producto en investigación se entregaron'
        using errcode = 'check_violation';
    end if;
    update public.dispensations set ip_kits = p_ip_kits where id = p_dispensation_id;
  end if;

  update public.dispensations set status = 'entregada' where id = p_dispensation_id;
  update public.dispensation_requests set status = 'atendida' where id = v_request_id;
end; $$;
revoke all on function public.deliver_dispensation(uuid, integer) from public;
grant execute on function public.deliver_dispensation(uuid, integer) to authenticated;


-- 10 · El stock de IP pasa a restar. Se DERIVA, no se muta: sin tabla de movimientos y sin rama
--      de devolución, porque el corte es `entregada`, que es irreversible.
--      `total_kits` NO cambia de significado (sigue siendo lo recibido; el front lo lee así):
--      se agregan dos columnas.
create or replace view public.v_ip_stock with (security_invoker = true) as
with recibido as (
  select r.protocol_id, count(*)::int as recepciones, coalesce(sum(r.total_kits), 0)::int as total_kits
  from public.medication_receptions r
  where r.tipo = 'investigacion' and r.status = 'verificada' and r.total_kits is not null
  group by r.protocol_id
), entregado as (
  -- La salida se cuenta tocando SOLO `dispensations` y `dispensation_requests`, que son las dos
  -- tablas que Farmacia sí puede leer (0006: "ver dispensaciones" y "ver solicitudes"). Llegar al
  -- protocolo por `patient_visits → enrollments`, que es el camino natural, le devolvería CERO
  -- filas a la farmacéutica —no tiene policy de select sobre patient_visits— y la vista diría
  -- "entregados = 0, disponibles = todo" siempre, sin ningún error a la vista. De ahí que el
  -- protocolo viaje desnormalizado en la solicitud (§3.1).
  select dr.protocol_id, coalesce(sum(d.ip_kits), 0)::int as kits
  from public.dispensations d
  join public.dispensation_requests dr on dr.id = d.request_id
  where d.ip_kits is not null and d.status = 'entregada' and dr.protocol_id is not null
  group by dr.protocol_id
)
select
  rc.protocol_id,
  p.code  as protocol_code,
  p.name  as protocol_name,
  rc.recepciones,
  rc.total_kits,
  coalesce(en.kits, 0)                 as kits_entregados,
  rc.total_kits - coalesce(en.kits, 0) as kits_disponibles
from recibido rc
join public.protocols p on p.id = rc.protocol_id
left join entregado en on en.protocol_id = rc.protocol_id;
comment on view public.v_ip_stock is
  'Stock de IP por protocolo: total_kits = recibido, kits_entregados = salido (dispensaciones
   entregadas), kits_disponibles = la resta. 0071.';


-- ============================================================================
-- VERIFICACIÓN POSTERIOR · lo que de verdad prueba algo (correr después de aplicar):
--
--   -- 1. La vista del día emite la columna nueva y ninguna visita cambió de estado:
--   --    select computed_status, count(*) from public.v_track_visits group by 1 order by 1;
--   --    (comparar con la misma consulta corrida ANTES de aplicar: tiene que dar idéntico).
--   -- 2. Ninguna visita quedó marcada como de IP por accidente — el default es false:
--   --    select count(*) from public.visit_definitions where dispenses_ip;   → 0
--   -- 3. Ningún pedido histórico quedó marcado como de IP ni fuera de cronograma:
--   --    select count(*) from public.dispensation_requests where includes_ip or off_schedule; → 0
--   -- 4. El stock de IP no se movió (nadie entregó kits todavía):
--   --    select protocol_code, total_kits, kits_entregados, kits_disponibles from public.v_ip_stock;
--   --    → kits_entregados = 0 y kits_disponibles = total_kits en TODAS las filas.
--   -- 5. Las dos funciones que cambiaron de firma quedaron ÚNICAS (sin sobrecarga colgada,
--   --    que es lo que dejaría a PostgREST eligiendo entre dos):
--   --    select proname, pg_get_function_identity_arguments(oid) from pg_proc
--   --     where proname in ('create_dispensation_request','deliver_dispensation');
--   --    → exactamente una fila por nombre.
--   -- 6. El backfill del protocolo llegó a TODAS las solicitudes históricas:
--   --    select count(*) from public.dispensation_requests where protocol_id is null;  → 0
--   -- 7. El backfill NO movió `updated_at` (si esto no da 0, el tablero de Farmacia va a mostrar
--   --    todo el histórico como "entregado hoy" — el trigger quedó vivo durante el update):
--   --    select count(*) from public.dispensation_requests where updated_at::date = current_date
--   --      and created_at::date <> current_date;  → 0
--   -- 8. Los triggers de la tabla de solicitudes quedaron como corresponde. El de `updated_at` se
--   --    APAGA y se vuelve a PRENDER alrededor del backfill (§3.1): si el archivo se aplicara en
--   --    pedazos y el corte cayera justo en el medio, `updated_at` quedaría congelado PARA SIEMPRE
--   --    y el tablero de Farmacia dejaría de mostrar lo trabajado del día — la misma corrupción
--   --    silenciosa que el apagado venía a evitar, pero al revés. Se comprueba por catálogo, que es
--   --    lo único que no depende de haber mirado la pantalla en el momento justo:
--   --    select tgname, tgenabled from pg_trigger
--   --     where tgrelid = 'public.dispensation_requests'::regclass and not tgisinternal
--   --     order by tgname;
--   --    → `trg_requests_updated_at` con tgenabled = 'O' (Origin = habilitado; 'D' = deshabilitado,
--   --      y en ese caso se arregla con
--   --      `alter table public.dispensation_requests enable trigger trg_requests_updated_at;`).
--   --      En la misma lista tienen que estar `trg_audit_requests` y el nuevo
--   --      `trg_seal_request_protocol` (§3.2), los dos también en 'O'.
--   -- 9. Las policies del bucket entraron. ⚠️ OJO: el "Success" del SQL Editor NO prueba nada acá —
--   --    el NOTICE de §6 sale por el canal de mensajes del servidor, que el editor no siempre
--   --    muestra, así que "policies no creadas + aviso invisible" se ve idéntico a que haya salido
--   --    todo bien, y el problema recién aparece después, en la UI, cuando falla la primera subida.
--   --    Esta consulta es la prueba; si da 0 o 1 filas, se crean a mano desde Storage → Policies:
--   --    select policyname from pg_policies
--   --     where schemaname = 'storage' and tablename = 'objects' and policyname like 'ip docs%';
--   --    → dos filas: "ip docs lectura" y "ip docs alta".
-- ============================================================================
