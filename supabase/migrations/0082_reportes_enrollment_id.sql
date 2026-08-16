-- Spira · Migración 0082 — El enrolamiento del pedido, desnormalizado en la fila.
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0081. IDEMPOTENTE.
--
-- QUÉ HABILITA: que las vistas de Reportes (0083) puedan decir de qué PACIENTE fue cada
-- movimiento. Es el pre-requisito de la pantalla, no una mejora suelta.
--
-- POR QUÉ UNA COLUMNA Y NO UN JOIN. Farmacia NO tiene policy de select sobre `patient_visits`:
-- la única (0006:162) cubre gerencia y a los coordinadores asignados del protocolo. Una vista
-- `security_invoker` —que es la convención de TODAS las vistas del repo, 0004:5— que joinee
-- `dispensation_requests → patient_visits → enrollments` para llegar al paciente NO da error:
-- la RLS filtra en silencio y devuelve CERO filas. La farmacéutica abriría Reportes y vería
-- todo en cero, para siempre, sin un solo mensaje. En un sistema auditable un número falso es
-- peor que un error, y encima no se detecta probando con el usuario de QA, que tiene los cinco
-- módulos y ve todo igual.
--
-- Es exactamente el problema que la 0071 §3.1 ya resolvió para el protocolo, con las mismas
-- palabras. Esta migración lo termina: `enrollment_id` abre las dos puntas que faltaban, porque
-- desde el enrolamiento se llega al paciente Y al protocolo, y las dos tablas SÍ son legibles
-- por Farmacia (`patients` por 0006:130, "farmacia central: ve el paciente"; `enrollments` por
-- la 0010). Misma familia que `patient_visits.coordinator_name` (0065) y
-- `visit_comments.author_name` (0048): el dato que la vista necesita viaja en la fila.
--
-- QUÉ NO ROMPE. La columna es NULLABLE y nadie la lee todavía: el front desplegado la ignora.
-- Es puramente ADITIVA, así que va PRIMERO y el front nuevo después (regla de orden de despliegue
-- del CLAUDE.md: lo aditivo va antes porque el que no funciona sin ella es el front nuevo).
-- Tampoco agrega una FK entre un par ya embebido en algún `select` del front —`dispensation_requests`
-- no embebe `enrollments` en ningún lado—, así que no dispara el PGRST201 de la 0076.
-- ============================================================================


-- 1 · La columna, el comentario y su índice.
--     `on delete restrict` espeja a `protocol_id` (0071). No agrega ningún bloqueo nuevo:
--     `visit_id` ya es restrict contra `patient_visits`, y `patient_visits.enrollment_id` es
--     cascade desde `enrollments`, así que borrar un enrolamiento con pedidos ya fallaba antes
--     de esta migración.
alter table public.dispensation_requests
  add column if not exists enrollment_id uuid references public.enrollments(id) on delete restrict;

comment on column public.dispensation_requests.enrollment_id is
  'Enrolamiento de la visita del pedido, sellado al crear. Desnormalizado a propósito: Farmacia no
   puede leer patient_visits, así que sin esta columna las vistas de Reportes no tendrían por dónde
   llegar al paciente. Hermana de protocol_id (0071). 0082.';

create index if not exists idx_dispensation_requests_enrollment
  on public.dispensation_requests(enrollment_id);


-- 2 · Backfill de las filas existentes, con el trigger de `updated_at` APAGADO mientras corre.
--     El porqué del apagado (idéntico al de la 0071 §3.1): `trg_requests_updated_at` (0003:29)
--     sella `updated_at = now()` en CADA update, y tanto el tablero de Farmacia como el historial
--     paginado filtran y ordenan las solicitudes atendidas POR updated_at ("el día en que la
--     farmacéutica la trabajó"). Un backfill con el trigger vivo arrastraría el histórico ENTERO
--     a la columna "Entregadas" del día en que se aplique la migración y aplanaría el orden del
--     historial: una corrupción silenciosa de datos reales.
--     El apagado es transaccional: si algo falla más abajo, el trigger vuelve solo.
--     `trg_audit_requests` queda ENCENDIDO a propósito: que el backfill quede registrado en el
--     audit_log es exactamente lo que corresponde en un sistema ANMAT / ICH-GCP.
alter table public.dispensation_requests disable trigger trg_requests_updated_at;

update public.dispensation_requests dr
   set enrollment_id = pv.enrollment_id
  from public.patient_visits pv
 where pv.id = dr.visit_id
   and dr.enrollment_id is null;          -- idempotente: en la segunda corrida no toca ninguna fila

alter table public.dispensation_requests enable trigger trg_requests_updated_at;


-- 3 · El seguro: un solo trigger sella las DOS columnas.
--     La 0071 dejó `seal_request_protocol`, que sella una sola. En vez de sumarle un segundo
--     trigger que repita el mismo lookup, se reemplaza por uno que hace el trabajo completo y se
--     llama por lo que hace. El motivo del sellado sigue siendo el de la 0071: las dos columnas
--     son NULLABLES y la policy "track crea solicitudes" (0006/0009) permite insertar en la tabla
--     SIN pasar por el RPC, así que un dato desnormalizado que dependa de que TODOS los caminos
--     de escritura se acuerden de llenarlo no se sostiene solo.
--
--     SECURITY DEFINER a propósito: Farmacia no tiene policy de select sobre `patient_visits`, así
--     que el lookup con los privilegios de quien inserta devolvería NULL en silencio justo en el
--     caso que se quiere blindar.
--
--     `before insert` y sólo si vienen en null: para el RPC —que ya sella el protocolo— es un
--     no-op en esa columna, y ninguna fila existente se toca.
create or replace function public.seal_request_scope()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_enrollment_id uuid; v_protocol_id uuid;
begin
  if new.enrollment_id is null or new.protocol_id is null then
    select pv.enrollment_id, e.protocol_id
      into v_enrollment_id, v_protocol_id
      from public.patient_visits pv
      join public.enrollments e on e.id = pv.enrollment_id
     where pv.id = new.visit_id;
    -- Si la visita no existe, las columnas quedan en null y el insert muere un instante después
    -- en la FK de `visit_id`: acá no hace falta (ni conviene) un mensaje propio.
    new.enrollment_id := coalesce(new.enrollment_id, v_enrollment_id);
    new.protocol_id   := coalesce(new.protocol_id,   v_protocol_id);
  end if;
  return new;
end; $$;

comment on function public.seal_request_scope() is
  'Sella dispensation_requests.enrollment_id y .protocol_id desde la visita cuando el insert no los
   trae (p. ej. una escritura directa por la policy de Track, sin pasar por el RPC). Sin esto, una
   fila con el enrolamiento en null desaparece de las vistas de Reportes y los totales salen cortos.
   Reemplaza a seal_request_protocol (0071), que sellaba una sola columna. 0082.';

-- El orden importa y NO es cosmético: el editor de Supabase no envuelve el bloque en una
-- transacción (ver CLAUDE.md), así que se crea el trigger nuevo ANTES de sacar el viejo. Si algo
-- falla en el medio, la tabla nunca queda sin sellar. Que los dos convivan un instante es inocuo:
-- hacen el mismo trabajo y el segundo encuentra la columna ya escrita.
drop trigger if exists trg_seal_request_scope on public.dispensation_requests;
create trigger trg_seal_request_scope
  before insert on public.dispensation_requests
  for each row execute function public.seal_request_scope();

drop trigger if exists trg_seal_request_protocol on public.dispensation_requests;
drop function if exists public.seal_request_protocol();


-- 4 · Verificación (correr después, en una sentencia aparte).
--     Tiene que devolver 0 filas: ningún pedido con visita puede quedar sin enrolamiento.
--
--   select count(*) as pedidos_sin_enrolamiento
--     from public.dispensation_requests
--    where enrollment_id is null;
