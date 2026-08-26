-- Spira · Migración 0097 — Un tercer formato de fecha: "31 Ago 2026"
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0096. IDEMPOTENTE.
-- ----------------------------------------------------------------------------
-- ADITIVA: sólo ENSANCHA el check de `user_preferences.date_format` para que acepte un valor más.
-- Ninguna fila existente deja de ser válida (los dos valores viejos siguen adentro) y ningún front
-- desplegado escribe el valor nuevo, así que va ANTES del deploy: el que no funciona sin ella es el
-- front nuevo. Al revés, quien elija el formato nuevo se comería un 23514 al guardar — y como en
-- Preferencias cada control guarda solo, el error saldría en pantalla en el mismo momento de
-- elegirlo, que es lo más parecido a "la app está rota" que puede ver alguien.
--
-- POR QUÉ UNA MIGRACIÓN PARA UNA OPCIÓN MÁS DE UN DESPLEGABLE. Es el costo que la 0093 aceptó a
-- propósito al tipar cada preferencia con su check en vez de meterlas en un `jsonb`: la base es la
-- que hace cumplir el conjunto de valores válidos, así que ampliarlo es un cambio de schema. La
-- contrapartida es la de siempre — un valor inventado no entra ni por PostgREST ni por la consola.
--
-- EL VALOR SE LLAMA `dmesy` Y NO `dmmy` A PROPÓSITO: pegado a `dmy` en un check, una diferencia de
-- una sola letra es una trampa para el que escriba SQL a mano. `dmesy` se lee "día, mes, año" con
-- el mes en letras y no se confunde con nada.
--
-- EL CONSTRAINT PASA A TENER NOMBRE PROPIO. El de la 0093 quedó con el nombre que le puso Postgres
-- al check inline de la columna. Se reemplaza por uno nombrado a mano para que la próxima
-- ampliación no dependa de adivinar un nombre generado — y el barrido de abajo no da nada por
-- sentado: borra CUALQUIER check de la tabla que mencione la columna, porque dejar vivo el viejo
-- por un nombre que no coincide sería aplicar esta migración "con éxito" y que el valor nuevo
-- siguiera rebotando.
-- ============================================================================

-- 1 · Fuera todo check viejo sobre la columna, se llame como se llame -------------
do $migracion$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class     rel on rel.oid = con.conrelid
      join pg_namespace ns  on ns.oid  = rel.relnamespace
     where ns.nspname  = 'public'
       and rel.relname = 'user_preferences'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%date_format%'
  loop
    execute format('alter table public.user_preferences drop constraint %I', c.conname);
  end loop;
end
$migracion$;

-- 2 · El conjunto de valores válidos, ahora de tres --------------------------
alter table public.user_preferences
  add constraint user_preferences_date_format_valido
  check (date_format in ('dmy', 'iso', 'dmesy'));

comment on column public.user_preferences.date_format is
  'Formato de fecha en pantalla: dmy (31/12/2026) | iso (2026-12-31) | dmesy (31 Ago 2026). 0093, ampliado en 0097.';
