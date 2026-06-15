-- Spira · Migración 0017 — Columnas nuevas de protocolo y paciente (tablero/ficha)
-- ----------------------------------------------------------------------------
-- El tablero del protocolo y la ficha del paciente muestran datos que hoy no se
-- almacenan. Se agregan como columnas nullable (sin impacto en la RLS, igual que
-- 0011). Los registros existentes quedan en null → el front muestra "—".
--
-- sex/fertility van como text + CHECK (no enum) para no acoplar a ALTER TYPE y
-- poder ajustar el vocabulario más adelante sin migración de tipo. El front
-- mapea los valores ascii a labels con acento.
-- ============================================================================

-- ── Protocolo: investigador principal, especialidad, código interno ─────────
alter table public.protocols
  add column if not exists principal_investigator text,  -- investigador principal (texto libre)
  add column if not exists specialty              text,  -- especialidad / área terapéutica
  add column if not exists internal_code          text;  -- código interno del sponsor (distinto de code)

comment on column public.protocols.principal_investigator is 'Investigador principal del protocolo (texto libre).';
comment on column public.protocols.specialty is 'Especialidad / área terapéutica.';
comment on column public.protocols.internal_code is 'Código interno del sponsor (distinto del code público).';

-- ── Paciente: sexo y fertilidad ─────────────────────────────────────────────
alter table public.patients
  add column if not exists sex text
    check (sex is null or sex in ('F', 'M', 'Otro')),
  add column if not exists fertility text
    check (fertility is null or fertility in ('fertil', 'no_fertil', 'esterilizado', 'posmenopausica', 'na'));

comment on column public.patients.sex is 'Sexo: F / M / Otro (nullable).';
comment on column public.patients.fertility is 'Fertilidad: fertil / no_fertil / esterilizado / posmenopausica / na (nullable). El front mapea a labels con acento.';
