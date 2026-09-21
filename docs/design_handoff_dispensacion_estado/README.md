# Handoff: Dispensación — estado de la entrega en el modal de visita

## Overview
Rediseño de la tarjeta **«Dispensación de medicación»** dentro del modal de visita (Spira Track / Pharma).
Problemas que resuelve, en el orden en que los planteó el Director:

1. **No se ve el estado de la dispensación.** Hoy vive en un tag chico al pie («Entregada», junto a «Pedido del 16 Sep 2026»). Pasa a ser lo primero que se lee.
2. **No se entiende que la medicación ya fue entregada.** Hoy es una lista de renglones idéntica a la de un pedido en curso. Pasa a leerse como un **comprobante** con número, fecha, quién entregó y sello de estado.
3. **«Corregir entrega» compite con «dispensar».** Pasa a enlace sobrio, chico, dentro del comprobante y alineado a la derecha; la acción de volver a dispensar queda afuera y abajo.
4. **Concomitante e IP parecían caminos distintos.** Van juntos: **una entrega, un comprobante, un estado**. El IP es un renglón más de esa entrega (la constancia adjunta).
5. **No se sabía cuándo fue la última entrega.** Historial **común a las dos partes**, con «Ver más» para recorrer las anteriores.

Archivo de referencia: `source/Dispensación - Estado de entrega (variantes) v2.html` (abrir en el navegador; ya trae `colors_and_type.css` al lado).

## About the Design Files
Son **referencias de diseño hechas en HTML/React-inline** — muestran look & behavior, no código para copiar. La implementación real va en `src/views/pharma/VisitDispensationPanel.tsx` (y los subcomponentes `Sub`, `SeccionIp`, `HistorialPlegado`), respetando los componentes y convenciones de la app.

## Fidelity
**Alta fidelidad.** Colores, tipografía, tamaños y jerarquía son normativos. Las tres variantes A/B/C y los tres accesos H1/H2/H3 son **alternativas a decidir**, no piezas a implementar todas.

## Tokens usados
Todos salen de `colors_and_type.css` (mismo set que el resto de Spira):

| Rol | Valor |
|---|---|
| Acento del panel (Track) | `#2E7D74` |
| Entregada | `#5C8A5A`, texto profundo `--spira-acc-deep-good` `#4A7248` |
| En preparación | `#B0823F`, texto profundo `--spira-acc-deep-warn` `#8C6520` |
| Texto | `--spira-ink`, secundario `--spira-ink-soft` `#4A5F5B`, terciario `--spira-muted` `#7C8C87`, rótulos `--spira-faint` |
| Superficies | card `--spira-white`, fondo de panel `color-mix(#2E7D74 5%, --spira-surface)` |
| Bordes | `--spira-line`, `--spira-line-2`; filetes internos del ticket: `1px dashed --spira-line-2` |
| Tipografías | display `Schibsted Grotesk`, texto `Hanken Grotesk`, mono `IBM Plex Mono` (números de comprobante, cantidades, nombres de kit) |
| Tintes | `color-mix(in srgb, <color> N%, white)` — 9% fondo de comprobante (A), 13% cinta (B), 35% borde |

Radios: tarjeta 16px · comprobante/ticket 12px · renglones 9–10px · píldoras `--spira-radius-pill`.

## Anatomía (común a las tres variantes)

### Encabezado del panel
Banda teal `#2E7D74` a sangre, alto ~36px, padding `10px 14px`, ícono `pill` 15px + título «Dispensación de medicación» 13px/700 en blanco.

### Comprobante (lo entregado en ESTA visita)
- **Estado**: sello/ícono + palabra («Entregada» / «En preparación»), 13.5–14px/700 en el color profundo.
- **Número**: `N° 86` en mono, a la derecha del estado (o grande, 20px, en C).
- **Línea de contexto**: `16 Sep 2026 · 17:02 · entregó M. Ferrer` (entregada) / `Pedido del 16 Sep 2026 10:30 · lo tiene M. Ferrer` (en proceso). 11.5px `ink-soft`.
- **Grupo «Concomitante»**: rótulo versalita 10.5px/700 tracking .14em; un renglón por medicamento, nombre a la izquierda (truncado con ellipsis) y cantidad en mono a la derecha. El N° de comprobante **ya no se repite por renglón** — es uno solo, el del encabezado.
- **Grupo «Producto en investigación»**: es **la constancia adjunta (PDF)**, no un kit ni un lote. Muestra nombre del archivo, peso, `firmada|cargada` + fecha y hora, quién la subió, y acción «Ver».
- **Pie del comprobante**: enlace sobrio, alineado a la **derecha**, `11.5px`, color `muted`, ícono `pencil` 12px:
  - entregada → **«Corregir esta entrega»**
  - en proceso → **«Cancelar solicitud»**

### Acción de volver a dispensar
**Afuera del comprobante**, debajo: botón de ancho completo, 38px, borde `#2E7D74 35%`, texto teal, ícono `plus` → **«Nueva dispensación»**. Nunca comparte peso visual con el enlace de corregir.

### Historial (común a concomitante + IP)
Al pie de la tarjeta, separado por `border-top 1px line`:
- Línea plegada: `Entrega anterior · V17 · 26 Ago 2026 · N° 71`, y debajo (opcional, según variante) qué llevó de cada parte.
- Enlace **«Ver más» / «Ocultar»** con chevron.
- Desplegado: una tarjeta por entrega con visita + fecha + N° de comprobante, y dos filas rotuladas **Concomitante** e **IP** (`Sin entrega` donde no hubo; «Ver» donde hay constancia).

## Estados

| Estado | Cómo se ve |
|---|---|
| **Entregada** | Verde `#5C8A5A`: sello de check, N° de comprobante, fecha/hora y quién entregó, renglones + constancia firmada, enlace «Corregir esta entrega». `screenshots/01-estado.png` |
| **En proceso** (solicitada / preparando / lista) | Ámbar `#B0823F`: mismo layout, «En preparación», línea `Pedido del … · lo tiene …`, enlace «Cancelar solicitud». En la variante B el paso activo se marca sobre el recorrido Solicitada → Preparando → Lista → Entregada. `screenshots/02-estado.png` |
| **Sin entrega** | Texto único para ambas partes: «En esta visita no se entregó medicación ni producto en investigación», botón primario «Registrar entrega» y el historial abajo. `screenshots/03-estado.png` |
| **Historial desplegado** | Lista de entregas anteriores con detalle por parte. `screenshots/04-estado.png` |

Pendientes de definir con Diseño antes de implementar (no están dibujados): IP que **no corresponde** en esta visita, entrega **parcial** / saldo, renglones «Otro medicamento» con receta, y la tarjeta en modo **corrección abierta**.

## Variantes del comprobante (elegir una)

- **A · Un comprobante, dos renglones** — el bloque entero se tiñe con el color del estado (9% de fondo, 35% de borde). Máxima señal de estado; el estado «pinta» toda la entrega.
- **B · Cinta de estado, lista única** — cinta teñida bajo el encabezado con estado + N° + recorrido de 4 pasos (barra 3px por paso, rótulo 9.5px, activo en 700); el cuerpo queda neutro. La mejor para entender **en qué punto** está un pedido en curso.
- **C · Ticket** — papel blanco, N° 86 en mono 20px, sello sólido a la derecha (píldora color pleno, texto blanco versalita), secciones separadas por filete punteado. Sin banda de color superior (se removió a pedido). La más «comprobante».

Ver `screenshots/01-estado.png` … `04-estado.png`: las tres aparecen lado a lado en cada captura, en el orden A · B · C.

## Accesos al historial (elegir uno, combinable con A/B/C)

- **H1 · Chip «Historial» en el encabezado** *(preferido)* — píldora outline blanca sobre la banda teal, a la derecha, ícono `history` 12px + rótulo **«Historial»**; abre un popover anclado (ancho ≤320px, `shadow-lg`, radius 12px) con la lista y «Cerrar». Siempre visible, no empuja el contenido. `screenshots/01-acceso.png`
- **H2 · Solapas** — «Esta visita» / «Historial · 3» sobre fondo blanco, subrayado 2px teal en la activa. El historial pasa a vista hermana. `screenshots/02-acceso.png`
- **H3 · Barra al pie + hoja** — línea con la entrega anterior siempre visible y «Ver las 3» a la derecha; abre una hoja que sube sobre la tarjeta (overlay `#1B2E2B 45%`). `screenshots/03-acceso.png`

Los rótulos evaluados para el chip fueron «Entregas anteriores», «Historial», «3 entregas» y «3»; **quedó «Historial»**. El selector de rótulos que aparece arriba de H1 en el prototipo es andamiaje de exploración: **no va a producción**.

## Interactions & Behavior
- Popover H1 y hoja H3 abren y cierran con clic; en la app deben cerrarse además con `Esc` y con clic afuera.
- «Ver más» del historial alterna la lista completa; el chevron rota 180°.
- Transiciones 130–150ms, `ease` por defecto; nada cambia `display` ni el flujo al pasar el mouse.
- Enlaces sobrios (`Corregir esta entrega`, `Cancelar solicitud`, `Ver`): color `muted`, hover a `--spira-primary`.
- Hit targets mínimos 32px de alto en las acciones reales; los enlaces de texto viven dentro de filas de ≥30px.

## Datos que necesita la vista
Por entrega (la de la visita y cada una del historial):
`visita`, `fecha` y `hora` de entrega, `estado` (solicitada|preparando|lista|entregada), `nro_comprobante`, `quien_entrego` / `quien_lo_prepara`, renglones de concomitante (`nombre`, `cantidad`), y la constancia de IP (`nombre_archivo`, `peso`, `subido_at`, `subido_por`, `url`, `firmada`).
El historial debe traer **las entregas del paciente**, no solo las de esta visita, y marcar explícitamente «Sin entrega» por parte cuando esa parte no llevó nada.

## Accesibilidad
- El estado nunca se apoya solo en color: siempre ícono + palabra.
- Texto sobre tinte en el color **profundo** (`acc-deep-good` / `acc-deep-warn`), nunca el color base, para mantener ≥4.5:1.
- El sello sólido de C usa texto blanco sobre color pleno.
- El N° de comprobante en mono debe ser texto seleccionable (se canta en el mostrador), no una imagen ni un badge decorativo.

## Files
```
design_handoff_dispensacion_estado/
├── README.md
├── screenshots/
│   ├── 01-estado.png     Entregada (A · B · C)
│   ├── 02-estado.png     En proceso
│   ├── 03-estado.png     Sin entrega
│   ├── 04-estado.png     Historial desplegado
│   ├── 01-acceso.png     H1 chip + popover
│   ├── 02-acceso.png     H2 solapas
│   └── 03-acceso.png     H3 hoja
└── source/
    ├── Dispensación - Estado de entrega (variantes) v2.html
    └── colors_and_type.css
```
