-- Spira · Migración 0093 — Preferencias del usuario ("Ajustes › Preferencias")
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0092. IDEMPOTENTE.
-- ----------------------------------------------------------------------------
-- ADITIVA: tabla nueva, sin tocar nada existente. Ningún front desplegado la consulta,
-- así que se aplica ANTES del deploy (el que no funciona sin ella es el front nuevo).
--
-- POR QUÉ EN LA BASE Y NO EN EL NAVEGADOR. El tema ya se guardaba en localStorage y "funcionaba",
-- pero en una clínica donde dos coordinadoras comparten la misma computadora eso quiere decir que
-- comparten las preferencias: la que entra segunda hereda el tema de la primera. Una preferencia
-- que en realidad es de la MÁQUINA y no de la PERSONA es una mentira chica que se nota todos los
-- días. Acá se arregla, y de paso viajan si entrás desde otra máquina del centro.
--
-- COLUMNAS TIPADAS Y NO UN jsonb: cada preferencia tiene un conjunto CERRADO de valores válidos y
-- la base los hace cumplir con un check. Un jsonb sin esquema es texto libre disfrazado, que es lo
-- contrario de la regla de "desplegables, no texto libre" del proyecto. El costo es que agregar una
-- preferencia nueva es una migración: aceptado a propósito.
--
-- SIN RPC: no hay autorización que resolver del lado del servidor — cada quien escribe SU fila y
-- nada más, y eso lo dice la RLS sola. Los RPC de este proyecto existen donde hay reglas que no se
-- pueden saltear (la ventana de 30 días del perfil) o escrituras atómicas de varias tablas.
-- ============================================================================

-- 1 · Tabla ------------------------------------------------------------------
-- Los defaults son los valores vigentes HOY, así que una fila nueva (o su ausencia) describe
-- exactamente el comportamiento actual: nadie ve un cambio por el solo hecho de aplicar esto.
create table if not exists public.user_preferences (
  user_id     uuid primary key references public.users(id) on delete cascade,
  -- Preferencia de tema, no el tema resuelto: 'sistema' tiene que poder seguir al sistema operativo.
  theme       text not null default 'light'  check (theme       in ('light', 'dark', 'system')),
  date_format text not null default 'dmy'    check (date_format in ('dmy', 'iso')),
  -- Dónde abre Spira al entrar: el Inicio, o el último módulo que estabas usando.
  home_view   text not null default 'inicio' check (home_view   in ('inicio', 'ultimo')),
  updated_at  timestamptz not null default now()
);

comment on table  public.user_preferences             is 'Preferencias de interfaz por usuario. Una fila por persona, escrita por ella misma. 0093.';
comment on column public.user_preferences.theme       is 'Preferencia de tema (NO el resuelto): light | dark | system. 0093.';
comment on column public.user_preferences.date_format is 'Formato de fecha en pantalla: dmy (31/12/2026) | iso (2026-12-31). 0093.';
comment on column public.user_preferences.home_view   is 'Pantalla de arranque: inicio | ultimo (el último módulo usado). 0093.';

-- 2 · updated_at por trigger (reusa el helper de 0003) ------------------------
drop trigger if exists trg_user_preferences_updated_at on public.user_preferences;
create trigger trg_user_preferences_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- 3 · RLS: cada quien, la suya --------------------------------------------------
-- `for all` cubre select/insert/update/delete con la misma regla, que acá es la correcta: la fila
-- es tuya o no existe para vos. Sin excepción de gerencia a propósito — el tema de otra persona no
-- es información que un administrador necesite, y agregarla sería ampliar el alcance sin motivo.
alter table public.user_preferences enable row level security;

drop policy if exists "preferencias propias" on public.user_preferences;
create policy "preferencias propias" on public.user_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4 · Grants -----------------------------------------------------------------
grant select, insert, update, delete on public.user_preferences to authenticated;
