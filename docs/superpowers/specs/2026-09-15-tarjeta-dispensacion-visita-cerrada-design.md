# La tarjeta de Dispensación en una visita ya cerrada

**Fecha:** 2026-09-15 · **Estado:** diseño aprobado, sin implementar
**Pedido del Director**, mirando la V5 de un paciente de ENDURA cerrada el 26/08.

## El problema

La tarjeta de Dispensación sólo distingue **quién mira** (`readOnly`: la ficha del paciente es
lectura, la vista del día es operable). No sabe si la visita **terminó**. Consecuencia: sobre una
visita cerrada hace un mes la tarjeta sigue ofreciendo «Elegir medicación» y «Pedir fuera de
cronograma», como si el paciente estuviera sentado enfrente.

Y al revés: lo que **sí** se entregó en esa visita no se ve. Queda plegado al pie, bajo un rótulo
—«Ver historial»— que además suena a archivo viejo cuando el pedido puede ser de hoy.

En una visita terminada el gesto normal es **leer**, no cargar. La tarjeta hace lo contrario.

## Qué se construye

### 1 · El corte: fin de atención, no fecha real

La tarjeta pasa a modo lectura cuando la visita tiene **`ready_at`** (fin de atención).

**No sirve `real_date`**: esa fecha se pone al *empezar* a atender, y ahí todavía falta dispensar —
cortar ahí apagaría la tarjeta justo en el momento en que más se usa. `ready_at` es el «Realizada
26 Ago 2026 10:00» del encabezado: la atención se cerró.

`ready_at` ya viaja en la fila de la visita (`src/data/visits.ts`) y `VisitDetail` ya la tiene; lo
único que falta es ensanchar el tipo del prop `visit` de `VisitDispensationPanel`, que hoy pide sólo
`id`, `enrollment_id`, `protocol_id`, `dispenses` y `dispenses_ip`.

Este modo es **independiente de `readOnly`**, que sigue significando lo que significa (permisos). Una
visita cerrada en la vista del día es lectura *con* corrección; en la ficha es lectura a secas.

**Y no alcanza con `ready_at`: si queda un pedido ABIERTO, la tarjeta sigue operable.** Abierto es
`solicitada`, `preparando` o `lista` — y `lista` es el caso que obliga: el pedido está preparado, con
el comprobante emitido, esperando que alguien lo retire. Decidir por `ready_at` a secas pondría la
tarjeta en lectura diciendo «en esta visita no se entregó medicación» —cierto en la letra— **mientras
hay un paquete esperando en la farmacia**, y sin forma de cancelarlo ni gestionarlo desde ahí. La
tarjeta pasa a lectura recién cuando todos los pedidos se resolvieron: entregados, cancelados o
rechazados. La regla de «abierto» no se reescribe: es la de `estaCerrado` en `historialPlegadoModel`,
que ya la tenía.

(Lo encontró la revisión de la Task 1, no esta spec.)

### 2 · Medicación concomitante

| Situación | Qué muestra |
|---|---|
| Visita abierta | Igual que hoy: renglones + «Elegir medicación» |
| Cerrada, con entrega | **«Dispensada el 26/08»** + un renglón por medicamento: nombre · cantidad · N° de comprobante |
| Cerrada, sin entrega | **«En esta visita no se entregó medicación.»** |

Los renglones salen de los pedidos **entregados** de esa visita, con la misma forma que ya usa el
historial desplegado (`historialPlegadoModel`), para no inventar un tercer modo de listar lo mismo.

### 3 · Producto en investigación

Con la visita cerrada deja de ofrecer «Pedir fuera de cronograma» y muestra el **desenlace**, que la
base ya calcula en `v_visit_ip_status` (0119): entregado · no correspondía · entregado en otra
visita · no se entregó.

Entra en el alcance por una razón concreta: arreglar sólo la mitad de arriba deja la misma
incoherencia 60px más abajo, en la misma tarjeta.

### 4 · La corrección

Debajo de los dos estados cerrados va la acción. **Sobria, no un botón primario**: el gesto normal
sobre una visita terminada es leer.

| Estado | Rótulo |
|---|---|
| Cerrada, con entrega | **«Corregir entrega»** |
| Cerrada, sin entrega | **«Registrar entrega»** |

Dos rótulos y no uno, porque son dos situaciones distintas: donde no hay entrega no hay nada que
corregir, y donde la hay «registrar» suena a que todavía no se registró. Mismo criterio que hizo que
«Agregar» pasara a «Elegir» en este mismo panel.

Al abrirla, una línea gris:

> La entrega anterior queda registrada. Lo que cargues acá la corrige.

**Por qué en positivo y no como advertencia.** `guard_dispensation_immutable` (0003) prohíbe revertir
una dispensación `entregada`: es el comprobante de que la medicación salió del centro, y en un
sistema auditable eso no se borra. La corrección sólo puede **sumar**. Pero el encuadre del Director
es el correcto y es el que va: *la anterior queda registrada, lo nuevo la corrige*. Decirlo como
«no se puede deshacer» describe el candado; decirlo así describe el trabajo.

Tocarla abre el mismo flujo de siempre (`soliciting`), sin caminos nuevos.

### 5 · El pie

- «Ver historial» → **«Ver pedido anterior»** / «Ver pedidos anteriores».
- «1 pedido cerrado · entregado el 26/08» → «1 **pedido anterior** · entregado el 26/08».

«Historial» suena a archivo viejo y el pedido puede ser de hoy; «anterior» es cierto en los dos
casos.

Y en la visita cerrada el pie **sólo lista lo que no se muestra arriba** — cancelados, rechazados. Si
el único pedido es el entregado, no hay pie: ya está arriba, y la misma entrega dos veces en la misma
tarjeta se lee como dos entregas.

## Qué NO entra

- **Anular una entrega.** Es otra cosa y necesita su propio diseño (y seguramente migración).
- **Declarar «no correspondía entregar»**, al estilo del «No corresponde» del IP. Se evaluó y se
  descartó: ese cierre existe porque el IP tiene una alerta de 48 h que hay que poder apagar
  (`v_ip_delivery_alerts`, 0119). La medicación de base **no tiene ninguna alerta** — los tres
  canales son IP, reportes de procedimiento y el de reportes retirado. Una declaración que no apaga
  nada es ceremonia.
- **Migraciones.** Todo sale de datos que la tarjeta ya tiene o ya consulta.

## Riesgos

- **`VisitDispensationPanel` tiene 1202 líneas.** Sumarle un tercer modo sin partir nada lo deja
  peor. La implementación saca la decisión a un modelo puro y testeable —qué estado tiene la sección
  y qué muestra— al estilo de `seccionIpModel.ts` y `historialPlegadoModel.ts`, que es el patrón que
  ya usa este panel. Ese modelo es lo que se testea; el pintado se verifica mirando.
- **Una visita cerrada hoy.** La coordinadora cierra la atención y recién ahí se acuerda de que no
  dispensó. Cubierto: «Registrar entrega» está ahí mismo, a un clic.
- **Visitas sin `ready_at` pero viejas.** Quedan en modo abierto, como hoy. Es lo correcto: sin fin
  de atención la visita no está cerrada, y ya hay un estado para eso («Sin cerrar»).

## Verificación

- Tests del modelo puro: los tres estados de la sección concomitante, los cuatro del IP, y la regla
  de qué queda en el pie.
- En el navegador: una visita cerrada con entrega, una cerrada sin entrega, y una abierta sin
  cambios respecto de hoy.
- `npm run build` verde.
