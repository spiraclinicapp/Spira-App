# Spira

Plataforma modular de investigación clínica de la **Fundación Scherbovsky** (Mendoza, AR).
Unifica en una sola app dos productos previos:

- **Spira Coordinación** — coordinación clínica: protocolos, pacientes, visitas, checklists, agenda.
  Clave interna `track` (así aparece en el código, las carpetas y la base).
- **Spira Farmacia** — farmacia de investigación: dispensación, stock por lote, reportes.
  Clave interna `pharma`.

El shell es modular (deja lugar para Lab y Contable a futuro), sobre Supabase con RLS y
auditoría transversal (sistema auditable ANMAT / ICH-GCP). Castellano rioplatense.

## Dónde corre

**Producción: <https://spira-app.vercel.app>** — Vercel, proyecto `spira-app`, **desplegada
automáticamente desde `main`**; las ramas con PR abierta salen en su propio preview.

Ojo: **corre contra la base REAL, con datos de pacientes.** Para probar no se usa esta URL sino
el dev server local (`npm run dev`, `.env` propio). Y para saber qué versión está arriba, el
popover "Acerca de Spira" del menú de usuario muestra la de `package.json`, que es la que dice
el tag de git — si no coinciden, falta un release o falta un deploy.

## Stack

Vite + React 19 + TypeScript (strict) · Supabase (PostgreSQL + RLS + Auth + Realtime) ·
CSS con variables (sin Tailwind/CSS-in-JS) · íconos Lucide. Sin router ni react-query: el
estado de navegación es propio y los datos se leen con un hook genérico (`useSupabaseQuery`).

## Cómo correr

```bash
npm install
# .env con: VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY  (ver .env.example)
npm run dev        # http://localhost:5173
npm run build      # typecheck (tsc) + build de producción
```

La base se aplica con las **migraciones numeradas** de `supabase/migrations/` (`0001`…),
en orden. Detalle e índice en [`supabase/README.md`](supabase/README.md).

## Mapa del repo

| Dónde | Qué |
|---|---|
| `src/shell/` | Top bar, navegación de módulos/submódulos, login |
| `src/views/` | Una vista por submódulo (registradas en `views/registry.tsx`) |
| `src/data/` | Hooks de lectura + mutaciones contra Supabase |
| `src/lib/` | Auth, cliente Supabase, theme, helpers de fecha |
| `supabase/migrations/` | Fuente de verdad del schema (numeradas) |
| `supabase/schema-review.md` | Revisiones de seguridad adversariales (RLS) |
| `docs/#4- ROADMAP.md` | Los 3 pasos del proyecto y su estado |
| `docs/bitacora/` | Bitácoras por jornada (changelog narrado + handoffs) |
| `docs/identidad-visual/` | Marca, tokens, reglas de diseño |

## Versionado

Pre-1.0 a propósito: el `0.` adelante avisa que el schema y las vistas todavía pueden
cambiar. La numeración real de la base son las **migraciones** (`0001`…), que no se renumeran.
Encima de eso, se taguean **hitos** (no cada commit):

- **minor** (`0.2` → `0.3`) — se cierra un paso del roadmap o un módulo grande.
- **patch** (`0.2.0` → `0.2.1`) — fixes acotados (p. ej. una ronda de seguridad).
- **`1.0.0`** — recién al entrar a **producción con pacientes reales** (Fase 3 del cronograma).
  El 1.0 es una promesa de estabilidad; no se libera mientras el modelo se mueve.

Cada tag debería poder leerse contra la bitácora del día y el `ROADMAP.md`.

| Tag | Hito |
|---|---|
| `v0.2.0` | Paso 2 — módulo **Track** completo (protocolos+pacientes, Resumen, Agenda, Plantillas) sobre datos reales, con RLS revisada |
| `v0.3.0` | Tablero del protocolo + ficha de paciente (KPIs, cronograma de visitas, acciones) + privacidad de paciente en toda la app *(no se taggeó por separado; quedó incluido en `v0.4.0`)* |
| `v0.4.0` | Ciclo de visitas unificado pre/post randomización (RPC `register_visit_event`, cronograma diferido, checklist en todas) + edición de protocolo/paciente, médico tratante e IVRS opcional + **tracker del Detalle de Protocolo según diseño** (pre-rando con sus sueltas, línea de tiempo, hover y tipografía uniformes; badge de la ficha = estado del paciente) |
| `v0.5.0` | **Visitas del día** (recorrido operativo del paciente en el centro: etapas por_llegar→fuera, cola "Para ver médico", dispensación mínima de Track, vista Alertas; migración 0023) + **eliminar paciente** (líderes; borrado en cascada auditado/recuperable, RPC `delete_patient`; migración 0024) + **ciclo de vida de la visita** (registrar = agendar — `register_visit_event` setea `estimated_date`, migración 0025 — y las pelotitas del tracker reflejan el recorrido operativo: gris sin atender → contorno verde atendida → relleno verde al cerrar, con el número de visita) |
| `v0.6.0` | **Cuadro de actividades completo** + cierre clínico de visita (IVRS de screening / confirmación de randomización) + cola del médico persistente (`doctor_seen_at`) + **login rediseñado** (Google + recuperar contraseña) (migraciones 0026–0031) |
| `v0.7.0` | **Home del centro** |
| `v0.8.0` | **Pharma 1a**: catálogo global de medicación, recepción con verificación, stock por lote; laboratorio autodetectado por código de barra; dosis/presentación estructuradas (migraciones 0032–0034) |
| `v0.9.0` | **Recepción tipada** (Protocolo / Ambulatoria), wizard de 4 pasos (migraciones 0035–0036) |
| `v0.10.0` | **Producto de Investigación (IP)** rastreado por unidad (migración 0037) |
| `v0.11.0` | **Re-piel "Sereno"** del submódulo Recepción + foco suave de inputs en toda la app |
| `v0.12.0` | **Pivote del IP a ingreso macro por cantidad** (la traza por kit la lleva el sponsor/IRT; excursión de temperatura bloquea el ingreso) + GitHub al día (primer push a origin, tags `v0.9.0`–`v0.12.0`) (migraciones 0038–0039) |
| `v0.13.0` | **Rediseño de la vista Medicamentos** (Pharma): menú de apartado (Protocolo agrupado con card de IP / Ambulatoria plana / Catálogo global), lista **por lote** con EAN13 + lote + vencimiento (color + ícono por estado, WCAG) + **stock por nivel**, búsqueda por código de barras y filtro de protocolos; **anti-duplicado del catálogo** (índice único) + edición del medicamento; formulario "Registrar medicación" con **desplegables-con-buscador** (alta/baja de monodroga y laboratorio con confirmación) (migraciones 0040–0043) |
