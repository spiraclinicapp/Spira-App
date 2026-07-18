# Handoff: Dispensaciones (Spira Pharma)

## Overview
Rediseño del módulo **Dispensaciones** de Spira Pharma — el flujo por el cual la farmacia clínica procesa las solicitudes de medicación que llegan (mayormente desde Coordinación) y las prepara, verifica, deja listas y entrega al paciente. Está pensado para **alto volumen diario**: la farmacéutica trabaja muchas solicitudes en paralelo, así que la interacción central es un **tablero Kanban por estado** con un cajón lateral (drawer) que resuelve cada solicitud sin sacar a la persona del contexto.

Estados del flujo: **Solicitada → Preparando → Lista para retirar → Entregada** (más un estado terminal **Rechazada**). Al pasar a *Lista* se genera un **comprobante** correlativo (N° 1044, 1045…) que se imprime; ese comprobante es la nota fuente que se sella y firma con la medicación al momento del retiro y va a la carpeta del paciente.

## About the Design Files
Los archivos de este paquete son **referencias de diseño hechas en HTML/CSS/JS vanilla** — un prototipo que muestra el look y el comportamiento buscados, **no** código de producción para copiar tal cual. La tarea es **recrear este diseño dentro del entorno del codebase destino** (React, Vue, etc.) usando sus patrones, librerías y sistema de estado ya establecidos. Si todavía no hay entorno, elegir el framework más apropiado e implementarlo ahí.

El prototipo usa un `reqs[]` en memoria y re-render por `innerHTML`; eso es solo andamiaje de la demo. En producción, reemplazar por el estado/datos reales del backend y por componentes del framework.

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografía, espaciados, radios, sombras e interacciones son finales. Recrear la UI de forma pixel-perfecta usando las librerías y patrones del codebase. Los tokens exactos están más abajo.

---

## Layout general (shell de la app)
Alto total = `100vh`, sin scroll de página; el scroll vive dentro de las columnas y el drawer.

Estructura de izquierda a derecha:
1. **Topbar** — 60px de alto, fondo blanco, borde inferior `--line`. Logo Spira (marca de gota + wordmark, `--fdisp` 20px 700) · divisor vertical · módulo activo "Pharma" con chip de ícono. A la derecha: buscador global (pill, placeholder "Buscar…" + `Ctrl K`), campana de notificaciones, avatar "SC / Spira Clinic".
2. **Rail** — 64px, íconos de navegación de módulos (grid, actividad, pharma [activo], candado). El activo lleva fondo `rgba(168,132,47,.14)` y color `--pharma-solid`.
3. **Submódulos** — 212px, fondo `--surface`. Lista: Resumen, Protocolos, Medicamentos, Recepción, **Dispensaciones** (activo), Reportes.
4. **Main** — flexible. Cabecera con breadcrumb "Spira Pharma › Dispensaciones", H1 "Dispensaciones" (`--fdisp` 26px 700, `letter-spacing:-.02em`) y botón primario **Nueva dispensación** alineado a la derecha.
5. **Content** — toolbar + tablero (o vista historial).

### Toolbar
- **Buscador** a la izquierda: input tipo pill, 300px, 42px alto, radio 999px, ícono lupa a la izquierda. Filtra por id, código de paciente, protocolo y nombre de medicamento. Focus: borde `--pharma-solid` + halo `rgba(168,132,47,.13)`.
- Un `spacer` empuja el resto a la derecha.
- **Filtro de protocolo** (`Todos ▾`) — pill que abre un menú con "Todos los protocolos" + cada protocolo único. El seleccionado lleva check dorado.
- **Filtro de fecha** (`Hoy · 17/07/2026 ▾`) — pill con menú de dos opciones: "Hoy" y "Ver todas / Histórico". Elegir "Hoy" fuerza vista tablero; "todas" fuerza vista historial.
- **Botón toggle Historial / Ver tablero** — alterna entre tablero Kanban y la lista agrupada por días. Al activarse queda con fondo `--ink` y texto `--paper`.

---

## Vista 1 — Tablero Kanban (por defecto)
`display:grid; grid-template-columns:repeat(4,1fr); gap:12px`. Una columna por estado, en orden: Solicitadas, Preparando, Listas, Entregadas.

**Columna** (`.col`): fondo blanco, borde `--line`, radio 14px. Cabecera (`.col-h`): punto de color del estado + nombre (`--fdisp` 14px 700) + contador (chip mono en `--surface`). Cuerpo (`.col-b`): fondo `--surface`, padding 11px, scroll vertical propio, gap 9px entre cards.

Colores de punto por estado:
- Solicitadas `#7C8C87` · Preparando `#3A6B8C` · Listas `#2E7D74` · Entregadas `#4E7A3F`

### Card de solicitud (`.kcard`)
Fondo blanco, borde `--line`, radio 12px, padding 12px/13px, sombra `--sm`. Hover: sombra `--md` + borde `--line2`. Toda la card es clickeable (abre el drawer). Estructura vertical:

1. **Fila superior** (`.kc-top`): avatar circular de paciente (28px, ícono persona, fondo `rgba(168,132,47,.14)`, color `--pharma-solid`) + **número de paciente** (`r.code`, ej. `P-204`, en mono, 13.5px 700) + chip de **protocolo** alineado a la derecha (mono 10.5px, pill dorado tenue).
2. **Medicamentos** (`.kc-med`): nombres concatenados por coma, 12.5px, `--ink`.
3. **Subfila** (`.kc-sub`, 11px, `--muted`): `{total} u.` · **número de dispensación** (`r.id`, ej. `D-1046`, en mono) · tiempo relativo (`hace 4 min`).
   > **Nota de la última iteración:** el nº de paciente va arriba junto al avatar; el nº de dispensación va abajo junto a las unidades. Respetar esta jerarquía.
4. **Indicador de estado** (según columna):
   - *Preparando:* `{n}/{total} escaneados` (azul si incompleto, verde si completo) con ícono de código de barras.
   - *Lista:* `Verificada · Comp. N° {corr}` en teal con check.
5. **CTA / footer:**
   - *Solicitada* → botón **Preparar** (fondo `--pharma-solid`).
   - *Preparando* → **Continuar** (azul) o **Marcar lista** (teal) si ya está todo escaneado.
   - *Lista* → **Entregar** (teal, texto blanco).
   - *Entregada* → sin botón; muestra `Comp. N° {corr}` con ícono de comprobante.

Columna vacía: texto centrado "Sin dispensaciones" en `--faint`.

---

## Vista 2 — Historial por días (`.listview`)
Lista vertical agrupada por `day` (`Hoy`, `Ayer`, `Martes 15 jul`…). Cada grupo: cabecera con eyebrow del día + línea divisoria + contador. Ignora el filtro de fecha (muestra todos los días) pero respeta búsqueda y protocolo.

**Fila (`.lcard`):** fondo blanco, radio 13px, padding 13/16px, flex horizontal, gap 13px:
- Avatar de paciente 38px.
- Bloque principal: línea 1 = **nº dispensación** (`--fdisp` 15px 700) · `· {código paciente}` (mono) · chip protocolo. Línea 2 = medicamentos · `{total} u.` (truncado con ellipsis).
- **Badge de estado** (pill con punto + etiqueta, color/tint según estado).
- Tiempo (`--faint`, mín 64px, derecha).
- A la derecha del todo: CTA de avance si aplica, o `N° {corr}` si ya tiene comprobante.

---

## Drawer lateral (cajón) — 480px, entra desde la derecha
`position:fixed; right:0; width:480px; max-width:94vw`, fondo `--paper`, sombra `--lg`, transición `transform .26s cubic-bezier(.4,0,.2,1)`. Scrim `rgba(20,48,46,.34)` detrás; click en scrim o X cierra.

**Cabecera** (`.dr-head`, blanca): avatar de paciente 44px + título (`{id} · {Estado}`, `--fdisp` 16px 700) + subtítulo (`{código paciente} · {protocolo} · {origen}`) + botón X.

**Barra de pasos** (`.dr-steps`): 3 segmentos — *Preparar + escanear* → *Lista para retirar* → *Entregar*. Los completados y el actual llevan barra `--pharma-solid`; el actual además texto dorado.

El contenido del cuerpo y del footer depende del estado:

### Estado Preparando (escaneo) — ver `screens/02`
- Etiqueta "Escaneá cada medicamento para confirmarlo · {n}/{total}".
- **Fila de escaneo:** input mono grande (50px, placeholder "Código de barras…", autofocus) + botón **Confirmar**. `Enter` o click confirma.
  - Simulación: sin texto → confirma el próximo ítem pendiente. Con EAN → busca en catálogo; si no existe, error "Ese código de barras no está en el catálogo."; si existe pero no corresponde al pendiente, error "Ese código es {X}, pero falta escanear {Y}.". Errores en `.scan-err` (rojo `--danger`).
- **Lista de ítems** (`.item`): ícono + nombre + dosis + `lote {lote}` (mono; los no escaneados muestran "— por asignar (FEFO)") + cantidad (`{qty} u.`) + estado ("A escanear" / "Confirmado"). El ítem confirmado toma fondo verde `rgba(92,138,90,.12)`.
- Nota FEFO: "Al marcar lista, el sistema asigna el lote por vencimiento (FEFO) y reserva el stock."
- **Footer:** **Rechazar** (outline, devuelve a Solicitadas y resetea escaneos) + **Marcar lista para retirar** (deshabilitado hasta escanear todo; al habilitarse pasa a teal). Al marcar lista se genera `corr` (comprobante) y se dispara toast + impresión.

### Estado Lista para retirar — ver `screens/03`
- **Comprobante** destacado (`.comprobante`, borde/acento teal): ícono de recibo, `N° {corr}` grande (`--fdisp` 34px, teal), etiqueta "Comprobante de dispensación · nota fuente".
- Nota teal: verificada y lista; imprimir para tenerlo listo; al retirar se entrega sellado y firmado y va a la carpeta.
- Lista de ítems (todos confirmados, con su lote).
- **Footer:** **Imprimir** (outline) + **Entregar al paciente** (teal).

### Estado Entregada — ver `screens/04`
- Comprobante en verde (`--good`): ícono check, `N° {corr}`, "Comprobante de dispensación".
- Sección "Entregado" con ítems. Nota FEFO (lotes asignados, stock descontado).
- **Footer:** **Cerrar** + **Imprimir comprobante**.

### Estado Rechazada
- Banner rojo "Solicitud rechazada · sin stock disponible del lote requerido." + sección "Pedido" con ítems. Footer: solo **Cerrar**.

### Nueva dispensación (alta manual) — ver `screens/05`
Se abre con el botón primario o (en el prototipo) tras entregar, para seguir en flujo. Formulario en el mismo drawer:
- Sección "Paciente y protocolo": input **Código IVRS** (placeholder `P-000`) + select **Protocolo** (RG-3041 / ACT18301 / EFC18244).
- Sección "Medicación solicitada": select de medicamento + select de cantidad (1-4) + botón **+ Agregar**. Los ítems agregados se listan con botón de quitar (X).
- **Footer:** **Cancelar** + **Crear y preparar** (deshabilitado hasta que haya código y ≥1 ítem). Al crear, la solicitud nace en estado *Preparando*, se hace unshift a la lista y se abre su drawer.

---

## Interacciones & comportamiento
- **Card click** → abre drawer de esa solicitud. **CTA dentro de card** → `event.stopPropagation()` para no abrir el drawer al avanzar de estado.
- **Avance de estado:** Preparar (solicitada→preparando, abre drawer) · Marcar lista (preparando→lista, requiere todo escaneado, genera comprobante) · Entregar (lista→entregada, genera comprobante si falta).
- **Toasts:** confirmación inferior-centro, fondo `--ink`, con check verde, autooculta a 2.4s. Ej.: "{id} lista · comprobante N° {corr} generado".
- **Menús (filtros):** click fuera cierra; el pill activo lleva borde `--pharma-solid`.
- **Transiciones:** drawer `transform .26s cubic-bezier(.4,0,.2,1)`; scrim `opacity .2s`; cards hover `box-shadow/border .15s`.
- **Autofocus** en el input de escaneo al abrir el drawer de Preparando.

## State management (a mapear en el codebase)
- **Colección de solicitudes** `reqs`, cada una: `id` (nº dispensación `D-####`), `code` (nº paciente `P-###`), `proto`, `ago` (tiempo relativo), `day`, `state` (`solicitada|preparando|lista|entregada|rechazada`), `source` (`Coordinación`/`Alta manual`), `corr` (nº comprobante, solo desde *lista*), `items[]` = `{ mid, qty, scanned, lot }`.
- **Catálogo** `CAT`: `{ id, name, dosis, ean }` — el `ean` valida el escaneo.
- **UI state:** `view` (`board|list`), `dateFilter` (`Hoy|todas`), `protoFilter`, `openId` (drawer de solicitud), `createDraft` (borrador de alta), `corr` (contador global de comprobantes, arranca en 1044).
- **Derivados:** `totalUnits`, `allScanned` (habilita "Marcar lista"), `visible` (búsqueda + protocolo + fecha).
- **Datos reales:** reemplazar el escaneo simulado por lectura de scanner/EAN real, y la generación de `corr` e impresión por los servicios del backend. La asignación de lote es FEFO (first-expired-first-out) al marcar lista.

---

## Design tokens
**Colores**
- `--ink #14302E` · `--primary #0F5F57` · `--paper #F4F1EA` · `--surface #FBFAF6` · `--white #FFFFFF`
- `--muted #7C8C87` · `--faint #A6B0AC` · `--line #E4DECF` · `--line2 #D8CBB0`
- Semánticos: `--good #5C8A5A` · `--warn #B0823F` · `--danger #A6483B` · `--blue #3A6B8C` · `--teal #2E7D74`
- Acento pharma: `--pharma #C9A24A` · `--pharma-solid #A8842F` (botones/activos) · `--on-accent #F4F1EA` (texto sobre acento)
- Estado entregada usa `#4E7A3F`. Fondos tenues frecuentes: `rgba(168,132,47,.14)` (dorado), `rgba(92,138,90,.12)` (verde ok), `rgba(46,125,116,.13)` (teal).

**Tipografía** (Google Fonts)
- `--fdisp 'Schibsted Grotesk'` — títulos, ids, cifras grandes (400–800).
- `--ftext 'Hanken Grotesk'` — texto/UI base (400–700). `body` 14px.
- `--fmono 'IBM Plex Mono'` — códigos, ids, EAN, cifras tabulares (`font-variant-numeric:tabular-nums`).

**Radios:** cards 12–14px · pills/botones 10px · inputs redondos 999px · avatares 50%.
**Sombras:** `--sm 0 1px 2px rgba(20,48,46,.06)` · `--md 0 12px 32px rgba(20,48,46,.10)` · `--lg -18px 0 48px rgba(20,48,46,.14)` (drawer).
**Espaciados frecuentes:** gap tablero 12px, gap cards 9px, padding content 16px/30px, drawer body 20/22px.

## Assets
- **Todos los íconos son SVG inline** (stroke, sin librería externa): lupa, campana, código de barras, calendario, filtro embudo, chevrons, check, impresora, comprobante, avatar de persona, íconos de nav. Recrearlos con la librería de íconos del codebase (Lucide/Heroicons u otra) buscando equivalentes por trazo.
- **Logo Spira:** marca de gota SVG inline (`stroke #0F5F57`) + wordmark tipográfico. Usar el asset de marca real del codebase.
- **Fuentes:** Schibsted Grotesk, Hanken Grotesk, IBM Plex Mono (Google Fonts).
- No hay imágenes rasterizadas ni fotos.

## Files
- `Dispensaciones - Tablero.html` — prototipo completo (markup + CSS en `<style>` + lógica en `<script>`). Fuente única de verdad para el diseño.
- `screens/01-tablero.png` — tablero Kanban (vista por defecto).
- `screens/02-drawer-preparando-scan.png` — drawer en Preparando con escaneo.
- `screens/03-drawer-lista-comprobante.png` — drawer en Lista con comprobante.
- `screens/04-drawer-entregada.png` — drawer en Entregada.
- `screens/05-nueva-dispensacion.png` — alta manual.
- `screens/06-historial-por-dias.png` — vista historial agrupada por días.
