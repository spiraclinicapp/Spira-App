-- Spira · Migración 0106 — El logo tiene su propio destino, aparte del arranque
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0105. IDEMPOTENTE.
-- ----------------------------------------------------------------------------
-- ADITIVA: columna nueva con default, sin tocar ninguna existente. Ningún front desplegado la
-- consulta, así que se aplica ANTES del deploy — el que no funciona sin ella es el front nuevo.
--
-- ⚠️ Y ACÁ EL FRONT NUEVO NO SE DEGRADA: SE ROMPE. `savePrefs` escribe la fila ENTERA en un solo
-- upsert (tema + formato de fecha + los dos destinos), así que sin esta columna PostgREST rechaza
-- la sentencia completa y deja de guardarse CUALQUIER preferencia, no sólo el destino del logo.
-- Desplegar el front antes que esto no rompe una función nueva: rompe Ajustes › Preferencias.
--
-- QUÉ CORRIGE. La 0105 dejó que "Página de inicio" gobernara DOS cosas con un solo valor: dónde
-- abre Spira al entrar y a dónde lleva el logo del top bar. **Son dos cosas distintas** (Director,
-- 2026-09-04): se puede querer abrir la sesión en Coordinación —que es donde se trabaja— y que el
-- logo siga devolviendo al panorama de Inicio. Con un solo campo eso no se podía expresar.
--
-- POR QUÉ UNA COLUMNA Y NO OTRO VALOR DE `home_view`: son dos preguntas independientes, y meter
-- las dos respuestas en un campo obligaría a inventar valores compuestos ('track+inicio'), que es
-- texto libre disfrazado — lo contrario de lo que la 0093 eligió al tipar cada preferencia.
--
-- `logo_view` NO ADMITE 'ultimo', y `home_view` sí. No es una omisión: "el último módulo que usé"
-- describe con qué abrir la SESIÓN. El rastro se reescribe en cada cambio de módulo, así que un
-- logo que lo siguiera llevaría siempre al módulo donde ya estás parado — un botón que no hace
-- nada. Ver `resolveHome` en `lib/home.ts`.
--
-- EL DEFAULT ES 'inicio' — el comportamiento que el logo tuvo siempre. Las filas que ya existen lo
-- toman sin backfill, así que nadie ve un cambio por el solo hecho de aplicar esto: quien no entre
-- a Preferencias sigue teniendo el logo de toda la vida.
-- ============================================================================

-- 1 · La columna -------------------------------------------------------------
alter table public.user_preferences
  add column if not exists logo_view text not null default 'inicio';

-- 2 · El conjunto de valores válidos: una clave de módulo, sin 'ultimo' -------
-- Se barre por definición y no por nombre, como en la 0097 y la 0105: si esta migración se corre
-- dos veces, el `add constraint` de abajo fallaría por nombre duplicado sin este barrido, y la
-- idempotencia es lo que permite reintentar el bloque entero.
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
       and pg_get_constraintdef(con.oid) ilike '%logo_view%'
  loop
    execute format('alter table public.user_preferences drop constraint %I', c.conname);
  end loop;
end
$migracion$;

alter table public.user_preferences
  add constraint user_preferences_logo_view_valido
  check (logo_view in ('inicio', 'track', 'pharma', 'lab', 'contable'));

comment on column public.user_preferences.logo_view is
  'A dónde lleva el logo del top bar: clave de módulo (inicio | track | pharma | lab | contable). Sin ultimo a propósito: ver 0106. 0106.';

comment on column public.user_preferences.home_view is
  'Dónde ABRE Spira al entrar: clave de módulo (inicio | track | pharma | lab | contable) o ultimo (el último usado en esa máquina). El destino del logo es logo_view, aparte. 0093, ampliado en 0105, acotado a su sentido original en 0106.';
