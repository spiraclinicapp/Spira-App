-- Spira · Migración 0154 — Quien da de alta un estudio queda asignado a él.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0153. IDEMPOTENTE.
--
-- ⚠️ ADITIVA: va ANTES del deploy del front. Ningún front viejo depende de ella, y el front nuevo sí:
--    sin la asignación, el estudio recién creado no aparece en la grilla de quien lo creó.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- POR QUÉ. Coordinación › Estudios y pacientes deja de tener el alternador «Mis estudios / Todos»
-- (critique del 2026-10-09). «Todos» mostraba los estudios ajenos con «0 pacientes»: la RLS de los
-- protocolos (0028) le deja ver todos a jefatura, pero la de los pacientes (0006) sólo los de sus
-- estudios, así que el cero no era un dato sino falta de acceso. Ahora la grilla muestra sólo los
-- estudios cuyos pacientes ves; los demás se gestionan desde Ajustes › Estudios del centro.
--
-- El alta de un protocolo era lo único que dependía de «Todos»: el estudio nuevo no estaba asignado a
-- nadie, y el front pasaba solo a «Todos» para que se viera. Sin el alternador quedaría invisible para
-- quien acaba de crearlo — y para un operador, que la policy "lideres crean protocolos" deja crear pero
-- "ver protocolos asignados" no deja leer, ya lo era: creaba un estudio y no lo podía abrir.
--
-- EL ARREGLO. Un trigger que, al insertar un protocolo, asigna a quien lo insertó. SECURITY DEFINER
-- porque la policy "lideres asignan" (0009) pide líder y crear un protocolo lo puede un operador.
--   · Se usa `auth.uid()` y no `new.created_by`: ése lo manda el front, y confiar en él dejaría
--     asignarle un estudio a otra persona poniendo su id en el insert.
--   · Gerencia NO se asigna: ya ve todos los pacientes, y una asignación de más le cambiaría lo que el
--     Resumen cuenta como «Lo mío».
--   · Sin sesión (un insert desde el editor de SQL, como postgres) no hay a quién asignar: se saltea.
-- La asignación queda en el historial de accesos como cualquier otra: la registra
-- trg_audit_protocol_coordinators (0110).
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

create or replace function public.asignar_estudio_a_quien_lo_crea()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or public.has_module('gerencia') then
    return new;
  end if;

  insert into public.protocol_coordinators (protocol_id, user_id)
  values (new.id, v_uid)
  on conflict (protocol_id, user_id) do nothing;

  return new;
end;
$fn$;

comment on function public.asignar_estudio_a_quien_lo_crea() is
  'Trigger de protocols: asigna el estudio recién creado a quien lo creó (auth.uid(), no created_by), '
  'salvo gerencia, que ya ve todo. Reemplaza el salto a «Todos» que hacía el front al dar de alta. 0154.';

drop trigger if exists trg_asignar_estudio_a_quien_lo_crea on public.protocols;
create trigger trg_asignar_estudio_a_quien_lo_crea
  after insert on public.protocols
  for each row execute function public.asignar_estudio_a_quien_lo_crea();
