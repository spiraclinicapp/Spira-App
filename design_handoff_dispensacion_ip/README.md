# Handoff de diseño — Dispensación de IP: la tarjeta partida en dos

**Fecha:** 2026-08-09 · **Versión:** v6 · **Módulo:** Track (detalle de visita) + Pharma (cajón)
**Especificación:** [`docs/superpowers/specs/2026-08-09-dispensacion-ip-design.md`](../docs/superpowers/specs/2026-08-09-dispensacion-ip-design.md)

Abrí **`Tarjeta partida - estados.html`** en el navegador. Tiene un botón de tema arriba a la
derecha: el diseño está pensado en claro y en oscuro.

## Qué es

La tarjeta **Dispensación** del modal de visita pasa a tener dos secciones:

- **Medicación concomitante** — lo que ya existe hoy, sin cambios de comportamiento.
- **Producto en investigación** — nuevo: se adjunta la constancia (PDF o imagen).

Las dos alimentan **un solo pedido** por visita, con un solo comprobante.

Se dibujan las **tres variables de realce (A/B/C)**, **siete estados de la tarjeta**, **el bloque que
ve la farmacéutica** y **el pop-up de los kits**. Todo al ancho real que tiene en el modal
(**442px**) — no estirado, así los cortes de línea que se ven son los que van a pasar.

## El realce — decidido

**Petróleo, carta teñida (opción B).** Toda la card sobre un velo del acento, sin riel y sin borde de
acento alrededor. Las tres candidatas quedan dibujadas en la sección 1 del mock, cada una arriba de
una tarjeta común, para que el porqué de la elección quede documentado y no haya que rediscutirlo.

Con B hay una cosa a mirar en la implementación: un tinte parejo y suave puede leerse como
*«esto está desactivado»* en vez de *«esto importa»*. Si en el uso real pasa eso, el remedio es subir
el tinte o pasar a la banda de cabecera, no agregar un borde.

## Cambios de la v6 respecto de la v1

- **Se fue el tilde.** Si el cronograma ya define que la visita entrega IP, pedirle al coordinador
  que lo confirme es pedirle que declare algo que el sistema sabe mejor que él. La sección aparece
  por `dispenses_ip` y lo único que se pide es el archivo. En la base esto **borra la RPC
  `set_request_ip`** y le devuelve a `create_dispensation_request` su firma original.
- **La tarjeta resalta** (pedido del Director Médico), en petróleo, carta teñida.
- **El realce se apaga** cuando la visita no entrega nada (estado 5).
- **Previsualizador** en las dos puntas, y en Farmacia **impresión en un clic**.
- El texto del box quedó en *«Preferentemente el PDF · hasta 10 MB»*.
- **Los kits arrancan en 0** y el 0 se ve como *pendiente*. Si sigue en 0 al entregar, un **pop-up**
  lo pide. Eso **mueve el descuento de stock del IP** de *marcar lista* a *entregar* — ver abajo.

## Dispensar fuera de cronograma (estados 5, 8 y 9)

Aunque la visita no dispense, se puede dispensar igual **con motivo obligatorio de desplegable**. La
marca *fuera de cronograma* y el motivo **viajan** al tablero, al cajón y al comprobante impreso.

**Cómo se integra** (v5 → v6, después del «quedó feo»): la salida usa **la misma fila punteada** que
«Agregar medicación» —la tarjeta ya tiene un idioma para *«acá se suma algo»*— pero un escalón más
callada, con el ícono sin acento y la tinta atenuada. Y la excepción **no es un formulario encima de
la tarjeta: es una subsección más**, con el mismo ritmo que las otras dos y el rótulo en ámbar.
Integrada por estructura, distinguida por color.

**Falta que confirmes la lista de motivos.** La propuesta, que seguro hay que corregir: *Reposición
por pérdida o rotura* · *Visita no programada (VNP)* · *Ajuste de dosis indicado por el investigador*
· *Adelanto por viaje del paciente* · *Otro (especificar)*.

### El aviso de 30 días cambia de tono, no de existencia

Si al paciente ya se le dispensó dentro de los 30 días, se avisa — y **nunca bloquea**. Pero el tono
depende de la situación, y esa es la decisión de diseño que importa:

| | Tono | Por qué |
|---|---|---|
| Dentro de cronograma (estado 9) | Informativo | En un protocolo con visitas cada 28 días la entrega **estaba prevista**: gritar por algo normal es ruido |
| Fuera de cronograma (estado 8) | Ámbar | Acá una entrega repetida **sí** puede ser un error, y el dato cambia una decisión |

**Una alarma que suena siempre deja de escucharse justo cuando importa.** Si el aviso fuera ámbar en
las dos situaciones, en la enorme mayoría de los casos sería ruido — y para cuando aparezca el caso
real, ya nadie lo lee.

## El cambio de fondo que trajo el «0»

Poner los kits en 0 y pedirlos recién al entregar no es solo una validación: **corre el momento en
que el IP sale del stock**. Ya no ocurre al *marcar lista* —como el de la medicación concomitante—
sino al **entregar**.

Sale mejor, no peor. En el IP no hay lote ni FEFO, así que no hay nada que reservar: descontarlo
antes solo produciría un número que puede terminar siendo otro. Y *entregada* es el paso
irreversible, que es donde corresponde congelar un dato que después no se corrige. Efecto lateral:
**cancelar una preparación ya no tiene que devolver kits**, porque nunca salieron — una rama menos
que escribir y que testear.

Lo que hay que asumir: en un mismo comprobante, la medicación de base descuenta en *lista* y el IP en
*entregada*.

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
| Rótulo de la subsección de excepción (ámbar) | 5,59:1 | 9,82:1 |
| Aviso informativo, título / segunda línea | 14,08:1 / 5,84:1 | 13,75:1 |
| Aviso en alerta, título | 11,45:1 | 11,93:1 |
| Salida «Dispensar fuera de cronograma» | 5,84:1 | — |
| Título del aviso «Falta la constancia» | 11,96:1 | — |
| Segunda línea del aviso | 4,96:1 | — |
| Píldora «Incompleta» | 5,24:1 | — |
| Ayuda de la zona de adjunto | 5,84:1 | 7,59:1 |

**Dos reglas que salieron de medir, y que valen para toda la feature:**

**Nada de tinte sobre tinte.** Dentro de la card teñida, todo el contenido va sobre **papel blanco**,
como ya lo hacen los renglones, la zona de adjunto y el archivo. Un recuadro teñido adentro de una
card teñida se ve sucio — era buena parte de lo que hacía fea a la v5. La única que se tiñe es la
*alerta*, donde el color es significado.

**Todo color "profundo" necesita su inverso en oscuro.** El acento del módulo a secas sobre el tinte
da **4,14:1**, y el título del panel va a 14px en negrita, donde AA pide 4,5:1. Por eso el texto sobre
tinte usa un **acento profundo** (`--spira-primary` en Track, un dorado más oscuro en Pharma) — y en
**tema oscuro se invierte**: ahí hay que aclarar, no oscurecer. Sin esa inversión el título queda en
**1,85:1**. El mismo agujero apareció **dos veces**: también con el ámbar del rótulo de excepción
(2,39:1 en oscuro hasta invertirlo a 9,82:1). Cada color que se oscurezca para leerse sobre un tinte
claro necesita su versión clara para oscuro.

Tres apartamientos deliberados del repo, los tres hacia arriba:

1. El rótulo de subsección va en **`ink-soft`** y no en el `faint` del `.spira-eyebrow`: `faint`
   sobre `surface` da 2,1:1, y esto es la división primaria de la tarjeta, no una nota al pie.
2. El aviso de «falta la constancia» lleva el **texto en tinta** y el ámbar solo en el ícono y el
   tinte: `--spira-warn` sobre el tinte da 3,2:1, y a 12,5px en negrita AA pide 4,5:1.
3. La píldora «Incompleta» usa un ámbar más oscuro que `--spira-warn` por el mismo motivo.

El estado se dice siempre con **forma + color**, nunca con color solo.
