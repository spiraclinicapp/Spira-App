---
target: el calendario de rango de Reportes (DateRangeField)
total_score: 34
p0_count: 0
p1_count: 0
timestamp: 2026-08-16T21-54-06Z
slug: src-components-daterangefield-tsx
---
⚠️ DEGRADADO: contexto único (instrucción de sesión: no lanzar subagentes sin pedirlo).

## Design Health Score

| # | Heurística | Antes | Ahora | Qué cambió |
|---|---|---|---|---|
| 1 | Visibilidad del estado | 3 | 4 | Los chevrones se apagan de verdad en los bordes |
| 2 | Sistema ↔ mundo real | 3 | 3 | — |
| 3 | Control y libertad | 3 | 3 | — |
| 4 | Consistencia y estándares | 1 | 3 | CalendarCaption compartido entre los dos calendarios |
| 5 | Prevención de errores | 3 | 4 | Se acabó el control muerto; límites respetados arriba y abajo |
| 6 | Reconocer vs recordar | 2 | 4 | El año está a la vista y es elegible |
| 7 | Flexibilidad y eficiencia | 1 | 3 | 29 clicks → 4 |
| 8 | Estético y minimalista | 2 | 4 | 238px de espacio muerto → 2px |
| 9 | Recuperación de errores | 3 | 3 | — |
| 10 | Ayuda y documentación | 3 | 3 | — |
| **Total** | | **24/40** | **34/40** | **Bueno** |

## Anti-patrones

Detector: 0 hallazgos en los tres archivos del calendario (antes 6, todos de la hoja impresa, fuera de target).
Pasa el test del registro product: el caption tiene los controles esperados, el popover mide lo que ocupa, los bordes se comportan.

## Mediciones

```
popover           288px · grilla 266 · espacio muerto 2px   (era 524 / 266 / 238)
clicks a marzo 2024   4                                      (eran 29)
chevrones         agosto 2026 → siguiente disabled
                  enero 2021  → anterior disabled
                  en el medio → los dos activos
teclado           6 paradas; roving tabindex intacto (1 de 31 días)
role              dialog + aria-label, sin aria-modal (no hay trampa de foco)
contraste claro   caption 14,08:1 · pie 5,59:1
contraste oscuro  caption 13,75:1 · pie 8,04:1 · días 13,75:1
tinte del tramo   claro rgba(15,95,87,.12) · oscuro rgba(46,125,116,.30)
```

## Abierto

- **[P2] No se puede tipear la fecha.** DateField sí lo permite. Es el techo que le queda al componente.
- **[P2] Sin trampa de foco.** Por eso role=dialog sin aria-modal. Se cierra con la PR del Modal compartido.
- **[P3] DateNavButton sigue sin mes/año.** En TODOS.md; el arreglo son dos líneas.
- **[P3] Días de 34×34.** Sobre el mínimo de 24 de WCAG 2.2, bajo los 44 ideales.

## Preguntas

- Con el año resuelto, ¿el preset "Año" se sigue ganando su lugar?
- El piso está en cinco años atrás: ¿es el número correcto para los datos del centro?
