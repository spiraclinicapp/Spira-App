# Plan — Campana de notificaciones v2

Handoff: [`docs/design_handoff_notificaciones_v2/`](design_handoff_notificaciones_v2/) (copiado de
Downloads el 2026-10-09, antes de implementar). Rediseña el v1
([`plan-campana-notificaciones.md`](plan-campana-notificaciones.md)), del que conserva las fuentes y
las reglas: la píldora sigue contando lo mismo que Pendientes.

## Qué trae

- **Listado cronológico** agrupado en Hoy / Ayer / Esta semana / Anteriores, con encabezados fijos.
- **Tarjeta C5**: encabezado «Paciente · Protocolo · hora», nombre con ícono chico y tiempo relativo,
  motivo en hasta dos líneas. La misma tarjeta en el listado y en la alerta.
- **No leídas**: punto rojo y tinte; pasan a leídas a los 2,5 s de abrir el panel o con «Marcar como leídas».
- **Alerta desde la campana**: sacudida, pulsos, 6 s con barra que se pausa en hover.
- **Dispensación en curso**: tarjeta fija con los cuatro pasos y su hora.

## Decisiones (el Director eligió «lo recomendado» en todas)

| # | Decisión | Por qué |
|---|---|---|
| D1 | **Leídas en el navegador** (`localStorage`, por usuario). La primera vez, todo lo existente cuenta como leído. | Es una comodidad de quien mira, no un dato auditable; sin migración ni RLS. Costo: no se sincroniza entre dispositivos. |
| D2 | **Los avisos de pedidos pasan a la campana** (6 s, reemplaza). Se borra `AvisosDePedidos` (abajo a la derecha, 30 s). | Los 30 s existían porque el popup era el único rastro. Ahora el punto queda prendido como «no leído» y la tarjeta sigue en el panel. |
| D3 | **El recorte de 10 elige por gravedad; el listado ordena por fecha.** | Una ventana vencida vieja nunca queda afuera por diez pendientes nuevos (regla de `priorizarAlertas`). |

## Desvíos del mock, con su porqué

- **Color del punto de la campana**: el peor tipo entre lo no leído, no rojo fijo (criterio de `tonoDelPunto`, v1).
- **Gris de los rótulos y la hora**: `--spira-muted` y no `#838C89` (`faint` da 3,46:1, debajo de AA a 11 px).
- **Color de «Preparando»** en la tarjeta fija: el azul de `badgeDeEstado`, como en el tablero y el historial. El mock lo pinta en ámbar.
- **Descartar en pantallas táctiles**: sin hover, el tacho queda siempre visible (`@media (hover: none)`).
- **Descartar abre el flujo con motivo** que ya existía, como pide el README del handoff (el prototipo borra directo).
- **Fechas puras**: las alertas de visita se anclan en un `date` (vencimiento de la ventana). Dicen «3 oct» y «hace 2 d», nunca una hora inventada.
- **Ocho tipos y no cuatro**: además de los del mock, el IP sin entregar, «no vino», las correcciones y las constancias de Farmacia, cada uno con su ícono.
- **El nombre sigue siendo link a la ficha** (`PatientLink`); la tarjeta entera abre la visita.

## Datos

Sin migración. La consulta de pedidos (`usePedidosParaAvisar`) suma columnas ya aplicadas:
`created_at`, `preparation_started_at` (0054), `prepared_by_name` (0121), `includes_ip` (0071),
`dispensations.delivered_at/updated_at`, los renglones con `medications!medication_id` (dos FKs desde la 0076)
y `users!requested_by` (dos FKs; la RLS sólo deja leer el propio, que es el caso de la tarjeta fija).

**Bug de paso**: pasar a «Lista» toca `dispensations` y no la solicitud, así que la hora de «Lista» y el
corte de «cerrado hoy» de `pedidosVigentes` usaban una hora vieja. Ahora usan `ultimoMovimiento` (con test).

## Pendiente

- **Tiempo real de las alertas clínicas**: los pedidos se repreguntan cada 30 s; las alertas clínicas sólo
  cuando se relee `useActiveAlerts` (al descartar, al cambiar algo en una visita). Una alerta que aparece
  por el paso del tiempo avisa en la próxima relectura, no en el momento. Agregar un sondeo es una decisión
  de costo (consulta de ~0,2 s por usuario) que queda para después.
- **QA logueado**: la integración se verificó en un banco de pruebas sin sesión, con pedidos fabricados
  (siembra, alerta, pausa, tarjeta fija, leídas, entrega). Falta mirarla con datos reales.
