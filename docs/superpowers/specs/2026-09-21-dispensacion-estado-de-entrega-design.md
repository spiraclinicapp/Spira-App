# Dispensación: el estado de la entrega como comprobante

**Fecha:** 2026-09-21 · **Handoff:** [`docs/design_handoff_dispensacion_estado/`](../../design_handoff_dispensacion_estado/)
(copiado de `Downloads/Spira — Identidad Visual (6)/`, 2026-09-20) · **Pantalla:** tarjeta
«Dispensación de medicación» del modal de visita (`src/views/pharma/VisitDispensationPanel.tsx`).

El Director pidió aplicar el handoff y, para las preguntas abiertas, **elegir siempre la opción
recomendada**. Este spec deja escritas esas elecciones: cada una dice qué se eligió y por qué.

## Qué resuelve (del handoff, en su orden)

1. El estado de la dispensación no se veía: vivía en una píldora chica al pie. Pasa a ser lo primero.
2. No se entendía que la medicación ya se había entregado: era una lista idéntica a la de un pedido
   en curso. Pasa a leerse como un **comprobante** (número, fecha, quién entregó, sello de estado).
3. «Corregir entrega» competía con dispensar. Pasa a enlace sobrio adentro del comprobante; volver a
   dispensar queda afuera y abajo.
4. Concomitante e IP parecían caminos distintos: **una entrega, un comprobante, un estado**.
5. No se sabía cuándo fue la última entrega: historial de las entregas del paciente.

## Decisiones

| # | Tema | Elegido | Por qué |
|---|---|---|---|
| D1 | Variante y acceso | **C · Ticket** + **H1 · chip «Historial» en la banda** con popover | Las dos capturas del bundle son del Director y muestran justo esa combinación; el README marca H1 como preferido. A y B no se implementan. |
| D2 | Color y tipografía | **Tokens vivos**, geometría del mock | El mock trae la paleta vieja (`--spira-muted #7C8C87`, `--faint #A6B0AC`, Hanken + IBM Plex Mono, banda `#2E7D74`). La banda sigue siendo la de `Panel` (`--spira-band-track`, 6,66:1 con el rótulo), el texto es Inter y los números van con `.spira-mono`. Un handoff es un snapshot: la geometría sale del mock, el color y la tipografía de `tokens.css`. |
| D3 | Sello sólido | Fondo = **color profundo del estado** (`badgeOf(r).color`), texto `var(--spira-white)` | El mock dice «texto blanco sobre color pleno» como garantía de accesibilidad, pero blanco sobre `#5C8A5A` da 4,01:1 y sobre `#B0823F` 3,44:1: los dos fallan AA a 11,5px. Con la familia `--spira-acc-deep-*` da 5,7–7,0:1 en claro y, como en oscuro esos tokens se aclaran y `--spira-white` pasa a ser la card oscura, 6,0–10,5:1 en oscuro. Se invierte solo. |
| D4 | Palabra del estado | La de la casa: **Solicitada · Preparando · Lista para retirar · Entregada** (`badgeOf`), con su color | El mock junta todo lo que no es entrega bajo «En preparación». No es cierto para una solicitud que Farmacia todavía no tomó, y «Lista para retirar» es justo lo que la coordinadora necesita saber (el paciente la puede ir a buscar). Mismo vocabulario que el tablero de Farmacia y los avisos. Ícono: tilde para entregada, reloj para el resto. |
| D5 | N° de comprobante | **Sólo si se emitió** (dispensación `lista` o `entregada`). Si no: «Sin número todavía» | El mock muestra `N° 86` en un pedido en preparación. El correlativo de una preparación cancelada queda **reservado** para un papel que nunca se imprimió (comentario de `comprobanteAbierto`, 0054+0057): mostrarlo sería un número falso en una nota fuente. |
| D6 | Línea de contexto | Entregada: `16/09/2026 · 17:02 · entregó M. Ferrer`. En curso: `Pedido del 16/09/2026 10:30`, más `· lo tiene M. Ferrer` si está preparando | Quién entregó ya existe en la base (`dispensations.delivered_by_name`, **0119**, en prod): sólo falta pedirlo en el `select`, sin migración. Sin nombre (entregas anteriores a la 0119) no se inventa: se omite el tramo. La fecha sale en hora argentina fija (`isoDayAR`), no del recorte UTC. |
| D7 | Constancia del IP en el ticket | Renglón compacto: ícono + nombre + **«Ver»** (abre en pestaña) y debajo `142 KB · cargada 16/09/2026 10:47` (+ `· 2 kits` si se entregó) | **No se escribe «firmada»**: la base no sabe si una constancia está firmada, y el mock usa la misma hora de carga con otra palabra. **Tampoco «· M. Ferrer» (quién la subió)**: `uploaded_by` es un uuid y Coordinación no puede leer `users` por RLS; hace falta un snapshot del nombre, que es una migración. Queda como pendiente (ver abajo). |
| D8 | Cuántos tickets | **Uno por pedido vivo o entregado** de la visita (lo normal es uno) | Cada pedido es un comprobante. Si Farmacia ya había tomado el primero y se pidió otra cosa, son dos papeles: dos tickets es lo cierto. Cancelados y rechazados no son comprobante. |
| D9 | Rechazo vigente | Aviso en el cuerpo, con el motivo | El historial plegado se va; un rechazo que nadie volvió a pedir no puede quedar escondido en un popover. Misma regla que antes (`rechazoVigente`). |
| D10 | Enlaces del pie del ticket | Entregada → **«Corregir esta entrega»**. Solicitada → **«Cancelar solicitud»**. Preparando / lista → **nada** | Cancelar sólo existe mientras está `solicitada` (después la tiene Farmacia; la línea de contexto dice quién). «Corregir» abre el mismo modo corrección de siempre, con su nota «La entrega anterior queda registrada. Lo que cargues acá la corrige.» — ahora también con la visita abierta. |
| D11 | Volver a dispensar | Botón de ancho completo abajo, afuera del ticket: **«Nueva dispensación»**; si hay un pedido que todavía acepta cambios, **«Sumar medicación»** | Con un pedido `solicitada` lo elegido se suma a ese mismo pedido: llamarlo «nueva» prometería un segundo comprobante que no va a existir. Con la visita cerrada abre en modo corrección (es la misma puerta que ya existía). |
| D12 | Sin entrega | Visita cerrada sin pedidos: **«En esta visita no se entregó medicación ni producto en investigación.»** + botón primario **«Registrar entrega»** | Salvo dos casos en que la frase del IP sería falsa o pobre: visita **anterior al registro del IP** (el IP vivía en papel: no se puede afirmar que no se entregó) y **cierre** del IP («No corresponde», «Entregado en otra visita»). Ahí la frase habla sólo de medicación y debajo va la línea del IP. Las salidas del IP (`IpSalidas`) siguen a mano: son las que apagan la alerta de IP sin entregar. |
| D13 | Chip «Historial» | Visible sólo si hay **entregas en otras visitas** del mismo estudio (enrolamiento) | Un disparador que abre una lista vacía es ruido (mismo criterio que `ActionMenu`). El popover lista, de la más nueva a la más vieja: visita · fecha · N°, y dos filas **Concomitante** / **IP** con «Sin entrega» donde no hubo. Rótulo «Entregas de otras visitas» y no «anteriores»: desde la ficha, en una visita vieja, también aparecen las posteriores. Cierra con Esc, clic afuera y «Cerrar» (`usePopover`, portaleado). |
| D14 | El historial plegado viejo | **Se retira** (`HistorialPlegado.tsx` y `historialPlegado()`) | Lo reemplaza el chip. Se conservan `estaCerrado` y `rechazoVigente`, que usan otros. |
| D15 | Formulario de carga | **Sin cambios de lógica.** Aparece si no hay ticket (visita abierta), si se abre con «Nueva dispensación» / «Corregir esta entrega», o si hay algo sin enviar | Avisos, selector, «Otro», «En partes», saldos, excepción fuera de cronograma y «Solicitar» siguen exactamente igual. |
| D16 | La sección del IP debajo de los tickets | Se muestra cuando cuenta algo que el ticket **no** cuenta | Oculta si el ticket ya lo dice (constancia en curso o entregada). Visible para el dropzone, la constancia elegida sin enviar, la excepción, el desenlace (con «Registrar la entrega» y las salidas), el cierre y la visita histórica. «El cronograma no lo pide» sólo con el formulario abierto (ahí ofrece «Pedir fuera de cronograma»). La regla es pura y tiene test. |

## Anatomía del ticket (C)

- Papel `--spira-white`, borde `--spira-line-2`, radio 12.
- **Encabezado**: rótulo `COMPROBANTE` (10,5/700, tracking .14em, `ink-soft`) y debajo `N° 86`
  (20px, `.spira-mono`, seleccionable: se canta en el mostrador). A la derecha, el sello (D3): 26px de
  alto, píldora, 11,5/700 versalita, ícono 13.
- **Contexto** (D6): 11,5px `ink-soft`.
- **Concomitante** (filete punteado `--spira-line-2`): rótulo versalita; un renglón por medicamento,
  nombre con `…` y cantidad en mono a la derecha. En un pedido `solicitada` y con permiso, el lápiz y
  la cruz de siempre (cambiar cantidad, quitar). Los «Otro» del pedido con su píldora («Por
  habilitar», «No habilitado») y su línea de receta.
- **Producto en investigación** (filete punteado): «Fuera de cronograma · motivo» si corresponde;
  la constancia (D7) con «Ver» y, en `solicitada` con permiso, «Reemplazar»; si el pedido la exige y
  no está, el aviso «Falta la constancia».
- **Pie** (filete sólido `--spira-line`): el enlace de D10, alineado a la derecha, 11,5px `muted`,
  hover a `--spira-primary` (clase `.spira-enlace-sobrio`, sin levante: es texto).

Una sección que el pedido no tiene (sin renglones, o sin IP) no se dibuja.

## Datos

- `REQUEST_COLS`: se suma `delivered_by_name` al embed de `dispensations` (0119, ya aplicada). Es una
  columna más en un embed existente: no toca FKs (no aplica el PGRST201 de la 0076) y no hace falta
  migración.
- Hook nuevo `useEntregasDelEnrolamiento(enrollmentId, visitId)`: pedidos del enrolamiento, de
  **otras** visitas, con la dispensación `entregada` (`dispensations!inner` + filtro, el mismo patrón
  que `useEntregasIpDelEnrolamiento`). RLS: el coordinador ve su protocolo; Farmacia, todo.

## Reglas puras (con test)

`comprobanteModel.ts` — lo que puede quedar al revés sin verse:

- qué pedidos son ticket (vivos o entregados; nunca cancelados ni rechazados) y en qué orden;
- el N° sólo si se emitió (una preparación cancelada deja el número reservado);
- la línea de contexto: fecha y hora en hora argentina (una entrega a las 22:30 no salta al día
  siguiente), sin «entregó» cuando no hay nombre, «lo tiene» sólo preparando;
- el enlace del pie según estado y permiso;
- qué rechazo avisar;
- si la sección del IP va debajo de los tickets (D16) y qué frase dice «Sin entrega» (D12).

`historialEntregasModel.ts` — las entregas del historial: ordenadas por la **entrega** y no por el
pedido, «Sin entrega» por parte, la constancia vigente (no una reemplazada).

## Fuera de alcance (pendientes para Diseño, del propio handoff)

- IP que **no corresponde** en esta visita dibujado adentro del ticket, entrega **parcial** / saldo,
  «Otro medicamento» con receta y el ticket en **modo corrección**: el handoff dice que no están
  dibujados. Se resuelven con lo que ya existe (la sección del IP y los renglones de siempre).
- **Quién subió la constancia**: pide una migración con el snapshot del nombre
  (`dispensation_ip_documents.uploaded_by_name`, aditiva → va antes del front). No entra en esta PR
  para no atar el deploy a SQL en prod.

## Verificación

`npm run build` verde (typecheck + tests + build) y la tarjeta mirada en el navegador logueado, en
los estados que haya en el banco de pruebas (`TEST-QA`), sin crear ni borrar datos reales.
