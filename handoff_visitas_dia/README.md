# Handoff: Visitas del día (Spira Coordinación)

## ⚠️ Leé esto antes de "implementar el handoff"

**Este handoff YA ESTÁ IMPLEMENTADO.** Se shipeó entre el 2026-08-04 y el 2026-08-06, en las
PRs #25 a #32 (releases `v0.22.0` → `v0.26.0`) más la migración **0065** (coordinador por
visita). No hay nada pendiente de construir acá.

Vive en:

| Handoff § | Dónde vive hoy |
|---|---|
| §6 la fila | `src/views/track/DayVisitRowItem.tsx` |
| §6 etiqueta de protocolo · §3 puntos de procedimiento · §6 responsables | `src/views/track/visitAtoms.tsx` (`ProtoTag`, `ProcDots`, `Persona`, `protoTone`) |
| §2 estados | `src/views/visitStates.tsx` (`OperationalStageChip`, `VisitChip`) |
| §4 cabecera y contadores · §5 filtros · §8 agrupación | `src/views/DayVisitsView.tsx` |
| §7 modal de detalle | `src/views/track/VisitDetail.tsx` + `VisitHeader.tsx` |

Si venís a hacer algo con este handoff, casi seguro lo que querés es **reusar esas piezas**,
no reescribirlas.

## Qué NO se portó del prototipo, y por qué

- **La escala de 7 tonos y letras de procedimiento (§3).** El catálogo real de procedimientos
  es de **texto libre**, no tiene las siete claves fijas del prototipo de demo. `ProcDots` es
  monocromo a propósito: no se inventa una escala de color sobre datos que no la tienen.
- **La hora de la visita (§6, columna izquierda).** **No existe hora de cita en el schema.**
  Esa columna muestra el chip de estado. Fue la decisión D1 del plan de Fase 1.
- **El token `violet`.** Entraba solo con la escala de procedimientos, que no se portó.
- **La paleta LIGHT/DARK del prototipo.** Los tonos salen de `src/styles/tokens.css`, que es
  theme-aware; los del prototipo están hardcodeados y no tienen modo oscuro.

## Los archivos

- `HANDOFF - Visitas dia.md` — la especificación completa (tokens, estados, fila, modal,
  filtros, agrupación, modelo de datos). Es la fuente.
- `PLAN - Visitas dia (Fase 1).md` — el plan de implementación producido con
  `/plan-eng-review` el 2026-08-04, con las 4 decisiones del Director.
- `Visitas - Dia.html` + `visitas-v2/*.jsx` — el prototipo de demo. **Son referencia de
  diseño, no código para copiar**: usan datos falsos, su propia paleta y no conocen el schema
  real ni la RLS.

## Trabajo derivado

El port de este vocabulario a las dos pantallas de resumen (Inicio › Resumen y Coordinación ›
Resumen) está planificado en [`docs/plan-resumen-vocabulario-visitas.md`](../docs/plan-resumen-vocabulario-visitas.md)
(2026-08-18). Ese plan **no reimplementa el handoff**: extrae las piezas de la tabla de arriba
y las reusa.
