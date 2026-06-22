# Roadmap — Spira

Unificación de **Spira Track** (coordinación clínica) y **Spira Pharma** (farmacia de
investigación) en **una sola plataforma**: un shell con módulos, sobre Supabase. Hoy son dos
módulos (Track + Pharma); el diseño deja lugar para sumar más a futuro (lab, contable, etc.).

El trabajo está organizado en **3 pasos**, en orden de dependencia. Los hitos se taguean en
git (convención de versionado en el [`README.md`](../README.md#versionado)): `v0.2.0` = Paso 2
con el módulo Track completo; `1.0.0` recién en producción con pacientes reales (Fase 3).

---

## Paso 1 · Base de datos — ✅ COMPLETO (2026-06-06)

Schema unificado diseñado desde cero, auditado en seguridad (2 rondas adversariales), desplegado
en Supabase real y validado en vivo.

- 26 tablas, 13 enums, 3 vistas, ~33 triggers, 71 policies RLS — en `supabase/migrations/0001`–`0008`.
- Aislamiento por protocolo (Track) + Pharma central, anti-spoofing, auditoría transversal,
  inmutabilidad, stock por lote.
- Desplegado en Supabase Pro (sa-east-1). RLS validado en vivo (coordinadora aislada, pharma ve todo).
- Detalle: [`supabase/README.md`](../supabase/README.md) · seguridad: [`supabase/schema-review.md`](../supabase/schema-review.md) · narrativa: [`bitacora/2026-06-06.md`](./bitacora/2026-06-06.md).

---

## Paso 2 · Merge — el core de la app · 🔄 EN CURSO

Construir la app React sobre la base ya desplegada. Va al **mismo repo**, en `src/`.
Stack: **Vite + React 19 + TypeScript + @supabase/supabase-js**.

1. **Core** — ✅ HECHO (2026-06-07):
   - Shell único (`src/shell/AppShell.tsx`): top bar, riel de módulos, panel de submódulos, navegación 2 niveles.
   - Design system portado a TS (`src/styles/tokens.css`, `src/components/Icon.tsx`, `Vilano.tsx`, `src/lib/theme.ts`).
   - Auth real (`src/lib/auth.tsx` + `src/lib/supabase.ts`): login, sesión, perfil, roles.
   - Gating de módulos por rol real (`user_module_roles`).
   - Niveles de rol estrictos en la base (migración `0009`, verificada y probada).
2. **Portar vistas a datos reales** — 🔄 EN CURSO (2026-06-08): se construyó el **router de contenido**
   reutilizable (`src/views/registry.tsx` + fallback a `Placeholder`) y se portó la **primera vista:
   Track → Pacientes** (`src/views/track/PatientsView.tsx`, solo lectura) sobre un hook genérico
   `useSupabaseQuery` y niveles de rol en el front (`hasMinRole`). Falta: alta de paciente y el resto
   de los submódulos (siguen en placeholder).
   **(2026-06-09)** Refresh visual del **selector de Protocolos** (cards con estado-punto, hover sobrio,
   descripción nueva → columna `description`, migración `0011`) + estándar de micro-interacción global.
   La **vista de tablero del protocolo** (KPIs + chips de visita) quedó **diseñada y diferida**
   (ver [`bitacora/2026-06-09.md`](./bitacora/2026-06-09.md)).
   **(2026-06-12)** Traspaso grande de Track: **altas cableadas** (protocolo/paciente, label
   "Número de sujeto (IVRS)") + **Resumen** (KPIs, próximas visitas 7 días, alertas; migración
   `0013` `v_track_visits`) + **Agenda semanal** (reagendado por click con validación de ventana;
   mueve solo `estimated_date`) + **Plantillas de checklist** (global/por protocolo con clonación;
   migración `0014` cierra el scoping de RLS). Decisiones de dominio: falla = screen failure ·
   4º KPI = próximas 7 días · número de sujeto lo asigna el IVRS. ⚠️ Correr
   `supabase/scripts/etapa0-preparacion.sql` en prod (aplica 0012–0014 + datos demo).
   Ver [`bitacora/2026-06-12.md`](./bitacora/2026-06-12.md).
3. **Panel de gerencia** — ⏳ PENDIENTE: que Pablo (gerencia) asigne roles con clicks (perfiles
   predefinidos que rellenan `user_module_roles`). Hoy se hace por SQL.
4. **Portar Track y Pharma** completos como módulos + **cablear el handoff** (solicitud → dispensación + realtime).

> El App Shell que ya prototipaste (`FinalShell` componiendo Track + Pharma) es el boceto del core.

---

## Paso 3 · Unificación visual · ⏳ ÚLTIMO

Pulido de coherencia visual, para que Track y Pharma se vean como **un solo producto**.

- Unificar los dos `spira-design-tokens.js` (que divergieron) en **uno solo**.
- Unificar el theme (dark/light).
- Alinear colores, tipografía y espaciados para que **no se note la costura** entre módulos.
- **(2026-06-09, adelantado)** Estándar de **micro-interacción**: todo lo pulsable se levanta ~1px al
  hover y se asienta al pulsar (global en `tokens.css`, opt-out `.spira-no-press`, respeta
  `prefers-reduced-motion`). Documentado en `identidad-visual/README.md` §3 "Movimiento".

La identidad visual ya está armada → este paso es **alinear**, no diseñar de cero. Va al final a
propósito: Paso 2 = "que se vea armado"; Paso 3 = "que se vea pulido".

---

## Cronograma (de la Propuesta de Despliegue)

| Fase | Período | Estado |
|---|---|---|
| Fase 1 · Migración cloud | Junio 2026 | ✅ base de datos lista y validada |
| Fase 2 · Funcionalidades pendientes | Julio 2026 | ⏳ |
| Fase 3 · Estabilización y producción | Agosto 2026 | ⏳ |

## Pendientes anotados (para no olvidar)

- Flujo de creación de perfil en producción (el trigger `0008` ya funciona).
- Edge Function de IVRS (PDF → Claude API) que pre-llena `dispensation_requests`.
- Verificar contra `App.jsx` de Track la elección de plantilla al materializar checklist.
- A futuro, si la farmacia se segrega por sponsor: tabla `pharma_assignments` (hoy Pharma es central).
- **Vista de tablero del protocolo + ficha de paciente**: ✅ implementada (2026-06-13, rama
  `feat/tablero-protocolo-ficha`, migraciones 0016–0018). Detalle de Protocolo (KPIs/adherencia/
  acciones + lista de pacientes con tracker) y Ficha de Paciente (demográficos/contexto/próxima
  visita/cronograma), con privacidad de paciente en toda la app. Ver
  [`bitacora/2026-06-13.md`](./bitacora/2026-06-13.md). Pendiente: aplicar el script SQL y validar
  en vivo + taggear v0.3.0.
- **Track · Visitas del día + eliminar paciente + ciclo de vida de la visita**: 🔄 implementado
  (2026-06-19, rama `feat/track-visitas-del-dia`, migraciones **0023–0025**). (a) **Visitas del día**:
  recorrido operativo del paciente en el centro (etapas `por_llegar→…→fuera`, cola "Para ver médico",
  dispensación mínima de Track, vista Alertas). (b) **Eliminar paciente** (líderes+): borrado en cascada
  auditado/recuperable (RPC `delete_patient`, con guarda contra dispensaciones de farmacia). (c) **Ciclo
  de vida unificado**: registrar = agendar (0025: `register_visit_event` setea `estimated_date`, no
  `real_date`) + las pelotitas del tracker reflejan el recorrido operativo (gris sin atender → contorno
  verde atendida → relleno verde al cerrar, con el número de visita). Migraciones 0023–0025 **aplicadas**;
  **taggeado `v0.5.0`** (en la punta de la rama). Ver [`bitacora/2026-06-20.md`](./bitacora/2026-06-20.md).
  Pendiente: **merge a `main`** + Task V completa (opcional).
- **Track · Cronograma del protocolo → cuadro de actividades completo**: 🔄 (2026-06-21, rama
  `feat/cronograma-protocolo`). El **cronograma** (migraciones **0026–0028**, aplicadas) cierra el bug
  "Próximas visitas: 0": editor del cronograma por protocolo (pestaña "Cronograma" en el Detalle de
  Protocolo) + generar/sincronizar las visitas de los randomizados. **Evolución a cuadro de actividades
  completo — Fase 1** (migración **0029**, aplicada): `role`/`date_mode` en `visit_definitions`, título
  **"código - nombre"**, generación/KPIs solo automáticas, editor con un select "Etapa". Diseño revisado
  con `/autoplan`. **Fase 2** (flujo operativo: agendar desde el cuadro + confirmación al "Listo para irse"
  con IVRS / ¿randomizó? / recitar / marcar fallo) **planificada, NO implementada** (spec/plan
  `docs/superpowers/*/2026-06-21-cronograma-cuadro-completo*`). Aparte, mismo día: **rediseño de Login**
  + Google OAuth + reset de contraseña **mergeado a `main` (PR #1)**. Ver
  [`bitacora/2026-06-21.md`](./bitacora/2026-06-21.md). Pendiente: Fase 2 + merge de la rama.
- Campos de paciente para el tablero: `sex` (F/M/Otro).
- Notas del día en Agenda: la tabla `agenda_notes` existe; falta `unique (user_id, note_date)` para
  upsert + policy DELETE (migración 0015 futura). Impresión de la agenda (`@media print`) también pendiente.
- Confirmar decisión de Agenda: al reagendar se mueve solo `estimated_date` (ventana del sponsor fija);
  si se prefiere paridad con el legacy (desplazar ventana), es un cambio trivial.
