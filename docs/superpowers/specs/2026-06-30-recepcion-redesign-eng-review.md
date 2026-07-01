# Rediseño visual del submódulo Recepción — decisiones de `/plan-eng-review`

Fecha: 2026-06-30 · Origen: handoff `Mejora visual recepciones/handoff_recepcion_v2/README.md` (diseño aprobado 2a/1b/1d).
Estado: **enfoque lockeado, implementación DIFERIDA a post-merge de `feat/pharma-ip`.** No hay plan de implementación aún.

## Qué es
Re-piel visual **behavior-preserving** del submódulo Recepción (escaneo 2a, lista 1b, wizard 1d) usando los tokens de "Sereno". La funcionalidad ya existe (v0.9.0 + IP); esto solo cambia la presentación.

## Decisiones lockeadas (gate del eng-review)
1. **Secuencia:** primero **mergear `feat/pharma-ip`** (tras el escaneo real del sponsor + verificación en navegador, mañana), y **después** rediseñar sobre un `main` que ya tiene IP. Evita re-pielar dos veces y los conflictos de una rama paralela. → El rediseño arranca en una rama nueva off main **post-merge**.
2. **Fuentes:** se **mantiene Inter** (decisión app-wide vigente en `tokens.css`). Del handoff se aplican **layout + color + convenciones** (chips, agrupación, stepper). **No** se adopta Hanken/IBM Plex Mono (sería cambio app-wide, fuera de alcance). Los tokens de color del handoff **ya son idénticos** a `tokens.css`.
3. **IA de la lista (1b):** adoptar la **lista transversal filtrable** del handoff — chips (Todas/Protocolo/Ambulatoria) + búsqueda libre + **agrupación por día** + "Más filtros". El protocolo pasa a ser un **filtro**, no un gate. La capa de datos ya lo soporta (`useReceptions(tipo, null)` trae todo; Pharma es central por RLS).
4. **Escaneo (2a):** mismo **lenguaje visual** (input central grande + ícono de barras a la derecha + contador) en **ambos** pasos de escaneo — base (`Step1Scan`, ±N por medicamento) e IP (`Step1ScanIp`, una fila por unidad, sin ×N) — cada uno conservando su comportamiento.

## Comportamiento a PRESERVAR (la re-piel no debe regresionar)
- `RecepcionView`: ámbito incl. `investigacion`; `verify → refetch → highlightId`; gating pharma-leader del botón "Nueva recepción".
- `ReceptionWizard`: Step0 3 ámbitos (investigacion habilitado, protocolo requerido para protocolo/investigacion); `canAdvance` ramificado por tipo (base: Σlotes==cantidad; IP: ≥1 unidad); guard de descarte; labels del stepper por rama ('Lotes'/'Revisión').
- `Step1Scan`: `resolveCode`/+1, panel `linkCode`, `assignMedicationToProtocol`, stepper ±, agregar a mano, dedup.
- `Step1ScanIp`: `parseGs1`, una fila por unidad, dedup por kit/rawCode, fallback manual marcado, `DrugPicker` por fila.
- `Step2Lots`/`Step2ReviewIp`, `Step3Summary`/`Step3SummaryIp`: lógica de lotes/vto/droga y creación atómica.
- `MedicamentosView`: ámbito base/IP.

## Tareas de implementación (post-merge)
- **T1 (P2)** — `components/`: extraer `Chip`/`Badge` compartido + helper `groupByDay(receptions)` (hoy los estilos de badge están duplicados en RecepcionView/MedicamentosView). DRY.
- **T2 (P1)** — `RecepcionView`: lista transversal (chips + búsqueda + agrupación por día + "Más filtros" client-side), preservando verify/refetch/highlightId/gating y el ámbito investigacion.
- **T3 (P1)** — `ReceptionWizard` + `Step0`..`Step3` (base): re-piel del stepper (check/actual ámbar/futuro atenuado) + nav fija abajo, preservando canAdvance/guard/labels por tipo.
- **T4 (P1)** — `Step1Scan`: escaneo 2a (input central + ícono barras derecha + "N med · M ítems"), preservando linkCode/stepper/agregar-a-mano.
- **T5 (P2)** — `Step1ScanIp` + `Step2ReviewIp` + `Step3SummaryIp`: mismo lenguaje visual, preservando el comportamiento por-unidad.
- **T6 (P3)** — `MedicamentosView`: alinear chips si aplica.
- **Verificación:** `typecheck` + browser (Director) recorriendo cada flujo [PRESERVAR] de arriba. Sin suite de tests.

## NOT in scope
Vista de **detalle** de recepción (chevron→detalle del 1b) · cambio de **fuentes** · filtrado **server-side** de "Más filtros" · otros submódulos de Pharma.

## Próximo paso
Post-merge de IP: `writing-plans` sobre este doc → plan de implementación → ejecución (subagent-driven) → voz externa/review sobre el plan real.
