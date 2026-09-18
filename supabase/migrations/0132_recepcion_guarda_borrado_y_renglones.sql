-- Spira · Migración 0132 — Recepción: una recepción no se borra y sus renglones no se escriben por fuera
-- de create_reception.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0131.
-- IDEMPOTENTE: reintentar es volver a correr el archivo entero.
--
-- ✅ ORDEN DE DESPLIEGUE INDIFERENTE. No cambia columnas, firmas ni lo que devuelve ningún select: sólo
--    rechaza dos escrituras que el front no hace. Buscado en src el 2026-09-17, y de nuevo el 2026-09-18: sobre medication_receptions
--    y reception_items el front sólo lee (src/data/pharma/receptions.ts); las altas van por create_reception
--    y las bajas por void_reception, que siguen pasando (ver más abajo por qué).
--
-- Numeración: nació como 0129 y quedó en 0132 (Director, 2026-09-18). Mientras esperaba sin pushear, la
-- 0129 la tomó feedback_lugar (#222), la 0130 las desviaciones de protocolo (#226) y la 0131 feedback_visto
-- (#225). La limpieza de Reposición, que la 0128 todavía llama «0129», toma el siguiente número libre
-- cuando se escriba: depende de un deploy de Farmacia, y esta guarda no depende de ninguno.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================
--
-- EL HUECO (anotado en TODOS.md al cerrar la review de la 0128)
--
-- Las policies «pharma administra recepciones» (0006:247) y «pharma administra items recepcion»
-- (0006:249), aflojadas a operator+ en la 0009 (153 y 155), son `for all`: habilitan también el DELETE de
-- la recepción y cualquier INSERT/UPDATE/DELETE de sus renglones por PostgREST. Las guardas que ya había
-- no los ven: guard_reception_void (0087/0088) y validar_pedido_de_recepcion (0128) cuelgan de INSERT/
-- UPDATE sobre medication_receptions, y reception_items no tenía ninguna.
--
--   · Borrar una recepción VERIFICADA no revierte el stock: los lotes y el movimiento «recepcion» que
--     escribió apply_reception_stock quedan como estaban, apuntando a una recepción que ya no existe. Los
--     renglones caen en CASCADE (0002:262), así que tampoco queda de dónde sacar qué ingresó. Con pedido
--     (0128), además, lo recibido de ese pedido baja solo: vuelve a figurar con faltante, la compra
--     calculada sale más corta y anular_pedido_medicacion —que sólo mira si queda una recepción no anulada
--     del pedido— lo deja anular con el stock ya en el estante.
--   · Borrar una PENDIENTE hace lo mismo con lo «sin verificar» del pedido. Y en un sistema auditable un
--     documento cargado no se borra, se anula: void_reception sella también a las pendientes, y Recepción
--     ofrece «Anular» para cualquier recepción que no esté anulada (esAnulable, recepcion/AnularRecepcion).
--   · Un PATCH a reception_items.quantity de una recepción verificada cambia lo «recibido» sin mover un
--     número de stock. void_reception resta después la cantidad NUEVA, no la que ingresó: saca de más o de
--     menos, o rechaza la anulación por un faltante que no existe. En una pendiente, cambia lo que va a
--     entrar al verificar y lo sin verificar del pedido, sin pasar por las validaciones de create_reception.
--
-- LA REGLA: SIEMPRE, SIN MIRAR EL ESTADO (Director, 2026-09-17)
--
-- Ni el DELETE de la recepción ni ninguna escritura de reception_items tienen un camino legítimo por
-- fuera de las funciones del owner: ninguna función borra recepciones, y la única que escribe renglones
-- es create_reception, al insertar. Así que no hace falta leer la recepción madre para decidir. Eso
-- también saca de la mesa dos problemas que una regla por estado sí tendría:
--   · la carrera con verify_reception: un renglón insertado mientras otra sesión verifica entraría a una
--     recepción verificada sin sumar al stock, salvo que la guarda lockeara la madre;
--   · el permiso del lock: SELECT … FOR SHARE exige privilegio UPDATE sobre la tabla que lockea (la
--     trampa que la 0128 esquiva cortando por rol primero).
--
-- EL MECANISMO: current_user <> 'postgres', SIN SECURITY DEFINER (igual que 0087/0088 y 0128)
--
-- Adentro de una función SECURITY DEFINER, current_user es su owner, no quien la llamó; un PATCH o POST de
-- PostgREST corre como el rol del JWT (authenticated). Si estas funciones trigger fueran SECURITY DEFINER,
-- current_user sería siempre postgres y la distinción no diría nada.
-- Pasan (current_user = postgres):
--   · create_reception (0128), que inserta los renglones;
--   · el editor SQL de Supabase, y con él los scripts de limpieza de datos TEST (supabase/_borrar_test_*.sql);
--   · la cascada de una FK. Postgres ejecuta la acción referencial como el DUEÑO de la tabla que
--     referencia (reception_items), no como quien borró la madre — probado en PGlite. Un DELETE de una
--     recepción desde el editor arrastra sus renglones a través de la guarda de reception_items sin
--     chocar con ella. Por eso el bloque de verificación de abajo confirma que el dueño de las dos
--     tablas sea postgres.
-- verify_reception (0085) y void_reception (0113) no escriben ninguna de las dos cosas: sólo hacen UPDATE
-- de medication_receptions y leen reception_items. Tampoco la RPC de recepción de IP (0038/0039), que no
-- carga renglones.
-- No pasan: authenticated y anon (PostgREST) y también service_role. Ninguna Edge Function toca
-- recepciones (supabase/functions/ sólo tiene admin-usuarios), así que se falla cerrado.
-- TRUNCATE no dispara triggers de fila, pero PostgREST no lo expone.
--
-- Errcode 42501, como en 0088 y 0128: no es un dato inválido, es el camino equivocado. El front nunca llega
-- a esto (pharmaErrorMessage lo traduciría a «No tenés permiso para esta acción.»); el texto de dominio es
-- para quien lo lea en la API, en el editor o en un log.
-- ============================================================================


-- 1 · Una recepción no se borra -----------------------------------------------------------------
create or replace function public.guard_reception_delete()
returns trigger language plpgsql set search_path = public as $fn$
begin
  if current_user <> 'postgres' then
    raise exception 'Una recepción no se borra: si fue un error, se anula desde Recepción (queda el motivo y, si estaba verificada, se revierte el stock).'
      using errcode = '42501';
  end if;

  -- OLD y no NEW ni NULL: en un BEFORE DELETE, devolver NULL cancela la fila EN SILENCIO (0 filas
  -- afectadas, sin error). El camino de postgres parecería andar y no borraría nada.
  return old;
end;
$fn$;
revoke all on function public.guard_reception_delete() from public;

comment on function public.guard_reception_delete() is
  'BEFORE DELETE sobre medication_receptions. Rechaza (42501) el DELETE de cualquier recepción, en cualquier
   estado, si current_user no es postgres: la policy for all de pharma (0006:247, 0009:153) lo permitía por
   PostgREST, y borrar no revierte el stock ni deja rastro en el pedido (0128). Una recepción cargada por
   error se anula (void_reception). Pasan el editor SQL y las funciones SECURITY DEFINER del owner. Sin
   SECURITY DEFINER a propósito: con él, current_user sería siempre postgres. 0132.';

drop trigger if exists trg_guard_reception_delete on public.medication_receptions;
create trigger trg_guard_reception_delete
  before delete on public.medication_receptions
  for each row execute function public.guard_reception_delete();


-- 2 · Los renglones se escriben sólo al crear la recepción -------------------------------------------
create or replace function public.guard_reception_items_write()
returns trigger language plpgsql set search_path = public as $fn$
begin
  if current_user <> 'postgres' then
    raise exception 'Los renglones de una recepción no se modifican por separado: se cargan al crearla. Si hay un error, anulá la recepción y cargá una nueva.'
      using errcode = '42501';
  end if;

  -- Mismo cuidado que en la sección 1: en el DELETE hay que devolver OLD (NEW es NULL y cancelaría la
  -- fila en silencio, incluida la cascada de un DELETE de la recepción hecho desde el editor).
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$fn$;
revoke all on function public.guard_reception_items_write() from public;

comment on function public.guard_reception_items_write() is
  'BEFORE INSERT OR UPDATE OR DELETE sobre reception_items. Rechaza (42501) toda escritura, sin mirar el
   estado de la recepción, si current_user no es postgres: la policy for all de pharma (0006:249,
   0009:155) la permitía por PostgREST, y cambiar un renglón cambia lo recibido sin mover stock (y lo
   recibido de un pedido, 0128). La única escritura legítima es el INSERT de create_reception (SECURITY
   DEFINER). La cascada de un DELETE de la recepción corre como el dueño de la tabla, así que desde el
   editor SQL pasa. No lee la recepción madre: sin lock, sin carrera con verify_reception. 0132.';

drop trigger if exists trg_guard_reception_items_write on public.reception_items;
create trigger trg_guard_reception_items_write
  before insert or update or delete on public.reception_items
  for each row execute function public.guard_reception_items_write();


-- ============================================================================
-- VERIFICACIÓN POSTERIOR (correr después de aplicar; cada consulta suelta, son de sólo lectura)
--
--   -- 1. Los dos triggers existen, en el evento y la tabla que corresponden.
--   select tgrelid::regclass as tabla, tgname, pg_get_triggerdef(oid) as definicion
--     from pg_trigger
--    where tgname in ('trg_guard_reception_delete', 'trg_guard_reception_items_write');
--   -- esperado: 2 filas; BEFORE DELETE en medication_receptions, BEFORE INSERT OR DELETE OR UPDATE en
--   --           reception_items.
--
--   -- 2. Las funciones trigger NO son SECURITY DEFINER (si lo fueran, no frenarían a nadie).
--   select proname, prosecdef
--     from pg_proc
--    where proname in ('guard_reception_delete', 'guard_reception_items_write');
--   -- esperado: prosecdef = false en las dos.
--
--   -- 3. Las funciones que tienen que pasar corren como postgres.
--   select proname, pg_get_userbyid(proowner) as owner, prosecdef
--     from pg_proc
--    where proname in ('create_reception', 'verify_reception', 'void_reception');
--   -- esperado: owner = postgres y prosecdef = true en las tres (una sola fila de create_reception).
--
--   -- 4. Las dos tablas son de postgres: la cascada de un DELETE desde el editor corre como ese dueño.
--   select tablename, tableowner
--     from pg_tables
--    where schemaname = 'public' and tablename in ('medication_receptions', 'reception_items');
--   -- esperado: tableowner = postgres en las dos.
-- ============================================================================
