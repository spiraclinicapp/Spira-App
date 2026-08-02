# Roadmap — Spira

Spira es una **plataforma modular de investigación clínica** de la **Fundación Scherbovsky**
(Mendoza, AR): un **Core compartido** (identidad, RBAC, auditoría, RLS, realtime — sistema auditable
ANMAT / ICH-GCP) sobre el que se montan módulos independientes. **Track** (coordinación clínica) y
**Pharma** (farmacia de investigación) son los primeros. **No** son el objetivo final: fusionar esos
dos MVPs fue el punto de partida, no la meta. La apuesta es la **base modular para todo el flujo del
centro** (roadmap: Lab, Contable/Gerencia, módulo de médicos, integraciones WhatsApp/IA).

El trabajo se organiza en **3 pasos** en orden de dependencia. Los hitos se taguean en git
(convención de versionado en el [`README.md`](../README.md#versionado)): hoy la punta es **`v0.19.0`**;
el `1.0.0` recién en **producción con pacientes reales** (Fase 3).

> **Dónde vive el detalle (para que este archivo NO vuelva a desfasarse).** Este ROADMAP es el
> **arco estratégico**, no el changelog. El detalle fino vive en fuentes que se mantienen solas:
> - **Base de datos:** índice de migraciones (`0001`…`0064`, con fecha de aplicación en prod) en
>   [`supabase/README.md`](../supabase/README.md).
> - **Hitos de versión:** tabla de tags (`v0.2.0`…) en [`README.md`](../README.md#versionado).
> - **Narrativa por jornada:** [`docs/bitacora/`](./bitacora/) (la última es la fuente de verdad para
>   retomar) + sus handoffs.

---

## Estado actual (2026-07-31)

**Fase de datos reales.** La beta con datos sembrados se cerró y el centro empezó a **cargar
información real** (pacientes, inscripciones y visitas históricas de protocolos activos). Ambos
módulos son **funcionales y están desplegados** (Vercel, `main` → prod; Supabase en prod):

- **Track** opera el recorrido completo del paciente: protocolos, pacientes, cronograma (cuadro de
  actividades / Schedule of Assessments), **visitas del día** (recorrido operativo `por_llegar→fuera`),
  cola "para ver médico" con motivo + hilo de comentarios, **procedimientos por visita con reporte**,
  agenda, alertas.
- **Pharma** opera catálogo global de medicación, **recepción tipada** (Protocolo / Ambulatoria / IP
  macro), stock por lote, y **dispensación end-to-end** (Track solicita → Pharma resuelve; tablero
  Kanban de cuatro estados con comprobante).

**Punta:** `v0.19.0` · **última migración aplicada en prod:** `0064` · **base:** 64 migraciones.

---

## Paso 1 · Base de datos — ✅ COMPLETO (y vivo)

Schema unificado diseñado desde cero, auditado en seguridad (**2 rondas adversariales → veredicto GO**),
desplegado en Supabase real y validado en vivo.

- Arrancó con `0001`–`0008` (26 tablas, 13 enums, RLS, auditoría transversal). **Hoy va por `0064`:**
  la base es un artefacto **vivo**, extendido por migraciones numeradas e **inmutables**, aplicadas a
  mano en prod, en orden (Track: cronograma, visitas del día, procedimientos; Pharma: catálogo,
  recepción tipada, IP, dispensación; además perfil editable, feedback).
- Aislamiento por protocolo (Track) + **Pharma central**, anti-spoofing de actor, `audit_log`
  inmutable/recuperable, inmutabilidad de campos sensibles, stock por lote.
- Fuente de verdad e índice: [`supabase/README.md`](../supabase/README.md) · seguridad:
  [`supabase/schema-review.md`](../supabase/schema-review.md) · narrativa del arranque:
  [`bitacora/2026-06-06.md`](./bitacora/2026-06-06.md).

---

## Paso 2 · Merge — el core de la app · ✅ COMPLETO EN LO ESENCIAL

Construir la app React sobre la base ya desplegada, en el **mismo repo** (`src/`).
Stack: **Vite + React 19 + TypeScript + @supabase/supabase-js**.

1. **Core** — ✅ shell modular único (top bar, riel de módulos, panel de submódulos, navegación de
   2 niveles), auth real (login, sesión, perfil, roles), gating de módulos por rol
   (`user_module_roles`), design system "Sereno" portado a TS, buscador global (⌘K) y menús de
   usuario / notificaciones / feedback.
2. **Track completo** — ✅ portado a datos reales: altas de protocolo/paciente, Resumen (KPIs),
   Agenda semanal, Plantillas de checklist, tablero de protocolo + ficha de paciente, visitas del día,
   cola del médico, cronograma/SoA, procedimientos por visita.
3. **Pharma completo** — ✅ catálogo global, recepción tipada + wizard, stock por lote, IP (ingreso
   macro por cantidad), rediseño de la vista Medicamentos, y **dispensación** (tablero Kanban).
4. **Handoff Track ↔ Pharma** — ✅ cableado: solicitud → dispensación con **doble enforcement** y
   **FEFO** atómico, en realtime.
5. **Panel de gerencia** — ⏳ **PENDIENTE**: que gerencia asigne roles con clicks (perfiles
   predefinidos que rellenan `user_module_roles`). Hoy se hace por SQL.

---

## Paso 3 · Unificación visual · 🔄 EN CURSO (transversal)

Coherencia visual para que Track y Pharma se vean como **un solo producto** ("que no se note la
costura"). Dejó de ser un paso aislado al final: se hace de forma **continua** a medida que madura
cada vista.

- Sistema visual **"Sereno"** (petróleo + papel cálido) unificado y documentado en
  [`PRODUCT.md`](../PRODUCT.md) / [`DESIGN.md`](../DESIGN.md) / `docs/identidad-visual/`; **tokens
  únicos** en `src/styles/tokens.css` (se cerró la divergencia de los dos `spira-design-tokens.js`).
- Estándar de **micro-interacción** global (todo lo pulsable se levanta ~1px al hover, respeta
  `prefers-reduced-motion`), **foco suave** de inputs, re-piel "Sereno" de submódulos, tema
  claro/oscuro unificado.
- Pulido continuo por vista con la skill **impeccable**.

---

## Cronograma (de la Propuesta de Despliegue)

| Fase | Período | Estado |
|---|---|---|
| Fase 1 · Migración cloud | Junio 2026 | ✅ base lista y validada |
| Fase 2 · Funcionalidades pendientes | Julio 2026 | ✅ en lo esencial — Track y Pharma construidos y desplegados |
| Fase 3 · Estabilización y producción | Agosto 2026 | 🔄 **en curso** — carga de datos reales; camino al `1.0.0` con pacientes reales |

---

## Pendientes estratégicos

Los micro-pendientes por feature viven en la última bitácora/handoff (`docs/bitacora/`). Acá, solo lo
que mueve el arco del proyecto:

- **Panel de gerencia** (asignar roles por clicks) — el único sub-ítem del Paso 2 sin cerrar; hoy los
  roles se asignan por SQL en el dashboard de Supabase.
- **Camino a Fase 3 / `1.0.0`:** estabilización + carga completa de datos reales + **producción con
  pacientes reales**. El `1.0` es una promesa de estabilidad: no se libera mientras el modelo se mueve.
- **Módulos futuros sobre el Core:** **Lab**, **Contable/Gerencia**, módulo de **médicos** completo, e
  **integraciones** (WhatsApp; IA — ej. Edge Function de IVRS que lee el PDF con la Claude API y
  pre-llena `dispensation_requests`).
- **Gap cross-módulo conocido:** en Track se ve "Medicamento" genérico porque `medications`/`drugs`
  no son legibles por Track (RLS) — cerrar la Fase 3 de la medicación del paciente (nombre
  desnormalizado en `patient_medications`, patrón de `visit_comments`).
- **A futuro, si la farmacia se segrega por sponsor:** tabla `pharma_assignments` (hoy Pharma es
  central por decisión de negocio).
