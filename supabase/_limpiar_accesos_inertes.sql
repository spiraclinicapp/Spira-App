-- ============================================================================
-- Spira · Limpieza de los accesos INERTES a Lab y Contable  (one-off, NO es migración)
-- ----------------------------------------------------------------------------
-- Borra las filas de `user_module_roles` de los módulos `lab` y `contable`.
--
-- NO ES UNA MIGRACIÓN: no lleva número, no va en `migrations/` y no se registra en el índice de
-- `supabase/README.md`. Es un script de datos, de una sola vez, al lado de `_reset_dev.sql`.
--
-- ── POR QUÉ ──
-- Esos dos módulos están marcados `proximamente` en el registro del front: NO le aparecen a nadie
-- en el riel, tenga el rol que tenga. O sea que un "Lab · Administrador" no le da absolutamente
-- nada a la persona que lo tiene — es un acceso inerte, probablemente heredado de cuando se
-- crearon las cuentas.
--
-- Desde el 2026-09-07 la consola de accesos ya no los ofrece (`MODULOS_ASIGNABLES` filtra los
-- `proximamente`), así que estos son los últimos: no se pueden volver a crear desde la app. Lo que
-- quedaba era el dato viejo, que la lista del equipo seguía mostrando como un chip más — y un chip
-- que dice "Lab · Administrador" al lado de uno que dice "Farmacia · Líder" promete algo que no
-- existe.
--
-- Se eligió BORRAR y no esconder (decisión del Director, 2026-09-07): filtrar el chip habría
-- dejado el acceso en la base, invisible en la vista general. Un acceso que existe se muestra; el
-- arreglo es que deje de existir.
--
-- ⚠️ ESTO ES PRODUCCIÓN, y es un borrado POR CATEGORÍA — exactamente la forma que una vez costó
--    data real en este repo. Por eso el paso 1 no borra nada: mirá la lista y recién después corré
--    el paso 2. Si lo que ves no es lo que esperabas, PARÁ.
--
-- ✅ RECUPERABLE: `trg_audit_module_roles` (0003) escribe cada DELETE en `audit_log` con la fila
--    completa en `before_data`. Si hiciera falta reponer alguno, sale de ahí. Ojo: corriendo esto
--    como `postgres` desde el editor, `auth.uid()` es null y el `actor_id` queda vacío, así que en
--    el historial de la ficha va a leerse como "El sistema le quitó el acceso a Lab a Fulana".
--    Es correcto: no lo hizo una persona desde la app.
--
-- Las sentencias NO comparten sesión ni transacción en el editor de Supabase. Cada paso es
-- independiente y se pega solo.
-- ============================================================================


-- ── PASO 1 · MIRAR (no borra nada) ─────────────────────────────────────────────────────────────
-- Quién tiene qué. Si esto devuelve cero filas, ya está limpio y no hay nada que hacer.
select u.full_name,
       u.email,
       r.module,
       r.role
  from public.user_module_roles r
  join public.users u on u.id = r.user_id
 where r.module in ('lab', 'contable')
 order by u.full_name, r.module;


-- ── PASO 2 · BORRAR ────────────────────────────────────────────────────────────────────────────
-- Correr SOLO después de leer el paso 1 y estar de acuerdo con lo que lista.
-- Idempotente: si ya se corrió, toca cero filas.
delete from public.user_module_roles
 where module in ('lab', 'contable');


-- ── PASO 3 · CONFIRMAR ─────────────────────────────────────────────────────────────────────────
-- Tiene que devolver 0. Si devuelve algo, el paso 2 no corrió o alguien volvió a insertar.
select count(*) as accesos_inertes_que_quedan
  from public.user_module_roles
 where module in ('lab', 'contable');
