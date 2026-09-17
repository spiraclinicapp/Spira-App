# Handoff · Bandera de estado del paciente + enlace «Resumen»

**Pantalla:** Spira Coordinación → Protocolo → tab **Pacientes** (y la lista «Todos los pacientes», que usa la misma fila).
**Archivos de esta carpeta:**
- `Bandera de estado y enlace Resumen.html` — especificación visual: plegado, desplegado, tema oscuro, medidas y tokens.
- `colors_and_type.css` — tokens usados por el HTML.

---

## 1 · Qué cambia

Dos piezas de `PdPatientRow`, sin mover la organización de la información (identidad · tracker · acción se quedan donde están):

1. **El punto de estado pasa a ser una bandera con la palabra.** Mismo lugar (esquina superior derecha, absoluto, fuera del flujo del texto) y mismo dato, pero deja de depender del color y del `title`: dice «Activo» / «Inactivo» en 9,5px sobre un tinte del color semántico, apoyada en el radio de la tarjeta. El motivo: con 47 de 48 pacientes activos, un punto verde repetido 47 veces no informa, y el rojo del inactivo se lee como «hay un problema acá» antes de que se sepa qué dice.

2. **El botón «Resumen» pasa a ser un enlace de texto, al pie de la columna derecha.** La bandera y el botón con borde se disputaban los mismos ~90px de esquina. Sin caja el objeto baja de 86×30 a ~78×17 y se alinea con la base del renglón del médico: **estado arriba a la derecha, acción abajo a la derecha**. La palabra sigue siendo «Resumen» y el comportamiento no cambia (despliega `PdFullSchedule` en la misma fila, con `stopPropagation`).

No cambia: el click de la fila entera abre la ficha; el nombre y el IVRS siguen siendo `PatientLink`; el panel desplegado es `PdFullSchedule` tal cual está.

## 2 · Archivos a tocar

| Archivo | Cambio |
| --- | --- |
| `src/components/EstadoPaciente.tsx` | Nueva forma `'bandera'` junto a `'punto'` y `'etiqueta'`. Mantiene `role="img"` + `aria-label` + `title` con los textos de `EXPLICACION` que ya existen. |
| `src/views/track/PdPatientRow.tsx` | `<EstadoPaciente forma="bandera" …>` en lugar del `punto` con `style={{position:'absolute',top:4,right:4}}` (la bandera se ancla en `top:0 right:0`). El `<button>` de «Resumen» pasa a enlace: se le saca `height/padding/border/background/borderRadius` y se le pone la celda con `alignSelf:'end'`. |
| `src/views/PatientFichaView.tsx` | Usa el mismo `punto` en la esquina; pasarlo a `forma="bandera"` para que las dos pantallas sigan hablando igual. |
| `src/views/pharma/…` (tabla con columna Estado) | **Sin cambios**: ahí va `forma="etiqueta"`, que ya muestra la palabra. |
| `src/styles/tokens.css` | Dos tokens de tinta nuevos (`--spira-flag-good-ink`, `--spira-flag-off-ink`), con su override en `[data-theme="dark"]`. Los fondos van como `color-mix` en la regla de la bandera. |

## 3 · Bandera

```
position: absolute; top: 0; right: 0;
display: inline-flex; align-items: center; gap: 6px;
padding: 4px 11px 5px;                 /* alto resultante: 22px */
border-top-right-radius: 13px;         /* 14 del card − 1 del borde */
border-bottom-left-radius: 10px;
font-size: 9.5px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase;
background: var(--spira-flag-good-bg); color: var(--spira-flag-good-ink);
```

- Punto interno de 6px con el color pleno (`--spira-good` / `--spira-acc-deep-danger`): la forma sigue siendo el segundo canal, como pide WCAG 1.4.1.
- Sin sombra y sin borde: se apoya en la tarjeta, no flota sobre ella.
- El fondo es un `color-mix` **declarado en la regla del componente**, no en un token: dentro de una custom property, `var(--spira-white)` se resuelve en el elemento que la declara (`:root`), así que un token quedaría con el tinte claro horneado y el tema oscuro no lo recalcularía. Puesto en la regla, sigue al fondo de la card en los dos temas. La **tinta** sí es token y se aclara en oscuro (ver tokens).
- A11y: `role="img"` + `aria-label` con el texto largo («Paciente activo: en seguimiento»). El `title` queda por si el mouse pasa, pero ya no es la única fuente del dato.

## 4 · Enlace «Resumen»

```
display: inline-flex; align-items: center; gap: 5px;
border: 0; background: none; padding: 0;
font-size: 12.5px; font-weight: 600; line-height: 1.35;   /* 17px de alto */
color: var(--spira-track);                                 /* accent del módulo */
border-bottom: 1px solid transparent;                      /* el subrayado del hover */
```

- Celda de acción: `justifySelf: 'end'; alignSelf: 'end'; paddingBottom: 1px; display: flex; justifyContent: flex-end` → la base del enlace coincide con la del renglón «Dr. …».
- Subrayado en `:hover`, `:focus-visible` y `[aria-expanded="true"]` (mientras está abierto queda subrayado, que es la señal de estado que antes daba el fondo lleno del botón).
- El chevron de 14px gira 180° con `transition: transform .15s`. **La palabra no cambia al abrir** — sigue diciendo «Resumen»; lo que cambia es el `title` («Ver» / «Ocultar el recorrido de visitas»).
- Sigue siendo un `<button type="button">` con `aria-expanded` y `stopPropagation`, no un `<a>`: no navega.
- Área de click: el texto + chevron dan ~78×17. Si se quiere blanco más generoso sin volver a la caja, ampliar con `padding: 6px 2px` y compensar con `margin-bottom: -6px` (no cambia la posición óptica de la base).

## 5 · Qué se probó y se descartó

- **Punto con borde verde en la tarjeta** — descartado por el Director: el estado es un dato del paciente, no una franja que tiña la tarjeta entera.
- **«Recorrido», «Ver visitas», «Cronograma», «8 visitas», «Línea de tiempo»** como palabra del enlace — se mantiene «Resumen», que es la que ya conoce el equipo.
- **Control al pie de la tarjeta (franja de 35px)** y **chevron centrado bajo el tracker** — resuelven el apretón pero cambian la silueta de la fila; quedan como plan B si la lista gana columnas.
- Exploraciones completas: `Pacientes - Indicador de estado (variantes).html`, `Pacientes - Bandera de estado y control del desplegable.html`, `Pacientes - Enlace del desplegable (lugar y palabra).html` (raíz del proyecto).
