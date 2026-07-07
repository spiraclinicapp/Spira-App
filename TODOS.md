# TODOS — Spira App

Deuda técnica y mejoras diferidas, capturadas con contexto para que quien las
tome dentro de unos meses entienda el porqué y por dónde empezar.

---

## Pharma · converger el formateo de fecha de vencimiento a un solo helper

- **Qué:** `MedicamentosView` formatea vencimientos con su `formatFecha` local
  (`dd/mm/yyyy`); el detalle de Recepción (v0.16+) usa `formatDayMonthYear` de
  `lib/dates.ts` (`dd mmm yyyy`). Converger ambas al helper compartido.
- **Por qué:** hoy el mismo dato (fecha de vencimiento) se lee distinto en dos
  vistas del mismo módulo. Es una inconsistencia menor de presentación, no un bug.
- **Pros:** una sola fuente de formato de fecha en Pharma; borra un formateador
  ad-hoc (`formatFecha` en `MedicamentosView.tsx`).
- **Contras:** cambia el formato visible de los vencimientos en Medicamentos
  (`dd/mm/yyyy` → `dd mmm yyyy`); conviene confirmarlo con el Director antes.
- **Contexto:** surgió en la `/plan-eng-review` del handoff "Recepción · detalle de
  renglones". Ahí se extrajo `ESTADO_CFG`/`estadoFromExpiry` a
  `src/views/pharma/expiryState.tsx` (compartido). El formateo de fecha quedó
  fuera de ese PR a propósito para no agrandar el diff a Medicamentos.
- **Empezar por:** `src/lib/dates.ts` (elegir/definir el helper canónico) →
  `src/views/pharma/MedicamentosView.tsx` (`formatFecha`, línea ~294).
- **Depende de / bloqueado por:** decisión de formato del Director (`dd/mm/yyyy`
  vs `dd mmm yyyy`) para todo Pharma.
