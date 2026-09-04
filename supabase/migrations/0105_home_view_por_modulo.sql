-- Spira · Migración 0105 — La pantalla de inicio puede ser cualquier módulo
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0104. IDEMPOTENTE.
-- ----------------------------------------------------------------------------
-- ADITIVA: sólo ENSANCHA el check de `user_preferences.home_view`. Ninguna fila existente deja de
-- ser válida (los dos valores viejos, 'inicio' y 'ultimo', siguen adentro) y ningún front
-- desplegado escribe los valores nuevos, así que va ANTES del deploy: el que no funciona sin ella
-- es el front nuevo. Al revés, quien eligiera "Farmacia" como inicio se comería un 23514 al
-- guardar — y como en Preferencias cada control guarda solo, el error saldría en pantalla en el
-- mismo momento de elegirlo. Mismo caso, misma forma y mismo razonamiento que la 0097.
--
-- QUÉ CAMBIA PARA EL USUARIO. Hasta ahora "Página de inicio" tenía dos opciones (Inicio / el último
-- módulo) y sólo gobernaba el ARRANQUE de la sesión. Pasa a admitir cualquier módulo del shell, y
-- además de decidir dónde abre Spira decide a dónde lleva el logo del top bar. Pedido del Director,
-- 2026-09-04: "quiero que se pueda elegir a dónde lleva el botón home".
--
-- POR QUÉ NO HIZO FALTA UNA COLUMNA NUEVA: 'inicio' YA ERA la clave de un módulo (`MODULES` en
-- `modules/registry.ts` lo lista primero). Así que el conjunto de valores válidos no es "los dos de
-- antes más una cosa distinta", sino "una clave de módulo, o 'ultimo'" — y las filas viejas ya
-- cumplen esa forma sin traducir nada.
--
-- POR QUÉ 'lab' Y 'contable' ENTRAN AHORA, si todavía no se pueden abrir: para que estrenarlos sea
-- sacar un flag del registro y no acordarse de una migración. El front no los ofrece (los filtra
-- `modulosElegibles`, en `lib/home.ts`) y si alguien fuerza el valor a mano, `resolveHome` degrada
-- a Inicio. El check acota lo que se puede GUARDAR; quién puede abrir qué lo decide la app.
--
-- POR QUÉ NO ENTRA 'gerencia', que sí es un valor del enum `spira_module`: no es un módulo del
-- shell. No tiene entrada en `MODULES` ni submódulos, así que no hay ninguna pantalla a la que
-- pudiera llevar. Es un ámbito de permisos, no un lugar.
--
-- EL CHECK NO SE ATA AL ENUM `spira_module` (0001) a propósito. Tendría que aceptar además
-- 'inicio' y 'ultimo', que no son módulos del enum, y rechazar 'gerencia', que sí lo es: la
-- coincidencia sería parcial en las dos direcciones, o sea peor que la lista explícita.
-- ============================================================================

-- 1 · Fuera todo check viejo sobre la columna, se llame como se llame -------------
-- El de la 0093 quedó con el nombre que le puso Postgres al check inline de la columna. Igual que
-- en la 0097, no se adivina: se barre cualquier check de la tabla que mencione `home_view`. Dejar
-- vivo el viejo por un nombre que no coincide sería aplicar esta migración "con éxito" y que los
-- valores nuevos siguieran rebotando.
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
       and pg_get_constraintdef(con.oid) ilike '%home_view%'
  loop
    execute format('alter table public.user_preferences drop constraint %I', c.conname);
  end loop;
end
$migracion$;

-- 2 · El conjunto de valores válidos: una clave de módulo, o 'ultimo' ---------
alter table public.user_preferences
  add constraint user_preferences_home_view_valido
  check (home_view in ('ultimo', 'inicio', 'track', 'pharma', 'lab', 'contable'));

comment on column public.user_preferences.home_view is
  'Dónde abre Spira y a dónde lleva el logo: clave de módulo (inicio | track | pharma | lab | contable) o ultimo (el último usado en esa máquina). 0093, ampliado en 0105.';
