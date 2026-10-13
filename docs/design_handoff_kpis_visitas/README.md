# Handoff · Visitas — fila de KPIs (reskin 2A)

Reemplaza la fila de 4 KPIs del encabezado de **Visitas** (Visitas de hoy · Atrasados · Próximas visitas · Pacientes activos). Los datos y el comportamiento no cambian. Cambian dos cosas:

1. **Se elimina el botón** "Estudios y pacientes →" de la 4ª tarjeta. Ahora **las cuatro tarjetas son el acceso**: toda la superficie es clicable y navega a su lista.
2. **El renglón secundario se dibuja**: barra de proporción (Atrasados, Pacientes activos) y tira semanal con conteo por día (Próximas visitas).

Referencia visual: `KPIs-referencia.html` (2A). Exploración completa: `../Visitas - KPIs (variantes).html`.

---

## Grilla
- 4 columnas `repeat(4, minmax(0,1fr))`, gap **14px**.
- Responsive: ≤ 900px → 2 columnas; ≤ 520px → 1 columna (la tira semanal no se achica por debajo de 7 × 22px).

## Tarjeta (común a las 4)
| Propiedad | Valor |
|---|---|
| Elemento | `<a>` (o `<button role="link">`) que envuelve toda la tarjeta |
| Fondo | `--spira-white` `#FFFFFF` |
| Borde | 1px `--spira-line` `#E4DECF` |
| Radio | 16px |
| Padding | 18px 20px |
| Layout | columna; rótulo → cifra → visual → leyenda |

**Rótulo**: punto 7×7 (color semántico) + texto 13px / 600 `--spira-muted`, gap 8px.
**Cifra**: IBM Plex Mono 600 36px, line-height 1, letter-spacing −.02em, `tabular-nums`, `--spira-ink`. Margen 12px arriba y abajo.
**Unidad** (al lado de la cifra, alineada a la base): 13px `--spira-muted`, gap 10px.
**Leyenda**: 12px `--spira-muted`, `justify-content: space-between`, margen superior 9px.

### Estados
| Estado | Cambio |
|---|---|
| Reposo | Sin sombra. Flecha oculta. |
| Hover | Borde `--spira-line-2` `#D8CBB0` · sombra `0 6px 18px rgba(20,48,46,.08)` · `translateY(-1px)` · rótulo pasa a `--spira-ink` · aparece la flecha |
| Focus-visible | Igual que hover + anillo 2px `--spira-primary` con offset 2px |
| Activo | `translateY(0)`, sin sombra |

Transición: 150ms en borde/sombra/transform.

**Flecha de esquina**: ícono ↗ 14px, trazo 2.2, `--spira-primary`. Contenedor 28×28 redondo, absoluto `top:14px; right:14px`. Reposo: `opacity 0` + `translate(-4px, 4px)`. Hover: `opacity 1`, sin desplazamiento, fondo `rgba(15,95,87,.08)`. Transición 180ms. Es decorativa (`aria-hidden`), y el link lleva el `aria-label` (ej. "Ver atrasados").

---

## Contenido por tarjeta

### 1 · Visitas de hoy → Vista Día (hoy)
- Punto `--spira-good`. Cifra = visitas de hoy. Unidad "de N" (total del día).
- Barra: realizadas / total del día. Si el total es 0, va la pista vacía.
- Leyenda: "sin visitas hoy" cuando es 0. Si no, "N realizadas" / "N pendientes".

### 2 · Atrasados → Lista filtrada por atrasados
- Punto `--spira-danger`. Cifra = total de atrasados.
- Barra de 2 tramos con gap 2px: **ventana vencida** `--spira-danger` (ancho = vencidas/total) y **en ventana** `#E3C9A0` (resto).
- Leyenda izq.: "N ventana vencida" en `--spira-danger` 600. Der.: "N en ventana" (= total − vencidas).

### 3 · Próximas visitas → Vista Semana
- Punto `--spira-good`. Cifra = visitas del **día de la próxima visita**. Unidad = fecha de ese día ("Miércoles 14/10").
- **Tira semanal** (lunes a domingo de la semana en curso), sin leyenda debajo:
  - Grilla de 7 columnas, gap 4px. Cada columna: celda del día arriba y conteo abajo, gap 4px.
  - Celda: alto 22px, radio 6px, inicial del día en IBM Plex Mono 600 10px.
  - Conteo: IBM Plex Mono 600 10.5px, centrado.

| Estado del día | Celda | Conteo |
|---|---|---|
| Sin visitas | fondo `#F3EFE6`, letra `--spira-faint` | "0" en `--spira-faint` 500 |
| Con visitas | fondo `rgba(46,125,116,.18)`, letra `--spira-primary` | `--spira-ink-2` |
| Próxima visita | fondo `--spira-track` `#2E7D74`, letra blanca | `--spira-primary` |
| Hoy | contorno 1.5px `--spira-line-2`, letra `--spira-ink` | según cantidad |

  Si hoy también tiene visitas, se combinan el contorno de "hoy" y el fondo de "con visitas".
  Si la próxima visita cae fuera de la semana en curso, la tira muestra la semana de esa visita.

### 4 · Pacientes activos → Estudios y pacientes
- Punto `--spira-good`. Cifra = activos. Unidad "de N" (registrados).
- Barra: activos/registrados en `--spira-good`.
- Leyenda izq.: "N registrados". Der.: "N inactivos" (= registrados − activos).

## Barra de proporción (común)
Alto 6px, radio 99px, pista `#EFEBE1`. Los tramos son `display:block` con radio 99px. Si hay más de un tramo, gap 2px.

## Colores nuevos
`#E3C9A0` (tramo "en ventana"), `#EFEBE1` (pista) y `#F3EFE6` (día vacío) todavía no son tokens. Propuesta:
- `--spira-kpi-track: #EFEBE1`
- `--spira-kpi-empty: #F3EFE6`
- `--spira-warn-soft: #E3C9A0`

Para el modo oscuro, derivarlos de `--spira-line` / `--spira-surface`.

## Pendiente de confirmar
- Que "9 en ventana" (total − vencidas) y "4 inactivos" (registrados − activos) sean cuentas correctas para el negocio.
- El texto de la leyenda de "Visitas de hoy" cuando hay visitas.
