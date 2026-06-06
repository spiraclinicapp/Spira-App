# Roadmap — Spira

Unificación de **Spira Track** (coordinación clínica) y **Spira Pharma** (farmacia de
investigación) en **una sola plataforma**: un shell con módulos, sobre Supabase. Hoy son dos
módulos (Track + Pharma); el diseño deja lugar para sumar más a futuro (lab, contable, etc.).

El trabajo está organizado en **3 pasos**, en orden de dependencia.

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

## Paso 2 · Merge — el core de la app · ⏳ SIGUIENTE

Construir la app React sobre la base ya desplegada. Va al **mismo repo**, en `src/`. Sub-orden:

1. **Core** (lo primero — el esqueleto donde todo se enchufa):
   - Shell único: login, sidebar, frame, routing entre módulos.
   - Capa de datos contra Supabase (queries + realtime), reemplazando el `localStorage` de los MVPs.
   - Auth (Supabase Auth) + gating por rol (`user_module_roles`).
   - Design system compartido (tokens/theme/primitivos) — base, no el pulido final (eso es Paso 3).
2. **Portar Track** como módulo (ya es modular → entra más derecho).
3. **Portar Pharma** como módulo (hoy es un monolito → se desarma pieza por pieza).
4. **Cablear el handoff** Track→Pharma: solicitud → dispensación + realtime entre módulos.

> El App Shell que ya prototipaste (`FinalShell` componiendo Track + Pharma) es el boceto del core.

---

## Paso 3 · Unificación visual · ⏳ ÚLTIMO

Pulido de coherencia visual, para que Track y Pharma se vean como **un solo producto**.

- Unificar los dos `spira-design-tokens.js` (que divergieron) en **uno solo**.
- Unificar el theme (dark/light).
- Alinear colores, tipografía y espaciados para que **no se note la costura** entre módulos.

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
