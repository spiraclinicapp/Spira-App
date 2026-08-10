# Handoff de diseño — Dispensación de IP: la tarjeta partida en dos

**Fecha:** 2026-08-09 · **Versión:** v2 · **Módulo:** Track (detalle de visita) + Pharma (cajón)
**Especificación:** [`docs/superpowers/specs/2026-08-09-dispensacion-ip-design.md`](../docs/superpowers/specs/2026-08-09-dispensacion-ip-design.md)

Abrí **`Tarjeta partida - estados.html`** en el navegador. Tiene un botón de tema arriba a la
derecha: el diseño está pensado en claro y en oscuro.

## Qué es

La tarjeta **Dispensación** del modal de visita pasa a tener dos secciones:

- **Medicación concomitante** — lo que ya existe hoy, sin cambios de comportamiento.
- **Producto en investigación** — nuevo: se adjunta la constancia (PDF o imagen).

Las dos alimentan **un solo pedido** por visita, con un solo comprobante.

Se dibujan la **elección de realce (A/B)**, **cinco estados de la tarjeta** y **el bloque que ve la
farmacéutica**. Todo al ancho real que tiene en el modal (**442px**) — no estirado, así los cortes
de línea que se ven son los que van a pasar.

## Lo que hay que decidir mirando

**El color del realce: dorado (A) o petróleo (B).** Cada uno está dibujado al lado de una tarjeta
común, que es la única forma de juzgar si resalta de verdad. El dorado dice algo que el petróleo no
puede decir —*esto lo resuelve Farmacia*—; el petróleo es más conservador pero resalta por
intensidad, no por significado. El resto del mock está dibujado con A.

**Si el realce corresponde cuando la visita no entrega nada** (estado 5). Mi propuesta es apagarlo:
una tarjeta que no tiene nada que hacer llamando la atención es lo contrario de lo que se pidió.

## Cambios de la v2 respecto de la v1

- **Se fue el tilde.** Si el cronograma ya define que la visita entrega IP, pedirle al coordinador
  que lo confirme es pedirle que declare algo que el sistema sabe mejor que él. La sección aparece
  por `dispenses_ip` y lo único que se pide es el archivo. En la base esto **borra la RPC
  `set_request_ip`** y le devuelve a `create_dispensation_request` su firma original.
- **La tarjeta resalta** (pedido del Director Médico): riel de 5px a la izquierda + tinte suave.
- **Previsualizador** en las dos puntas, y en Farmacia **impresión en un clic**.
- El texto del box quedó en *«Preferentemente el PDF · hasta 10 MB»*.

## Qué manda y qué no

- **Manda este mock** para el layout, la jerarquía y el vocabulario de los controles.
- **Manda la especificación** para el comportamiento, el modelo de datos y las reglas de authz.
- **Mandan los tokens** (`src/styles/tokens.css`) para el color: los de este archivo son una copia
  para que el HTML abra suelto. Si divergen, gana `tokens.css`.
- El documento que se ve en los previsualizadores es un **ejemplo dibujado** (va rotulado como tal),
  no un archivo real. Los nombres de medicación y de personas también son de ejemplo.

## El previsualizador, en concreto

No trae librerías: `<iframe>` para PDF y `<img>` para imagen, apuntando a la URL firmada. La
alternativa —pdf.js dibujando la miniatura en un canvas— son ~350 KB comprimidos por una imagen que
el navegador ya sabe dibujar solo.

La **impresión de un clic** se hace bajando el archivo como blob (que queda en *nuestro* origen),
montándolo en un iframe oculto y llamando a `print()`. Con la URL firmada a pelo no se puede: es otro
origen y el navegador bloquea el `print()` cruzado. Por eso «Abrir en pestaña» queda siempre visible
como salida, no escondido tras un fallo.

## Accesibilidad — medido, no estimado

Contrastes verificados en el navegador sobre el fondo real de cada elemento:

| Elemento | Claro | Oscuro |
|---|---|---|
| Rótulo de subsección (`ink-soft`) | 5,59:1 | 7,91:1 |
| Título del aviso «Falta la constancia» | 11,96:1 | — |
| Segunda línea del aviso | 4,96:1 | — |
| Píldora «Incompleta» | 5,24:1 | — |
| Ayuda de la zona de adjunto | 5,84:1 | 7,59:1 |

Tres apartamientos deliberados del repo, los tres hacia arriba:

1. El rótulo de subsección va en **`ink-soft`** y no en el `faint` del `.spira-eyebrow`: `faint`
   sobre `surface` da 2,1:1, y esto es la división primaria de la tarjeta, no una nota al pie.
2. El aviso de «falta la constancia» lleva el **texto en tinta** y el ámbar solo en el ícono y el
   tinte: `--spira-warn` sobre el tinte da 3,2:1, y a 12,5px en negrita AA pide 4,5:1.
3. La píldora «Incompleta» usa un ámbar más oscuro que `--spira-warn` por el mismo motivo.

El estado se dice siempre con **forma + color**, nunca con color solo.
