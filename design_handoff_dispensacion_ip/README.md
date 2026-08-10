# Handoff de diseño — Dispensación de IP: la tarjeta partida en dos

**Fecha:** 2026-08-09 · **Versión:** v3 · **Módulo:** Track (detalle de visita) + Pharma (cajón)
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

**Cuál de las tres variables de realce.** El color ya está decidido (petróleo) y el riel quedó
descartado, así que la pregunta es qué *otra* variable mover — porque un contorno de acento alrededor
de la card está descartado de entrada:

| | Qué mueve | Cuándo conviene |
|---|---|---|
| **A · Banda de cabecera** | El fondo de la cabecera, a sangre | **Recomendada.** El color se apoya sobre el nombre de la sección: hace de rótulo, no de decoración |
| **B · Carta teñida** | El fondo de toda la card | La más silenciosa. Riesgo: un tinte parejo se puede leer como «desactivado» |
| **C · Hoja elevada** | El material: papel blanco + sombra, más la banda | La que más resalta. Contra: la elevación en esta app ya significa «el mouse está acá» |

Cada una está dibujada arriba de una tarjeta común, que es la única forma de juzgar si resalta de
verdad. El resto del mock está dibujado con **A**.

## Cambios de la v3 respecto de la v1

- **Se fue el tilde.** Si el cronograma ya define que la visita entrega IP, pedirle al coordinador
  que lo confirme es pedirle que declare algo que el sistema sabe mejor que él. La sección aparece
  por `dispenses_ip` y lo único que se pide es el archivo. En la base esto **borra la RPC
  `set_request_ip`** y le devuelve a `create_dispensation_request` su firma original.
- **La tarjeta resalta** (pedido del Director Médico), en petróleo, sin riel — tres variables a elegir.
- **El realce se apaga** cuando la visita no entrega nada (estado 5).
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
| Título del panel destacado, banda (`--acc-deep`) | 6,37:1 | 9,77:1 |
| Título del panel destacado, carta teñida | 6,70:1 | 10,61:1 |
| Título del panel destacado, hoja elevada | 6,61:1 | 9,23:1 |
| Título del panel de Farmacia | 5,84:1 | 9,29:1 |
| Ícono del panel (gráfico, mínimo 3:1) | 4,14:1 | — |
| Rótulo de subsección (`ink-soft`) | 5,59:1 | 8,04:1 |
| Título del aviso «Falta la constancia» | 11,96:1 | — |
| Segunda línea del aviso | 4,96:1 | — |
| Píldora «Incompleta» | 5,24:1 | — |
| Ayuda de la zona de adjunto | 5,84:1 | 7,59:1 |

**El realce obliga a un token nuevo.** El acento del módulo a secas sobre el tinte da **4,14:1**, y el
título del panel va a 14px en negrita, donde AA pide 4,5:1. Por eso el texto sobre tinte usa un
**acento profundo** (`--spira-primary` en Track, un dorado más oscuro en Pharma) — y en **tema oscuro
se invierte**: ahí hay que aclarar, no oscurecer, y va el menta que `tokens.css` ya usa para el
isotipo. Sin esa inversión el título queda en **1,85:1**, o sea invisible.

Tres apartamientos deliberados del repo, los tres hacia arriba:

1. El rótulo de subsección va en **`ink-soft`** y no en el `faint` del `.spira-eyebrow`: `faint`
   sobre `surface` da 2,1:1, y esto es la división primaria de la tarjeta, no una nota al pie.
2. El aviso de «falta la constancia» lleva el **texto en tinta** y el ámbar solo en el ícono y el
   tinte: `--spira-warn` sobre el tinte da 3,2:1, y a 12,5px en negrita AA pide 4,5:1.
3. La píldora «Incompleta» usa un ámbar más oscuro que `--spira-warn` por el mismo motivo.

El estado se dice siempre con **forma + color**, nunca con color solo.
