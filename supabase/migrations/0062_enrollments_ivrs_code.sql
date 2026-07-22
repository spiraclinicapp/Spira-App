-- 0062_enrollments_ivrs_code.sql
-- N° de sujeto IVRS por inscripción. Una persona en dos estudios (p. ej. un
-- pivotal + su extensión LTS a largo plazo) tiene DOS IVRS: uno por enrollment.
-- patients.code guarda el del estudio madre; este campo, el de cada enrollment.
alter table public.enrollments
  add column if not exists ivrs_code text;

comment on column public.enrollments.ivrs_code is
  'Número de sujeto IVRS de ESTE enrollment (por estudio). Distinto de patients.code (IVRS del estudio madre). Nullable: puede faltar antes de randomización.';

-- Unicidad por protocolo, tolerante a legacy: las filas viejas con ivrs_code NULL
-- conviven porque el índice parcial (where ... is not null) no las indexa.
create unique index if not exists enrollments_protocol_ivrs_uq
  on public.enrollments (protocol_id, ivrs_code)
  where ivrs_code is not null;
