-- ============================================================================
-- 0138 · Un pedido hecho desde una visita SUELTA se quedaba sin paciente
--
-- EL SÍNTOMA: en el tablero de Farmacia, un pedido aparece como "— · —". La farmacéutica tiene que
-- despachar medicación sin saber para quién es. Lo mismo en el aviso de la campana.
--
-- LA CADENA, de atrás para adelante:
--   1. Farmacia NO puede leer `patient_visits` (0006:162). Por eso el pedido llega al paciente por
--      su propia columna `enrollment_id`, desnormalizada, y no por la visita.
--   2. Esa columna no la pone `create_dispensation_request`: el RPC inserta `visit_id` y
--      `protocol_id` y deja `enrollment_id` y `visit_code` en null.
--   3. Las sella el trigger `seal_request_scope` (0082, ampliado en la 0084), que las busca con un
--      INNER JOIN a `visit_definitions`.
--   4. Una visita que no es del cronograma tiene `visit_def_id` NULL — y no por accidente: lo
--      EXIGE el check `patient_visits_kind_shape` de la 0022
--      (`kind <> 'programada' and visit_def_id is null`).
--
-- Con ese null el join no devuelve ninguna fila, las tres variables quedan vacías y el pedido nace
-- huérfano de enrolamiento. Pasa cada vez que se pide medicación concomitante desde una Firma, un
-- Screening, una Firma y Screening, una VNP o un Retest — que son justamente las visitas donde la
-- medicación de base se pide.
--
-- LA CURA: el join a `visit_definitions` pasa a ser LEFT. El enrolamiento y el protocolo cuelgan de
-- `patient_visits` y de `enrollments`, que existen siempre; la definición es lo único que puede
-- faltar, y su ausencia no tiene por qué llevarse puesto lo demás.
--
-- LO QUE ESTA MIGRACIÓN NO HACE, a propósito: ponerle un nombre a la visita suelta. `visit_code`
-- queda NULL, que es la verdad —una visita fuera del cronograma no tiene código— y no un `case`
-- sobre `kind` que duplicaría `KIND_LABELS` (`src/lib/visitLabels.ts`) en SQL. El repo ya decidió
-- eso una vez, en el RPC `visitas_dispensables`: un `visit_kind` nuevo caería al `else` en silencio
-- y la pantalla mostraría una etiqueta equivocada sin que nada falle. Si algún día Farmacia tiene
-- que ver "Firma y Screening" ahí, lo que falta es sellar el `kind` en una columna propia y que el
-- front lo rotule, no escribir los rótulos acá.
--
-- NO ES BREAKING para el front desplegado: llena columnas que el código ya lee y ya sabe mostrar en
-- null. Se puede aplicar en cualquier momento.
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

-- 1 · El sellado, con LEFT JOIN.
--     `create or replace` SIN cambio de firma (returns trigger, sin argumentos), así que reemplaza
--     de verdad y no deja una sobrecarga viva. El trigger `trg_seal_request_scope` de la 0082 no se
--     toca: sigue apuntando a esta misma función.
create or replace function public.seal_request_scope()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare v_enrollment_id uuid; v_protocol_id uuid; v_visit_code text;
begin
  if new.enrollment_id is null or new.protocol_id is null or new.visit_code is null then
    select pv.enrollment_id, e.protocol_id, coalesce(vd.code, vd.name)
      into v_enrollment_id, v_protocol_id, v_visit_code
      from public.patient_visits pv
      join public.enrollments e             on e.id  = pv.enrollment_id
      -- LEFT: una visita suelta (firma, screening, VNP, retest…) no tiene definición, y eso no
      -- puede costarle el paciente al pedido. Ver la cabecera.
      left join public.visit_definitions vd on vd.id = pv.visit_def_id
     where pv.id = new.visit_id;
    -- Si la visita no existe, las columnas quedan en null y el insert muere un instante después
    -- en la FK de `visit_id`: acá no hace falta (ni conviene) un mensaje propio.
    new.enrollment_id := coalesce(new.enrollment_id, v_enrollment_id);
    new.protocol_id   := coalesce(new.protocol_id,   v_protocol_id);
    new.visit_code    := coalesce(new.visit_code,    v_visit_code);
  end if;
  return new;
end; $fn$;

comment on function public.seal_request_scope() is
  'Sella dispensation_requests.enrollment_id, .protocol_id y .visit_code desde la visita cuando el
   insert no los trae. El join a visit_definitions es LEFT desde la 0138: una visita suelta no tiene
   definicion y con INNER el pedido se quedaba sin enrolamiento, o sea sin paciente para Farmacia.
   0082, ampliado en 0084 y corregido en 0138.';


-- 2 · Backfill de los pedidos que ya nacieron huérfanos.
--     Pasa por la guarda `guard_request_sealed_columns` (0122) sin trucos: esa función deja pasar
--     todo lo que no venga de los roles `authenticated`/`anon`, y el editor SQL corre como dueño.
--     Idempotente: sólo toca filas con la columna todavía en null, así que reintentar es gratis.
update public.dispensation_requests dr
   set enrollment_id = coalesce(dr.enrollment_id, x.enrollment_id),
       protocol_id   = coalesce(dr.protocol_id,   x.protocol_id)
  from (
    select pv.id as visit_id, pv.enrollment_id, e.protocol_id
      from public.patient_visits pv
      join public.enrollments e on e.id = pv.enrollment_id
  ) x
 where x.visit_id = dr.visit_id
   and (dr.enrollment_id is null or dr.protocol_id is null);


-- 3 · Sonda: después de correr lo de arriba, esto tiene que devolver 0 filas.
--     Si devuelve alguna, son pedidos cuya visita ya no existe — otro problema, y hay que mirarlo.
select count(*) as pedidos_sin_enrolamiento
  from public.dispensation_requests
 where enrollment_id is null;
