# Reposición: submódulo de Farmacia, de corte a corte, con pedido impreso por estudio

**Fecha:** 2026-09-16 · **Estado:** diseño aprobado por el Director · **Origen:** pedido del Director
sobre la card «Compras para octubre» de Estadísticas (`docs/plan-reposicion-stock-minimo.md`, en prod
desde el 2026-09-14).

## El pedido, textual

> Dentro de estadisticas hicimos un apartado para lo que es la reposición de la mercaderia. Bueno quiero
> de que hagamos un cambio en esta parte. Esto va a pasar a ser un submodulo de farmacia que va a estar
> por encima de estadisticas.
> En este submodulo vamos a mostrar una vista muy parecida a la del primer paso dentro del modulo de
> pacientes. Con todos los estudios para elegir, con la cantidad que falta en cada estudio a rapida
> vista. Y con la posibilidad de ingresar y ver los ingresos y egresos de la medicación y cuanto vamos
> gastando en cada uno. Es decir de un lado ingresaron 15, del otro salieron 4 hay que comprar tantos.
> Con el funcionamiento de que el pedido se realiza tal dia y se pide para el proximo mes todo lo que
> pase despues. Algo similar como la tarjeta es decir de corte a corte, lo ideal es que este corte sea
> los ultimos dias del mes. Y se comience con la medicación.
> La idea es que dentro de cada uno de estos protocolos se imprima un pedido de medicación el cual va a
> la farmacia, la farmacia lo entrega y este mismo pedido vuelve con la medicación para luego ser
> utilizado en la recepción.

## Qué cambia

| | Hasta hoy (card de Estadísticas) | Con este diseño |
|---|---|---|
| Dónde | Card arriba de Estadísticas | Submódulo **Reposición**, entre Dispensaciones y Estadísticas |
| Entrada | Una lista con todos los estudios mezclados | Grilla de estudios, como Pacientes, con lo que falta en cada tarjeta |
| Adentro | Renglón por medicamento con la cuenta | Por medicamento: **había · entró · salió · hay · comprar** |
| Período | Mes calendario; se compra el mes siguiente | **De corte a corte**, con un día de corte fijo |
| Fecha límite | Demora de compra global («pedí antes del 11/09») | **Se va**: se pide en el corte |
| Pedido | «Ver pedido» de todos los estudios + «Ya lo pedí» | **Un pedido por estudio**, con número, impreso |
| ¿Llegó? | Se descontaba solo contra cualquier recepción del medicamento | La Recepción **recibe el pedido**; el estado sale de lo recibido |

## Decisiones del Director (2026-09-16, no re-discutir)

Numeradas **R1-R13** para no chocar con las D1-D48 del plan del 14/09.

- **R1 · Submódulo propio.** Se llama «Reposición» y va entre Dispensaciones y Estadísticas.
- **R2 · Grilla de estudios** como el primer paso de Pacientes. Cada tarjeta dice cuántos envases hay
  que comprar en ese estudio y cómo está su pedido.
- **R3 · Se ven los dos números.** Por medicamento se ve lo que entró y lo que salió en el período **y**
  lo que hay que comprar para que alcance a todos. **Al pedido va el de pacientes**: la cuenta del 14/09
  (D8, «para todos») sigue valiendo. Se eligió sobre «reponer lo que salió» con este ejemplo: 12
  pacientes con 1 por mes, había 5, entraron 15, salieron 12, quedan 8 → se ve «salieron 12» y se compran 4.
- **R4 · Corte en un día fijo del mes**, uno para toda Farmacia y editable. El período va del día
  siguiente al corte anterior hasta el día de corte, inclusive. Si el día cargado no existe en un mes
  (29, 30 o 31), el corte de ese mes es su último día.
- **R5 · La demora de compra se va.** La fecha que importa es el corte.
- **R6 · Períodos anteriores** con flechas junto al período, como los resúmenes viejos de la tarjeta. En
  un período cerrado se ven había, entró, salió y lo que quedó, **sin** la columna «comprar», que es sólo
  del período en curso.
- **R7 · La cuenta, como una boleta.** El Director rechazó la versión en prosa («Hoy hay 8 y ya
  retiraron los 12 este período → al corte quedan 8» y «Comprar 12 − 8 = 4»: *«poco claro, no me gusta
  para nada»*). Se eligió la boleta entre tres variantes: arriba lo que hace falta, abajo cada resta en su
  renglón con una aclaración chica debajo, y al final «A comprar». Ver «La boleta».
- **R8 · El pedido se arma por estudio.** «Armar pedido» abre una ventana con lo calculado y un campo
  «Pedir» por renglón, **corregible**. Se ve lo que había calculado Spira al lado de lo pedido. «Emitir e
  imprimir» lo guarda con número y abre la hoja. Un medicamento «sin cargar» se puede pedir con cantidad a
  mano; los de «no se compra» no aparecen.
- **R9 · En camino.** Mientras un renglón no se recibe, cuenta como «ya pedido» y se descuenta de la
  compra. Un pedido se puede **anular** mientras no tenga ninguna recepción.
- **R10 · «Recibir un pedido» en Recepción.** Abre el asistente de recepción de siempre con el estudio,
  los medicamentos y las cantidades que faltan recibir ya puestos. Se completan lote, vencimiento y lo que
  llegó de verdad. El pedido pasa **solo** a «recibido» o «recibido en parte».
- **R11 · «No va a llegar».** Desde el pedido se cierra lo que falta de un renglón, con un motivo elegido
  de una lista. Deja de contar como «ya pedido» y ese faltante vuelve a la compra.
- **R12 · La card de Estadísticas se va entera**, con su «Ver pedido» de todos los estudios. Estadísticas
  vuelve a ser sólo los números del período.
- **R13 · Pedido con cabecera propia** (camino A de tres). Se descartaron estirar la tabla de «Ya lo
  pedí» (dos formas de dar un pedido por recibido) y guardar el pedido como una recepción pendiente
  (mezcla lo pedido con lo que llegó).

### Criterios de diseño que no se preguntaron

Se pueden discutir en la revisión del mock; hasta entonces valen así.

- **Sin día de corte cargado, la pantalla lo pide** («Cargá el día de corte para empezar») y no calcula.
  No hay un corte por defecto inventado.
- **El código para escanear la hoja queda fuera.** El pedido se elige por número de una lista corta.
- **Motivos de «No va a llegar»:** «La farmacia no lo tiene», «Lo discontinuaron», «Ya no hace falta».
  **Motivos de anular:** «Se emitió por error», «Se rehízo con otras cantidades». Sin texto libre.
- **Farmacia `viewer`** ve todo y puede reimprimir; no emite, no anula, no cierra faltantes ni carga el
  corte.
- **Estudios que aparecen:** los que no están cerrados, en el mismo orden que la grilla de Pacientes. Un
  estudio pausado lleva la etiqueta, como decía D26.

## Decisiones del 14/09 que esto reemplaza

| Del plan anterior | Queda |
|---|---|
| D6 · demora global · D17 + D24 · fechas límite y «ya es tarde» | Reemplazadas por R4 y R5 |
| D10 · «por mes calendario» · D14 · «retirado este mes» | La unidad pasa a ser el **período**: «retirado en el período» |
| D13 + D28 + D37 · la card en Estadísticas | Reemplazadas por R1 y R12 |
| D20 + D47 · «Ya lo pedí» y el descuento automático contra recepciones | Reemplazadas por R8-R11 |
| D44-D48 · card plegada, lista, «Ver pedido» con tres órdenes | Reemplazadas por R2, R6, R7 y R12 |
| D31 · «lo que falta este mes entra en la compra» | Sigue, dicho del período en curso |

**Siguen igual:** D1-D5, D7, D8, D11, D12, D15, D16 + D23, D18, D19, D21, D22, D25-D27, D30, D32.

## Pantallas

### 1 · La grilla

```
Farmacia › Reposición
📅 Corte el 28/09 · faltan 12 días      Período 29/08 → 28/09          [✎ Día de corte: 28]
┌────────────────────────────┐ ┌────────────────────────────┐
│ 222714             ● Activo│ │ LTS17231           ● Activo│
│ ENDURA                     │ │ LTS17231                   │
│────────────────────────────│ │────────────────────────────│
│ 11 envases para comprar   ›│ │ ✓ Cubierto                ›│
│ 2 medicamentos · 1 sin cargar │ │ 🚚 Pedido Nº 13 · recibido en parte │
│ · sin pedido para el que viene │ │                        │
└────────────────────────────┘ └────────────────────────────┘
```

| Estado de la tarjeta | Qué dice |
|---|---|
| Hay que comprar | «**N** envases para comprar» + «M medicamentos · K sin cargar» |
| Alcanza | «✓ Cubierto» |
| Todo sin cargar | «Falta cargar cómo se repone · 0 de 5 cargados» |
| Sin medicación de base | «Sin medicación para reponer» |
| Pedido | El más reciente que tenga faltante abierto o que sea para el período que viene: «Pedido Nº 14 · sin recibir» / «recibido en parte» / «recibido». Si no hay ninguno, «sin pedido para el período que viene» |

Un pedido es **«para» un período**: al emitirlo guarda P1 (ver «La cuenta»). Uno emitido el 28/09 con
corte 28 es para el 29/09-28/10. El 16/09 todavía no existe, así que la tarjeta dice «sin pedido»; el
28/09 ya aparece; y desde el 29/09 sigue apareciendo mientras tenga faltante abierto.

Estados de la pantalla: cargando («Calculando…»), error con «Reintentar», sin día de corte (lo pide; a
un `viewer` le dice que Farmacia todavía no lo cargó).

### 2 · El estudio

```
[←] 222714 ENDURA                                                        [🛒 Armar pedido]
     ‹ Período 29/08 → 28/09 · corte en 12 días ›
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Para el período que viene (29/09 → 28/10): 11 envases · 2 medicamentos · 1 sin cargar │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Medicamento                      Había  Entró  Salió   Hay    Comprar                │
│ Seretide 250/50 · Aerosol           5     15     12      8    4 envases        ⌄     │
│ Salbutral 100 mcg · Aerosol         2      6      3      5    7 envases        ⌄     │
│ Montelukast 10 mg · Comprimidos     0      0      0      0    Sin cargar [Cargar] ⌄  │
│ Tiotropio 18 mcg · Cápsulas         4      0      1      3    No se compra     ⌄     │
└──────────────────────────────────────────────────────────────────────────────────────┘
🚚 Pedidos del estudio: Nº 12 · 28/08 · recibido [Ver]
```

- **«Hay»** es lo físico en el estante, lotes vencidos incluidos. Si en el período hubo ajustes,
  reasignaciones o bajas por vencimiento, debajo de «Hay» va «± N por ajustes», para que la fila cierre:
  había + entró − salió ± ajustes = hay.
- **Con un pedido ya emitido para el período que viene**, el botón pasa a «Armar otro pedido» y lo ya
  pedido se descuenta.
- **En un período anterior** (flecha ‹): columnas había · entró · salió · quedó, sin «comprar» ni botón,
  y la lista de los pedidos emitidos para ese período.
- La carga de cómo se repone cada medicamento (mensual / a demanda / no se compra y la cantidad) se muda
  tal cual está hoy en la card: «Cargar» abre el formulario en el renglón.

### 3 · La boleta (renglón abierto)

```
Salbutral 100 mcg · Aerosol                                               7 envases
  Hacen falta para el próximo período                                        8
    8 pacientes, 1 envase por mes
  Van a quedar en el estante al corte                                      − 1
    hay 5, y 4 pacientes todavía no retiraron
  Ya pedido, sin recibir                                                   − 0   ← sólo si > 0
  ───────────────────────────────────────────────────────────────────────────
  A comprar                                                                  7
  Cambiar cómo se repone
```

Renglones de la boleta. **Cada uno aparece sólo si aplica**:

| Renglón | Signo | Aclaración debajo |
|---|---|---|
| Hacen falta para el próximo período (mensual) | | «8 pacientes, 1 envase por mes» · con excepciones: «8 pacientes (2 con cantidad propia)» |
| Tener siempre (a demanda) | | «a demanda» |
| Faltan para terminar este período | + | «4 pacientes todavía no retiraron y en el estante no alcanza» |
| Van a quedar en el estante al corte | − | «hay 5, y 4 pacientes todavía no retiraron» · «hay 8 y ya retiraron todos» · «sin contar 2 vencidos» |
| Ya pedido, sin recibir | − | «Pedido Nº 14 del 28/09» |
| **A comprar** | = | si da cero o menos: «0 · alcanza» |

Debajo de la boleta, **los avisos que no mueven el número** (D21, D22, D23, D30, vencimientos durante el
próximo período), cada uno en una frase corta y sin tecnicismos.

### 4 · Armar pedido

```
Pedido de 222714 · ENDURA
Para el período 29/09 → 28/10
Medicamento                          Calculado     Pedir
Seretide 250/50 · Aerosol                    4     [ 6 ]
Salbutral 100 mcg · Aerosol                  7     [ 7 ]
Montelukast 10 mg · Comprimidos     Sin cargar     [ 0 ]
Seretide: pedís 6, Spira calculó 4.
Se guarda con número y queda para recibir en Recepción.        [Cancelar] [🖨 Emitir e imprimir]
```

- Arranca con «Pedir» = «Calculado». Un renglón en 0 no va al pedido.
- No se puede emitir un pedido vacío.
- El botón se deshabilita mientras guarda, así un doble click no emite dos pedidos.

### 5 · La hoja

Sobre `HojaImpresa` (el membrete de Estadísticas). Número grande, estudio, emitido (fecha y quién),
período. Tabla: medicamento · presentación · **pedido** · entregado · lote · vence. Las tres últimas
columnas van **vacías**, para que la farmacia las complete a mano. Al pie, dos firmas («Entregó
(farmacia)» / «Recibió») y «Devolver esta hoja junto con la medicación». Se puede **reimprimir** desde el
pedido.

### 6 · El pedido (detalle)

Desde «Ver» en la pantalla del estudio. Por renglón muestra pedido, recibido y lo que falta. Si un
renglón quedó cerrado, lo dice con su motivo. Acciones:

- **Reimprimir**, para todos los roles.
- **Anular**, con motivo, sólo sin recepciones.
- **«No va a llegar»** en cada renglón con faltante, con motivo.

Estados del pedido:

| Estado | Cuándo |
|---|---|
| Sin recibir | ningún renglón tiene nada recibido y alguno tiene faltante |
| Recibido en parte | algo recibido y algún renglón con faltante abierto |
| Recibido | ningún faltante abierto (si se cerró alguno: «recibido · faltó 1») |
| Anulado | anulado |

### 7 · Recepción › «Recibir un pedido»

Botón junto a «Nueva recepción» en `RecepcionView`. Abre una lista de pedidos con faltante abierto: Nº,
estudio, fecha, medicamentos y envases que faltan. Un pedido con una recepción **sin verificar** lo dice
(«recepción Nº 1043 sin verificar») para que no se reciba dos veces.

«Recibir» abre `ReceptionWizard` en la rama de base (Farmacia Protocolo). Arranca con el estudio del
pedido y los renglones que faltan, con la cantidad pendiente como punto de partida. Usa la misma semilla
`initialMeds` que ya tiene «Repetir recepción». El resumen final compara lo pedido con lo recibido. Si se
agrega un medicamento que no estaba en el pedido, se recibe igual, se avisa «no estaba en el pedido» y no
cuenta para ningún renglón. En la tarjeta de la recepción se ve «Pedido Nº 14».

## La cuenta

Vive en `src/data/pharma/reposicionModel.ts`, pura y con tests, como hoy.

```
diaCorte = d                        corte(mes) = min(d, último día del mes)
hoy <= corte(mes de hoy)  →  P0 = [corte(mes anterior) + 1, corte(mes de hoy)]
hoy >  corte(mes de hoy)  →  P0 = [corte(mes de hoy) + 1,   corte(mes siguiente)]
P1 = el período que sigue a P0 (el que se compra)

por (estudio, medicamento): igual que el plan del 14/09, cambiando M0 → P0 y M1 → P1
  retirado(p)   = neto dispensado a esa asignación desde el inicio de P0 (hora AR)       ex D14
  pendiente_P0  = Σ max(0, mensual(p) − retirado(p))              sobre pacientes(P0)
  estante al corte y falta_P0 por FEFO contra los lotes vigentes hoy                     D15
  necesidad_P1  = Σ mensual(p)                                    sobre pacientes(P1)
  ya_pedido     = Σ faltante abierto de los renglones de pedidos no anulados              R9 R11
  comprar       = max(0, necesidad_P1 + falta_P0 − estante_al_corte − ya_pedido)          D31

libro del período [desde, hasta], por (estudio, medicamento), con el protocolo por el lote.
Todo sobre `stock_movements.quantity_delta`, que ya trae su signo, con el día en hora AR:
  entró   =   Σ delta de recepcion y anulacion_recepcion           dentro del período
  salió   = − Σ delta de dispensacion y devolucion                 dentro del período
  ajustes =   Σ delta de ajuste_manual, reasignacion y vencimiento dentro del período
  había   = en_estante_hoy − Σ delta de TODO movimiento desde `desde` hasta hoy
  hay     = había + entró − salió + ajustes
            (período en curso: igual a en_estante_hoy · período cerrado: «quedó» al `hasta`)

pedido, por renglón:
  recibido = Σ reception_items.quantity de recepciones VERIFICADAS con ese pedido_id y medicamento
             (una recepción anulada deja de contar sola: el pedido vuelve a tener faltante)
  faltante = cerrado ? 0 : max(0, pedido − recibido)
```

**Las 70 entregas históricas del 15/09 no aparecen en «salió»:** se cargaron sin lotes y sin movimiento
de stock, así que nunca tocaron el estante. Es correcto: Farmacia arrancó en cero.

## Datos

### Migración `0128` (sólo agrega: se aplica ANTES del front)

1. **`farmacia_ajustes.dia_corte integer null check (dia_corte between 1 and 31)`**. Null = sin cargar.
   Se escribe con update directo, como la demora (grant de `update` a `operator`, y `updated_by` sellado
   por trigger, 0125).
2. **`pedidos_medicacion`**:
   - `id uuid pk default gen_random_uuid()`;
   - `numero integer` correlativo, único, con secuencia propia (mismo patrón que el folio de la 0085);
   - `protocol_id` (FK `on delete restrict`), `periodo_desde date`, `periodo_hasta date`;
   - `emitido_el date` (hora AR, viene del front), `emitido_por uuid` sellado,
     `emitido_por_nombre text` (snapshot, por la RLS de `users`, como en la 0085);
   - `anulado_at`, `anulado_por_nombre`, `anulado_motivo` (check con la lista);
   - `created_at`.
   - Auditoría (`audit_row`: tiene `id`). RLS: select `pharma viewer` o `gerencia`; escritura sólo por
     funciones.
3. **`pedido_medicacion_items`**:
   - `id uuid pk`, `pedido_id` (FK `on delete restrict`), `medication_id`;
   - `calculado integer null` (null = estaba sin cargar), `pedido integer not null check (> 0)`;
   - `cerrado_at`, `cerrado_por_nombre`, `cerrado_motivo` (check con la lista);
   - `unique (pedido_id, medication_id)`.
   - Auditoría y RLS como la cabecera.
4. **`medication_receptions.pedido_id uuid null`**, FK a `pedidos_medicacion`. **Antes de escribirla**:
   buscar `medication_receptions`, `protocols` y `users` en los `select(...)` del front
   (`gotcha-fk-nueva-rompe-embed-postgrest`). La tabla nueva no está embebida en ningún lado, pero la FK
   convierte a `medication_receptions` en un posible puente entre `protocols` y `pedidos_medicacion`.
5. **Funciones.** Todas `SECURITY DEFINER`, `set search_path = public`, rol chequeado adentro y
   `revoke all … from public` (D32):
   - `emitir_pedido_medicacion(p_protocol_id uuid, p_desde date, p_hasta date, p_emitido_el date,
     p_renglones jsonb) → jsonb {id, numero}`. `pharma operator`. `p_desde`/`p_hasta` son P1, el
     período para el que se pide. Rechaza el pedido vacío y los medicamentos que no son del estudio.
   - `anular_pedido_medicacion(p_pedido_id uuid, p_motivo text)`. `operator`. Falla con
     `23514` si hay alguna recepción no anulada con ese pedido.
   - `cerrar_faltante_pedido(p_item_id uuid, p_motivo text)`. `operator`. Falla si el renglón no tiene
     faltante.
   - `reposicion_del_periodo(p_desde date, p_hasta date, p_hoy date, p_protocol_id uuid default null)
     → jsonb`. `stable`, `viewer` o `gerencia`. `SECURITY DEFINER` porque Farmacia no lee
     `patient_visits` (D11). Trae lo mismo que `insumos_de_reposicion` salvo los `pedidos` y las
     `recepciones` de la 0125, y suma el libro del período, el día de corte y los pedidos del período con
     lo recibido por renglón. **La forma exacta la fija el modelo primero** (D29).
   - `create_reception`: **`drop function` de la firma de 5 argumentos** y se crea con
     `p_pedido_id uuid default null` al final (`gotcha-create-or-replace-cambia-firma`). El front
     desplegado llama por nombre con 5 argumentos y resuelve a la nueva por el default: por eso sigue
     siendo aditiva. Valida que el pedido sea del mismo protocolo y no esté anulado.
6. **Trampas conocidas:** calificar todo en `returns table` (0056/0058), `gen_random_uuid()` y nunca
   `uuid_generate_v4()` (0113), cero dollar-quotes sueltos en comentarios (0071), sentencias idempotentes
   (el editor de Supabase no comparte sesión). Se prueba en **PGlite** antes de pasarla
   (`probar-sql-con-pglite`).

### Migración `0129` (limpieza: DESPUÉS del deploy del front)

`drop` de `insumos_de_reposicion(date)`, `registrar_pedido_reposicion`, `anular_pedido_reposicion`, la
tabla `reposicion_pedidos` y la columna `farmacia_ajustes.demora_compra_dias`. La card vieja las usa: con
la 0129 aplicada antes, Estadísticas se rompe en prod.

- **El archivo no se pushea hasta que el front esté desplegado** (CLAUDE.md §3, 0068 y 0092).
- Antes, una sonda de sólo lectura confirma que `reposicion_pedidos` está vacía en prod (la limpieza del
  15/09 la dejó así).

## Front

| Archivo | Qué |
|---|---|
| `src/modules/registry.ts` | `{ key: 'reposicion', name: 'Reposición', icon: 'cart', hint: 'Pedidos de medicación' }` antes de `reportes`. **Medir el hint ≤ 145px** con la fuente cargada. |
| `src/views/registry.tsx` | `'pharma/reposicion': ReposicionView` (el test de `destinos` exige vista). |
| `src/data/pharma/reposicionModel.ts` | Período por corte, libro, boleta, resumen por estudio. Se van `plazo`, `pedidoOrdenado` y `renglonesDelPedido` global. |
| `src/data/pharma/pedidosModel.ts` (nuevo) | Faltante por renglón, estado del pedido, «ya pedido» por medicamento, pedidos con faltante para Recepción. Puro, con tests. |
| `src/data/pharma/reposicion.ts` | `useReposicionDelPeriodo`, `guardarDiaCorte`, `emitirPedido`, `anularPedido`, `cerrarFaltante`. Se van demora y «Ya lo pedí». |
| `src/views/pharma/reposicion/` (nuevo) | `ReposicionView` (grilla y navegación en la URL, como Pacientes), `EstudioReposicion`, `Boleta`, `CargarReposicion` (mudado de `ComprasDelMes`), `DiaDeCorte`, `ArmarPedido`, `PedidoDetalle`, `HojaPedido`. |
| `src/views/pharma/RecepcionView.tsx` + `recepcion/RecibirPedido.tsx` (nuevo) | Botón y lista de pedidos con faltante. |
| `ReceptionWizard.tsx`, `wizard/Step3Summary.tsx`, `data/pharma/receptions.ts`, `recepcion/ReceptionCard.tsx` | `pedidoId` en el wizard, pedido vs recibido en el resumen, `p_pedido_id` en `createReception`, «Pedido Nº» en la tarjeta. |
| `src/views/pharma/reportes/ReportesView.tsx` | Se saca el montaje de la card y se ajusta el texto que la nombraba. Se borran `ComprasDelMes.tsx` y `VerPedido.tsx`. |
| `supabase/README.md` | Filas de la 0128 y la 0129; «Aplicada en prod (fecha)» al confirmarse. |
| `docs/plan-reposicion-stock-minimo.md` | Nota al principio: qué decisiones reemplaza este documento. |

Realce por elevación, nunca borde verde; Lucide; copy corto; nombre del paciente visible en los avisos.
La excepción por paciente de `PatientMedicationsCard` no cambia.

## Entregas

0. **Mock al repo** (`docs/design_handoff_reposicion_submodulo/`) y `/plan-design-review`, antes de
   programar. Parte de los bocetos de esta sesión: grilla, estudio, boleta (variante A), armar pedido,
   hoja y Recibir un pedido.
1. **Modelo y tests** (`reposicionModel` + `pedidosModel`): fija la forma del JSON.
2. **`0128`** en su PR, probada en PGlite. Se aplica apenas se mergea, con sondas sin sesión.
3. **Front, en una sola PR**: submódulo, pedido, Recepción y salida de la card. QA logueado de lectura.
   Emitir un pedido real deja datos permanentes: **se pregunta antes** y, si no, se cubre con tests
   (`preferencia-qa-sin-datos-de-prueba-en-prod`).
4. **`0129`** después del deploy.

## Tests (reglas que fallan en silencio)

```
periodoDe(hoy, diaCorte)
├── corte 28: el 16/09 → 29/08-28/09 · el 28/09 → mismo período · el 29/09 → 29/09-28/10
├── corte 31: febrero → corta el 28 (29 en bisiesto) · abril → el 30
├── cruce de año: corte 28, hoy 29/12 → 29/12-28/01
└── P1 siempre empieza el día siguiente al fin de P0
libro
├── entró neto de anulaciones · salió neto de devoluciones · ajustes con signo
├── había + entró − salió + ajustes = hay (se cumple siempre)
└── período cerrado: «quedó» al `hasta`, movimientos posteriores fuera
cuenta (la del 14/09 con P0/P1)
├── retirado desde el inicio del período, no del mes calendario
├── ya pedido = faltante abierto; renglón cerrado no descuenta; pedido anulado no descuenta
└── ejemplos de R3 (→ 4) y de la boleta A (→ 7)
boleta
├── renglones que no aplican no aparecen · a demanda usa «Tener siempre»
└── «sin contar N vencidos» cuando hay lotes vencidos en el estante
pedidosModel
├── recibido sólo de recepciones verificadas; anulada no cuenta
├── faltante: parcial · de más → 0 · cerrado → 0
├── estado: sin recibir · en parte · recibido · recibido con faltante cerrado · anulado
└── medicamento recibido que no estaba en el pedido no suma a ningún renglón
armar pedido
└── arranca en lo calculado · renglón en 0 fuera · pedido vacío no se emite
```

Fechas fijas en los tests (CI corre en UTC). Fábricas de filas mínimas, sin Supabase.

## Modos de falla

| Camino | Falla realista | Manejo | ¿Se ve? |
|---|---|---|---|
| Corte en día 29-31 | febrero sin ese día → período mal armado | `min(d, último día)` + test | test |
| Recepción de un pedido | se recibe dos veces | la lista avisa si hay una recepción sin verificar | se ve |
| Recepción anulada | el pedido quedaba «recibido» | el estado se deduce de las verificadas | test |
| `create_reception` con parámetro nuevo | sobrecarga viva, el front llama a la vieja | `drop` de la firma vieja en la 0128 | sonda |
| FK `pedido_id` | embed ambiguo tira Recepción | búsqueda de embeds antes de escribirla | QA |
| 0129 antes del front | Estadísticas en blanco en prod | archivo sin pushear hasta el deploy | se vería |
| Doble click en «Emitir» | dos pedidos | botón deshabilitado mientras guarda | QA |

## Fuera de alcance

- **Escanear el código de la hoja** en Recepción: por ahora se elige por número.
- **Pedido de varios estudios juntos** (R12).
- **Producto en investigación y Ambulatoria** (D7).
- **Plata:** «cuánto vamos gastando» se lee en envases, no en pesos.
- **Un corte distinto por estudio** (R4) y **la demora** (R5).
