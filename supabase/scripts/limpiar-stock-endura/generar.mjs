// Spira · Limpieza del stock de ENDURA (222714) — generador de 1-simular.sql y 2-aplicar.sql.
//
// Pedido del Director (2026-09-28): «limpiemos el stock que tiene actualmente endura». Aclarado en el chat:
//   · se borra COMO SI NUNCA SE HUBIERA CARGADO (no es una baja con ajuste que deja la historia a la vista);
//   · lo que ya salió hacia pacientes —dispensaciones, salidas ambulatorias— y los pedidos de reposición
//     quedan intactos.
//
// Las dos salidas son el MISMO bloque, cambia una sola línea (v_aplicar). Por eso se generan: el SQL que
// corre el Director tiene que correr tal cual, sin «cambiá false por true».
//
//   node supabase/scripts/limpiar-stock-endura/generar.mjs
//
// QUÉ SE BORRA (todo lo del protocolo 222714, en cualquier estado, anuladas incluidas):
//   · medication_receptions — de protocolo y de investigación (IP macro). Sus renglones (reception_items) caen
//     en cascada. guard_reception_delete (0132) deja pasar al editor porque corre como postgres.
//   · ip_units — las del modelo por unidad (0037), si quedara alguna colgada de esas recepciones.
//   · stock_movements — los de los lotes de ENDURA y los que apuntan a sus recepciones.
//   · medication_lots — todos los de ENDURA.
//
// LO QUE FRENA (no se toca nada y el informe dice por qué): cualquier cosa que haga falsa la frase «como si
// nunca se hubiera cargado» sin tocar lo dispensado:
//   · un lote de ENDURA del que salió una dispensación o una salida ambulatoria: su FK es restrict (0002, 0116)
//     y borrar la recepción dejaría a esa entrega sin origen;
//   · kits de IP de ENDURA ya entregados: v_ip_stock (0071) resta lo entregado de lo recibido; sin recepciones,
//     la próxima que entre saldría con esos kits de menos;
//   · una unidad de IP (0037) ya dispensada;
//   · un traslado (0113) entre ENDURA y otro ámbito: el asiento de la otra punta quedaría huérfano.
// Si aparece un freno, se decide con el Director qué hacer con ese caso; el script no improvisa.
//
// EL RASTRO: medication_lots, reception_items y stock_movements NO tienen trigger de auditoría (sólo lo tienen
// medication_receptions e ip_units). Para que lo borrado no se pierda, el bloque escribe UNA fila en audit_log
// (entity_type = 'limpieza_stock_protocolo', entity_id = el protocolo) con la foto completa de cada fila que
// borra, antes de borrarla.
//
// ⚠️ NUNCA dos signos peso pegados dentro de un comentario del SQL generado (CLAUDE.md, 0071).
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))

const cabecera = (aplicar) => `-- Spira · Limpieza del stock de ENDURA (222714) — ${aplicar ? '2 · APLICAR' : '1 · SIMULAR (no guarda nada)'}
-- ============================================================================
-- GENERADO por supabase/scripts/limpiar-stock-endura/generar.mjs. No editar a mano: el porqué de cada paso
-- está en la cabecera del generador.
--
-- Pedido del Director (2026-09-28): borrar el stock de ENDURA como si nunca se hubiera cargado —recepciones,
-- renglones, lotes, movimientos y unidades de IP—, sin tocar dispensaciones, salidas ambulatorias ni pedidos.
--
-- ORDEN:
--   1. 1-simular.sql → leer el informe (sale como «error» a propósito: es la forma de deshacer todo).
--   2. 2-aplicar.sql → un único bloque do: o entra entero o no entra nada. Al final, un select de control.
--
-- ${aplicar
    ? 'APLICA. Correrlo de nuevo no hace daño: la segunda vez no encuentra nada que borrar y lo dice (como «error»).'
    : 'SIMULA. Hace la limpieza completa y la deshace al final con raise exception: el mensaje ES el informe.'}
-- ============================================================================
`

const cuerpo = (aplicar) => String.raw`
do $limpieza$
declare
  v_aplicar  boolean := ${aplicar};
  v_codigo   text    := '222714';
  v_proto    uuid;
  v_nombre   text;
  v_frenos   text;
  v_foto     jsonb;
  v_n_rec    bigint;
  v_n_ren    bigint;
  v_n_lot    bigint;
  v_n_mov    bigint;
  v_n_ipu    bigint;
  v_n        bigint;
  v_informe  text;
begin
  select p.id, p.name into v_proto, v_nombre from public.protocols p where p.code = v_codigo;
  if v_proto is null then
    raise exception 'No existe un protocolo con código %. No se tocó nada.', v_codigo;
  end if;

  -- 0 · Qué es de ENDURA ----------------------------------------------------------------------------------
  drop table if exists _rec;
  drop table if exists _lot;
  drop table if exists _mov;
  create temp table _rec on commit drop as
    select r.id from public.medication_receptions r where r.protocol_id = v_proto;
  create temp table _lot on commit drop as
    select l.id from public.medication_lots l where l.protocol_id = v_proto;
  create temp table _mov on commit drop as
    select m.id from public.stock_movements m
     where m.lot_id in (select id from _lot)
        or (m.reference_type = 'reception' and m.reference_id in (select id from _rec));

  select count(*) into v_n_rec from _rec;
  select count(*) into v_n_ren from public.reception_items ri where ri.reception_id in (select id from _rec);
  select count(*) into v_n_lot from _lot;
  select count(*) into v_n_mov from _mov;
  select count(*) into v_n_ipu from public.ip_units u
   where u.protocol_id = v_proto or u.reception_id in (select id from _rec);

  if v_n_rec + v_n_lot + v_n_mov + v_n_ipu = 0 then
    raise exception 'No hay stock de % (%) para borrar: no quedan recepciones, lotes, movimientos ni unidades de IP. No se tocó nada.',
      v_codigo, v_nombre;
  end if;

  -- 1 · Frenos: se miran todos antes de tocar una fila ----------------------------------------------------
  select string_agg(f, E'\n') into v_frenos from (
    select format('· Dispensación Nº %s (%s): salió %s de %s, lote %s.',
                  d.correlative_number, d.status, di.quantity, md.name, l.lot_number) as f
      from public.dispensation_items di
      join public.dispensations d on d.id = di.dispensation_id
      join public.medication_lots l on l.id = di.lot_id
      join public.medications md on md.id = di.medication_id
     where di.lot_id in (select id from _lot)
    union all
    select format('· Salida ambulatoria del %s: %s de %s, lote %s.',
                  to_char(a.created_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY'),
                  a.quantity, md.name, l.lot_number)
      from public.ambulatory_dispensations a
      join public.medication_lots l on l.id = a.lot_id
      join public.medications md on md.id = a.medication_id
     where a.lot_id in (select id from _lot)
    union all
    select format('· Kits de IP entregados: %s, en %s dispensaciones.', sum(d.ip_kits), count(*))
      from public.dispensations d
      join public.dispensation_requests dr on dr.id = d.request_id
     where dr.protocol_id = v_proto and d.ip_kits is not null and d.status = 'entregada'
    having count(*) > 0
    union all
    select format('· Unidad de IP %s ya dispensada.', u.kit_number)
      from public.ip_units u
     where (u.protocol_id = v_proto or u.reception_id in (select id from _rec))
       and (u.status = 'dispensada' or u.dispensed_visit_id is not null or u.dispensed_to_enrollment_id is not null)
    union all
    select format('· Traslado de stock con otro ámbito (%s de %s, lote %s).',
                  m.quantity_delta, md.name, coalesce(l.lot_number, 'sin lote'))
      from public.stock_movements m
      join public.medications md on md.id = m.medication_id
      left join public.medication_lots l on l.id = m.lot_id
     where m.reference_type = 'reasignacion'
       and m.id not in (select id from _mov)
       and m.reference_id in (select m2.reference_id from public.stock_movements m2
                               where m2.id in (select id from _mov) and m2.reference_type = 'reasignacion')
  ) frenos;

  if v_frenos is not null then
    raise exception E'NO SE TOCÓ NADA. El stock de % (%) tiene cosas que no se pueden borrar «como si nunca se hubiera cargado» sin tocar lo ya entregado:\n%\n\nPasale este mensaje a Claude para decidir qué hacer con estos casos.',
      v_codigo, v_nombre, v_frenos;
  end if;

  -- 2 · La foto de lo que se borra, antes de borrarlo -------------------------------------------------------
  select jsonb_build_object(
    'motivo', 'Limpieza del stock de ' || v_codigo || ' pedida por el Director el 2026-09-28: se borra como si nunca se hubiera cargado.',
    'protocolo', jsonb_build_object('id', v_proto, 'code', v_codigo, 'name', v_nombre),
    'medication_receptions', coalesce((select jsonb_agg(to_jsonb(r)) from public.medication_receptions r where r.id in (select id from _rec)), '[]'::jsonb),
    'reception_items', coalesce((select jsonb_agg(to_jsonb(ri)) from public.reception_items ri where ri.reception_id in (select id from _rec)), '[]'::jsonb),
    'medication_lots', coalesce((select jsonb_agg(to_jsonb(l)) from public.medication_lots l where l.id in (select id from _lot)), '[]'::jsonb),
    'stock_movements', coalesce((select jsonb_agg(to_jsonb(m)) from public.stock_movements m where m.id in (select id from _mov)), '[]'::jsonb),
    'ip_units', coalesce((select jsonb_agg(to_jsonb(u)) from public.ip_units u where u.protocol_id = v_proto or u.reception_id in (select id from _rec)), '[]'::jsonb)
  ) into v_foto;

  -- El informe se arma ANTES de borrar: después no queda de dónde sacar los nombres.
  select concat_ws(E'\n',
    case when v_aplicar then 'LIMPIEZA APLICADA.' else 'SIMULACIÓN — NO SE BORRÓ NADA. Si el informe está bien, corré 2-aplicar.sql.' end,
    format('Protocolo %s · %s', v_codigo, v_nombre),
    '',
    format('Se borran: %s recepciones (%s renglones), %s lotes, %s movimientos de stock, %s unidades de IP.',
           v_n_rec, v_n_ren, v_n_lot, v_n_mov, v_n_ipu),
    '',
    '== Recepciones ==',
    coalesce((select string_agg(format('· Folio %s · %s · %s · %s%s',
                                       r.folio, r.tipo, to_char(r.reception_date, 'DD/MM/YYYY'), r.status,
                                       case when r.tipo = 'investigacion' then format(' · %s kits', r.total_kits) else '' end),
                                E'\n' order by r.reception_date, r.folio)
                from public.medication_receptions r where r.id in (select id from _rec)), '(ninguna)'),
    '',
    '== Lotes (existencia actual) ==',
    coalesce((select string_agg(format('· %s · lote %s · vence %s · %s en existencia',
                                       md.name, l.lot_number, coalesce(to_char(l.expiry_date, 'DD/MM/YYYY'), 's/f'), l.quantity_on_hand),
                                E'\n' order by md.name, l.lot_number)
                from public.medication_lots l join public.medications md on md.id = l.medication_id
               where l.id in (select id from _lot)), '(ninguno)'),
    '',
    '== Pedidos de reposición que vuelven a figurar sin recibir ==',
    coalesce((select string_agg(format('· Pedido Nº %s', pm.numero), E'\n' order by pm.numero)
                from public.pedidos_medicacion pm
               where pm.id in (select r.pedido_id from public.medication_receptions r where r.id in (select id from _rec))),
             '(ninguno)')
  ) into v_informe;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before_data, after_data, db_role)
  values (null, 'DELETE', 'limpieza_stock_protocolo', v_proto, v_foto || jsonb_build_object('informe', v_informe), null, session_user);

  -- 3 · Borrar, en el orden de las FKs ----------------------------------------------------------------------
  -- Movimientos primero: su FK a medication_lots es restrict (0002). Después las unidades de IP (restrict a la
  -- recepción, 0037), las recepciones (los renglones caen en cascada) y al final los lotes.
  delete from public.stock_movements m where m.id in (select id from _mov);
  get diagnostics v_n = row_count;
  if v_n <> v_n_mov then raise exception 'Se borraron % movimientos y eran %. No se tocó nada.', v_n, v_n_mov; end if;

  delete from public.ip_units u where u.protocol_id = v_proto or u.reception_id in (select id from _rec);
  get diagnostics v_n = row_count;
  if v_n <> v_n_ipu then raise exception 'Se borraron % unidades de IP y eran %. No se tocó nada.', v_n, v_n_ipu; end if;

  delete from public.medication_receptions r where r.id in (select id from _rec);
  get diagnostics v_n = row_count;
  if v_n <> v_n_rec then raise exception 'Se borraron % recepciones y eran %. No se tocó nada.', v_n, v_n_rec; end if;

  delete from public.medication_lots l where l.id in (select id from _lot);
  get diagnostics v_n = row_count;
  if v_n <> v_n_lot then raise exception 'Se borraron % lotes y eran %. No se tocó nada.', v_n, v_n_lot; end if;

  -- 4 · Controles: si algo de esto no da, se deshace todo ---------------------------------------------------
  if exists (select 1 from public.medication_receptions r where r.protocol_id = v_proto)
     or exists (select 1 from public.reception_items ri where ri.reception_id in (select id from _rec))
     or exists (select 1 from public.medication_lots l where l.protocol_id = v_proto)
     or exists (select 1 from public.v_ip_stock s where s.protocol_id = v_proto) then
    raise exception 'Quedó stock de % después de borrar. No se tocó nada.', v_codigo;
  end if;

  if not v_aplicar then
    raise exception '%', v_informe;
  end if;
end
$limpieza$;
`

const control = `
-- Control: lo que queda del stock de 222714 (todo en 0) y la foto guardada en audit_log.
select
  (select count(*) from public.medication_receptions r join public.protocols p on p.id = r.protocol_id where p.code = '222714') as recepciones,
  (select count(*) from public.medication_lots l join public.protocols p on p.id = l.protocol_id where p.code = '222714') as lotes,
  (select count(*) from public.v_ip_stock s where s.protocol_code = '222714') as filas_de_stock_ip,
  (select count(*) from public.audit_log a where a.entity_type = 'limpieza_stock_protocolo') as fotos_en_audit_log;
`

for (const [archivo, aplicar] of [['1-simular.sql', false], ['2-aplicar.sql', true]]) {
  const sql = cabecera(aplicar) + cuerpo(aplicar) + (aplicar ? control : '')
  // El editor de Supabase parte los cuerpos si la cantidad de marcadores de dollar-quote no es par (0071).
  const marcadores = sql.match(/\$[A-Za-z_]*\$/g) ?? []
  if (marcadores.length % 2 !== 0) throw new Error(`${archivo}: ${marcadores.length} marcadores de dollar-quote (impar).`)
  writeFileSync(join(AQUI, archivo), sql)
  console.log(`${archivo}: ${sql.split('\n').length} líneas, ${marcadores.length} marcadores de dollar-quote`)
}
