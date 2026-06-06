-- Spira · Migración 0002 — Tablas (identidad, Track, Pharma, auditoría)

-- ============================================================================
-- 2 · IDENTIDAD Y ACCESO
-- ============================================================================

-- Perfil. La autenticación (email/password) la maneja Supabase Auth.
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.users is 'Perfil de usuario. Credenciales en auth.users (Supabase Auth).';

-- Una persona puede operar varios módulos con distinto rol en cada uno.
create table public.user_module_roles (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.users(id) on delete cascade,
  module     spira_module not null,
  role       module_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, module)            -- un rol por módulo por persona
);
comment on table public.user_module_roles is 'Qué módulos usa cada persona y con qué nivel. Spina del RBAC.';


-- ============================================================================
-- 3 · TRACK · Protocolos, pacientes, enrolamientos
-- ============================================================================

create table public.protocols (
  id           uuid primary key default uuid_generate_v4(),
  code         text not null unique,        -- "ACT18301", "ENDURA", "CQMF149G2301"
  name         text not null,
  sponsor      text,                        -- "Roche", "Novartis", ...
  legal_entity legal_entity not null,       -- a quién imputa contable
  status       protocol_status not null default 'activo',
  created_by   uuid not null references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.protocols is 'Ensayos clínicos. Solo líderes de track pueden crear/editar.';

-- Qué coordinadoras ven qué protocolos (scoping de datos por usuario).
create table public.protocol_coordinators (
  id          uuid primary key default uuid_generate_v4(),
  protocol_id uuid not null references public.protocols(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (protocol_id, user_id)
);
comment on table public.protocol_coordinators is 'Asignación coordinadora ↔ protocolo. Define qué pacientes ve cada una.';

create table public.patients (
  id         uuid primary key default uuid_generate_v4(),
  code       text not null unique,    -- identificación sin nombre (apto código de barras)
  full_name  text not null,
  birth_date date,
  status     patient_status not null default 'activo',
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.patients is 'Paciente. Puede estar en varios protocolos (ver enrollments).';

-- Vínculo paciente ↔ protocolo. Al insertar, un trigger genera las visitas.
create table public.enrollments (
  id              uuid primary key default uuid_generate_v4(),
  patient_id      uuid not null references public.patients(id) on delete restrict,
  protocol_id     uuid not null references public.protocols(id) on delete restrict,
  enrolled_by        uuid not null references public.users(id),  -- quién registró el enrolamiento (auditoría)
  treating_physician text,                                       -- médico tratante (Track: medico)
  enrollment_date    date not null,                              -- ancla para generar las visitas
  status             enrollment_status not null default 'activo',
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (patient_id, protocol_id)
);
comment on table public.enrollments is 'Paciente en un protocolo. Genera patient_visits automáticamente (trigger).';


-- ============================================================================
-- 4 · TRACK · Esquema de visitas y visitas concretas
-- ============================================================================

-- Esquema del protocolo (viene del sponsor): cada visita con su offset y ventana.
create table public.visit_definitions (
  id                  uuid primary key default uuid_generate_v4(),
  protocol_id         uuid not null references public.protocols(id) on delete cascade,
  code                text,                       -- "V1", "CT1" (display corto)
  name                text not null,              -- "Screening", "Baseline"
  visit_type          visit_type not null default 'presencial',
  date_mode           text not null default 'automatica' check (date_mode in ('libre','automatica')),
  anchor_visit_def_id uuid references public.visit_definitions(id) on delete set null, -- null = ancla al enrolamiento
  offset_days         integer not null default 0, -- días desde el ancla
  window_minus        integer not null default 0, -- ventana antes (días)
  window_plus         integer not null default 0, -- ventana después (días)
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now()
);
comment on table public.visit_definitions is 'Esquema de visitas por protocolo. offset+ventana. La generación actual ancla todo al enrolamiento (como Track/utils.js); anchor_visit_def_id queda para agendado relativo futuro.';

-- Catálogo OPCIONAL de actividades/procedimientos típicos de un protocolo.
-- suggested_order es NULLABLE: sugiere un orden, NO lo impone (los eventos
-- reales se registran libres en patient_timeline). Soporta la "zona sin orden".
create table public.protocol_activities (
  id              uuid primary key default uuid_generate_v4(),
  protocol_id     uuid not null references public.protocols(id) on delete cascade,
  visit_def_id    uuid references public.visit_definitions(id) on delete cascade, -- null = aplica a cualquier visita
  name            text not null,
  suggested_order integer,            -- NULLABLE a propósito
  requires_dispensation boolean not null default false,
  created_at      timestamptz not null default now()
);
comment on table public.protocol_activities is 'Actividades sugeridas por protocolo. suggested_order nullable: sugiere sin forzar.';

-- Visitas concretas del paciente. SIN columna status: se calcula (v_patient_visits).
-- window_start/end SÍ se guardan: son el ancla del cálculo, no el resultado.
create table public.patient_visits (
  id             uuid primary key default uuid_generate_v4(),
  enrollment_id  uuid not null references public.enrollments(id) on delete cascade,
  visit_def_id   uuid not null references public.visit_definitions(id) on delete restrict,
  estimated_date date not null,            -- fecha teórica (enrollment + offset)
  real_date      date,                     -- fecha real de realización (null = no realizada)
  window_start   date not null,            -- límite inferior de ventana
  window_end     date not null,            -- límite superior de ventana
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.patient_visits is 'Visitas por paciente. El status NO se almacena: ver vista v_patient_visits.';


-- ============================================================================
-- 5 · TRACK · Checklists (plantilla → instancia)
-- ============================================================================

-- Plantilla madre global (protocol_id NULL) + plantillas por protocolo.
create table public.checklist_templates (
  id          uuid primary key default uuid_generate_v4(),
  protocol_id uuid references public.protocols(id) on delete cascade, -- NULL = global
  name        text not null,
  created_at  timestamptz not null default now()
);
comment on table public.checklist_templates is 'Plantillas de checklist. protocol_id NULL = plantilla global base.';

create table public.checklist_template_items (
  id             uuid primary key default uuid_generate_v4(),
  template_id    uuid not null references public.checklist_templates(id) on delete cascade,
  description    text not null,
  deadline_hours integer not null default 0 check (deadline_hours in (0, 48, 168)),
  mandatory      boolean not null default true,   -- 'obligatorio' en Track: solo estos pesan en el estado
  sort_order     integer not null default 0
);
comment on table public.checklist_template_items is 'Ítems de plantilla. deadline_hours: 0=inmediato, 48=2 días, 168=7 días. mandatory = obligatorio.';

-- Instancia: se materializa al marcar la visita realizada (trigger).
create table public.checklist_items (
  id               uuid primary key default uuid_generate_v4(),
  visit_id         uuid not null references public.patient_visits(id) on delete cascade,
  template_item_id uuid references public.checklist_template_items(id) on delete set null,
  description      text not null,
  deadline_hours   integer not null default 0,
  mandatory        boolean not null default true,   -- solo los obligatorios afectan el estado de la visita
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);

create table public.checklist_completions (
  id           uuid primary key default uuid_generate_v4(),
  item_id      uuid not null references public.checklist_items(id) on delete cascade,
  completed_by uuid not null default auth.uid() references public.users(id),  -- default = quien completa (anti-spoofing)
  completed_at timestamptz not null default now(),
  notes        text,
  unique (item_id)                      -- un ítem se completa una sola vez
);
comment on table public.checklist_completions is 'Quién completó cada ítem y cuándo. Auditable.';

-- Notas libres por día en la agenda semanal.
create table public.agenda_notes (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null default auth.uid() references public.users(id) on delete cascade,  -- default = autor (anti-spoofing)
  note_date  date not null,
  content    text not null,
  created_at timestamptz not null default now()
);


-- ============================================================================
-- 6 · TIMELINE · Log de eventos genérico (el corazón del flujo)
-- ----------------------------------------------------------------------------
-- Reemplaza el WhatsApp entre sectores. Cada acción de la visita es UN evento.
-- Sin columnas de estado: el orden vive en occurred_at. event_type es vocabulario
-- ABIERTO (texto), no enum, para no forzar el flujo. Tabla insert-only (audit).
-- event_type comunes: 'checkin', 'procedimiento', 'solicitud_dispensacion',
--   'dispensacion_lista', 'retiro_medicacion', 'entrega_dispensacion', 'checkout'.
-- metadata lleva el payload propio de cada tipo (ej. dispensation_id, activity_id).
-- ============================================================================
create table public.patient_timeline (
  id          uuid primary key default uuid_generate_v4(),
  visit_id    uuid not null references public.patient_visits(id) on delete cascade,
  actor_id    uuid not null default auth.uid() references public.users(id),  -- default = quien inserta (anti-spoofing)
  event_type  text not null,
  activity_id uuid references public.protocol_activities(id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.patient_timeline is 'Log de eventos de la visita. Insert-only. event_type abierto. Orden en occurred_at.';


-- ============================================================================
-- 7 · PHARMA · Medicación, lotes y stock
-- ============================================================================

-- El medicamento como catálogo (por protocolo). El stock NO vive acá: vive en lotes.
create table public.medications (
  id                  uuid primary key default uuid_generate_v4(),
  protocol_id         uuid not null references public.protocols(id) on delete restrict,
  name                text not null,
  unit                text not null,            -- "comprimidos", "ml", "viales"
  low_stock_threshold integer not null default 5,
  created_by          uuid not null references public.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.medications is 'Catálogo de medicación por protocolo. El stock está en medication_lots.';

-- Stock real, por lote, con su vencimiento. total de un medicamento = suma de lotes.
create table public.medication_lots (
  id               uuid primary key default uuid_generate_v4(),
  medication_id    uuid not null references public.medications(id) on delete restrict,
  lot_number       text not null,
  expiry_date      date,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (medication_id, lot_number),
  unique (id, medication_id)              -- soporta el FK compuesto de dispensation_items / stock_movements
);
comment on table public.medication_lots is 'Stock por lote. quantity_on_hand >= 0 impide sobre-dispensar.';

-- Recepción de medicación del sponsor. Al verificar, ingresa stock (trigger).
create table public.medication_receptions (
  id             uuid primary key default uuid_generate_v4(),
  protocol_id    uuid not null references public.protocols(id) on delete restrict,
  received_by    uuid not null references public.users(id),
  reception_date date not null,
  status         reception_status not null default 'pendiente',
  verified_by    uuid references public.users(id),   -- quién verificó (se sella al pasar a 'verificada')
  verified_at    timestamptz,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.reception_items (
  id            uuid primary key default uuid_generate_v4(),
  reception_id  uuid not null references public.medication_receptions(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete restrict,
  lot_number    text not null,
  expiry_date   date,
  quantity      integer not null check (quantity > 0),
  unique (reception_id, medication_id, lot_number)   -- un lote una sola vez por recepción (evita doble carga)
);
comment on table public.medication_receptions is 'Recepción del sponsor. status=verificada → ingresa a lotes (trigger).';


-- ============================================================================
-- 8 · PHARMA · Dispensación (Track solicita → Pharma ejecuta)
-- ============================================================================

-- La crea la COORDINADORA desde Track, en el contexto de una visita.
create table public.dispensation_requests (
  id            uuid primary key default uuid_generate_v4(),
  visit_id      uuid not null references public.patient_visits(id) on delete restrict,
  requested_by  uuid not null default auth.uid() references public.users(id),    -- coordinadora (default = quien crea)
  status        request_status not null default 'solicitada',
  source        dispensation_source not null default 'manual',
  rejection_reason text,                                       -- si status = rechazada
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.dispensation_requests is 'Solicitud creada por la coordinadora (Track). Viaja a Pharma. REALTIME.';

create table public.dispensation_request_items (
  id            uuid primary key default uuid_generate_v4(),
  request_id    uuid not null references public.dispensation_requests(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete restrict,
  quantity      integer not null check (quantity > 0)
);

-- La ejecuta la FARMACÉUTICA desde Pharma a partir de una solicitud aprobada.
create table public.dispensations (
  id                 uuid primary key default uuid_generate_v4(),
  request_id         uuid not null references public.dispensation_requests(id) on delete restrict,
  executed_by        uuid not null default auth.uid() references public.users(id),   -- farmacéutica (default = quien ejecuta)
  correlative_number serial,                                       -- N° de comprobante
  status             dispensation_status not null default 'en_preparacion',
  delivered_at       timestamptz,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.dispensations is 'Dispensación ejecutada por farmacéutica. correlative_number = comprobante. REALTIME.';

-- Renglones de la dispensación. lot_id dice de QUÉ lote salió (trazabilidad).
-- lot_number/expiry_date se copian como snapshot para el comprobante impreso.
create table public.dispensation_items (
  id              uuid primary key default uuid_generate_v4(),
  dispensation_id uuid not null references public.dispensations(id) on delete cascade,
  medication_id   uuid not null references public.medications(id) on delete restrict,
  lot_id          uuid not null references public.medication_lots(id) on delete restrict,
  quantity        integer not null check (quantity > 0),  -- puede diferir de lo solicitado
  lot_number      text,                                   -- snapshot para el comprobante
  expiry_date     date,                                   -- snapshot para el comprobante
  -- el lote debe pertenecer al MISMO medicamento (coherencia de trazabilidad)
  constraint fk_disp_item_lot_med foreign key (lot_id, medication_id)
    references public.medication_lots (id, medication_id) on delete restrict
);

-- Movimientos de stock: inmutable, nunca se borra. Audit trail de ANMAT.
-- Generado automáticamente por recepciones y dispensaciones (triggers).
create table public.stock_movements (
  id             uuid primary key default uuid_generate_v4(),
  medication_id  uuid not null references public.medications(id) on delete restrict,
  lot_id         uuid,                       -- nullable (ajuste_manual puede no tener lote)
  movement_type  stock_movement_type not null,
  quantity_delta integer not null,          -- (+) ingreso, (-) egreso
  reference_id   uuid,                       -- id de la dispensación / recepción origen
  reference_type text check (reference_type is null or reference_type in
                   ('reception','dispensation','ajuste_manual','devolucion','vencimiento')),
  reason         text,                       -- obligatorio para ajuste_manual
  created_by     uuid not null references public.users(id),
  created_at     timestamptz not null default now(),
  -- el lote (si hay) debe pertenecer al mismo medicamento; restrict protege el audit trail
  constraint fk_stock_mov_lot_med foreign key (lot_id, medication_id)
    references public.medication_lots (id, medication_id) on delete restrict
);
comment on table public.stock_movements is 'Audit trail de stock. Inmutable (solo insert). Requerido por ANMAT.';

-- Alertas configurables por protocolo (stock bajo, vencimiento, ventana próxima).
create table public.protocol_alerts (
  id              uuid primary key default uuid_generate_v4(),
  protocol_id     uuid not null references public.protocols(id) on delete cascade,
  alert_type      text not null,            -- 'stock_bajo' | 'vencimiento_proximo' | 'ventana_proxima'
  threshold_value integer,
  threshold_unit  text,                     -- 'dias' | 'unidades'
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);


-- ============================================================================
-- 9 · AUDITORÍA TRANSVERSAL
-- ----------------------------------------------------------------------------
-- Log imborrable de acciones sensibles. Insert-only. "Toda acción trazable".
-- Se llena vía trigger audit_row() sobre las tablas críticas.
-- ============================================================================
create table public.audit_log (
  id          uuid primary key default uuid_generate_v4(),
  actor_id    uuid references public.users(id),   -- null = acción del sistema
  action      text not null,                      -- INSERT | UPDATE | DELETE
  entity_type text not null,                      -- nombre de la tabla
  entity_id   uuid,
  before_data jsonb,
  after_data  jsonb,
  db_role     text,                          -- session_user: 'authenticator' (PostgREST) | 'postgres' (DML directo)
  occurred_at timestamptz not null default now()
);
comment on table public.audit_log is 'Auditoría transversal. Insert-only. Llenado por trigger audit_row().';
