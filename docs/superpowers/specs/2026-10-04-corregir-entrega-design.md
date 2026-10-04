# Corregir una entrega de verdad

**Fecha:** 2026-10-04 · **Estado:** aprobado por el Director (2026-10-04); fase 1 en la 0149 · **Pantallas:** el
ticket del comprobante en la visita (`src/views/pharma/VisitDispensationPanel.tsx`,
`ComprobanteTicket.tsx`) y el cajón de una entrega en Farmacia (`dispensaciones/DispensacionDrawer.tsx`,
`PanelEntregada.tsx`).

## El problema

«Corregir esta entrega» **no corrige la entrega**. Abre el formulario de un pedido NUEVO, que va a
Farmacia y sale con otro comprobante (`abrirCorreccion`, D10 del spec 2026-09-21). Lo único que la
distingue de «Nueva dispensación» es la nota «La entrega anterior queda registrada». El IP no se ve ni
se toca. El Director (2026-10-04): *«no estaría cumpliendo ninguna función […] el IP no lo podés
modificar ni ver, no tiene sentido»*.

Y hoy la base no deja otra cosa: una entrega es definitiva.

## Lo que se tiene que poder corregir (Director, 2026-10-04: las cuatro)

1. **Constancia de IP equivocada**: se subió el PDF de otro paciente o de otra visita.
2. **Medicación mal registrada**: un medicamento o una cantidad que no coincide con lo que se dio.
3. **Kits de IP mal declarados**.
4. **Faltó registrar algo que se dio**.

## Decisiones

| # | Tema | Elegido | Por qué |
|---|---|---|---|
| D1 | Quién corrige | **Cada uno lo suyo** (Director). Coordinación: la constancia. Farmacia: renglones y kits | El que cargó corrige lo que cargó. La constancia la sube Coordinación; los renglones, los lotes y los kits los declara Farmacia al entregar. |
| D2 | Nivel de Farmacia | **Líder** (Director) | Corregir reescribe stock hacia atrás: es el mismo nivel que `adjust_stock` y `void_reception`. Entregar sigue siendo de operador. |
| D3 | Coordinación y la medicación | **Pide la corrección a Farmacia** (Director). Nunca mueve stock | Arma el pedido («faltó registrar Salbutamol x1», «eran 2, no 1») y le llega a Farmacia como aviso, que lo aplica o lo descarta con una nota. |
| D4 | El comprobante | **Conserva su número** (N° 97), queda marcado **«Corregida»** y muestra qué cambió, quién y por qué | Una segunda dispensación sobre el mismo pedido rompe dos supuestos que hoy se sostienen solos: `activeDispensation` toma `dispensations[0]` sin orden, y `dispensation_audit_trail` hace `limit 1` sin orden. Además, cada fila nueva consume un correlativo. |
| D5 | Cómo se corrige | **No se reescribe: se asienta.** Cada cambio es una fila en una tabla de correcciones (antes, después, motivo y quién), y el stock se compensa con un movimiento de tipo propio | Mismo patrón que «Anular recepción»: el libro de `stock_movements` no se toca, se compensa. En una app auditable el comprobante corregido tiene que poder contar su historia. |
| D6 | Motivo | **Obligatorio, de una lista**, más «Otro» con texto | Desplegables antes que texto libre (regla de la casa). Lista inicial: *Cantidad mal registrada · Medicamento equivocado · Faltó registrar · Constancia equivocada · Kits mal declarados · Otro*. |
| D7 | Dónde se edita | **Sobre el propio ticket** (pedido del Director): el ticket pasa a modo edición, en el lugar | Es lo que se pidió: «un campo de edición sobre la propia entrega». No es un formulario aparte ni un modal. |

## Qué hace cada lado

### Coordinación (el ticket de la visita)

«Corregir esta entrega» pone el ticket en **modo edición**:

- **Constancia**: «Reemplazar» abre la zona de carga. Al confirmar con motivo, la nueva queda vigente.
  La vieja no se borra (el bucket no permite borrar): pasa a «reemplazada» y se puede ver desde el
  detalle de la corrección.
- **Medicación**: cada renglón muestra su cantidad entregada y deja escribir la **cantidad correcta**
  (0 = no se dio). Un «Falta algo» suma un renglón con la medicación del paciente. Esto **no corrige**,
  arma un **pedido de corrección** que se envía a Farmacia con el motivo.
- Pie: «Cancelar» / «Guardar corrección» (constancia) o «Pedir corrección a Farmacia» (medicación).
- Con un pedido de corrección pendiente, el ticket lo dice: «Corrección pedida a Farmacia · 04/10 ·
  Lautaro Molina», y no deja abrir otro encima.

### Farmacia (el cajón de una entrega)

- En el ⋯ de una entregada (`MenuAcciones` de `DispensacionDrawer.tsx`), **«Corregir entrega»**,
  sólo para líder.
- `PanelEntregada` pasa a modo edición: por renglón, la cantidad y el lote; quitar; agregar un renglón
  (lote por FEFO, cambiable). Los kits de IP. Motivo obligatorio.
- Si hay un pedido de corrección de Coordinación, va **arriba de todo**, con «Aplicar» (precarga los
  cambios para revisar) y «Descartar» (con nota, que Coordinación ve en el ticket).
- El pedido de corrección pendiente aparece como aviso en el tablero, con el mismo mecanismo que los
  avisos de pedidos.

### El comprobante después

- Mismo número, sello «Entregada», y una línea más: **«Corregida · 04/10/2026 · 2 cambios»**, que
  despliega la lista (antes → después, motivo, quién y cuándo).
- El comprobante imprimible muestra los valores corregidos y la leyenda de la corrección.

## Base (migraciones nuevas, números a definir al escribirlas)

Todo **aditivo**: ningún front desplegado pide algo distinto. Va **la migración primero, después el front**.

1. **Un valor nuevo de `stock_movement_type`** (`correccion_entrega`), en un archivo propio aplicado
   ANTES: `ALTER TYPE … ADD VALUE` no se puede usar en la misma transacción (lección de la 0053/0086).
2. **`dispensation_corrections`**: `id` (lo exige `audit_row`), `dispensation_id`, `request_id`,
   `tipo` (`constancia | kits_ip | renglon_cantidad | renglon_alta | renglon_baja`), `antes jsonb`,
   `despues jsonb`, `motivo_codigo`, `motivo_texto`, `corrected_by`, `corrected_by_name` (copiado: la
   RLS de `users` no deja leerlo) y `created_at`. Sin update ni delete, con auditoría.
3. **`dispensation_correction_requests`** (el pedido de Coordinación): `id`, `request_id`,
   `dispensation_id`, `renglones jsonb`, `motivo_*`, `estado` (`pendiente | aplicado | descartado`),
   `requested_by(_name)`, `resolved_by(_name)`, `resolved_at` y `nota_resolucion`. Un solo pendiente
   por entrega (índice único parcial).
4. **RPCs** (`security definer`, con el orden de siempre: alcance → rol → motivo → lock):
   - `reemplazar_constancia_entregada(request, archivo…, motivo)`: quien coordina la visita o Farmacia,
     sólo con el pedido `atendida`. Reusa el mecanismo de `superseded_at` de `attach_ip_document`.
   - `corregir_kits_ip(dispensación, kits, motivo)`: líder de Farmacia. Valida que `v_ip_stock` no
     quede negativo.
   - `corregir_renglon_entregado(item, cantidad, lote, motivo)` y
     `agregar_renglon_entregado(dispensación, medicamento, lote, cantidad, motivo)`: líder de Farmacia.
     Ajustan `dispensation_items` y `dispensation_request_items`, mueven `quantity_on_hand` del lote y
     asientan un `correccion_entrega` por la diferencia.
   - `pedir_correccion_entrega(…)` (Coordinación) y `resolver_pedido_correccion(id, aplicado|descartado, nota)`
     (Farmacia).
5. **`guard_dispensation_immutable`** deja cambiar `ip_kits` de una entregada sólo a
   `current_user = 'postgres'` (o sea, desde la RPC), como hace la guarda de la 0088.

### Trampas ya identificadas (investigación del 2026-10-04)

- **Los reportes no verían la corrección.** `v_pharma_report_items` (0126) sólo suma
  `movement_type = 'dispensacion'`. Hay que sumarle `correccion_entrega`, y revisar `reposicion_del_periodo`.
- **`check_request_item_protocol` / `check_dispensation_item_protocol` (0050)** exigen la medicación
  del paciente activa en cualquier insert o update de renglones. Después de la entrega, la habilitada
  con receta se desactiva (0124), y un paciente que terminó el estudio no tiene ninguna activa: la
  corrección fallaría justo en el caso típico. Las guardas tienen que dejar pasar a la RPC.
- **Tocar `dispensation_requests` lo manda a «hoy»** (`trg_requests_updated_at`): la corrección no
  escribe en esa fila.
- **Los lectores de renglones** (`v_billing_dispensations`, `ComprobanteImprimible`, `PanelEntregada`,
  `saldo_restante_de_indicacion`) leen `dispensation_items` / `dispensation_request_items`. Por eso la
  RPC actualiza los renglones además del libro: corregir sólo el libro los dejaría mostrando lo viejo.
- **Las ~70 entregas históricas** cargadas el 2026-09-15 no tienen renglones ni lote. Ahí sólo se
  corrigen la constancia y los kits, y se puede agregar un renglón; el ticket lo dice en vez de ofrecer
  editar lo que no existe.
- **El camino actual de «Corregir» duplica los kits del IP**: un pedido nuevo con constancia fuera de
  cronograma prende `includes_ip` y `v_ip_stock` los cuenta dos veces. Desaparece con este diseño.
- **Textos que hoy prometen lo contrario**: `ModalKitsIp` («no se puede corregir después») y el
  comentario de `PanelEntregada` («acá no se corrige nada»).

## Fases (cada una se puede usar sola)

1. **Constancia** (Coordinación): la tabla de correcciones, la RPC de reemplazo y el ticket en modo
   edición con sólo esa parte. La más chica y la que no mueve stock.
2. **Farmacia corrige renglones y kits**: el tipo de movimiento, las RPCs, las guardas, los reportes
   y el modo edición de `PanelEntregada`.
3. **Pedido de corrección de Coordinación**: la tabla, las dos RPCs, el aviso y el «Aplicar / Descartar».

Hasta la fase 3, la medicación del lado de Coordinación sigue sin poder pedirse desde el ticket. El
enlace «Corregir esta entrega» deja de abrir el formulario de pedido nuevo desde la fase 1. «Nueva
dispensación» queda como está.

## Cómo se prueba

- **Reglas puras con vitest**: qué deja editar el modo corrección según rol, estado y si la entrega
  tiene renglones (lo que falla en silencio).
- **Banco RLS** (`scripts/banco-rls/`): quién puede llamar cada RPC, perfil por perfil, y que
  Coordinación nunca mueva stock.
- **PGlite**: que el stock del lote y `v_ip_stock` den lo que tienen que dar después de cada corrección,
  y que los reportes la cuenten.
- **QA en el navegador** con el protocolo TEST-QA (paciente TEST-001), nunca sobre entregas reales.

## Decidido después (Director, 2026-10-04)

- **D8 · Reimprimir: aviso, sin bloquear.** El sello «impresa» es de la constancia vieja. Farmacia lo
  ve en la campana («Constancias para reimprimir», que lleva al cajón de la entrega) y arriba del
  cajón, con «Imprimir la constancia», que imprime y sella. No bloquea nada: la entrega ya ocurrió.
  La regla (`paraReimprimir`): la constancia vigente se cargó DESPUÉS de la entrega y nadie la marcó
  como impresa.
- **D9 · Sin plazo para corregir.** La auditoría registra cuándo se corrigió; un límite arbitrario
  sólo empuja a corregir por fuera del sistema.

## Fase 1, como quedó (0149)

- El enlace sólo aparece sobre una entrega con IP (`entregaCorregible`): sin IP, en la fase 1 no hay
  nada que corregir y un modo edición vacío sería un botón que finge. Para sumar lo que faltó sigue
  «Nueva dispensación», cuya nota ahora dice que es un pedido nuevo (antes decía que «corregía» la
  entrega anterior, y no era cierto).
- Pueden corregir la constancia quien coordina la visita y Farmacia (operador, con alcance): las
  mismas puertas que `attach_ip_document`. En la UI, por ahora, sólo desde el ticket de la visita.
