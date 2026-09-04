-- ============================================================================
-- Script de DATOS (no es una migración: no va numerado ni cambia el schema).
--
-- QUÉ HACE: asigna la cuenta de la coordinadora al protocolo LTS17231, para poder
-- verificar el ámbito "Lo mío" / "Todo" del Resumen de Coordinación con datos reales.
-- Hoy esa cuenta sólo coordina PROT-A ("Protocolo A (demo)"), que tiene 0 pacientes,
-- así que "Lo mío" y "Todo" muestran lo mismo (nada) y el filtro no se puede probar.
--
-- POR QUÉ VA A MANO: el front sólo LEE `protocol_coordinators` (`data/protocols.ts:99` y el
-- RPC `list_protocol_coordinators` de la 0038). No hay ninguna pantalla ni RPC que asigne un
-- coordinador a un protocolo, así que no hay forma de hacerlo desde la app.
--
-- ES REVERSIBLE: el bloque 3 deshace exactamente esta fila y nada más.
--
-- Cada sentencia es autocontenida (resuelve el protocolo por su `code` en una subconsulta):
-- el editor SQL de Supabase NO comparte sesión entre sentencias de un mismo bloque, así que
-- no se puede apoyar en una tabla temporal ni en una transacción que abarque todo.
-- ============================================================================


-- 1 · ASIGNAR ---------------------------------------------------------------------------
-- Idempotente por el `unique (protocol_id, user_id)` de la 0002: correrlo dos veces no
-- duplica ni falla.
insert into public.protocol_coordinators (protocol_id, user_id)
select p.id, 'f765cfdc-b822-4cb3-ad10-4e5f05d7d67d'::uuid
from public.protocols p
where p.code = 'LTS17231'
on conflict (protocol_id, user_id) do nothing;


-- 2 · VERIFICAR -------------------------------------------------------------------------
-- Tiene que devolver DOS filas: PROT-A (la que ya tenía) y LTS17231 (la nueva).
select p.code as protocolo, p.name, u.full_name as coordinadora, pc.assigned_at
from public.protocol_coordinators pc
join public.protocols p on p.id = pc.protocol_id
join public.users     u on u.id = pc.user_id
where pc.user_id = 'f765cfdc-b822-4cb3-ad10-4e5f05d7d67d'::uuid
order by pc.assigned_at;


-- 3 · REVERTIR (correr SOLO cuando la verificación esté hecha) --------------------------
-- Acotado a UNA fila: este usuario y este protocolo. No es un borrado por categoría.
-- delete from public.protocol_coordinators
-- where user_id = 'f765cfdc-b822-4cb3-ad10-4e5f05d7d67d'::uuid
--   and protocol_id = (select id from public.protocols where code = 'LTS17231');
