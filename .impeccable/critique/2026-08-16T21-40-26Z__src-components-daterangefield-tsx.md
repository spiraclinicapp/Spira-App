---
target: el calendario de rango de Reportes (DateRangeField)
total_score: 24
p0_count: 0
p1_count: 2
timestamp: 2026-08-16T21-40-26Z
slug: src-components-daterangefield-tsx
---
⚠️ DEGRADADO: contexto único (instrucción de sesión: no lanzar subagentes sin pedirlo). Las dos evaluaciones se hicieron en el mismo contexto, con detector y navegador reales.

## Design Health Score

| # | Heurística | Puntaje | Hallazgo |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | El pie dice qué se va a aplicar y el tramo se pinta. El botón "mes siguiente" se ve activo y no hace nada |
| 2 | Sistema ↔ mundo real | 3 | Castellano, voseo, "tramo"/"día" natural |
| 3 | Control y libertad | 3 | Cancelar, Escape, click afuera; el borrador no se aplica hasta confirmar |
| 4 | Consistencia y estándares | 1 | Tres selectores de fecha en la app, tres capacidades distintas |
| 5 | Prevención de errores | 3 | Futuro deshabilitado, orden normalizado, no se aplica sin selección |
| 6 | Reconocer en vez de recordar | 2 | Sin año a la vista, hay que llevar la cuenta de los meses retrocedidos |
| 7 | Flexibilidad y eficiencia | 1 | 29 clicks para llegar a marzo 2024 |
| 8 | Estético y minimalista | 2 | 238px de espacio muerto: el 45% del popover vacío |
| 9 | Recuperación de errores | 3 | Cancelar restaura; nada destructivo |
| 10 | Ayuda y documentación | 3 | El pie enseña la interacción en el momento justo |
| **Total** | | **24/40** | **Aceptable** |

## Anti-patrones

No es slop visual: usa los tokens del proyecto, sin gradientes, glass, eyebrow ni cards anidadas. Falla el test del registro *product* (¿alguien fluido en Linear/Stripe frenaría?): sí, dos veces, en el hueco de 238px y en la ausencia del año. Marcas de algo ensamblado, no diseñado.

Detector: 6 hallazgos `design-system-color`, todos negros/grises de `impresion.tsx` (hoja impresa). Falsos positivos en contexto. Cero en el calendario.

## Mediciones

```
popover:          524 × 373 px
grilla de meses:  266 × 302 px
espacio muerto:   238 px (45% del ancho)
clicks a marzo 2024: 29
dropdown de mes/año: 0    (DateField.tsx:117 sí lo tiene)
contraste del pie: 5,59:1 (AA ok)
días deshabilitados: opacity 0.35 (~1,9:1)
roving tabindex: 31 días, 1 tabulable (correcto)
botón "mes siguiente": disabled=false pero el caption no cambia
popover: role=null, aria-modal=null, con aria-haspopup="dialog" en el disparador
```

## Lo que funciona

1. El borrador con confirmación: no aplica al soltar, no dispara consulta por click.
2. El pie como ayuda contextual, con contraste 5,59:1.
3. Teclado: roving tabindex real, Escape cierra, el foco entra al día seleccionado.

## Problemas prioritarios

- **[P1] Sin selector de mes/año, y la app ya tiene uno.** `DateField.tsx:117` usa `captionLayout="dropdown"` + `SelectDropdown` con año buscable. 29 clicks a marzo 2024. Fix: extraer `SelectDropdown` a un módulo compartido y usarlo. → `/impeccable polish`
- **[P1] 238px de espacio muerto.** El popover no declara ancho y hace shrink-to-fit sobre el `max-content` del pie (~500px en una línea). Fix: que el pie envuelva y el ancho lo dé el calendario. → `/impeccable layout`
- **[P2] El botón "mes siguiente" es un control muerto.** `endMonth` limita pero RDP no lo deshabilita. → `/impeccable harden`
- **[P2] El popover se anuncia como diálogo y no lo es.** `role: null`, sin trampa de foco. → `/impeccable audit`
- **[P3] Días deshabilitados al 35% de opacidad** (~1,9:1). Subir a ~0.45.

## Banderas por persona

- **Alex (experto):** no puede tipear una fecha; el `DateField` de la app sí lo permite. 29 clicks o nada.
- **Sam (accesibilidad):** roving tabindex y Escape bien; el popover se anuncia `dialog` sin `role`, y el botón "siguiente" no deshabilitado le hace perder tiempo.
- **Farmacéutica del cierre (proyecto):** el riesgo no es que se frustre, es que elija el mes equivocado y lo imprima, sin referencia de año a la vista.

## Observaciones menores

- El caption "agosto 2026" es texto estático; ahí van los dropdowns.
- Chevrones 36×36, días 34×34: sobre el mínimo de 24 de WCAG 2.2, bajo los 44 ideales.
- El popover sigue al disparador al scrollear.
- A 524px de ancho, en un monitor de 1280 con el disparador cerca del borde el clamp de `usePopover` va a trabajar; achicarlo lo resuelve.

## Preguntas

- Si `DateField` ya sabe mes + año buscable, ¿por qué esta pantalla tiene su propio calendario?
- Los tres presets cubren el 90%. ¿El calendario completo es la respuesta para el 10%, o lo es un cuarto preset más tipear las dos fechas?
- ¿Cuál es el caso más viejo que alguien va a pedir de verdad?
