-- Spira · Migración 0011 — Descripción del protocolo
--
-- Contexto: la mejora visual del selector de protocolos suma una descripción corta y
-- libre por protocolo (ej. "Asma leve", "EPOC"). Se muestra recortada a una línea en la
-- card y completa al abrir el protocolo. Campo libre y nullable: es una pista legible,
-- no la indicación formal del estudio (puede reusarse para otra cosa).
--
-- Sin impacto en RLS: 'description' viaja con la fila de protocols, cuya policy de SELECT
-- ya scopea quién ve cada protocolo. No es dato sensible.

alter table public.protocols
  add column if not exists description text;

comment on column public.protocols.description is
  'Descripción/pista corta y libre del protocolo (ej. "Asma leve"). Se muestra recortada en la card.';

-- Seed de demostración: solo toca los protocolos demo conocidos y solo si están vacíos.
update public.protocols set description = 'Asma leve'  where code = 'EFC18244' and description is null;
update public.protocols set description = 'Asma grave' where code = 'EFC18419' and description is null;
update public.protocols set description = 'EPOC'       where code = 'ACT18301' and description is null;
