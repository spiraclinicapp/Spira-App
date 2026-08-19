# HANDOFF — Inicio / Resumen

Vista de inicio de Spira (módulo **Inicio**, ruta `Inicio › Resumen`).
Idioma de la UI: **español rioplatense**.
Fecha del handoff: 17/08/2026.

---

## 0. Contenido del bundle

| Archivo | Qué es |
|---|---|
| `Resumen - Inicio.html` | **Referencia principal.** La vista completa dentro del shell de la app (header, riel de módulos, migas), a 1560px. Abrir en el navegador. Debajo del marco de la app va la especificación del glosario de frases y eventos. |
| `Anatomía - Resumen.html` | **Especificación visual pieza por pieza.** Cada bloque a tamaño real con su tabla de medidas al costado, más escala tipográfica y paleta. Es el archivo para tener abierto mientras se implementa. |
| `referencias/Resumen - vista completa.png` | Captura de la vista entera, para pegar en tickets. |
| `referencias/Glosario - frases y eventos.png` | Captura de la especificación del glosario. |
| `spira-app-tokens.css` | Tokens del design system Spira (colores, tipografía, radios, sombras, estados). |
| `assets/` | Isotipo recortado de la Fundación, logo completo original, isotipo de Spira. |
| `README.md` | Este documento: layout, medidas, copy, reglas de comportamiento y pendientes. |

### Cómo leerlo

Abrir `Resumen - Inicio.html` para ver la vista, `Anatomía - Resumen.html` al lado para las medidas, y usar este README para las reglas que no se ven en una captura (rotación de frases, prioridad de eventos, qué es mock).

**Los HTML de este bundle son referencias de diseño, no código de producción.** Son estáticos, con estilos inline y datos mock. La tarea es recrear el diseño en el codebase de destino con sus componentes y patrones; si el codebase ya tiene los tokens de Spira, usar esos y no re-declarar hex.

**Fidelidad: high-fidelity.** Colores, tipografía, espaciados, radios y copy están definitivos. Lo único deliberadamente provisorio es la imagen de portada de Novedades (placeholder rayado) y los datos numéricos, que son mock.

---

## 1. Estructura general

Dentro del área de contenido del shell (`main` con padding `16px 26px 26px`):

```
grid  grid-template-columns: minmax(0,1fr) 372px
      gap: 16px
      align-items: start          ← alturas naturales, sin estirar
│
├── COLUMNA IZQUIERDA  (flex column, gap 14px)
│   ├── A. Banda de saludo (petróleo)
│   ├── B. Card Fundación Scherbovsky + números de la clínica
│   └── C. Grilla de módulos activos (2 columnas, gap 14px)
│
└── COLUMNA DERECHA (372px fijos)
    └── D. Card Novedades
```

Reglas de layout que NO hay que cambiar:
- La columna derecha es de **372px fijos**; la izquierda es fluida (`minmax(0,1fr)`).
- `align-items: start`: cada columna termina donde termina su contenido. Se probó estirar los cards (numbers y módulos) y se descartó por decisión de diseño.
- Nada de alturas forzadas ni `height:100%` en los cards.

---

## 2. A — Banda de saludo

Contenedor: `border-radius:18px`, `padding:26px 28px`, `display:flex; align-items:center; gap:32px`,
fondo `linear-gradient(140deg, var(--spira-primary), var(--spira-primary-deep))`, texto `var(--spira-on-accent)`.

**Bloque izquierdo** (`flex:1; min-width:0`), de arriba a abajo:

| Elemento | Especificación | Contenido |
|---|---|---|
| Fecha | 10.5px / `letter-spacing:.16em` / uppercase / 700 / `opacity:.7` | `Domingo 16 de agosto` |
| Saludo | `--spira-font-display` 700 · 30px · `letter-spacing:-.025em` · `line-height:1.1` · `margin-top:9px` | `Buen día, Lautaro` |
| **Frase del día** | 14.5px · `line-height:1.5` · `opacity:.9` · `max-width:460px` · `margin-top:9px` | `Espero que tengas un domingo genial.` |
| **Píldora de evento** | `inline-flex`, `gap:9px`, `padding:7px 13px 7px 10px`, `border-radius:999px`, fondo `rgba(244,241,234,.14)`, borde `1px solid rgba(244,241,234,.22)`, `margin-top:13px`. Ícono 15px trazo `#F0E4C9` (moño de regalo, lucide-style, `stroke-width:1.9`). Texto 12.5px / 600 | `Hoy cumple años Valeria Fernández` |

**Bloque derecho**: `display:flex; align-items:flex-start; gap:26px; padding-left:32px; border-left:1px solid rgba(244,241,234,.22)`.
Tres cifras: `--spira-font-display` 700 · 44px · `letter-spacing:-.035em` · `line-height:1`; rótulo 12.5px `opacity:.8` `margin-top:6px`.

| Cifra | Rótulo | Color |
|---|---|---|
| 4 | visitas hoy | hereda (`on-accent`) |
| 5 | dispensaciones pendientes (2 líneas) | hereda |
| 3 | ventanas vencidas (2 líneas) | `#F0BFB4` (salmón claro sobre petróleo) |

Comportamiento:
- La **frase** sale del glosario de frases (§6). Rota por día.
- La **píldora** aparece solo si la fecha coincide con un evento del glosario. Sin evento, la píldora no se renderiza (la frase queda como última línea).

---

## 3. B — Card Fundación Scherbovsky

Card: `background:var(--spira-white)`, `border:1px solid var(--spira-line)`, `border-radius:16px`, `padding:20px 22px 18px`.

### 3.1 Fila superior — identidad institucional
`display:flex; align-items:center; gap:22px`. Tres bloques:

1. **Lockup** (`display:flex; align-items:center; gap:13px`)
   - `assets/fundacion-mark.png` — **solo el isotipo** (vilano recortado del logo original), `height:48px; width:auto`. `alt=""` porque el nombre va como texto al lado.
   - Nombre: `--spira-font-display` 700 · 17.5px · `letter-spacing:-.02em` · `line-height:1.15` → `Fundación Scherbovsky`
   - Bajada: 12px `var(--spira-muted)` `margin-top:3px` → `un cambio de aire`
   - Nota: el logo completo (`assets/fundacion-scherbovsky.png`) NO se usa acá — a 44-62px de alto su tipografía queda ilegible y compite con la de Spira.
2. **Descriptor** (`flex:1; min-width:250px; padding-left:22px; border-left:1px solid var(--spira-line)`), ambas líneas con `white-space:nowrap`:
   - 13.5px / 600 / `var(--spira-ink)` → `Centro de investigación médica`
   - 12.5px / `var(--spira-ink-soft)` / `margin-top:3px` → `Líder en ensayos clínicos en el país`
3. **Credenciales** (`display:flex; align-items:center; gap:18px; flex-shrink:1`) — 4 items, cifra `--spira-font-display` 700 · 19px · `letter-spacing:-.02em`; rótulo 11.5px `var(--spira-ink-soft)` `margin-top:4px`:

| Cifra | Rótulo |
|---|---|
| +20 | años de experiencia |
| +120 | estudios realizados |
| +5.000 | pacientes en ensayos |
| +40 | sponsors confían |

> Datos tomados del sitio de la Fundación. **Confirmar antes de producción** y definir si son estáticos (config) o calculados.

### 3.2 Fila inferior — números de la clínica
Separador: `margin-top:18px; padding-top:16px; border-top:1px solid var(--spira-line)`.
`display:grid; grid-template-columns:repeat(5,minmax(0,1fr))`, sin gap; divisores `border-left:1px solid var(--spira-line)` en las columnas 2-5. Padding: col 1 `padding-right:18px`, cols 2-4 `padding:0 18px`, col 5 `padding-left:18px`.
Cifra: `--spira-font-display` 700 · 26px · `letter-spacing:-.025em`. Rótulo 12px `var(--spira-ink-soft)` `margin-top:5px`.

| Cifra | Rótulo | Color |
|---|---|---|
| 128 | pacientes en seguimiento | ink |
| 7 | protocolos activos | ink |
| 86 | visitas realizadas | ink |
| 41 | dispensaciones entregadas | ink |
| 96% | visitas dentro de ventana | `var(--spira-good)` |

**No lleva rótulo de sección ni "Últimos 30 días"** (se sacó por decisión de diseño). El período de cálculo son los últimos 30 días; si hace falta comunicarlo, va en tooltip, no como texto.

---

## 4. C — Módulos activos

`display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px`.
**Solo se muestran los módulos disponibles.** Laboratorio y Contable (bloqueados) NO aparecen en esta vista.

Card de módulo: `var(--spira-white)`, `border:1px solid var(--spira-line)`, `border-radius:16px`, `overflow:hidden`, `display:flex`.
- Barra de acento: `width:5px; flex:0 0 5px`, color del módulo.
- Cuerpo: `flex:1; min-width:0; padding:19px 21px` (alto natural, sin `justify-content`).
- Encabezado: `display:flex; align-items:center; gap:11px`
  - Chip de ícono 38×38, `border-radius:11px`, fondo = acento al 11-13% de alfa, ícono 20px trazo del acento.
  - Título `--spira-font-display` 700 · 17.5px; subtítulo 12.5px `var(--spira-ink-soft)` `margin-top:2px`.
  - Flecha `→` 17px trazo `var(--spira-faint)` a la derecha.
- Cifras: `display:flex; gap:26px; margin-top:17px`; cifra `--spira-font-display` 700 · 24px `letter-spacing:-.02em`; rótulo 12px `var(--spira-ink-soft)` `margin-top:4px`.

| Módulo | Acento | Chip | Ícono | Subtítulo | Cifras |
|---|---|---|---|---|---|
| Coordinación | `var(--spira-track)` | `rgba(46,125,116,.13)` | activity | Agenda, visitas y alertas | 4 visitas hoy · 12 esta semana · **3 alertas** (`--spira-danger`) |
| Farmacia | `var(--spira-pharma)` | `rgba(15,95,87,.11)` | pill | Recepción, stock y dispensación | 2 por verificar · 5 pendientes · **1 lote por vencer** (`--spira-acc-deep-warn`) |

Card completo clickeable → entra al módulo.

---

## 5. D — Card Novedades (372px)

`var(--spira-white)`, `border:1px solid var(--spira-line)`, `border-radius:16px`, `overflow:hidden`. De arriba a abajo:

1. Encabezado `padding:15px 18px 0`: título `--spira-font-display` 700 · 16px `Novedades`; a la derecha `Ver todas` 12.5px / 600 / `var(--spira-primary)`.
2. **Portada** `margin:13px 18px 0; height:132px; border-radius:12px`. Placeholder actual: `repeating-linear-gradient(135deg,#EFEBE1 0 9px,#E6E0D2 9px 18px)` con etiqueta mono 10.5px `portada · 640×280`. **Reemplazar por imagen real** (ratio ≈ 640×280, `object-fit:cover`).
3. Novedad destacada `padding:14px 18px 0`:
   - Chip `Producto · v0.9.2`: alto 20px, `padding:0 8px`, `border-radius:999px`, fondo `rgba(15,95,87,.10)`, texto 10.5px/700 `var(--spira-primary)`; al lado fecha relativa 11.5px `var(--spira-faint)`.
   - Título `--spira-font-display` 700 · 18px `letter-spacing:-.02em` `margin-top:9px`.
   - Bajada 12.5px `line-height:1.55` `var(--spira-ink-soft)`.
   - `Leer la novedad` 12.5px/600 `var(--spira-primary)` `margin-top:11px`.
4. Dos novedades secundarias: bloque con `border-top:1px solid var(--spira-line)`, etiqueta de categoría 11.5px/700 (`Clínica` → `var(--spira-acc-deep-warn)`, `Equipo` → `var(--spira-muted)`) + fecha 11.5px `var(--spira-faint)`; título 14px/600 `var(--spira-ink-2)`.
5. Pie `padding:12px 18px`, `border-top:1px solid var(--spira-line)`, fondo `var(--spira-surface)`: ícono mail 15px, texto `Resumen del lunes por mail` 12.5px `var(--spira-ink-soft)`, switch 34×20 (`border-radius:999px`, fondo `var(--spira-primary)`, perilla 16px blanca a 2px del borde).

**Pendiente (siguiente iteración): apartado de Tutoriales.** Va debajo de Novedades, en la misma columna de 372px, como card hermano — o como segunda pestaña dentro de este card. A definir.

---

## 6. Saludo del día — frases

La línea bajo el nombre sale de una lista de frases y rota por día de la semana, con variantes para no repetir la misma cada siete días.

Frases base cargadas:
1. Espero que tengas un lunes genial.
2. Te deseo que hoy sea un día genial.
3. Que sea un miércoles tranquilo.
4. Gracias por estar de este lado del mostrador.
5. Un viernes más cerca del fin de semana.
6. Buen fin de semana, que descanses.

Reglas:
- Tono: cercano, breve, una sola oración, sin emoji.
- El nombre del día se interpola cuando la frase lo pide (`Espero que tengas un {día} genial.`).
- Si la fecha tiene evento, **la frase del evento reemplaza a la frase del día**.

---

## 7. Glosario de eventos

Eventos previstos:

| Evento | Fecha | Origen |
|---|---|---|
| Cumpleaños del equipo | variable | ficha de la persona |
| Aniversario en Spira | variable | fecha de ingreso |
| Día del Médico | 3 de diciembre | fijo |
| Día del Farmacéutico | 10 de agosto | fijo |
| Día de la Enfermería | 21 de noviembre | fijo |
| Día del Investigador | 10 de abril | fijo |
| Fechas patrias | 25 de mayo, 20 de junio, 9 de julio | fijo |
| Fiestas | Navidad y Año Nuevo | fijo |
| Aniversario de la Fundación | **a confirmar** | fijo |
| Cierre de estudio | última visita de un protocolo | dato del protocolo |

Reglas de prioridad:
- Si hay dos eventos el mismo día, **gana el personal** (cumpleaños o aniversario); el otro pasa a Novedades.
- Un solo evento por día en la píldora.
- Los eventos personales solo se muestran a quienes comparten clínica con la persona.

---

## 8. Configuración › Glosario  ← A CONSTRUIR

Sección nueva en **Configuración** para que el equipo cargue y edite todo esto sin tocar código. Requisitos:

- **Frases**: lista editable (agregar, editar, eliminar, activar/desactivar). Campo de texto + día de la semana opcional. Vista previa de cómo queda en la banda de saludo.
- **Eventos**: alta manual con nombre, fecha (fija anual o puntual), frase asociada, alcance (toda la clínica / un módulo / una persona) y estado activo. Los recurrentes se repiten cada año.
- **Cumpleaños y aniversarios**: se toman de la ficha de cada persona; en esta sección solo se activa o desactiva su aparición.
- **Orden de prioridad** configurable si dos eventos caen el mismo día.
- Permisos: edición solo para administración de la clínica.
- Import/export de fechas (CSV) para la carga inicial — el usuario carga todas las fechas.

---

## 9. Tokens y literales

Todos los colores y fuentes salen de `spira-app-tokens.css`; no hay hex nuevos salvo los tres literales del final. Tokens usados: `--spira-primary` `#0F5F57`, `--spira-primary-deep` `#0B4A42`, `--spira-on-accent` `#F4F1EA`, `--spira-paper` `#F4F1EA`, `--spira-white` `#FFFFFF`, `--spira-surface` `#FBFAF6`, `--spira-line` `#E4DECF`, `--spira-line-2` `#D8CBB0`, `--spira-ink` `#14302E`, `--spira-ink-2` `#2A4744`, `--spira-ink-soft` `#556966`, `--spira-muted` `#7C8C87`, `--spira-faint` `#A6B0AC`, `--spira-good` `#5C8A5A`, `--spira-danger` `#A6483B`, `--spira-track` `#2E7D74`, `--spira-pharma` `#0F5F57`, `--spira-acc-deep-warn` `#6E5620`.

Tipografía: `--spira-font-display` = Schibsted Grotesk (cifras y títulos), `--spira-font-text` = Inter (cuerpo), `--spira-font-mono` = Inter con `font-variant-numeric: tabular-nums`.

Literales admitidos (solo estos tres):
- `#F0BFB4` — cifra de alerta sobre la banda petróleo.
- `#F0E4C9` — trazo del ícono de la píldora de evento.
- `#EFEBE1 / #E6E0D2` — rayado del placeholder de portada (se va cuando entra la imagen real).

Radios: cards 16px, banda de saludo 18px, chips de ícono 11px, portada 12px, píldoras 999px.
Bordes: siempre 1px `var(--spira-line)`. Sin sombras dentro del contenido (la sombra la pone el marco del shell).

---

## 10. Assets del bundle

| Archivo | Uso |
|---|---|
| `assets/fundacion-mark.png` | isotipo (vilano) recortado — el que se usa en el card, 48px de alto |
| `assets/fundacion-scherbovsky.png` | logo completo original — de archivo, no se usa en la vista |
| `assets/spira-vilano-petrol.svg` | isotipo de Spira en el header del shell |

Íconos: lucide, trazo 1.9-2px, sin relleno, color por token.

Fuente de verdad en el proyecto de diseño: `Resumen - Variantes.dc.html`, shell `InicioShell.dc.html`.

---

## 11. QA / criterios de aceptación

- [ ] Las dos columnas usan alturas naturales; ningún card estirado.
- [ ] Solo módulos activos en la grilla; Laboratorio y Contable no se listan.
- [ ] Descriptor de la Fundación en dos líneas, una línea cada una, sin cortes.
- [ ] La fila de números de la clínica no tiene rótulo de sección.
- [ ] La frase del día cambia con el día; con evento aparece la píldora y la frase del evento.
- [ ] Sin evento, no se renderiza la píldora (no queda un hueco).
- [ ] Cifras en Schibsted Grotesk, cuerpo en Inter.
- [ ] Contraste AA en 11-13px (usar `ink-soft`, no `faint`, para texto chico).
- [ ] Tema oscuro: la banda petróleo no se invierte; el resto sigue los tokens.
