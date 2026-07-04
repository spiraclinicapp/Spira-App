# Spira Pharma — Submódulo Recepción · Handoff

Paquete de implementación para Claude Code. Diseño final aprobado del flujo de **Recepción**
(Spira Pharma): paso de escaneo, lista de recepciones y wizard de "Nueva recepción".

## Qué se aprobó

| id  | Qué es | Estado |
|-----|--------|--------|
| **2a** | **Paso de escaneo** — buscador central con ícono de barras a la derecha + listado de medicamentos cargados | ✅ a implementar |
| **1b** | **Lista de recepciones** — cards agrupadas por día, filtros en chips | ✅ a implementar |
| **1d** | **Wizard "Nueva recepción"** (Setup → Escaneo → Lotes → Resumen), navegable. Su paso 2 ES el diseño 2a | ✅ a implementar |

2a es la pantalla de escaneo, que vive **dentro del wizard 1d** como paso "Escaneo". Se entrega
también suelta (2a) para ver ese módulo en detalle. 1b es la vista de listado a la que se vuelve
tras crear una recepción.

## Estructura

```
handoff_recepcion_v2/
├── README.md                       ← este archivo (specs + tokens)
└── design/
    ├── Recepcion-Final-v2.dc.html  ← diseño de referencia (abrir en navegador)
    ├── SpiraChrome.dc.html         ← shell reutilizable (topbar + rail + submódulos)
    ├── support.js                  ← runtime del artefacto de diseño (no portar)
    ├── assets/spira-vilano-petrol.svg
    └── _ds/.../colors_and_type.css ← tokens de marca (fuente de verdad)
```

> **Sobre los `.dc.html`**: son el artefacto de diseño (mini-runtime React). **No los portes
> tal cual** — son la **referencia visual exacta**. Abrilos en el navegador y leé el markup
> inline. Reimplementá en el stack real usando los tokens de `colors_and_type.css` + las specs.

## Tokens (usar SIEMPRE las variables, nunca hex sueltos)

Definidos en `design/_ds/.../colors_and_type.css`. Los más usados en Recepción:

- **Marca / acento Pharma**: `--spira-pharma` `#C9A24A` · `--spira-pharma-solid` `#A8842F` (botones/acciones)
- **Texto**: `--spira-ink` `#14302E` · `--spira-muted` `#7C8C87` · `--spira-faint` `#A6B0AC`
- **Superficies**: `--spira-paper` `#F4F1EA` · `--spira-surface` `#FBFAF6` · `--spira-white` `#FFF`
- **Líneas**: `--spira-line` `#E4DECF` (divisores) · `--spira-line-2` `#D8CBB0` (bordes de input)
- **Semántico**: `--spira-good` `#5C8A5A` · `--spira-warn` `#B0823F` · `--spira-danger` `#A6483B`
- **Chip "Ambulatoria"**: `--spira-contable` `#3A6B8C`
- **Tipos**: display `Schibsted Grotesk` (títulos/números/marca) · texto `Hanken Grotesk` (UI) · mono `IBM Plex Mono` (códigos/lotes/EAN)
- **Radios**: sm 8 · md 10 · lg 16 · pill 999 · **Sombras**: `--spira-shadow-sm/md/lg`

### Convenciones visuales
- Acción primaria = fondo `--spira-pharma-solid`, texto `--spira-paper`, radius 10–12px, alto 40–50px.
- Input activo/foco = borde 2px `--spira-pharma-solid` + halo `0 0 0 3px rgba(168,132,47,.12)`.
- Chip "Protocolo" = `rgba(168,132,47,.14)` + texto `--spira-pharma-solid` + punto del mismo color.
- Chip "Ambulatoria" = `rgba(58,107,140,.12)` + texto `--spira-contable` + punto del mismo color.
- Códigos de barra, EAN y lotes siempre en `--spira-font-mono`.
- Números grandes (ítems, cantidades) en `--spira-font-display` 700 + `tabular-nums`.

## Especificación funcional

### 2a — Paso de escaneo
- **Buscador central**: input grande (alto ~50px) con placeholder "Escaneá o tipeá el código y Enter".
  **Ícono de código de barras + lupa alineado a la derecha** dentro del input (ámbar). Botón "Buscar" al lado.
- Texto de ayuda: "Cada beep suma una unidad. Ajustá la cantidad con − / + si hace falta."
- Atajo: "¿Sin lector? **Buscar a mano**" (link ámbar).
- **Listado de medicamentos cargados**: card con filas; cada fila = ícono pastilla, nombre del
  medicamento, EAN (mono), **stepper −/+** de cantidad, botón quitar (×).
- **Footer del listado**: "N medicamentos · M ítems" (números en display + ícono de paquete).
- Estado vacío (no diseñado aquí): mostrar prompt "Escaneá el primer medicamento".

### 1b — Lista de recepciones
- **Header**: breadcrumb "Spira Pharma › Recepción" + título "Recepción". A la derecha, botón
  **"Nueva recepción"** (icono +) → abre el wizard 1d.
- **Filtros** en chips: búsqueda libre · Todas / Protocolo / Ambulatoria · 7 días / 30 días · "Más filtros".
  Campos completos a soportar: Protocolo, Tipo, Fecha/rango, Medicamento, búsqueda libre.
- **Agrupación por día**: encabezado de fecha + conteo. Cada recepción es una card: ícono,
  medicamento, protocolo (código mono) + lote, chip de tipo, nº de ítems, chevron.
- Click en card → detalle de la recepción (fuera de alcance).

### 1d — Wizard "Nueva recepción"
Stepper de 4 pasos. Barra de acciones fija abajo (Atrás / Siguiente · "Crear recepción" en el último). "Cancelar" arriba a la derecha.

1. **Setup** — Tipo (Farmacia Protocolo / Ambulatoria / Producto Investigación *próximamente, deshabilitado*) + selección de Protocolo.
2. **Escaneo** — **es el diseño 2a** (ver arriba).
3. **Lotes** — Por medicamento: nº de lote, vencimiento, cantidad; "Dividir en varios lotes". Indicador "Cantidad cubierta X/Y".
4. **Resumen** — Fecha de recepción, notas opcionales, detalle recibido, nota de trazabilidad. CTA "Crear recepción".

#### Reglas
- Siguiente avanza; en el último paso dice "Crear recepción".
- "Atrás" no aparece en el paso 1.
- Stepper: completados con check, actual resaltado (ámbar), futuros atenuados.
- Tipo de recepción es selección única; "Producto Investigación" visible pero deshabilitado.

## Notas de implementación
- Hit targets ≥ 44px (steppers −/+ y botones cumplen).
- Estados a contemplar (confirmar con producto): lista vacía, código no encontrado,
  lote vencido (`--spira-danger`), stock parcial.
- El shell (`SpiraChrome`) es compartido por todo Spira Pharma — consumir el layout existente,
  no reimplementarlo dentro de Recepción.
