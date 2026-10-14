# Semilla narrativa del demo (T2b) — la receta

> Relevada contra las migraciones 0001–0154 (la última definición de cada función), con cita a archivo y línea, el
> 2026-10-13, para escribir `scripts/demo/semilla.mjs`. Plan: [`plan-tutoriales.md`](plan-tutoriales.md), T2b.
> **Antes de escribir código, verificar las citas que se vayan a usar:** esto es un relevamiento, no código probado.

Cada paso «como X» va en una transacción con `set local role authenticated` +
`select set_config('request.jwt.claims', '{"sub":"<uid>","role":"authenticated"}', true)`, y `reset role` entre actores.
Fechas relativas al día de la corrida, **en hora AR** (H = hoy). Las cuentas se crean primero por la API admin (secret key).

## Lo que cambia el plan (leer primero)

- **A. Pharma operator no alcanza para el catálogo ni el stock.** `create_drug` (0032:210-218), `create_medication`
  (0043:15-33), `assign_medication_to_protocol` (0142:434-450), `create_reception` y `verify_reception` (0140:486-623)
  exigen **pharma leader**. Operator alcanza para `create_laboratorio` (0033:57-66) y `assign_patient_medication`
  (0141:316-366). → **Cuarta cuenta «Farmacéutica responsable» (pharma leader)**; la de los tutoriales sigue operator.
- **B. El cronograma (`visit_definitions`) lo carga gerencia o track ADMIN** (policy 0146:498-504), no track leader.
- **C. El catálogo de procedimientos nace VACÍO** en un proyecto nuevo: la siembra de la 0061 (0061:141-177) se saltea si
  no hay usuarios. Cargarlo después de crear las cuentas (como track leader/gerencia, policy 0146:373-375).
- **D. Las visitas históricas cerradas por RPC quedan con la hora de HOY**: `mark_arrived` (0067:114), `start_visit_attention`
  (0102:260) y `mark_ready_with_outcome` (0030:84) usan `now()`, y Visitas del día filtra por esas marcas
  (`src/data/dayVisitsFilter.ts:27-39`). Corregir las marcas al final (llegada 09:00, atención 09:15, fin 10:00, como
  `supabase/scripts/pacientes-prueba-real/generar.mjs:33-34`). **No** tocar las de hoy.
- **E. `enrollments.ivrs_code` no tiene RPC**: UPDATE directo como coordinadora asignada (policy 0146:242-243; unique por
  protocolo, 0062).
- **F. La primera gerencia va por INSERT directo** como postgres (`set_module_access` exige gerencia, 0096:118). Para que el
  actor de auditoría no quede null: `set local app.actor_id` (0003:199).

## Roles y cuentas

- `user_module_roles(user_id, module, role, ve_todos_los_estudios default true)`, unique `(user_id, module)` (0002:18-25,
  0139:49-50). Módulos `track | pharma | lab | contable | gerencia` (0001:16-22); roles `viewer < operator < leader < admin`
  (0009:18-39). Gerencia = cualquier fila con `module='gerencia'` (0096:148-149).
- Consola: `set_module_access(user, module, role, expected_role)` con compare-and-swap; sólo gerencia (0096:94-178).
- Alta: `handle_new_user` (0095:47-62) copia `full_name` de `user_metadata`. API admin con `email_confirm: true`.
- Coordinador del estudio: `protocol_coordinators`; lo pone solo el trigger de la 0154 cuando la coordinadora inserta el
  protocolo (0154:34-62; no si inserta gerencia). Alternativa: `set_protocol_access` (0110:105-177).

## La receta

**0 · API admin:** cuatro cuentas (los mails son del demo, ficticios):

| Cuenta | Nombre | Accesos |
|---|---|---|
| `coord@demo.spira` | Valeria Sosa | track leader (coordina ACME-301) |
| `farma@demo.spira` | Julieta Paz | pharma operator (la de los tutoriales) |
| `farmaresp@demo.spira` | Martín Ibarra | pharma leader (catálogo y stock) |
| `dir@demo.spira` | Dr. Andrés Ferro | gerencia (+ track admin para el cronograma) |

**1 · postgres:** `insert into user_module_roles(user_id, module, role) values (dir, 'gerencia', 'admin')`.

**2 · como dir:** `set_module_access` para coord (track leader), farma (pharma operator), farmaresp (pharma leader) y dir
(track admin).

**3 · como coord:** `insert into protocols(code, name, sponsor, legal_entity, created_by, description) values ('ACME-301',
'Estudio fase III de ACME-301 en EPOC', 'ACME Pharma', 'protocolo_particular', coord, 'EPOC')` (no hay RPC: el front
inserta directo, `src/data/protocols.ts:59`). La 0154 la deja como coordinadora. **La 0154 SÍ está en el demo** (154/154).

**4 · como dir:** cronograma en `visit_definitions` (`code` null, el título en `name`; `src/data/visitDefinitions.ts:128-136`):

| sort | name | date_mode | role | offset | ventana | dispenses |
|---|---|---|---|---|---|---|
| 0 | V1 Screening | libre | screening | -14 | 0/0 | no |
| 1 | V2 Randomización · Día 1 | libre | randomizacion | 0 | 0/0 | **sí** |
| 2 | V3 W4 | automatica | comun | 28 | ±3 | no |
| 3 | V4 W8 | automatica | comun | 56 | ±3 | no |
| 4 | V5 W12 EOT | automatica | comun | 84 | ±7 | no |

`dispenses_ip=false` en todas. Procedimientos: cargar `procedures` (hallazgo C) y `set_visit_procedures` (0091:70-120).
Las automáticas las genera `trg_generate_visits` al fijarse `randomization_date` (0021:63-66, 0029:47-65).

**5 · como farmaresp:** `create_drug('Budesonida/Formoterol')` → `create_laboratorio('ACME Pharma')` →
`create_medication(drug, 'Bufomix 160/4.5 mcg', 'Aerosol (IDM)', 5, '7790000123457', lab, '160/4.5 mcg', 'ICS/LABA')` →
`assign_medication_to_protocol(pid, med)` → `create_reception('protocolo', pid, H-20, 'Envío inicial del sponsor',
[{medication_id, lot_number 'L24A031', expiry_date a más de 30 días (0041), quantity 60}])` → `verify_reception(rid)`
(dispara `apply_reception_stock`, 0040:16-50).

**6 · como coord, cuatro pacientes:** `create_patient_with_enrollment(code, nombre, pid, nacimiento, 'Dr. Ruiz', sexo,
fertilidad)` (0022:149-196) → leer el `enrollment` → `update enrollments set ivrs_code` (hallazgo E). Randomizar = 
`schedule_protocol_visit` (0030:28-55) → `start_visit_attention(visit, fecha)` (0102:199-265) →
`mark_ready_with_outcome(visit, null, true)` (0030:67-106).

| Paciente | Qué deja | Cómo |
|---|---|---|
| P1 | V3 **hoy, sin llegar** | V1 en D-14 y V2 en D, con D = H-28 |
| P2 | **pedido pendiente** | V1 en H-14; V2 agendada hoy + `mark_arrived` (sin randomizar) |
| P3 | V3 en H+2 | como P1 con D = H-26 |
| P4 | **alerta en Pendientes** | como P1 con D = H-54: la V3 queda con `ventana_vencida` |

**7 · corregir marcas** de las V1/V2 históricas (hallazgo D); no las de P2 (hoy).

**8 · como farma:** `assign_patient_medication(enr_P2, med, 'Indicación del protocolo', false)` (0141:316-366).

**9 · como coord:** `create_dispensation_request(v2_P2, [{medication_id, quantity 2}], 'Día 1 · randomización',
'track')` (0141:1918-1950) → queda `solicitada`. Exige el medicamento en `protocol_medications` y habilitado para el
paciente (trigger 0151:99-125).

## Datos que siembran las propias migraciones

Sí: `report_platforms` (5 filas, 0111:144-153) y `farmacia_ajustes` (1 fila, 0125:69-70). No: `procedures` (hallazgo C) ni
los backfills de 0064/0089. No hay otras tablas de consulta con filas fijas.

## Incertidumbres a verificar al escribir el script

1. Los guards de la 0132 (0132:82-130) chequean `current_user <> 'postgres'`: las funciones del demo tienen dueño
   `postgres` (las migró `postgres`), así que debería andar; confirmarlo con `create_reception`.
2. Que `auth.uid()` lea `request.jwt.claims->>'sub'` en el demo (estándar de Supabase).
3. Una V2 histórica con `dispenses=true` sin entrega: no se encontró alerta para concomitante (la de IP sólo con
   `dispenses_ip`).
4. El borde UTC/AR después de las 21 h (`current_date` en UTC; la app en AR).

Scripts parecidos del repo: `supabase/scripts/pacientes-prueba-real/generar.mjs` y
`supabase/scripts/cronograma-prueba-real/generar.mjs`.
