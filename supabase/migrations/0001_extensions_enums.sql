-- Spira · Migración 0001 — Extensiones + enums

-- ============================================================================
-- 0 · EXTENSIONES
-- ============================================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";


-- ============================================================================
-- 1 · ENUMS
-- Valores cerrados. Para agregar: ALTER TYPE <nombre> ADD VALUE '<valor>';
-- ============================================================================

-- Módulos de la plataforma (cada uno es un "espacio" en el shell)
create type spira_module as enum (
  'track',      -- coordinación clínica
  'pharma',     -- farmacia de investigación
  'lab',        -- laboratorio (futuro)
  'contable',   -- facturación / liquidación a sponsors
  'gerencia'    -- dirección / reportes
);

-- Nivel de acceso DENTRO de un módulo (uno por persona por módulo)
create type module_role as enum (
  'viewer',     -- solo lectura
  'operator',   -- operación estándar (coordinadora, empleada de farmacia)
  'leader',     -- coordinadora líder / farmacéutica responsable
  'admin'       -- acceso total al módulo
);

-- Entidad legal para imputación contable (a quién se factura)
create type legal_entity as enum (
  'fuca',
  'fundacion_scherbovsky',
  'protocolo_particular'
);

create type protocol_status   as enum ('activo', 'pausado', 'cerrado');
create type patient_status     as enum ('activo', 'inactivo');
create type enrollment_status  as enum ('screening', 'activo', 'completado', 'discontinuado');
create type visit_type         as enum ('presencial', 'telefonica');

-- Estados de visita. NO se almacenan: este tipo lo usa la vista v_patient_visits
-- como tipo de retorno del cálculo. Documentado acá como contrato.
create type visit_status as enum (
  'futura',          -- hoy < window_start
  'proxima',         -- window_start <= hoy <= window_end, sin realizar
  'realizada',       -- tiene real_date, checklist con ítems pendientes (en plazo)
  'completa',        -- tiene real_date, checklist sin pendientes
  'item_vencido',    -- tiene real_date, hay ítem de checklist vencido sin completar
  'ventana_vencida'  -- hoy > window_end, sin realizar
);

-- Ciclo de la SOLICITUD (la crea la coordinadora desde Track)
create type request_status as enum (
  'solicitada',   -- recibida, esperando a la farmacéutica (PENDIENTE)
  'atendida',     -- la farmacéutica generó una dispensación
  'rechazada',    -- la farmacéutica la rechazó (ver rejection_reason)
  'cancelada'     -- la coordinadora la dio de baja antes de atenderse
);

-- Ciclo de la DISPENSACIÓN ejecutada (la maneja la farmacéutica) — REALTIME
create type dispensation_status as enum (
  'en_preparacion', -- la farmacéutica la tomó y prepara la medicación
  'lista',          -- lista para retirar
  'entregada'       -- retirada y entregada (descuenta stock)
);

-- De dónde salieron los datos de la solicitud (para el pre-llenado IVRS)
create type dispensation_source as enum (
  'ivrs',    -- extraído de PDF de IVRS via Edge Function + Claude API
  'base',    -- esquema base del protocolo
  'manual'   -- cargado a mano por la coordinadora
);

create type reception_status as enum ('pendiente', 'verificada', 'con_observaciones');

create type stock_movement_type as enum (
  'recepcion',     -- ingreso por recepción del sponsor (+)
  'dispensacion',  -- egreso por dispensación entregada (-)
  'ajuste_manual', -- ajuste de la farmacéutica (±, requiere motivo)
  'devolucion',    -- devolución de medicación (+)
  'vencimiento'    -- baja por vencimiento (-)
);
