---
target: Recepción (reskin 2c)
total_score: 29
p0_count: 0
p1_count: 2
timestamp: 2026-08-17T22-13-27Z
slug: src-views-pharma-recepcion
---
**Method:** ⚠️ DEGRADED: single-context (la sesión prohíbe subagentes sin pedido explícito; el detector determinístico sí corrió)

## Design Health Score

| # | Heurística | Score | Hallazgo |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | Carga, toast, busy y truncado cubiertos; un refetch en curso no se anuncia |
| 2 | Sistema ↔ mundo real | 4 | "Recibido", "Ingresada a stock", folio, lote: vocabulario del mostrador |
| 3 | Control y libertad | 2 | Verificar no se deshace y una recepción no se puede anular ni borrar |
| 4 | Consistencia | 3 | Botones, tokens y Toast alineados; `--spira-muted` usado contra su propia regla |
| 5 | Prevención de errores | 3 | Confirmación con el número delante; el wizard valida por paso |
| 6 | Reconocer > recordar | 4 | Todo rotulado, folio legible, el buscador declara sus campos |
| 7 | Flexibilidad y eficiencia | 2 | Sin atajos, sin verificación en lote, sin ordenar |
| 8 | Estético y minimalista | 4 | Denso y calmo a la vez; la grilla rígida hace el trabajo |
| 9 | Recuperación de errores | 3 | El error va en la banda de su card, en castellano |
| 10 | Ayuda y documentación | 1 | No existe |
| **Total** | | **29/40** | **Good** |

## Anti-Patterns Verdict

`detect.mjs` sobre `recepcion/` + `RecepcionView.tsx` → `[]`, cero hallazgos.

No parece hecho por IA: el vocabulario es de dominio y la densidad es de tabla real, no de tres
cards con ícono. Quedaba un ban absoluto en pie (side-stripe border en la barra de ámbito), y el
argumento real no era la regla sino la redundancia: el nombre del ámbito ya se escribe en su color.

## Priority Issues

**[P1] Seis textos por debajo de AA, todos con `--spira-muted`** — RESUELTO en esta pasada.
Medido contra el fondo real: texto de la banda 3,14 · conteo del día 3,12 · rótulo RECIBIDO 3,37 ·
títulos de columna 3,52 · monodroga 3,52 · laboratorio 3,52. Mínimo 4,5. `--spira-ink-soft` da
5,11–5,84 en los mismos fondos y ya estaba documentado como el token para esto.
Después del cambio: 5,17 a 5,84, los seis pasan.

**[P1] Una recepción cargada mal es para siempre** — DIFERIDO a TODOS.md.
No hay anular, editar ni borrar. Un lote tipeado mal sólo se corrige con un ajuste manual de stock,
que es otra pantalla y deja los dos registros conviviendo. No borrar es correcto en una app
auditable; no poder anular no lo es.

**[P2] No escala al día de volumen** — DIFERIDO a TODOS.md.
Sin verificación en lote, sin atajos, sin ordenar. Diez recepciones son diez modales.

**[P2] La barra de ámbito repite el color de su etiqueta** — RESUELTO. Sacada.

**[P3] El cambio de estado no se anuncia.** El toast no tiene `aria-live`.

## Persona Red Flags

**Alex (power user):** 25 focusables, ni un atajo. Verificar cinco recepciones son cinco
confirmaciones. No puede ordenar.

**Sam (lector de pantalla):** los seis contrastes (ya resueltos). El toast no se anuncia. A favor:
la tabla lleva `aria-label` con el folio y el vencimiento combina forma + color + etiqueta.

**La farmacéutica bajo presión:** la pantalla trata cada recepción como un evento aislado y
cuidadoso. Con seis cargamentos juntos, la confirmación de a una pasa de red a peaje.

## Minor Observations

- "Más filtros" mide 36px; el resto de la fila, 38 y 40.
- "Recepción / Recibido" son dos formas de la misma raíz a 60px de distancia.

## Questions to Consider

- ¿Y si verificar fuera reversible por 30 segundos desde el toast, en vez de confirmado por modal?
- ¿La confirmación tiene que aparecer siempre, o sólo cuando algo se sale de lo esperado?
