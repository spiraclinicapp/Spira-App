-- ============================================================================
-- 0087 — Recepción: anular (y revertir el ingreso si ya estaba verificada)
--
-- Hoy la pantalla de Recepción no tiene NINGUNA salida: ni anular, ni editar, ni borrar. Un lote
-- tipeado mal o una cantidad equivocada quedan para siempre, y la única corrección posible es un
-- ajuste manual de stock — otra pantalla, otro motivo escrito, y los dos registros conviviendo sin
-- que nada los vincule. En una app auditable no borrar es correcto; no poder anular no lo es.
-- Ver docs/plan-anular-recepcion.md.
--
-- TRES RAMAS, porque no todas las recepciones hicieron lo mismo:
--
--   1. PENDIENTE — nunca tocó stock. Se sella el estado y listo.
--
--   2. VERIFICADA de medicación base (protocolo / ambulatoria) — ingresó a medication_lots por el
--      trigger apply_reception_stock (0003:97). Se revierte en DOS PASADAS: primero se validan
--      TODOS los renglones sin mover nada, después se aplica. Un raise dentro de un único loop
--      revertiría igual toda la transacción, pero abortaría en el primer renglón que falle y la
--      farmacéutica vería un problema por vez; validar todo primero hace el error completo.
--      La reversión es un movimiento COMPENSATORIO (-), no un borrado: stock_movements es el libro
--      insert-only que pide ANMAT. El lote tampoco se borra aunque quede en cero — el libro tiene
--      los dos asientos y la fila del lote es su percha.
--
--   3. VERIFICADA de Producto de Investigación — sólo cambia de estado. EL IP NO TIENE LIBRO:
--      create_ip_reception (0038) nace ya verificada y el stock lo DERIVA la vista v_ip_stock
--      (0071 §10) como "recibido − entregado". Anularla es sacarla del conjunto que la vista suma,
--      y el stock se recalcula solo. No se escribe compensatorio porque no hay tabla donde
--      escribirlo: es una asimetría real del modelo, no un olvido.
--
-- LO QUE NO SE PERMITE (D1): anular dejando el stock en descubierto. Si de un lote ya se dispensó
-- parte de lo que esta recepción ingresó, la función corta y explica con los números. Una
-- anulación no puede contradecir una dispensación ya entregada a un paciente; para ese descuadre
-- está el ajuste manual, que existe desde la 0032.
--
-- PERMISO: pharma leader+ (D2), el mismo que verifica y el mismo que ya puede mover cualquier lote
-- con adjust_stock. El control es el registro (quién, cuándo, por qué), no el rango.
--
-- LOS TRIGGERS VIEJOS NO MOLESTAN: set_reception_verified (0003:232) y apply_reception_stock
-- (0003:97) están condicionados a `new.status = 'verificada' and old.status is distinct from
-- 'verificada'`, así que un update a 'anulada' no entra en ninguno. Y el camino inverso queda
-- cerrado por verify_reception, que sólo acepta 'pendiente': una anulada no se puede re-verificar,
-- de modo que el stock no puede re-ingresarse.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0086 (que crea los dos
-- valores de enum que este archivo usa). IDEMPOTENTE. Registrar en supabase/README.md al
-- confirmarse aplicada.
-- ============================================================================


-- 1 · Las cuatro columnas de la anulación -------------------------------------
-- voided_by_name va DESNORMALIZADO, igual que verified_by_name en la 0085: la policy de users es
-- `id = auth.uid() or has_module('gerencia')` (0006:82), así que un join dejaría a la farmacéutica
-- viendo su propio nombre y NULL en todo lo que anuló otra persona. Lo escribe esta función, que
-- es SECURITY DEFINER y sí puede leer users. Quinta vez que aparece el mismo muro.
--
-- voided_by es la TERCERA FK de medication_receptions a users (ya están received_by y
-- verified_by). Es seguro: ningún select del front embebe users desde esta tabla —la 0085
-- desnormalizó el nombre justamente para no hacerlo—, así que no hay embed que quede ambiguo
-- (PGRST201, el incidente de la 0076).
alter table public.medication_receptions
  add column if not exists voided_at      timestamptz,
  add column if not exists voided_by      uuid references public.users(id),
  add column if not exists voided_by_name text,
  add column if not exists void_reason    text;

comment on column public.medication_receptions.voided_at is
  'Cuándo se anuló la recepción. NULL = no está anulada. 0087.';
comment on column public.medication_receptions.voided_by is
  'Quién la anuló (auditable). Lo sella void_reception. 0087.';
comment on column public.medication_receptions.voided_by_name is
  'Snapshot del nombre de quien anuló (la RLS de users oculta las filas ajenas → no se puede joinear; lo escribe void_reception, que es SECURITY DEFINER). Mismo patrón que verified_by_name (0085). 0087.';
comment on column public.medication_receptions.void_reason is
  'Motivo de la anulación, obligatorio. Queda asentado también en el reason del movimiento compensatorio. 0087.';


-- 2 · Una anulada SIEMPRE tiene fecha y motivo --------------------------------
-- Ninguna fila existente la viola (no hay anuladas todavía), así que entra sin NOT VALID. El
-- bloque `do` la hace repetible: ADD CONSTRAINT no acepta IF NOT EXISTS.
do $blk$
begin
  if not exists (select 1 from pg_constraint where conname = 'medication_receptions_anulada_chk') then
    alter table public.medication_receptions
      add constraint medication_receptions_anulada_chk
      check (status <> 'anulada' or (voided_at is not null and void_reason is not null));
  end if;
end
$blk$;


-- 3 · void_reception ----------------------------------------------------------
create or replace function public.void_reception(p_reception_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_status    reception_status;
  v_tipo      reception_kind;
  v_protocol  uuid;
  v_kits      integer;
  v_recibido  integer;
  v_entregado integer;
  v_lot_id    uuid;
  v_en_lote   integer;
  v_name      text;
  it          record;
begin
  if not public.has_min_role('pharma','leader') then
    raise exception 'Sin permiso para anular recepciones' using errcode = '42501';
  end if;

  -- Mismo criterio que adjust_stock (0032): sin motivo no hay anulación.
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'La anulación requiere un motivo' using errcode = 'check_violation';
  end if;

  -- FOR UPDATE: lock anti-carrera con una verificación simultánea sobre la misma recepción.
  select r.status, r.tipo, r.protocol_id, r.total_kits
    into v_status, v_tipo, v_protocol, v_kits
    from public.medication_receptions r
   where r.id = p_reception_id
     for update;

  if v_status is null then
    raise exception 'Recepción % inexistente', p_reception_id using errcode = 'foreign_key_violation';
  end if;
  if v_status = 'anulada' then
    raise exception 'La recepción % ya está anulada', p_reception_id using errcode = 'check_violation';
  end if;

  -- Una PENDIENTE nunca tocó stock: se saltea todo esto y sólo se sella al final.
  if v_status = 'verificada' then

    if v_tipo = 'investigacion' then
      -- ── Rama IP ──────────────────────────────────────────────────────────────
      -- La rama se elige por TIPO y no por `total_kits is not null` a propósito: las recepciones
      -- IP viejas (modelo por-unidad, anterior a la 0038) tienen total_kits NULL y tampoco
      -- ingresaron nunca a medication_lots — la rama IP del trigger apply_reception_stock (0037)
      -- retorna temprano. Mandarlas al loop de renglones las haría fallar buscando lotes que no
      -- existen. Sin kits que descontar, anularlas es sólo cambiar el estado.
      if v_kits is not null then
        -- Las dos mitades de v_ip_stock (0071 §10), replicadas acá porque la vista es
        -- security_invoker y agrega POR PROTOCOLO, no por recepción.
        select coalesce(sum(r.total_kits), 0) into v_recibido
          from public.medication_receptions r
         where r.protocol_id = v_protocol and r.tipo = 'investigacion'
           and r.status = 'verificada' and r.total_kits is not null;

        select coalesce(sum(d.ip_kits), 0) into v_entregado
          from public.dispensations d
          join public.dispensation_requests dr on dr.id = d.request_id
         where dr.protocol_id = v_protocol and d.ip_kits is not null and d.status = 'entregada';

        if v_recibido - v_entregado < v_kits then
          raise exception
            'No se puede anular: al protocolo le quedan % kits disponibles y esta recepción ingresó %. Ya se dispensaron kits que dependen de ella.',
            v_recibido - v_entregado, v_kits using errcode = 'check_violation';
        end if;
      end if;

    else
      -- ── Rama base (protocolo / ambulatoria) ─────────────────────────────────
      -- PASADA 1 · validar TODOS los renglones antes de mover un solo número.
      -- El lote se ubica por (medication_id, lot_number) porque reception_items no guarda lot_id;
      -- es la misma clave del unique de medication_lots (0002:241) que usa el upsert del ingreso.
      -- El FOR UPDATE de acá sostiene el lock hasta el fin de la transacción, así que la pasada 2
      -- opera sobre lo mismo que se validó.
      for it in
        select i.medication_id, i.lot_number, i.quantity
          from public.reception_items i
         where i.reception_id = p_reception_id
      loop
        select l.id, l.quantity_on_hand into v_lot_id, v_en_lote
          from public.medication_lots l
         where l.medication_id = it.medication_id and l.lot_number = it.lot_number
           for update;

        if v_lot_id is null then
          raise exception 'El lote % ya no existe: no se puede revertir su ingreso', it.lot_number
            using errcode = 'foreign_key_violation';
        end if;
        if v_en_lote < it.quantity then
          raise exception
            'No se puede anular: del lote % quedan % unidades y esta recepción ingresó %. Ya se dispensaron unidades de ese lote.',
            it.lot_number, v_en_lote, it.quantity using errcode = 'check_violation';
        end if;
      end loop;

      -- PASADA 2 · aplicar.
      for it in
        select i.medication_id, i.lot_number, i.quantity
          from public.reception_items i
         where i.reception_id = p_reception_id
      loop
        select l.id into v_lot_id
          from public.medication_lots l
         where l.medication_id = it.medication_id and l.lot_number = it.lot_number;

        update public.medication_lots l
           set quantity_on_hand = l.quantity_on_hand - it.quantity,
               updated_at       = now()
         where l.id = v_lot_id;

        -- reference_type 'reception' + reference_id ya estaban permitidos por el check de la tabla
        -- (0002:335): el vínculo con la recepción, que es lo que hoy falta, no necesita ninguna
        -- columna nueva.
        insert into public.stock_movements
          (medication_id, lot_id, movement_type, quantity_delta,
           reference_id, reference_type, reason, created_by)
        values
          (it.medication_id, v_lot_id, 'anulacion_recepcion', -it.quantity,
           p_reception_id, 'reception', p_reason, auth.uid());
      end loop;
    end if;
  end if;

  -- El que anula es siempre el usuario actual, así que alcanza con resolver su propio nombre.
  select u.full_name into v_name
    from public.users u
   where u.id = auth.uid();

  update public.medication_receptions
     set status         = 'anulada',
         voided_at      = now(),
         voided_by      = auth.uid(),
         voided_by_name = v_name,
         void_reason    = p_reason
   where id = p_reception_id;
end;
$fn$;

comment on function public.void_reception is
  'Anula una recepción con motivo obligatorio. Pendiente → sella. Verificada de base → valida que el ingreso siga intacto, resta los lotes y escribe el compensatorio anulacion_recepcion. Verificada de IP → sólo estado (su stock lo deriva v_ip_stock). Bloquea si ya se dispensó. pharma leader+. SECURITY DEFINER. 0087.';

grant execute on function public.void_reception(uuid, text) to authenticated;
