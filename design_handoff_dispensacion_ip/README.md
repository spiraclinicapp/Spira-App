# Handoff de diseño — Dispensación de IP: la tarjeta partida en dos

**Fecha:** 2026-08-09 · **Módulo:** Track (detalle de visita) + Pharma (cajón)
**Especificación:** [`docs/superpowers/specs/2026-08-09-dispensacion-ip-design.md`](../docs/superpowers/specs/2026-08-09-dispensacion-ip-design.md)

Abrí **`Tarjeta partida - estados.html`** en el navegador. Tiene un botón de tema arriba a la
derecha: el diseño está pensado en claro y en oscuro.

## Qué es

La tarjeta **Dispensación** del modal de visita pasa a tener dos secciones:

- **Medicación concomitante** — lo que ya existe hoy, sin cambios de comportamiento.
- **Producto en investigación** — nuevo: se tilda y se adjunta la constancia (PDF o imagen).

Las dos alimentan **un solo pedido** por visita, con un solo comprobante.

Se dibujan **cinco estados de la tarjeta** más **el bloque que ve la farmacéutica**, todos al ancho
real que tienen en el modal (**442px**) — no estirados, así los cortes de línea que se ven son los
que van a pasar.

## Qué manda y qué no

- **Manda este mock** para el layout, la jerarquía y el vocabulario de los controles.
- **Manda la especificación** para el comportamiento, el modelo de datos y las reglas de authz.
- **Mandan los tokens** (`src/styles/tokens.css`) para el color: los de este archivo son una copia
  para que el HTML abra suelto. Si divergen, gana `tokens.css`.
- Los nombres de medicación, archivos y personas son **de ejemplo**. Nada de esto sale de datos
  reales.

## Lo que el mock resolvió y la especificación no decía

**Quién crea el pedido.** Si es un solo pedido por visita y hay dos secciones que pueden actuar,
había que decidir cuál lo abre. La respuesta dibujada: **el primero que actúa lo crea y el segundo
se suma al mismo pedido** — tildar el IP primero lo abre, agregar medicación primero también. Sin
esa regla harían falta dos botones «Solicitar» y volveríamos a tener dos circuitos, que es
justamente lo que la decisión D3 descartó.

**El pie común** (fecha + estado + «Cancelar solicitud», una sola vez, abajo de todo) es la pieza
que hace *visible* que es un pedido y no dos. Sin él, la tarjeta partida se leería como dos
circuitos que casualmente conviven.

## Accesibilidad — medido, no estimado

Contrastes verificados en el navegador sobre el fondo real de cada elemento:

| Elemento | Claro | Oscuro |
|---|---|---|
| Rótulo de subsección (`ink-soft`) | 5,59:1 | 8,04:1 |
| Título del aviso «Falta la constancia» | 11,96:1 | — |
| Segunda línea del aviso | 4,96:1 | — |
| Ayuda de la zona de adjunto | 5,84:1 | 7,59:1 |

Dos apartamientos deliberados del repo, los dos hacia arriba:

1. El rótulo de subsección va en **`ink-soft`** y no en el `faint` del `.spira-eyebrow`: `faint`
   sobre `surface` da 2,1:1, y esto es la división primaria de la tarjeta, no una nota al pie.
2. El aviso de «falta la constancia» lleva el **texto en tinta** y el ámbar solo en el ícono y el
   tinte: `--spira-warn` sobre el tinte da 3,2:1, y a 12,5px en negrita AA pide 4,5:1.

El estado se dice siempre con **forma + color**, nunca con color solo.
