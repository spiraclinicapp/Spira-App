# HANDOFF — Spira Track · Visitas (vista día)

Rediseño del listado de Visitas del día, tomando como referencia de lenguaje visual el apartado "Día" de la agenda personal. **No es la agenda**: es Visitas, con la fila reformulada.

- **Prototipo:** `Visitas - Dia.html`
- **Fuentes:** `visitas-v2/data.js`, `atoms.jsx`, `rows.jsx`, `detail.jsx`, `shell.jsx`
- **Configuración aprobada (la que hay que replicar):**

| Tweak | Valor |
|---|---|
| Jerarquía (`layout`) | `paciente` |
| Tags (`tagStyle`) | `punto` |
| Densidad (`density`) | `compacta` |
| Borde de estado (`rail`) | `true` |
| Mini ruta (`showRoute`) | `false` |
| Mostrar hora (`showTime`) | `true` |
| Agrupar por (`group`) | `hora` |
| Detalle (`detailStyle`) | `modal` |
| Animación (`anim`) | `suave` |
| Tema | claro |

Las demás variantes quedan en el prototipo como exploración; **no hace falta implementarlas**. Si se implementan, están descritas en el anexo al final.

---

## 1. Tokens

Los mismos del sistema Spira. `violet` es el único agregado nuevo (procedimientos).

### Claro
```
ink      #14302E   texto principal
primary  #0F5F57   marca
paper    #F4F1EA   fondo de la app
surface  #FBFAF6   fondo de bloques internos
white    #FFFFFF   fondo de tarjetas
muted    #7C8C87   texto secundario
faint    #A6B0AC   texto terciario / íconos apagados
line     #E4DECF   bordes suaves
line2    #D8CBB0   bordes de control
good     #5C8A5A   verde
warn     #B0823F   ámbar
danger   #A6483B   rojo
accent   #2E7D74   acción primaria
blue     #3A6B8C   azul
gold     #A8842F   dorado
violet   #6B5CA5   violeta
shadow   rgba(20,48,46,.14)
scrim    rgba(20,38,36,.42)
```

### Oscuro
```
ink #E9F2EF · primary #1F8A7E · paper #0E1B1A · surface #142523 · white #17302C
muted #8AA39D · faint #5E726D · line #27403B · line2 #34504A
good #74B071 · warn #D2A35C · danger #D17468 · accent #43A597
blue #6FA0C2 · gold #D2A35C · violet #9C8FD4
shadow rgba(0,0,0,.5) · scrim rgba(4,12,11,.62)
```

### Tipografía
- **Display** `Schibsted Grotesk` 500/600/700/800 — H1, hora, nombre del paciente, títulos de tarjeta, nombre de protocolo.
- **Texto/UI** `Inter` 400/500/600/700/800 — todo lo demás.
- Todo número identificatorio (hora, N° de paciente, fechas, contadores) lleva `font-variant-numeric: tabular-nums`.

### Convención de color con alpha
Los fondos tenues se escriben como `color + "XX"` en hex de 8 dígitos:
`10` ≈ 6%, `12` ≈ 7%, `14` ≈ 8%, `16` ≈ 9%, `18` ≈ 9.5%, `1A` ≈ 10%, `1F` ≈ 12%, `22` ≈ 13%, `55` ≈ 33%.

---

## 2. Estados de la visita

Cinco etapas secuenciales + un estado fuera de ruta.

| key | label | short | tono |
|---|---|---|---|
| `por_llegar` | Por llegar | Por llegar | `muted` |
| `en_el_sitio` | En el sitio | En sitio | `accent` |
| `atendido` | Atendido | Atendido | `blue` |
| `listo` | Listo para irse | Listo | `good` |
| `fuera` | Fuera del sitio | Fuera | `faint` |
| `no_vino` | No vino | No vino | `danger` |

**Regla importante:** en la columna de hora **siempre se usa `short`**, nunca `label`. Es lo que evita que "Fuera del sitio" o "Listo para irse" se superpongan con el contenido de al lado. `label` completo se usa sólo en el chip de estado, el filtro y el modal.

### Acción siguiente por estado
| estado actual | botón primario | pasa a |
|---|---|---|
| `por_llegar` | Marcar en sitio | `en_el_sitio` |
| `en_el_sitio` | Marcar atendido | `atendido` |
| `atendido` | Listo para irse | `listo` |
| `listo` | Marcar salida | `fuera` |
| `fuera` | *(sin botón)* pastilla "Finalizada" | — |
| `no_vino` | Deshacer | `por_llegar` |

---

## 3. Procedimientos

Cada visita lleva 0..n procedimientos. Catálogo:

| key | label | letra | tono | detalle (modal) |
|---|---|---|---|---|
| `sangre` | Sangre | S | `danger` | Extracción de laboratorio central |
| `procedimiento` | Procedimiento | P | `violet` | Procedimiento del protocolo |
| `ecg` | ECG | E | `blue` | ECG de 12 derivaciones |
| `orina` | Orina | O | `gold` | Muestra de orina / test de embarazo |
| `dispensacion` | Dispensación | D | `accent` | Entrega de medicación del estudio |
| `pk` | PK | K | `violet` | Muestreo farmacocinético seriado |
| `cuestionario` | Cuestionario | C | `muted` | Cuestionario de calidad de vida |

### Tratamiento visual en la fila — variante `punto` (la aprobada)
```
● Procedimiento   ● Sangre
```
- Punto de 7×7 px, `border-radius: 50%`, color = tono del procedimiento.
- Texto: 11.5 px / peso 600 / color `muted`.
- `gap: 6px` entre punto y texto; `gap: 6px` entre tags; `flex-wrap: wrap`.
- Sin fondo, sin borde, sin pastilla.

En el **modal** los tags sí van en la variante rica (círculo con la letra) — ver §7.

---

## 4. Estructura de la pantalla

```
┌ Topbar 56px ─────────────────────────────────────────────────┐
├ Rail 58 ─┬ Submenú 216 ─┬ Contenido ───────────────────────── ┤
│          │              │  Cabecera (padding 20 28 0)         │
│          │              │  Lista (scroll, padding 18 28 40)   │
└──────────┴──────────────┴─────────────────────────────────────┘
```

- Rail: 58 px, `background: white`, `border-right: 1px line`. Íconos 19 px, celda 38×38, radio 11. Activo: fondo `accent+18`, ícono `accent`.
- Submenú: 216 px, `background: surface`, `border-right: 1px line`. Ítems 13 px, padding `9px 11px`, radio 10. Activo: fondo `white` + `border 1px line` + peso 600.
- Contenido: `max-width 1480`, `min-width 1180` (por debajo scrollea horizontal — es una vista de escritorio).

### Cabecera
1. Breadcrumb 12.5 px `muted`: `Spira Track › Visitas`.
2. `<h1>` **Visitas de hoy** — Display 700, 30 px, `letter-spacing -.02em`, `white-space: nowrap`.
3. Al lado del H1, misma línea, alineado a la base, 13 px `muted`:
   `lunes 3 ago · 14 visitas · 7 por llegar · 5 en el sitio · 1 no vino`
   Los contadores se colorean: por llegar `warn`, en el sitio `accent`, no vino `danger`, todos peso 600. Cada segmento aparece sólo si su contador es > 0.
4. Buscador a la derecha: 230×36, radio 10, `border 1px line2`, fondo `white`, ícono `search` 15 px `faint`, placeholder `Paciente, N° o protocolo…`, botón ✕ cuando hay texto. Filtra por nombre, N°, nombre de protocolo y tag de visita (case-insensitive, `includes`).
5. Fila de filtros: `padding: 14px 0`, `gap 8`, `flex-wrap: wrap`.
6. **No hay línea divisoria debajo de los filtros.** La separación la dan la hora del grupo y su regla.

---

## 5. Filtros

Cuatro filtros multi-selección + un selector simple de agrupación.

### Filtro multi (Estado · Protocolo · Coordinador · Médico)
Disparador:
- Alto 36, padding `0 12px`, radio 10, `gap 8`.
- Inactivo: `border 1px line2`, fondo `white`, texto `muted` 13 px/600.
- Activo (≥1 seleccionado) o abierto: `border 1px accent`; activo además fondo `accent+12` y texto `accent`.
- Contenido: ícono 14 px (`filter` / `file` / `user` / `stethoscope`) + label + badge de conteo + chevron.
- Badge: `min-width 18`, alto 18, radio 999, fondo `accent`, texto blanco 11/700.
- Chevron `chevronDown` 14 px, rota 180° al abrir, `transition: transform .16s`.

Popover:
- `position: absolute; top: 42; left: 0; z-index: 30`, ancho 200 (Estado/Protocolo) o 220 (Coordinador/Médico).
- Fondo `white`, `border 1px line`, radio 12, `box-shadow: 0 14px 34px shadow`, padding 6.
- Lista con `max-height: 264px; overflow: auto`.
- Ítem: alto natural, padding `8px 9px`, radio 8, `gap 10`. Seleccionado: fondo `accent+10`, texto `ink` 600.
- Checkbox: 16×16, radio 5, `border 1.5px line2`; marcado: fondo `accent`, check blanco 11 px stroke 3.
- A la derecha del label, conteo de visitas del día que caen en esa opción, 11.5 px `faint`.
- Pie "Limpiar" (sólo si hay selección): alto 30, `border-top 1px line`, texto `muted` 12.5/600.
- Cierra con clic fuera (`mousedown` en `document`).
- Animación de entrada: `v2-menu .14s cubic-bezier(.2,.85,.25,1)` — `opacity 0→1`, `translateY(-6px) scale(.98) → none`.

### Selector "Agrupar por"
Mismo disparador pero de selección única y sin badge: `Agrupar por  **Hora**  ⌄`. El valor actual va en `ink`, la etiqueta en `muted`. Opciones: **Hora · Estado · Protocolo · Coordinador · Médico · Sin agrupar**. En el popover, la opción activa lleva un check `accent` a la izquierda en una columna fija de 15 px.

Antes de este control hay un separador vertical: 1×22 px, `background: line`, `margin: 0 4px`.

### Limpiar todo
Cuando `nFilters > 0` aparece a la derecha de los filtros un botón texto `✕ Limpiar N` (12.5/600, `muted`, sin borde ni fondo) que resetea los cuatro filtros y el buscador.

### Ayuda
Alineado a la derecha de la fila de filtros, 12 px `faint`:
`Clic en la fila para abrir el detalle · ↑↓ para navegar`

### Lógica de filtrado
AND entre categorías, OR dentro de cada categoría. El buscador se aplica encima.

---

## 6. La fila (variante `paciente`, densidad `compacta`)

```
┌─┬──────────────────────────────────────────────────────────────────────────────────────┐
│▍│ 08:00   Mariño, Carlos Adolfo                        ⌾ Coord.  Valeria Araya   [Visto por médico] [Marcar salida →] [⋯]│
│ │ Listo   [ATLAS-7] #0320040058 [V6] Visita 6 · Semana 24  ⌾ Médico Dr. F. Salas │
│ │         ● Procedimiento  ● Sangre                                              │
└─┴──────────────────────────────────────────────────────────────────────────────────────┘
```

### Contenedor
- `background: white`, radio 14, `border: 1px solid line`, `box-shadow: 0 1px 2px shadow`.
- `padding: 11px 16px`; con borde de estado, `padding-left: 22px`.
- `display: flex; align-items: center; gap: 16px`. `overflow: hidden` (recorta el rail).
- `cursor: pointer`. Separación entre filas: `gap 6px` (compacta) / `9px` (cómoda).

### Borde de estado (rail)
`position: absolute; left 0; top 0; bottom 0; width 4px`, color = tono del estado. Es el indicador de estado a distancia.

### Hover
`border-color: line2`, `box-shadow: 0 6px 18px shadow`, `transform: translateY(-1px)`.
`transition: box-shadow .18s ease, transform .18s ease, border-color .18s ease`.

### Foco (fila abierta en el modal)
`border-color: accent`, `outline: 2px solid accent44`.

### Columna hora — ancho fijo 66 px (74 en cómoda)
- Hora: Display 700, 17 px (19 en cómoda), `letter-spacing -.01em`, tabular, `line-height 1.15`, color `ink`.
- Debajo: `short` del estado, 11.5/700, color = tono del estado, `nowrap` + `ellipsis`, `margin-top 2`.
- Si `showTime = false`, la columna se reemplaza por el chip de estado completo en un ancho fijo de 84 px.

### Bloque central (`flex: 1; min-width: 0`)
**Línea 1** — nombre del paciente: Display 700, 17 px (19 en cómoda), `letter-spacing -.01em`, `line-height 1.2`, `nowrap`. Formato `Apellido, Nombre`.

**Línea 2** (`margin-top: 6`, `gap 8`, `flex-wrap: wrap`):
- **Etiqueta de protocolo**: padding `3px 10px`, radio 7, fondo `tono+16`, texto Display 700 13 px del mismo tono. El tono sale del protocolo (ver §9).
- **N° de paciente**: `#0320040058`, 12.5 px `muted`, tabular.
- **Tag de visita**: padding `2px 9px`, radio 6, fondo `ink`, texto `paper` 11.5/800. Es el elemento de mayor contraste de la fila; se lee de un vistazo (V6, V140, EOT, F y V1, VNP).
- **Nombre de la visita**: 12.5 px `faint` (ej. "Visita 6 · Semana 24", "Fin de tratamiento").

**Línea 3** (`margin-top: 9`): tags de procedimiento, variante `punto`.

### Columna responsables — ancho fijo 206 px, alineada a la derecha
Dos líneas, `gap 4`, `overflow: hidden`:
```
⌾ Coord.  Valeria Araya
⌾ Médico  Dr. Federico Salas
```
Cada línea: ícono 13 px `faint` (`user` / `stethoscope`) + rol 12 px `faint` + nombre 12 px `ink` 600. `nowrap`.

### Acciones — `gap 6`, anchos fijos (crítico)
Los tres controles **no cambian de tamaño nunca**; la columna derecha queda perfectamente alineada entre filas.

1. **Botón médico** — ancho fijo **134 px** (148 en cómoda), alto 34 (38), radio 10, `gap 7`, contenido centrado, ícono `stethoscope` 15 px en los tres estados:
   - *No marcado:* `border 1px line2`, fondo `white`, texto `muted` 13/600 — **"Quiere médico"**.
   - *Marcado, sin ver:* `border 1px accent`, fondo `accent+12`, texto `accent` — **"Espera médico"**.
   - *Visto:* no es botón, es una pastilla: fondo `good+14`, texto `good`, `border 1px transparent` — **"Visto por médico"**, `title` = `Visto por {médico}`.

   Clic alterna `wantsDoctor` (y sincroniza el submódulo "Para ver médico"). El estado *Visto* no es reversible desde acá.

2. **Botón primario** — ancho fijo **150 px** (158 en cómoda), alto 34 (38), radio 10:
   - Activo: fondo `accent`, texto blanco 13/700, `box-shadow: 0 2px 8px accent3D`, ícono `arrowRight` 14 px a la derecha. Label según §2.
   - `no_vino`: `border 1px line2`, fondo `white`, texto `muted` 600, ícono `undo` — "Deshacer".
   - `fuera`: no es botón, es una pastilla fondo `good+14`, texto `good`, check 14 px — "Finalizada".

3. **Menú ⋯** — 34×34, radio 9, ícono `dots` 17 px `faint`, sin borde. Abierto: `border 1px line2` + fondo `surface`.
   Popover 186 px, mismo estilo que los filtros, `top: 38; right: 0`. Ítems padding `8px 10px`, radio 8, 13 px:
   `Marcar como no vino` (color `danger`, oculto si ya está en `no_vino`) · `Reprogramar visita` · `Ver ficha del paciente` · `Copiar N° de paciente`.

### Interacción de la fila
- Toda la fila es clicable → abre el modal.
- `role="button"`, `tabIndex=0`.
- Enter/Space abre el modal **sólo si el evento nació en la fila misma** (`e.target === e.currentTarget`). Sin esta guarda, Enter sobre un botón interno dispara la acción *y* abre el modal.
- Todos los botones internos hacen `stopPropagation()` en `onClick` **y** en `onKeyDown`.

---

## 7. Modal de detalle

Se abre con clic en cualquier parte de la fila (fuera de los botones).

### Envoltorio
- Scrim: `position: absolute; inset: 0; z-index: 60`, fondo `scrim`, `padding: 22`, centrado. Clic en el scrim cierra.
- Panel: `width: min(1020px, 95vw)`, `max-height: 90vh`, radio 20, fondo `paper`, `border 1px line`, `box-shadow: 0 28px 70px scrim`, `overflow: hidden`, `display: flex; flex-direction: column`.

### Animación (`suave`)
- Scrim: `v2-scrim .18s ease` (opacity 0→1).
- Panel entrada: `v2-pop .24s cubic-bezier(.2,.85,.25,1)` — `opacity 0→1`, `scale(.96) translateY(10px) → none`.
- Salida (ambos): 180 ms; panel `v2-out` — `scale(.97) translateY(6px)`, opacity → 0. El cierre se difiere 180 ms para que la salida se vea.

### Header (fondo `white`, `padding: 18px 22px 16px`, `border-bottom 1px line`)
A la izquierda, una barra vertical de 4 px `align-self: stretch`, radio 3, color = tono del estado (eco del rail de la fila).

**Línea 1** — protocolo, es el título:
`ATLAS-7` Display 700 **28 px** `-.02em` + al lado, 13 px `faint`: `EFC18419 · Fase III · Cardiología`.

**Línea 2** (`margin-top: 8`, `gap 9`, `flex-wrap: wrap`) — separadores `•` de 3×3 px `line2`:
`Mariño, Carlos Adolfo` (16/700 `ink`) · `#0320040058` (13 `muted` tabular) • `[V6]` • `Visita 6 · Semana 24` (13 `muted`) • `🕐 08:00` • chip de estado grande • flag de médico.

Chip de estado grande: padding `5px 12px`, radio 999, fondo `tono+1A`, texto del tono 12.5/700, con punto 6×6.

**Línea 3** (`margin-top: 11`) — **todos los tags de procedimiento en variante rica**:
padding `3px 11px 3px 4px`, radio 999, fondo `tono+16`, texto del tono 12.5/600, y a la izquierda un círculo 19×19 fondo del tono con la **letra** en blanco 10.5/800. `title` = detalle del procedimiento. Si no hay: "Sin procedimientos" 12.5 `faint`.

**Controles arriba a la derecha** (`gap 6`): posición `1/14` (12 px `faint`, tabular) · ▲ · ▼ · ✕. Los tres botones: 32×32, radio 9, `border 1px line`, fondo `white`, ícono 16 px `muted`.

### Cuerpo — grilla de 2 columnas iguales, `padding: 18`, `gap: 14`, `overflow: auto`, `align-items: start`

Todas las tarjetas: fondo `white`, `border 1px line`, radio 14, `padding: 16px 18px`. Título Display 700 15.5 px, `margin-bottom 12`, con un slot a la derecha.

**Columna izquierda**

1. **Ruta en el sitio** — a la derecha del título, el chip de estado.
   Stepper vertical de las 5 etapas:
   - Nodo 24×24 radio 50%. Completado: fondo del tono + check blanco 13 px stroke 2.6. Actual: fondo `white`, `border 2px tono`, `box-shadow: 0 0 0 4px tono22`, punto interior 6×6. Pendiente: fondo `surface`, `border 2px line2`, punto `line2`.
   - Conector: 2 px de ancho, `min-height 12`, `margin: 2px 0`; `tono` si está completado, `line` si no.
   - Texto: label 13.5 px (700 si es la actual, 600 si no; `ink` si hecha/actual, `faint` si pendiente) + sublabel 11.5 `muted`: *Completado / Etapa actual / Pendiente*. `padding-bottom: 12` salvo el último.
   - Si el estado es `no_vino`, el stepper se reemplaza por un aviso: fondo `danger+10`, radio 11, padding `12px 14px`, ícono `alert` 17 `danger`, texto 13: *"El paciente no se presentó. La visita queda pendiente de reprogramación."*
   - **Pie de acción** (`margin-top: 14`, `gap 8`): botón primario a ancho completo (alto 42, radio 11, fondo `accent`, `box-shadow: 0 2px 10px accent40`, 13.5/700 + flecha). En `por_llegar` se le suma a la derecha un botón secundario **"No vino"** (alto 42, padding `0 15px`, `border 1px line2`, fondo `white`, `muted`). En `no_vino`, un único botón secundario "Deshacer «no vino»". En `fuera`, pastilla "Visita finalizada" (`good+14`).

2. **A cargo** — filas de dato (ver formato abajo): `Coordinador`, `Médico a cargo`, y si `wantsDoctor`, `Atención médica` (→ "Visto {hora}" en `good`, o el motivo en `accent`).
   Debajo, si aún no fue visto, botón a ancho completo (alto 38, radio 10, ícono `users` 15):
   - no marcado: `border 1px accent`, fondo `accent+10`, texto `accent` — "Marcar que quiere médico".
   - marcado: `border 1px line2`, fondo `white`, texto `muted` — "Quitar de Para ver médico".

3. **Paciente** — filas de dato: `Sexo` (ícono `venus`/`mars`), `Edad` (`{n} años`), `Nacimiento` (dd/mm/aaaa, tabular), `Potencial fértil` (Sí/No).

**Formato de fila de dato:** `padding: 9px 0`, `border-top: 1px line`, `gap 10`; ícono 15 px `faint` + label 12.5 `muted` + valor a la derecha 13/600 `ink`.

**Columna derecha**

4. **Procedimientos de la visita** — a la derecha del título, `hechos/total` 12.5/600 `muted` tabular.
   Cada procedimiento es un botón que alterna hecho/pendiente:
   - `padding: 10px 12px`, radio 11, `gap 11`, `transition: background .15s, border-color .15s`.
   - Pendiente: `border 1px line`, fondo `surface`. Hecho: `border 1px tono55`, fondo `tono+0D`.
   - Cuadro 26×26, radio 8: pendiente → fondo `tono+1F` con la **letra** en el tono; hecho → fondo `tono` con check blanco.
   - Label 13.5/700 `ink` + detalle 11.5 `muted` debajo.
   - A la derecha, 11.5/700: "Hecho" (en el tono) o "Pendiente" (`faint`).
   - Vacío: "Esta visita no lleva procedimientos." 12.5 `faint`.

5. **Comentarios** — contador a la derecha del título.
   - Cada comentario: avatar 28×28 radio 50% con iniciales (fondo `rol+1F`, texto del rol) + autor 12.5/700 + pastilla de rol (10.5/700, fondo `rol+18`, radio 5, padding `1px 6px`) + tiempo relativo 11 `faint` alineado a la derecha + burbuja: fondo `surface`, `border 1px line`, radio 10, padding `8px 11px`, 13 px, `line-height 1.5`.
   - Color por rol: Médico `accent`, Enfermería `blue`, Recepción `gold`, Coordinación `violet`.
   - Vacío: "Sin comentarios todavía." 12.5 `faint`.
   - Composer: `border-top 1px line`, `padding-top 12`, input alto 36 (radio 10, `border 1px line2`, fondo `surface`) + botón "Enviar" alto 36 padding `0 14px`. Deshabilitado con texto vacío (fondo `line`, texto `faint`, `cursor: not-allowed`). Enter envía.

### Navegación y teclado (esto es lo que hace fluido el modal)
- `↑` / `k` → visita anterior · `↓` / `j` → siguiente. Recorre **la lista filtrada y ordenada tal como se ve**, con wrap circular. El contenido cambia sin cerrar ni reanimar el panel.
- `Esc` cierra.
- Los atajos se ignoran si el foco está en un `INPUT` o `TEXTAREA`.
- El contador `n/total` del header refleja la posición dentro de la lista visible.
- La fila correspondiente en el fondo queda marcada como *focused* (`border accent` + `outline accent44`).

---

## 8. Agrupación

Encabezado de grupo (`padding: 0 2px 9px`, `gap 10`):
- Etiqueta Display 700 13 px, `letter-spacing .04em`, `text-transform: uppercase`, color `muted`, tabular.
- Conteo del grupo 12 px `faint`.
- Regla: `flex: 1; height: 1px; background: line`.

Separación entre bloques de grupo: 14 px (compacta) / 18 px (cómoda).

| Agrupar por | Orden de grupos | Etiqueta |
|---|---|---|
| Hora | ascendente | `08:00` |
| Estado | orden de la ruta, `no_vino` al final | label completo |
| Protocolo | orden del catálogo | nombre |
| Coordinador | orden del catálogo | nombre |
| Médico | orden del catálogo | nombre |
| Sin agrupar | — | sin encabezado |

Los grupos vacíos no se renderizan.

### Estado vacío
Centrado, `padding: 70px 20px`: título Display 700 17 px `muted` "Ninguna visita coincide con los filtros" + botón "Limpiar filtros" (alto 36, `border 1px line2`, fondo `white`, texto `accent`).

---

## 9. Modelo de datos

```ts
Protocol {
  id: string
  name: string        // "ATLAS-7" — es el título del modal
  code: string        // "EFC18419"
  phase: string       // "Fase III"
  area: string        // "Cardiología"
  tone: "blue"|"accent"|"violet"|"gold"|"good"   // color de la etiqueta
}

Visit {
  id: string
  time: "HH:MM"
  protoId: string
  visitTag: string    // "V6" | "EOT" | "F y V1" | "VNP"
  visitName: string   // "Visita 6 · Semana 24"
  estado: "por_llegar"|"en_el_sitio"|"atendido"|"listo"|"fuera"|"no_vino"
  procs: ProcKey[]
  procsDone: ProcKey[]
  coordinador: string
  medico: string
  wantsDoctor: boolean
  doctorSeen: boolean
  doctorSeenAt?: "HH:MM"
  doctorMotivo?: string
  patient: {
    name: string      // "Apellido, Nombre"
    num: string       // 10 dígitos
    sex: "Femenino"|"Masculino"
    age: number
    dob: "dd/mm/aaaa"
    fertile: boolean
  }
  comments: Comment[]
}

Comment { id, author, initials, role: "Médico"|"Enfermería"|"Recepción"|"Coordinación", at, txt }
```

Tonos de protocolo usados en la demo: ATLAS-7 `blue`, MERIDIAN `accent`, HELIOS-2 `violet`, CORVUS `gold`, NOVARA `good`. Asignar de forma estable por protocolo (hash del id contra la paleta) para que el color no cambie entre sesiones.

---

## 10. Keyframes

```css
@keyframes v2-scrim     {from{opacity:0}to{opacity:1}}
@keyframes v2-scrim-out {from{opacity:1}to{opacity:0}}
@keyframes v2-pop       {from{opacity:0;transform:scale(.96) translateY(10px)}to{opacity:1;transform:none}}
@keyframes v2-out       {from{opacity:1;transform:none}to{opacity:0;transform:scale(.97) translateY(6px)}}
@keyframes v2-menu      {from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}
@keyframes v2-pulse     {0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.65)}}
```

---

## 11. Checklist de QA

- [ ] La columna derecha (botón médico + botón primario + ⋯) está alineada al pixel en todas las filas, en todos los estados.
- [ ] Pasar una visita por los 5 estados no cambia el ancho de ningún botón.
- [ ] "Fuera del sitio" y "Listo para irse" muestran `Fuera` / `Listo` en la columna de hora, sin recorte ni superposición.
- [ ] No hay línea divisoria entre la barra de filtros y la lista.
- [ ] Tab hasta un botón de la fila + Enter ejecuta **sólo** ese botón; no abre el modal.
- [ ] Los popovers de filtro y el menú ⋯ cierran con clic fuera y se dibujan por encima de las filas.
- [ ] Con el modal abierto, ↑↓ recorre la lista filtrada, no la lista completa.
- [ ] Escribir en el composer de comentarios y presionar ↑ no cambia de visita.
- [ ] Los contadores de la cabecera y los del popover de filtros responden a los filtros activos.
- [ ] Modo oscuro: revisar rail, chips y `tono+alpha` sobre `white` = `#17302C`.

---

## Anexo — variantes exploradas (no requeridas)

Quedan en el prototipo por si sirven más adelante:

- **Jerarquía `protocolo`**: el nombre del protocolo pasa a ser el titular (Display 700 19/22 px) y el paciente baja a la segunda línea. Útil si el criterio de lectura pasa a ser el estudio.
- **Jerarquía `tabla`**: grilla densa de 56 px de alto, columnas `hora | protocolo | paciente | visita | procs (círculos con letra) | coord/médico | estado + acciones`.
- **Tags `letra`**: pastilla con círculo + letra (la que usa el modal). **Tags `solido`**: pastilla llena del tono con texto blanco.
- **Densidad `comoda`**: +4 px en la mayoría de las medidas, `gap 9` entre filas.
- **Mini ruta**: stepper horizontal de 92 px con las 5 etapas, entre el bloque central y los responsables.
- **Mostrar hora `false`**: la columna de hora se reemplaza por el chip de estado.
- **Detalle `panel`**: el mismo detalle como drawer derecho `min(620px, 96vw)`, radio `20px 0 0 20px`, una sola columna, entrada `translateX(100%) → 0` en 320 ms.
- **Animación `resorte`** (`cubic-bezier(.18,1.3,.32,1)`, 420 ms, overshoot a 1.02) y **`rapido`** (130 ms, sin escala perceptible).
