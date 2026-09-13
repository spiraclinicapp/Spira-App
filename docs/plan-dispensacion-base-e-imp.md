# Plan · Dispensación de base y de IMP

> `/plan-eng-review` del 2026-09-13, sobre `main` en `9000fe6` (v0.69.6, última migración `0118`).
> **Dieciséis decisiones del Director, ninguna abierta.** Se entrega en **tres tandas = tres PRs**.
> La Tanda 3 necesita **mock en el repo** antes de implementarse (regla de `CLAUDE.md`).

## El pedido, textual

> Para la base: la entrega debe ser independiente del cronograma y siempre editable. Si se selecciona
> una medicación entregada en los últimos 30 días, mostrar un aviso en rojo en la parte superior:
> 'Este paciente ha recibido en los últimos 30 días tal medicación'. Debe mostrar el stock disponible
> y una opción 'Otro' asociada a un pedido (Archivo o foto). Hay medicaciones que las entregamos en
> dos partes, por ejemplo fenisona son 60 dosis y les damos 30 cada 15 días […].
>
> Para el IMP: debe estar vinculado al cronograma y generar automáticamente el procedimiento dentro
> del panel de procedimientos en el modal de la visita […]. Solo se marcará como realizado al
> confirmar la entrega por la farmacéutica y, si pasan dos días sin confirmación, enviar una alerta
> al coordinador.

## Lo que ya existe (y se reusa, no se reconstruye)

| Pieza | Hoy | Dónde | Qué hace el plan |
|---|---|---|---|
| IMP ligado al cronograma | `visit_definitions.dispenses_ip` | `0071:20` | Se reusa. Se **sella** en la visita al atender (D10). |
| Pedido de IP + constancia del IRT | bucket `ip-docs`, `attach_ip_document` | `0071:183-383` | **No se toca.** "Otro" usa un circuito aparte (D12). |
| Confirmación de entrega | `deliver_dispensation` sella `delivered_at` | `0071:743`, `0003:139-141` | Se suma `delivered_by` + nombre (D1, corrección 1). |
| Candado de medicación habilitada | `check_request_item_protocol` | `0050:72-95` | **No se afloja** (precedente `0076:21`, D12). |
| Habilitar un medicamento | `assign_patient_medication`, sólo Farmacia | `0051:28` | Se reusa en la transacción de "Otro". |
| Aviso de 30 días | `AvisoReciente` + `useUltimaDispensacion`, genérico, `limit 1` | `VisitDispensationPanel.tsx:164-289`, `dispensations.ts:646-730` | Se reemplaza por uno por droga, entre protocolos (D14). |
| Stock | `v_medication_stock`, cerrada a Coordinación | `0036`, `0006:239-240`, `0074:15` | RPC nueva que no expone lotes (D6). |
| Alertas | calculadas al leer, sin cron ni SMTP | `0070:3`, `0103`, `alertDismissals.ts` | Clase nueva, calculada (D3). |
| Procedimientos de la visita | `protocol_activities` + `visit_procedure_completions` | `0061`, `0064`, `procedures.ts` | La fila del IP **no** entra al modelo: se calcula (D1). |

## Decisiones (no re-discutir)

### Tanda 1 · IMP

- **D1 · La fila del IP es CALCULADA, no un procedimiento guardado.** Va primera en Procedimientos,
  sin tilde, y debajo vienen los procedimientos que el cronograma le asignó a la visita. Estados:
  *Sin pedir · Pedido a Farmacia (fecha) · Entregado por <farmacéutica> (fecha) · Rechazado ·
  No corresponde · Entregado en otra visita*. Nueva columna `dispensations.delivered_by` +
  `delivered_by_name`. *Por qué:* con un procedimiento guardado, `set_visit_procedures` lo borra al
  guardar (`0091:84-86`), la RLS deja tildarlo a mano (`0064:59-63`) y el estado de las visitas
  viejas cambia de golpe (`0102:115-119`).
- **D2 · La visita espera la entrega del IP**: sin ella queda `realizada` y no pasa a `completa`.
  Rige **sólo para visitas atendidas desde el deploy**. Coordinación tiene una salida explícita,
  **"No corresponde entregar IP"**, con motivo de lista: *discontinuó tratamiento · lo retiró el
  sponsor · otro*.
- **D3 · Alerta «IP sin entregar», en la app** (campana + Pendientes). Salta a las **48 h corridas**
  desde lo primero que ocurra: la atención de la visita o el pedido de IP. **No se descarta.** Sólo
  la apagan la entrega, "No corresponde" o "Entregado en otra visita"; cancelar o rechazar el pedido
  **no** la apaga. La ven los coordinadores del protocolo, y "Lo mío" es quien pidió o quien atendió.
- **D10 · Una sola regla del IP, en SQL.** Una vista por visita da el estado del IP y la leen la fila
  (D1), `computed_status` (D2) y la alerta (D3). "Esta visita lleva IP" **se sella en
  `patient_visits`** cuando la visita pasa a tener fecha real o se inicia la atención (trigger
  `BEFORE UPDATE`, así cubre los dos caminos). Nunca se mira `dispenses_ip` en vivo, porque corregir
  un cronograma reabriría visitas cerradas. **El mismo corte de fecha, con huso `-03` explícito**,
  vale para D2 y D3. El ancla es `attended_at`, y si falta, `real_date`.
- **D11 · IP entregado en otra visita:** coordinación lo **vincula a mano** desde la fila del IP de la
  visita de cronograma. Elige de un desplegable las entregas de IP del mismo enrolamiento
  (fecha · visita · kits). Queda auditado quién vinculó qué.
- **D9 (parte que arregla un bug de prod) · `includes_ip` se sella sólo si ese pedido lleva IP de
  verdad.** Hoy se copia del cronograma en **cada** pedido (`0071:495`). En una visita con IP, el
  segundo pedido (el que nace cuando Farmacia ya tomó el primero) sale "con IP" aunque sea sólo de
  base, y el mostrador le pide constancia impresa y kits que no existen. **Va en la Tanda 1.**

### Tanda 2 · Base, lo definido

- **D4 · La base se pide en cualquier visita, sin motivo.** El IP sigue exigiendo cronograma o motivo.
- **D9 · El sello "base sin cronograma" va en una COLUMNA NUEVA** que sella el servidor y leen el
  comprobante y el historial. `off_schedule` + motivo sigue siendo la única puerta del IP. *Por qué:*
  sellar `off_schedule` sin motivo revienta el check `0071:98`, y si se afloja, `attach_ip_document`
  (`0071:333`) deja convertir un pedido de base en uno de IP sin motivo.
- **D5 · Edición completa mientras el pedido está `solicitada`:** cambiar cantidad, quitar, agregar y
  cancelar, todo por RPC con guard de estado. En `preparando`, el panel dice quién lo tiene y que le
  pida liberarlo. Desde `lista`, sólo lectura. **Se cierra la escritura directa de la RLS.**
- **D6 · Stock por RPC**, con tres números por medicamento del protocolo de la visita: **vigente**,
  **ya pedido** (pedidos abiertos todavía no descontados) y **máximo que se arma de una vez** (el lote
  más grande, porque el FEFO toma un solo lote, `0075:499-510`). En pantalla: «12 en stock · 2 ya
  pedidas», y un aviso si la cantidad supera lo armable. No expone lotes ni vencimientos.

### Tanda 3 · Base, con mock

- **D7 · "Otro"** es un medicamento **del catálogo** que el paciente no tiene habilitado, del stock del
  protocolo, con el **pedido adjunto obligatorio** (receta o indicación, PDF o foto).
- **D12 · Cómo se implementa "Otro":** viaja como **pedido de habilitación**, no como renglón. Farmacia,
  al tomarlo, **habilita y suma el renglón en una sola transacción** (el patrón de la 0076) o lo
  rechaza con motivo. **Ningún trigger se afloja.** La receta va en **su propia tabla y RPC**; del
  circuito del IP se reusan sólo el bucket, las policies de Storage, el patrón de path y el
  previsualizador.
- **D8 · Entregas en partes por ENVASES, con saldo.** El renglón dice «indicado N, entregar ahora M».
  En la visita siguiente aparece «Saldo de Fenisona: 1 envase (se entregó 1 el 01/09)» para pedirlo
  con un clic.
- **D13 · El aviso rojo sale en esta tanda**, junto con las partes, para que nunca haya rojo falso.
  Se discutió adelantarlo a la Tanda 2 (tensión con la voz externa) y se mantuvo.
- **D14 · El aviso compara por DROGA y ENTRE PROTOCOLOS**, con un RPC por paciente que devuelve sólo
  droga, presentación, fecha y protocolo. Rojo si la droga se entregó en los últimos 30 días;
  informativo si lo que queda es un saldo pendiente (D8).

### Transversal

- **D-alcance · Tres tandas, tres PRs.** Cada una se prueba logueada por separado.
- **D15 · Doce correcciones de implementación incorporadas** (abajo, en cada tanda).
- **D16 · `TODOS.md`:** sólo «alertas al día sin recargar». Partición entre lotes, alerta por mail o
  WhatsApp y saldo con fecha quedaron **descartados por ahora**, no diferidos.

## Cómo fluye

### Estado del IP de una visita (D1, D2, D3, D10, D11)

```
          visita atendida (attended_at ó real_date) y lleva_ip sellado
                                   │
                                   ▼
                             ┌───────────┐  coordinación: "No corresponde" (motivo)
                             │ SIN PEDIR │──────────────────────────────┐
                             └─────┬─────┘                              │
                 pedido con IP     │        coordinación: "Entregado    │
                                   ▼        en otra visita" (elige)     │
                        ┌──────────────────┐ ───────────────────┐       │
                        │ PEDIDO A FARMACIA│                    │       │
                        └───┬──────────┬───┘                    │       │
          Farmacia rechaza  │          │ deliver_dispensation   │       │
          o cancelan        ▼          ▼ (ip_kits, delivered_by) ▼      ▼
                     ┌───────────┐ ┌──────────┐        ┌─────────────┐ ┌───────────────┐
                     │ RECHAZADO │ │ENTREGADO │        │ENTREGADO EN │ │NO CORRESPONDE │
                     │ (sigue    │ │ (cierra) │        │OTRA VISITA  │ │  (cierra)     │
                     │  abierto) │ └──────────┘        │  (cierra)   │ └───────────────┘
                     └───────────┘                     └─────────────┘

  abierto (SIN PEDIR · PEDIDO · RECHAZADO)  ⇒ computed_status nunca 'completa'   (D2)
  abierto y ancla + 48 h < now()           ⇒ alerta «IP sin entregar»            (D3)
  todo esto sólo si ancla >= corte '2026-MM-DD 00:00-03'                           (D10)
```

### Pedido de base (D4, D5, D6, D8, D12)

```
 coordinación (panel de la visita)                          Farmacia
 ─────────────────────────────────                          ────────
 elige medicamento habilitado ──► stock_de_la_visita()  (vigente · ya pedido · máx. armable)
   │   └─ aviso de 30 días (D14, en memoria sobre 1 consulta por panel)
   │
   ├─ "Otro" + receta ─► pedido de habilitación ───────► toma: habilita + renglón (1 tx) │ rechaza
   │
   ▼
 create/add (sella base_sin_cronograma; includes_ip sólo si va IP)
   │
 SOLICITADA ── editar cantidad / quitar / agregar / cancelar (RPC + lock + guard + auditoría)
   │ start_dispensation_preparation (prepared_by_name)
 PREPARANDO ── coordinación: "Lo tiene <nombre>; pedile que lo libere"   (lectura)
   │ mark_dispensation_ready  → stock descontado (FEFO, un lote)
 LISTA ─────── sólo lectura
   │ deliver_dispensation     → delivered_by sellado por trigger
 ENTREGADA ─── saldo = indicado − Σ entregado (calculado, D8)
```

## Tanda 1 · IMP

**Migraciones en DOS archivos** (corrección 2):

- **`0119` · aditiva, se aplica ANTES del front.**
  - `dispensations.delivered_by` y `delivered_by_name`: los sella el trigger `BEFORE` que hoy sella
    `delivered_at`, **pisando** lo que mande el cliente. Se suman al candado de la 0073, reescrito
    entero (corrección 1).
  - `patient_visits.lleva_ip` (nombre a confirmar al escribir): lo sella un trigger `BEFORE UPDATE`
    cuando `real_date` o `attended_at` pasan de null a valor.
  - Tabla de cierre del IP (*No corresponde / Entregado en otra visita*), con `id`,
    `unique (visit_id)`, lectura igual que `patient_visits`, trigger de auditoría y RPCs con permiso
    de operador (corrección 3).
  - Arreglo de `includes_ip` en `create_dispensation_request` y `add_dispensation_items`, **misma
    firma**.
  - Vista del estado del IP por visita (D10), armada desde tablas base.
  - Vista de la alerta, agrupada por visita, patrón de la 0103 (corrección 4).
- **`0120` · se aplica DESPUÉS del deploy del front, y no se pushea hasta entonces.**
  `v_patient_visits` con la condición nueva de `computed_status` y el corte literal con `-03`. Como
  no cambia columnas: `create or replace view` de `v_patient_visits`. Si hiciera falta recrear las
  dos, se copia verbatim la 0102.

**Front:**

- `VisitDetail.tsx`: lee el pedido **una vez** (`useVisitDispensations`) y se lo pasa a los dos
  paneles con un `onChanged` compartido (corrección 5).
- `VisitProcedures.tsx`: dibuja la fila del IP **antes** de las tres salidas tempranas
  (`procedures.ts:171`, `:184`; `VisitProcedures.tsx:99`). Desde la fila se ofrecen «No corresponde»
  y «Entregado en otra visita».
- Regla pura nueva (p. ej. `src/views/track/ipEstado.ts`): estado → rótulo, tono y acción disponible.
- Clase de alerta nueva, con barrido de **todos** sus consumidores:
  - `src/data/visits.ts`, `src/views/alertSeverity.ts`
  - `src/shell/notificaciones.ts` (`ClaseDeAlerta`/`CLASES`), `NotificationsMenu.tsx`
  - `src/views/TrackAlertsView.tsx` (`estadoOptions`, los dos pipelines, `:259`)
  - `src/views/pendientesPorProtocolo.ts`, `src/views/alertFilters.ts`
  - `src/views/resumen/ambito.ts`, `src/data/alertDismissals.ts` (`useActiveAlerts`)
- Contador de módulo `bumpAlertas()`, mismo patrón que `dismissalsVersion`.

**QA logueado:** con una cuenta **sólo coordinadora** y con la farmacéutica.

- Los seis estados de la fila.
- La visita queda `realizada` y pasa a `completa` al entregar.
- La alerta se enciende y se apaga en los tres caminos de cierre.
- Un segundo pedido de base en una visita con IP **ya no pide constancia**.
- Un PATCH directo sobre `delivered_by` de una entrega cerrada es rechazado.

## Tanda 2 · Base, lo definido

**Migración `0121` · aditiva, se aplica ANTES del front.**

- Columna `base_sin_cronograma`, sellada en `create_dispensation_request` / `add_dispensation_items`
  (misma firma). Se afloja el chequeo de cronograma **sólo para renglones de base**.
- RPCs de edición: `update_dispensation_item_quantity`, `remove_dispensation_item` (nombres a fijar).
  Llevan `for update` sobre el pedido, guard `solicitada`, rechazo del último renglón y permiso igual
  al de `create_dispensation_request` (corrección 9).
- `prepared_by_name`, sellado en `start_dispensation_preparation` y
  `reassign_dispensation_preparation`, y limpiado en `cancel_dispensation_preparation` (corrección 8).
- Trigger de auditoría en `dispensation_request_items`:
  `after insert or delete or update of quantity, medication_id`. `dispensation_audit_trail` (0077)
  pasa a buscar los renglones por `request_id` dentro del JSON, así también aparecen los borrados
  (corrección 6).
- Se cierran las **tres** policies de escritura de Track: `track crea solicitudes`,
  `track gestiona solicitud propia` y `track administra items solicitud`. Todo lo que escribe es
  `security definer`: verificado que `0071:409` y `0072:32` lo son y que el front no escribe directo
  (correcciones 5 y 7).
- `stock_de_la_visita(p_visit_id)`, una llamada por panel (corrección 10):
  - **vigente** con el predicado **exacto** del FEFO (`0075:502-504`: protocolo de la visita,
    vencimiento nulo o `>= current_date`);
  - **ya pedido** = renglones de pedidos `solicitada`/`preparando` **sin** dispensación en
    `lista`/`entregada`, separando lo de esta visita de lo de las demás;
  - **máximo armable** = el lote vigente más grande, comparado contra la **suma por medicamento**
    del pedido;
  - si es plpgsql con `returns table`, calificar columnas (0056/0058) o escribirlo en `language sql`.

**Front:** `VisitDispensationPanel.tsx`, `motivosFueraCronograma.ts` (`'renglones'` deja de pedir
motivo), `PanelNuevaDispensacion.tsx`, `ComprobanteImprimible.tsx` e historial (leen el sello nuevo).
Ante el rechazo del guard, releer el pedido y el stock, arreglando también `:710` y `:729`.

**QA logueado** (cuenta sólo coordinadora):

- Pedir base en una visita sin `dispenses`: sale sin motivo y el comprobante muestra el sello.
- Editar cantidad y quitar un renglón: queda en el historial.
- Con Farmacia tomando el pedido: el panel pasa a "Lo tiene <nombre>".
- Un insert o update directo por PostgREST: 0 filas o `42501`.
- Los números de stock contra lo que acepta `mark_dispensation_ready`.

## Tanda 3 · Base, con mock

**Antes de la primera línea:** mock de "Otro", del saldo y del aviso rojo **en el repo**.
Sugerido: `/plan-design-review`.

- Pedido de habilitación de "Otro": tabla nueva + RPC de coordinación. Su receta va en tabla y RPC
  propias, sobre el bucket existente con prefijo de path propio y sin tocar `includes_ip`.
- RPC de Farmacia: habilitar + renglón en una transacción (patrón `0076`), o rechazar con motivo.
- El saldo **calculado** desde `dispensation_items` de lo entregado, por enrolamiento y droga. Tiene
  que resolver la sustitución (sigue al sustituto) y la cancelación (no cuenta) (corrección 11).
- `entregas_recientes_del_paciente(p_patient_id)`, `security definer`: devuelve sólo droga,
  presentación, fecha y protocolo de los últimos 30 días, **excluyendo la visita actual**. La regla
  roja o informativa se resuelve en memoria (corrección 12). Reemplaza a `AvisoReciente`, cuyo
  comentario de cabecera se reescribe.
- Ojo con la FK nueva sobre `dispensation_request_items`: ya está embebida en `dispensations.ts:703`.
  Desambiguar por columna (lección 0076).

## Tests

Criterio del repo: se testea la regla pura que puede fallar **en silencio**. Lo visible se verifica
logueado.

```
CÓDIGO                                                    RECORRIDOS
[T1] vista estado IP por visita (SQL)                     [T1] V7 con IP de punta a punta
  ├── sin pedir / pedido / entregado / rechazado    [→E2E]  ├── [GAP][→E2E] pedir → entregar → completa
  ├── no corresponde / en otra visita                [→E2E]  ├── [GAP][→E2E] 48 h → alerta → No corresponde
  └── corte -03 y ancla attended_at→real_date        [→E2E]  └── [GAP][→E2E] entregado en VNP → vincular
[T1] ipEstado.ts (pura: estado → rótulo/tono/acción)       [T1] segundo pedido de base en V con IP
  └── [GAP] ipEstado.test.ts: los 6 estados + desconocido    └── [GAP][→E2E] no pide constancia (bug de hoy)
[T1] clase de alerta nueva
  ├── [REGRESIÓN] notificaciones.test.ts «CLASES cubre las cuatro» → cinco
  ├── [REGRESIÓN] pendientesPorProtocolo.test.ts: tercera lista
  ├── [REGRESIÓN] alertFilters.test.ts: opciones con la lista nueva
  └── [REGRESIÓN] ambito.test.ts: «Lo mío» con requested_by agregado y sin coordinador
[T1] delivered_by (trigger + candado 0073)                 [→E2E] PATCH directo rechazado
[T2] motivosFueraCronograma.ts
  └── [REGRESIÓN] 'renglones' ya no exige motivo; 'solo_ip' sigue igual
[T2] stockModel.ts (pura)
  └── [GAP] suma por medicamento vs lote más grande; excluye lista/entregada; esta visita vs otras
[T2] edicionPedido.ts (pura: qué se puede hacer en cada estado)
  └── [GAP] solicitada edita · preparando muestra nombre · lista lectura · último renglón → cancelar
[T2] RLS cerrada + auditoría de renglones                  [→E2E] cuenta sólo coordinadora
[T3] saldoModel.ts (pura)
  └── [GAP] indicado − Σ entregado; sustitución; cancelación no cuenta; medicamento deshabilitado
[T3] avisoReciente.ts (pura)
  └── [GAP] por droga; borde 30 días AR vs UTC (CI en UTC); saldo → informativo; excluye esta visita
[T3] "Otro": habilitar + renglón en 1 tx                   [→E2E] la constancia del IP queda intacta

COBERTURA ACTUAL de lo nuevo: 0 %  |  a escribir: 7 archivos de test + 5 regresiones
E2E (QA logueado): 9 recorridos  |  Sin tests posibles en vitest: las vistas y RPCs SQL (van por QA)
```

**Regresiones, obligatorias:** `notificaciones.test.ts`, `pendientesPorProtocolo.test.ts`,
`alertFilters.test.ts`, `ambito.test.ts` y `motivosFueraCronograma.test.ts`. Los tests de fecha se
escriben con timestamps en `+00:00`, que es la forma en que los manda PostgREST: un test con
`-03:00` ya pasó una vez con la implementación rota (2026-09-08).

## Performance

Volumen: ~23 pacientes, 262 visitas históricas, 11 recepciones. **Nada llega a P1.**

- `computed_status` suma un `exists` por visita, y los índices que usa ya existen (`0005:18`,
  `0005:20`). **Nunca un JOIN a pedidos en la vista**, porque duplica visitas cuando hay más de un
  pedido.
- La alerta, en vista propia agrupada por visita: las listas de visitas no pagan nada.
- Stock y aviso de 30 días: **una consulta por panel**, nunca una por selección.
- Sin índices nuevos a este volumen.
- Refutado: «el corte de fecha tiene que ir primero en un CASE anidado». Es consejo genérico: el
  histórico tiene `attended_at` nulo y ya cortocircuita.

## Modos de falla

| Camino nuevo | Falla realista | ¿Test? | ¿Manejo? | ¿Silenciosa? |
|---|---|---|---|---|
| Sello `lleva_ip` | visita registrada sin "Iniciar atención" | E2E | trigger sobre `real_date` | no |
| Corte de D2/D3 | literal sin huso → corta a las 21:00 del día anterior | E2E | literal con `-03` | **sí, sin el huso** |
| Alerta IP | pedido cancelado + nuevo → alerta duplicada | E2E | vista agrupada por visita | no |
| Entrega en VNP | la V7 no cierra nunca | E2E | "Entregado en otra visita" | no |
| `delivered_by` | PATCH reescribe quién entregó | E2E | candado 0073 extendido | no |
| Base en visita con IP | segundo pedido pide constancia | E2E | `includes_ip` sólo si va | no |
| Edición de pedido | Farmacia lo toma mientras se edita | pura | lock + guard + relectura | no |
| Stock | aviso de lote no coincide con el FEFO | pura | mismo predicado, suma por medicamento | **sí, sin la suma** |
| Saldo | sustitución cambia el medicamento | pura | saldo calculado | **sí, si se guarda** |
| Aviso rojo | droga entregada en el otro protocolo | pura | RPC por paciente | **sí, sin cruzar** |

**Brechas críticas: 0.** Las cuatro filas marcadas "sí" quedan cubiertas por la decisión o
corrección que ya está en el plan. Se listan para que la implementación no las "simplifique".

## NO entra en este plan

- **Partir un pedido entre varios lotes en el FEFO.** Descartado por ahora; D6 muestra el máximo
  armable en su lugar.
- **Alerta que llega por mail o WhatsApp.** No hay SMTP ni ejecución con horario.
- **Saldo con fecha prevista y alerta de la segunda parte** (opción C de D8).
- **Fraccionar un envase en dosis** (opción B de D8). Sería su propia feature.
- **Corregir un pedido ya entregado** (opción C de D5). Es terreno de Farmacia.
- **Alertas al día sin recargar.** Anotado en `TODOS.md`.
- **Backfill de `delivered_by` desde `audit_log`** para entregas viejas: la fila dice «Entregado
  (fecha)» sin nombre.

## Paralelización

Secuencial. Las tres tandas reescriben `create_dispensation_request` y tocan
`VisitDispensationPanel.tsx`, y el orden lo fija el alcance. Dentro de la Tanda 1, una vez escrito el
contrato SQL (`0119`), la clase de alerta (`src/shell/`, `src/views/`) y la fila del modal
(`src/views/track/`) pueden ir en paralelo; comparten sólo `src/data/`.

## Tareas

- [ ] **T1 (P1)** · SQL · `0119`: `delivered_by`, `lleva_ip`, cierre del IP, arreglo de
  `includes_ip`, vistas de estado y alerta. *Verifica:* sonda PostgREST sin sesión (`42501`) + QA.
- [ ] **T2 (P1)** · Front · fila del IP, lectura única del pedido, `onChanged` compartido.
  *Verifica:* `npm run build` + QA de los seis estados.
- [ ] **T3 (P1)** · Front · clase «IP sin entregar» + barrido de consumidores + `bumpAlertas` + 5
  tests de regresión. *Verifica:* `npm run build`.
- [ ] **T4 (P1)** · SQL · `0120`: `computed_status` con corte. **Después del deploy.**
- [ ] **T5 (P1)** · SQL · `0121`: sello de base, RPCs de edición, `prepared_by_name`, auditoría de
  renglones, cierre de RLS, stock. *Verifica:* sondas + QA con cuenta sólo coordinadora.
- [ ] **T6 (P1)** · Front · panel de base sin cronograma, edición, stock, relectura ante guard.
- [ ] **T7 (P2)** · Diseño · mock de "Otro", saldo y aviso rojo en el repo.
- [ ] **T8 (P1)** · SQL + Front · "Otro" (habilitación en 1 tx, receta aparte), saldo calculado,
  aviso rojo por droga entre protocolos + 2 tests puros.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — (codex no instalado) | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 26 issues (8 arquitectura + 6 de seguimiento + 12 correcciones), 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** voz externa por subagente Claude. Coincidió con el buscador de SQL, sin haberlo
  visto, en el sello de `off_schedule` (D9), la regla única del IP (D10) y el candado de
  `delivered_by`. Hubo una sola tensión, adelantar el aviso rojo, y el Director mantuvo lo decidido
  (D13). El workflow de verificación se cortó a mitad a pedido del Director: Performance quedó
  verificada completa (6 sobreviven, 1 refutado); los hallazgos de SQL se verificaron a mano contra
  el `.sql` vivo; Calidad, Tests y Bordes se cubrieron en línea.
- **VERDICT:** ENG CLEARED — lista para implementar la Tanda 1. La Tanda 3 necesita mock en el repo y
  conviene pasarla por `/plan-design-review`.

NO UNRESOLVED DECISIONS
