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

**Mock en el repo:** `docs/design_handoff_dispensacion_t3/` (lienzo publicado:
<https://claude.ai/code/artifact/e110068f-a952-4880-a78c-76c3cb308780>). Pasó `/plan-design-review`
el 2026-09-13: las decisiones D17 a D28 y las especificaciones están en
[«Revisión de diseño · Tanda 3»](#revisión-de-diseño--tanda-3-2026-09-13), más abajo. **Mandan sobre el mock
donde lo contradicen** (el mock es anterior a la revisión).

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
- [x] **T7 (P2)** · Diseño · mock de "Otro", saldo y aviso rojo en el repo
  (`docs/design_handoff_dispensacion_t3/`) + `/plan-design-review` (2026-09-13).
- [ ] **T8 (P1)** · Partida en tres entregas por la revisión de arquitectura (R1): ver las tareas
  **3a**, **3b** y **3c** al final de «Revisión de arquitectura · Tanda 3».

## Revisión de diseño · Tanda 3 (2026-09-13)

`/plan-design-review` sobre el mock `docs/design_handoff_dispensacion_t3/`, **con el pedido del Director
de simplificar el Historial**: hoy el historial de pedidos cerrados y el botón «Pedir producto en
investigación fuera de cronograma» quedan pegados al pie de la tarjeta, con la misma caja blanca, y el
botón se lee como un pedido más (`VisitDispensationPanel.tsx:1218-1267`). Sin voz externa (codex no
está instalado; el Director eligió no sumar un subagente). Las maquetas son HTML con los tokens reales
del código, en el lienzo, en lugar de las imágenes del generador de gstack.

### Decisiones (no re-discutir)

- **D17 · Historial plegado en una línea (opción B del lienzo, página «Historial»).** Al pie: «2 pedidos
  cerrados · el último, entregado el 13/09» + «Ver historial», que despliega renglones de una línea
  (fecha · qué · comprobante · estado) en una sola caja blanca. **Con un pedido rechazado, la línea lo
  nombra y abre desplegado**, con el motivo en una segunda línea. Se va la tarjeta completa por pedido
  (`renderCard`) y el «Ver N más».
- **D18 · La sección «Producto en investigación» existe siempre, y el motivo del IP fuera de cronograma
  vive adentro.** Si el cronograma no prevé IP, su estado vacío dice «El cronograma no lo prevé en esta
  visita.» con un botón chico «Pedir fuera de cronograma». Al tocarlo, el rótulo pasa a ámbar con ⓘ (el
  tratamiento actual de la excepción) y adentro van el motivo y después la constancia. **Desaparece la
  subsección aparte «Fuera de cronograma» y el botón suelto al pie.** El aviso rojo de D14 sigue arriba
  de toda la tarjeta y ya no se muda a la excepción.
- **D19 · Orden de la tarjeta, fijo:** avisos (rojo → informativo) · Medicación concomitante · Producto
  en investigación · Solicitar · pie del pedido abierto · Historial plegado (último).
- **D20 · «Otro» lista sólo lo que tiene stock vigente en el protocolo.** Si no queda nada: «No hay otro
  medicamento con stock en PROT-A».
- **D21 · Saldo trabado: visible, sin botón.** Si el medicamento se deshabilitó, la caja del saldo sigue
  y en lugar de «Pedir el saldo» dice «Ya no está habilitada». Sin stock, se puede pedir con el aviso de
  stock de siempre.
- **D22 · «Marcar lista para retirar» espera la habilitación.** Apagado con «Falta resolver la
  habilitación de <medicamento>», que también es el primer pendiente de la columna de pasos. Mismo
  criterio que la constancia del IP: lo que cambia el comprobante se resuelve antes de emitirlo.
- **D23 · «Pedir de nuevo» en la fila «No habilitado».** Abre «Otro» con medicamento y cantidad cargados
  y pide una receta nueva. El rechazo queda en el historial.
- **D24 · Pedir MÁS que el saldo pone el aviso en rojo.** *Reescrita por R2 (revisión de
  arquitectura):* el renglón del saldo nunca supera el saldo. Pedir esa droga como renglón NORMAL
  teniendo saldo abierto es una indicación nueva y va en rojo, con la pista «Tiene saldo de 1 envase:
  pedilo con «Pedir el saldo»». Nunca bloquea.
- **D25 · Varias drogas en rojo: una sola caja**, con el título general («Este paciente recibió omeprazol
  y budesonida en los últimos 30 días») y una línea por droga (presentación · fecha · protocolo).
- **D26 · Un «Otro» solo abre su propio pedido, sin renglones**, que entra a Solicitadas con la señal
  «Pide habilitar». Al habilitar recibe su primer renglón; si no se habilita y no tiene nada más, el
  pedido se cierra rechazado con ese motivo. *Resuelto en arquitectura: R3 y R4.*
- **D27 · El comprobante impreso, el cajón y el historial dicen «1 (de 2 indicados)».**
- **D28 · Motivos de «No habilitar», de lista:** receta ilegible o incompleta · receta sin firma del
  médico · no corresponde a este paciente · sin stock en el protocolo · otro motivo (texto obligatorio).

### La tarjeta, de arriba abajo (D19)

```
┌ Dispensación ─────────────────────────────────────────┐
│ 1 Avisos: rojo (droga reciente) → informativo (saldo) │  lo que frena la mano, ANTES de cargar
│ 2 Medicación concomitante: renglones · Elegir / Otro  │  lo que se está haciendo
│ 3 Producto en investigación: siempre presente         │  vacío = «Pedir fuera de cronograma»
│ 4 Solicitar dispensación (si hay algo sin mandar)     │
│ 5 Pie del pedido abierto: fecha · estado · Cancelar   │
│ 6 Historial plegado en una línea                      │  lo que ya pasó, último
└───────────────────────────────────────────────────────┘
```

### Estados

```
PARTE                 | CARGANDO                  | VACÍO                | ERROR                              | LISTO                  | PARCIAL
----------------------|---------------------------|----------------------|------------------------------------|------------------------|---------------------------
Aviso rojo / saldo    | «Comprobando entregas     | sin caja             | ámbar: «No se pudo comprobar si    | rojo o informativo     | una droga en rojo y otra
                      | recientes…» (reloj, sólo  |                      | recibió esta droga hace poco» +    |                        | con saldo: dos cajas, el
                      | si hay algo elegido)      |                      | «Revisá el historial antes de      |                        | rojo primero (D25)
                      |                           |                      | pedir.» Nunca se calla un error    |                        |
Desplegable «Otro»    | como el desplegable de hoy| D20                  | caja de error del panel            | formulario de «Otro»   | —
Receta de «Otro»      | —                         | «Agregar» apagado,   | mismos mensajes que la constancia  | vista previa + nombre  | si la subida falla, no se
                      |                           | «Falta la receta»    | del IP (10 MB · PDF, JPG, PNG,     |                        | crea la habilitación; lo
                      |                           |                      | WEBP)                              |                        | ya pedido queda
Saldo                 | sin caja hasta saber      | sin saldo: sin caja  | caja ámbar del aviso               | «Pedir el saldo»       | D21
Historial plegado     | sin línea hasta que carga | sin pedidos cerrados:| caja de error del panel            | la línea               | con un rechazo: abre
                      |                           | sin línea            |                                    |                        | desplegado (D17)
Habilitar (Farmacia)  | «Un momento…» en el botón | —                    | mensaje en el panel, sin cerrar    | aviso «Budesonida      | sin stock: se habilita
                      |                           |                      |                                    | habilitada y sumada»   | igual, como en sustitución
```

### El recorrido

```
PASO | QUIÉN HACE                                  | QUÉ SIENTE                   | QUÉ LO RESUELVE
-----|---------------------------------------------|------------------------------|--------------------------------------------
1    | Coordinadora abre la visita                 | «¿qué le toca?»              | avisos arriba, antes de cargar nada
2    | Elige una droga que se entregó hace poco    | duda                         | el rojo nombra droga, fecha y protocolo; no bloquea
3    | No encuentra el medicamento en la lista     | trabada                      | «Otro medicamento», al final del desplegable
4    | Adjunta la receta                           | «¿es la de este paciente?»   | vista previa antes de mandar
5    | Solicita                                    | alivio                       | la fila «Por habilitar» dice quién sigue
6    | Farmacéutica toma el pedido                 | trabajo extra                | la tarjeta lo anticipa, el cajón lo pone primero (D22)
7    | No lo habilita                              | tensión con Coordinación     | motivo de lista (D28); «Pedir de nuevo» (D23)
8    | Visita siguiente                            | «¿cuánto le faltaba?»        | saldo arriba, un clic (D21, D24)
```

### Especificaciones de sistema y accesibilidad

- «En partes» es la casilla nativa dentro de un `label`, como `ScheduleDefinitionForm.tsx:158`.
- «Otro» es una opción al pie del `SearchableSelect`, separada por un filete. **No usa `onCreate`**:
  en la casa «crear» es dar de alta en el catálogo.
- «No habilitado» usa el color de `rechazada` (`estados.ts:103`); el aviso rojo, `DANGER_TINT` con
  el título en `--spira-acc-deep-danger` (4,97:1 sobre el tinte).
- Ancho de referencia: el panel mide ~560px en la notebook de 1536×864. Los renglones del historial
  recortan con puntos suspensivos el texto del medio, nunca la fecha ni el estado.
- El aviso rojo va con `role="status"`: se anuncia sin interrumpir, porque nunca bloquea. «Ver
  historial» con `aria-expanded`. «Pedir el saldo» con nombre accesible «Pedir el saldo de <droga>».

### Lo que ya existe y se reusa

`AvisoReciente` (estados cargando/error, `VisitDispensationPanel.tsx:207`) · `ConstanciaDropzone` y
`ConstanciaPendiente` para la receta (`ConstanciaIp.tsx`) · `PanelSustitucion` como precedente de
habilitar en el mismo acto · `TarjetaConstancia` para la receta en el cajón · `RailProceso` +
`requisitos()` para el pendiente de habilitar · `SearchableSelect` con `desc` · `chipExcepcion`, badges
de `estados.ts` · `RejectModal` como base del modal «No habilitar».

### NO entra

- **Estado vacío de la receta dibujado en el mock:** lo describe la tabla de estados; no hace falta
  pantalla propia.
- **Cajón en tablet:** ya está en `TODOS.md` («el cajón en tablet»).
- **Historial en la ficha del paciente (solo lectura):** se aplica la misma línea plegada; no se
  diseñó una vista distinta.

### Tareas de diseño (repartidas en 3a, 3b y 3c por R1)

- [ ] **DT1 (P1)** · Front · Historial plegado (D17) y orden fijo de la tarjeta (D19).
  `VisitDispensationPanel.tsx`. *Verifica:* QA logueado con una visita con un pedido rechazado.
- [ ] **DT2 (P1)** · Front · Sección del IP siempre presente con estado vacío y motivo adentro (D18).
  `VisitDispensationPanel.tsx`. *Verifica:* QA en visita sin IP en el cronograma.
- [ ] **DT3 (P1)** · Front · Avisos: una caja roja por pedido con líneas por droga (D25), rojo por
  exceso de saldo (D24), estados cargando/error. `avisoReciente.ts` (pura, con test).
- [ ] **DT4 (P1)** · Front · «Otro»: sólo con stock (D20), «Pedir de nuevo» (D23).
- [ ] **DT5 (P1)** · Front · Saldo trabado (D21). `saldoModel.ts` (pura, con test).
- [ ] **DT6 (P1)** · Front + SQL · Farmacia: «Marcar lista» espera la habilitación (D22), motivos de
  lista (D28), pedido solo de habilitación (D26, confirmar en arquitectura).
- [ ] **DT7 (P2)** · Front · «1 (de 2 indicados)» en comprobante, cajón e historial (D27).
  `ComprobanteImprimible.tsx`, `ItemRow.tsx`.

## Revisión de arquitectura · Tanda 3 (2026-09-13)

`/plan-eng-review` acotado a la Tanda 3, sobre `main` en `88e60ab` (última migración `0122`), con las
decisiones D17-D28 de la revisión de diseño. Voz externa: subagente Claude (codex no instalado), 15
hallazgos; los que cambiaban decisiones se verificaron contra el código antes de preguntarlos. **Mandan
sobre D7-D28 donde los precisan.**

### Correcciones (no re-discutir)

- **R1 · Tres entregas, en orden.** **3a** panel (D17-D19), sólo front. **3b** partes, saldo y aviso
  rojo (D8, D13, D14, D21, D24, D25, D27). **3c** «Otro» y habilitación (D7, D12, D20, D22, D23, D26,
  D28). Mismo alcance total; cada una con su QA logueado.
- **R2 · El saldo es un VÍNCULO al renglón, no una suma por droga (3b).**
  - `dispensation_request_items` suma `quantity_indicated` (N de «entregar M de N») y
    `saldo_de_item_id` (FK a la misma tabla, sólo en renglones pedidos con «Pedir el saldo»).
  - Saldo = indicado del original − entregado (original + sus saldos) − **en camino** (saldos en
    solicitada / preparando / lista). **Sólo nace de un original ENTREGADO.** Si lo que falta ya está
    pedido: «Saldo de Fenisona: 1 envase · ya pedido», sin botón.
  - Validación en el SERVIDOR al crear/sumar: mismo enrolamiento, original raíz y entregado, cantidad
    ≤ saldo restante. `update_dispensation_item_quantity` aplica el mismo tope y, con indicado,
    cantidad ≤ indicado.
  - **Un medicamento, un renglón por pedido**, también en el servidor (índice único o guard). Antes de
    crearlo, contar duplicados en prod: si hay filas viejas repetidas, el índice no entra.
  - Así el comprobante cruza lo preparado (`dispensation_items`, agrupado por medicamento) con lo pedido
    por (pedido, medicamento) y puede decir «1 (de 2 indicados)» (D27).
  - Sigue a la sustitución porque el vínculo es al renglón.
- **R3 · Un «Otro» nace atómico (3c).** Una sola función `solicitar_habilitacion(visita, pedido|null,
  medicamento, cantidad, indicado, receta…)`: con pedido `solicitada` se suma; si no hay, o Farmacia ya
  lo tomó, crea pedido + habilitación en la MISMA transacción. El alta del pedido (permisos, protocolo,
  origen) sale a una **función interna** que también usa `create_dispensation_request` (reescrita con la
  misma firma y el mismo comportamiento). La interna lleva `revoke execute … from authenticated, anon,
  public` —`0007:30` da permiso de ejecución a toda función nueva— y repite `auth.uid()` y permisos
  adentro. Sonda sin sesión: `42501` o `PGRST202`.
- **R4 · Ciclo de la habilitación (3c).**
  - La fila guarda sólo la decisión de Farmacia: `pendiente` → `habilitada` / `no_habilitada`.
    **«Anulada» se deduce**: pendiente en un pedido cancelado, rechazado o atendido. Cancelar y rechazar
    no se reescriben.
  - Se reescriben, desde su última versión y con la misma firma: `remove_dispensation_item` (0121: una
    habilitación pendiente cuenta como «el pedido lleva algo») y `mark_dispensation_ready` (0075 tal
    cual + guard «ninguna habilitación pendiente», D22).
  - Habilitar / no habilitar exigen pedido `preparando` **y** que no exista dispensación en `lista` o
    `entregada` (el chequeo de `attach_ip_document`, 0071:352-358): en `lista` el pedido sigue en
    `preparando`.
  - No habilitar deja el pedido sin renglones, sin IP y sin otras pendientes → llama a
    `reject_dispensation_request` con el motivo (D26).
  - Se revoca `resolve_dispensation` (0050:342, deprecada y sin llamadas) de `authenticated`, y se borra
    `resolveDispensation` de `dispensations.ts`. El PATCH directo de estados sigue en `TODOS.md`.
- **R5 · Una tabla, con la receta adentro (3c).** `dispensation_habilitaciones`: `id` (lo exige
  `audit_row`), `request_id`, `medication_id`, `quantity`, `quantity_indicated`, `receta_path` (unique),
  `receta_file_name`, `receta_mime`, `receta_size`, `origen_habilitacion_id` (R6), `requested_by/at`,
  `estado`, `motivo_codigo`, `motivo_texto`, `decided_by/at`. Lectura como `dispensation_ip_documents`;
  sin insert/update/delete para el cliente; trigger de auditoría.
  - Receta en `ip-docs/{protocolo}/habilitaciones/{uuid}.{ext}`: las policies de 0071 la cubren y no se
    tocan. La función exige esa forma exacta, el protocolo de la visita y que el objeto EXISTA en
    `storage.objects`.
  - Los huérfanos se aceptan (el bucket no permite borrar, a propósito); se saca la promesa de
    «borrar si falla». Limpieza anotada en `TODOS.md`.
  - «Otro» se ofrece sólo a quien puede subir: coordinador asignado o Farmacia. Admin de Coordinación y
    gerencia no lo ven.
- **R6 · La receta habilita UNA entrega (decisión del Director, contra la recomendación) (3c).**
  - Habilitar activa `patient_medications` y anota qué habilitación lo activó (columna nueva en
    `patient_medications`, con FK nombrada en cualquier embed). Un trigger `AFTER UPDATE OF status` en
    `dispensation_requests` lo desactiva cuando el pedido termina (atendida, cancelada, rechazada), sólo
    si la marca sigue apuntando a esa habilitación. `assign_patient_medication` (Farmacia desde la ficha)
    limpia la marca: si Farmacia lo habilita a mano, queda habilitado. El candado de la 0050 no se afloja.
  - **Saldo de un «Otro»:** «Pedir el saldo» crea una habilitación nueva con `origen_habilitacion_id` y
    la MISMA receta ya aprobada (no se sube otra); Farmacia la aprueba al preparar.
  - Copy: «Se habilita sólo para esta entrega», en el formulario y en el cajón.
- **R7 · `contexto_dispensacion(p_visit_id)` (3b).** Security definer; permiso como
  `stock_de_la_visita`. Devuelve **filas crudas**, marcadas por tipo:
  - `entrega`: entregas de los últimos 31 días de TODAS las visitas y protocolos del paciente, incluida
    esta: droga, medicamento, presentación, instante, código de protocolo. Nunca lote, cantidad ni
    nombre del estudio.
  - `abierto`: pedidos abiertos del paciente (solicitada / preparando / lista) en cualquier visita,
    salvo el pedido abierto de ESTA visita. «Pedido el 12/09 en PROT-B, todavía sin retirar».
  - `indicacion`: del enrolamiento, cada renglón con indicado, lo entregado y lo en camino, renglón por
    renglón (R2).
  - `ip`: la última entrega de IP del enrolamiento en 31 días (instante, kits, visita).
  - La ventana exacta en huso AR, la resta del saldo y la clasificación rojo/informativo viven en
    `avisoReciente.ts` y `saldoModel.ts`, con test. Comparación **por droga si las dos la tienen, si no
    por el mismo medicamento** (`drug_id` es nullable). La validación de escritura del saldo queda en
    SQL como autoridad (R2); el QA verifica que las dos cuentas coincidan.
- **R8 · Despliegue y consultas (3b, 3c).** 3a sin migración. 3b y 3c son **aditivas: migración
  primero**. Todo anidado nuevo nombra la clave (`medications!medication_id`, y la FK nueva de
  `patient_medications`); `saldo_de_item_id` no se anida. Sonda sin sesión de cada select nuevo antes del
  push: `401`/`42501`, nunca `300`/`PGRST201`.
- **R9 · El panel se parte.** 3a: `HistorialPlegado.tsx`, `SeccionIp.tsx`. 3b: `AvisosDeEntrega.tsx`
  (y se BORRAN `AvisoReciente` y `useUltimaDispensacion`). 3c: `FormularioOtro.tsx`. Reglas puras:
  `historialPlegado.ts`, `avisoReciente.ts`, `saldoModel.ts`.
- **R10 · El saldo también en el alta manual de Farmacia (3b).** `PanelNuevaDispensacion.tsx` muestra
  la misma caja de saldos con «Pedir el saldo». La salida ambulatoria (0116) no tiene visita y queda
  afuera.
- **R11 · 3a sin SQL, pero con la verdad del IP.** `SeccionIp` lee el mismo estado del IP que
  Procedimientos (`src/data/visitIp.ts`): con un cierre de la 0119 muestra el cierre y no ofrece nada. El
  aviso viejo sigue arriba con su regla de tono y, al abrir la excepción, aparece dentro de la sección del
  IP en ámbar, hasta que la 3b lo reemplaza.
- **R12 · `candidatos_otro(p_visit_id)` (3c).** Medicamentos del protocolo de la visita
  (`protocol_medications`), con stock vigente (predicado exacto del FEFO, `0075:501-504`) y sin
  habilitación activa para el paciente: id, nombre, dosis, unidad, en stock, máximo armable. Todo
  calificado (0056/0058).
- **R13 · La trazabilidad ve la habilitación (3c).** `dispensation_audit_trail` reescrita sobre la 0121
  con la misma firma: suma `dispensation_habilitaciones` del pedido y los cambios de
  `patient_medications` que la referencian. Etiquetas nuevas en `historial.ts`, con test.

### Cómo fluye «Otro» (R3-R6)

```
 COORDINACIÓN                                   BASE                                    FARMACIA
 ────────────                                   ────                                    ────────
 candidatos_otro(visita) ──► protocolo ∩ stock vigente ∖ habilitados
 elige + receta ──► sube a ip-docs/{prot}/habilitaciones/{uuid}   (huérfano si lo de abajo falla)
          │
          ▼
 solicitar_habilitacion ──► ¿pedido 'solicitada'? ── sí ──► + habilitación 'pendiente'
                                   │ no
                                   └──► _alta_pedido (interna, revocada) + habilitación   (1 tx)
                                                                         │
                                                  tablero: «Pide habilitar X» ◄───────────┘
                                                                         │ Preparar
                                                   ┌─────────────────────┴─────────────────────┐
                                                   ▼                                           ▼
                                   habilitar (sin disp. lista/entregada)          no habilitar (motivo de lista)
                                   patient_medications.active + marca             ¿pedido vacío? → reject_dispensation_request
                                   + renglón (scanned_units 0)
                                                   │
                        mark_dispensation_ready: pendientes = 0 (D22) ─► lista ─► entregada
                                                   │
                        trigger AFTER UPDATE OF status (atendida/cancelada/rechazada)
                        ──► desactiva patient_medications si la marca es de esta habilitación (R6)
```

### Tests

```
CÓDIGO                                                     RECORRIDOS
[3a] historialPlegado.ts (pura)                            [3a] Visita con historial
  ├── [GAP] resumen «N pedidos cerrados · el último…»        ├── [GAP][→E2E] plegado → «Ver historial» → renglones
  ├── [GAP] con un rechazado: abre desplegado y lo nombra    ├── [GAP][→E2E] visita sin IP: «Pedir fuera de cronograma»
  └── [GAP] sin pedidos cerrados: sin línea                  │           → motivo adentro → constancia → solicitar
[3a] SeccionIp.tsx                                           └── [GAP][→E2E] visita con cierre «No corresponde»: sin oferta
  └── [REGRESIÓN] motivosFueraCronograma.test.ts sigue verde
[3b] saldoModel.ts (pura)                                  [3b] Partes y saldo
  ├── [GAP] indicado − entregado − en camino (R2)            ├── [GAP][→E2E] V1 «1 de 2» → entregar → V2 saldo → pedir
  ├── [GAP] original no entregado: sin saldo                 ├── [GAP][→E2E] saldo en camino: «ya pedido», sin botón
  ├── [GAP] sustitución sigue al renglón                     ├── [GAP][→E2E] comprobante «1 (de 2 indicados)»
  └── [GAP] trabado: deshabilitado / sin stock (D21)         ├── [GAP][→E2E] editar cantidad del saldo por encima → rechazo
[3b] avisoReciente.ts (pura)                                 └── [GAP][→E2E] «Pedir el saldo» desde el alta manual de Farmacia
  ├── [GAP] misma droga, otra presentación → rojo          [3b] Aviso rojo
  ├── [GAP] sin droga: compara por medicamento (R7)          ├── [GAP][→E2E] droga entregada en OTRO protocolo → rojo
  ├── [GAP] saldo → informativo; renglón normal → rojo (D24) ├── [GAP][→E2E] entregada hoy en ESTA visita → rojo (R7)
  ├── [GAP] abierto sin retirar → rojo                       ├── [GAP][→E2E] SEGURIDAD: coordinadora SÓLO de otro protocolo
  ├── [GAP] varias drogas → una caja (D25)                   │           llama contexto_dispensacion → 42501
  ├── [GAP] borde 30 días en huso AR (timestamps +00:00)     └── [GAP][→E2E] IP fuera de cronograma con IP reciente → ámbar
  └── [GAP] cargando / error nunca se callan
[3c] estados.ts requisitos()/readyBlockedReason            [3c] «Otro» de punta a punta
  └── [REGRESIÓN CRÍTICA] habilitación pendiente es          ├── [GAP][→E2E] «Otro» solo → pedido nuevo en Solicitadas
       requisito y bloquea «Marcar lista»                    ├── [GAP][→E2E] Preparar → Habilitar → renglón escaneable → lista
[3c] edicionPedido.ts                                        ├── [GAP][→E2E] entregado → medicamento desactivado (R6)
  └── [REGRESIÓN] último renglón con habilitación pendiente  ├── [GAP][→E2E] saldo de un «Otro» → habilitación con misma receta
       se puede quitar                                       ├── [GAP][→E2E] no habilitar, pedido vacío → rechazado
[3c] historial.ts                                            ├── [GAP][→E2E] «Pedir de nuevo» con receta nueva
  └── [GAP] etiquetas de habilitación (historial.test.ts)    ├── [GAP][→E2E] cancelar pedido → «anulada»
[3c] SQL: solicitar/resolver/candidatos/mark_ready           ├── [GAP][→E2E] habilitar con dispensación en lista → rechazo
  └── [→E2E] sondas sin sesión: función interna (42501/      ├── [GAP][→E2E] ruta de receta de otra forma/protocolo → rechazo
       PGRST202), resolve_dispensation revocada, selects     └── [GAP][→E2E] PATCH directo a la tabla nueva → 0 filas/42501

COBERTURA de lo nuevo: 0 %  |  a escribir: 3 archivos de test puros + historial.test.ts + 3 regresiones
E2E (QA logueado, cuenta SÓLO coordinadora + farmacéutica): 25 recorridos
```

### Modos de falla

| Camino nuevo | Falla realista | ¿Test? | ¿Manejo? | ¿Silenciosa? |
|---|---|---|---|---|
| Saldo | saldo en camino ofrecido otra vez | pura | resta en camino (R2) | no |
| Saldo | renglón colgado de otro paciente | E2E | validación en SQL (R2) | no |
| Aviso | medicamento sin droga | pura | fallback a medicamento (R7) | no |
| Aviso | entrega a las 22:00 AR del día 30 | pura | ventana en TS con huso AR | no |
| Cruce de protocolos | coordinadora ajena lee historia | E2E | permiso por visita (R7) | no |
| «Otro» solo | se corta entre pedido y habilitación | E2E | una transacción (R3) | no |
| Función interna | llamada por `/rpc` | sonda | revoke + permisos adentro (R3) | no |
| Habilitar | con comprobante ya emitido | E2E | chequeo lista/entregada (R4) | no |
| Una entrega | queda habilitado tras cancelar | E2E | trigger al terminar (R6) | no |
| Marcar lista | habilitación pendiente | regresión | guard SQL + `requisitos()` | no |
| Receta | archivo subido, función falla | — | se acepta; `TODOS.md` | **sí, huérfano** (aceptado) |
| Embed nuevo | FK ambigua voltea el tablero | sonda | FK nombrada (R8) | no |

**Brechas críticas: 0.** El único camino silencioso, el archivo huérfano, se aceptó con su TODO.

### Lo que ya existe y se reusa

`substitute_dispensation_item` (habilitar + renglón en una transacción) · `attach_ip_document` (chequeo
de protocolo de la ruta y de dispensación emitida) · policies de `ip-docs` (0071) · `reject_dispensation_request`
(cierre de D26) · `stock_de_la_visita` y `alternativas_sustitucion` (molde de `candidatos_otro`) ·
`requisitos()` (un solo lugar para el riel y el botón) · `dispensation_audit_trail` · `uploadIpDocument`
(validaciones de archivo).

### NO entra

- **Borrar recetas huérfanas:** el bucket no lo permite a propósito; limpieza manual en `TODOS.md`.
- **Cerrar el PATCH directo de estados:** ya está en `TODOS.md`, desde la 0122.
- **Saldo desde la salida ambulatoria (0116):** no tiene visita ni protocolo.
- **Tests automáticos de SQL:** el repo no los tiene; se cubren con sondas y QA logueado.
- **Una cola aparte de habilitaciones:** se evaluó (voz externa) y se mantuvo D12.

### Paralelización

Secuencial entre entregas: las tres tocan `VisitDispensationPanel.tsx` y el orden lo fija R1. Dentro de
la 3c, una vez escrito el SQL, el lado de Farmacia (`src/views/pharma/dispensaciones/`) y el formulario
de Coordinación (`src/views/pharma/FormularioOtro.tsx`) pueden ir en paralelo; comparten sólo
`src/data/pharma/`.

### Tareas por entrega

**3a · Panel (sin SQL)**

- [x] **3a-1 (P1, humano: ~4h / CC: ~30min)** · Front · `HistorialPlegado.tsx` + `historialPlegado.ts`
  con test (D17, R9). *Verifica:* `npm run build` + QA con un pedido rechazado.
- [x] **3a-2 (P1, humano: ~4h / CC: ~30min)** · Front · `SeccionIp.tsx`: siempre presente, estado vacío,
  motivo adentro, lee el estado del IP de la 0119, aviso viejo mudado (D18, D19, R11).
  *Verifica:* QA en visita sin IP y en visita con cierre «No corresponde».

  **Al implementar la 3a (2026-09-13, rama `feat/dispensacion-3a`):** `npm run build` verde (998 tests) y
  el dibujo verificado contra el mock en un banco de pruebas sin sesión. **Falta el QA logueado.**
  - **Las reglas puras se llaman `*Model.ts`** (`historialPlegadoModel.ts`, `seccionIpModel.ts`), no como
    dice R9: en Windows `historialPlegado.ts` y `HistorialPlegado.tsx` son el MISMO archivo para `tsc`
    (TS1149). Vale para la 3b: `avisoReciente.ts` no choca (el componente viejo vive adentro del panel),
    pero `AvisosDeEntrega.tsx` + `avisosDeEntrega.ts` sí chocaría.
  - **«Con un pedido rechazado» (D17) es con un rechazo VIGENTE:** el pedido más nuevo que no se canceló
    es el rechazado. Uno ya resuelto por un pedido posterior no abre el historial, para que la ficha de un
    paciente de meses no quede desplegada para siempre por algo viejo.
  - **El historial cuenta TODOS los pedidos cerrados**, también el entregado con IP que la sección del IP
    muestra como desenlace. Antes se excluía para no repetir el comprobante, pero así sus renglones de
    base no aparecían en ningún lado de la tarjeta.
  - Los estilos compartidos del panel se mudaron a `panelDispensacion.tsx`.

**3b · Partes, saldo y aviso rojo**

- [x] **3b-1 (P1, humano: ~1 día / CC: ~1h)** · SQL · migración aditiva: `quantity_indicated`,
  `saldo_de_item_id`, validaciones y tope (R2), un renglón por medicamento (contar duplicados en prod
  antes), `contexto_dispensacion` con filas crudas (R7). *Verifica:* sondas + QA con cuenta sólo
  coordinadora de otro protocolo.
- [x] **3b-2 (P1, humano: ~1 día / CC: ~1h)** · Front · `saldoModel.ts` + `avisoReciente.ts` con tests,
  `AvisosDeEntrega.tsx`, «En partes», «Pedir el saldo», borrar `AvisoReciente` y
  `useUltimaDispensacion` (D8, D13, D14, D21, D24, D25, R9). *Verifica:* `npm run build` + QA.
- [x] **3b-3 (P2, humano: ~3h / CC: ~20min)** · Front · «1 (de 2 indicados)» en comprobante, cajón e
  historial (D27); caja de saldos en el alta manual de Farmacia (R10).

  **Al implementar la 3b (2026-09-14):** migración `0123` (PR #171, **aplicada en prod el 2026-09-14**);
  front en `feat/dispensacion-3b`. `npm run build` verde (1025 tests).
  - **Sondas:** sin sesión, columnas y funciones existen y ningún embed quedó ambiguo; con sesión, las dos
    funciones internas dan `42501`. **Cero pedidos con un medicamento repetido** (9 renglones en prod).
  - **QA logueado de sólo lectura** (ACT18301, Susana Rodriguez): aviso rojo real al elegir Alvetide en la
    V5 («tiene pedido … sin retirar», por el pedido abierto de la V6); «En partes» apaga «Agregar» con lo
    indicado inválido y muestra el saldo que queda; renglón «x1 de 2 · Sin solicitar»; tablero de
    Farmacia y alta manual cargan; consola limpia. No se solicitó nada.
  - **Sin QA con datos reales, por decisión del Director:** el saldo de punta a punta y el rojo por entrega
    reciente (no hay entregas en los últimos 31 días en prod). Cubiertos por tests y banco de pruebas.
  - **Copy (Director, 2026-09-14):** el estado vacío del IP dice «El cronograma no lo pide en esta visita.»
    (antes «no lo prevé»).
  - **«Entregar en partes», rediseñado sobre el mock (Director, 2026-09-14):** «En partes · entregar … de
    [2] envases» no se entendía. Ahora la casilla dice «Entregar en partes» con un ⓘ (`InfoTip`) que
    explica, y adentro una sola línea: «Total indicado [2] envases · queda 1 de saldo». «Cant.» arranca
    en 1.
  - **Un renglón por medicamento va como GUARD por trigger, no índice único:** no depende de que no haya
    duplicados viejos (el conteo en prod quedó pendiente porque la sesión se cerró) y los locks sobre el
    pedido que ya toman las funciones cierran las carreras.
  - **La alta de un renglón vive en `alta_renglon_pedido`** (interna, revocada), que usan `create` y `add`:
    la validación del saldo es una sola.
  - **Lo entregado se cuenta con la cantidad del renglón**, no con `dispensation_items`: el FEFO arma cada
    medicamento con esa misma cantidad, y con un renglón por medicamento son el mismo número.
  - **El rojo cubre también lo elegido en el desplegable** antes de «Agregar» (mock 1), y un saldo pedido
    con «Pedir el saldo» no dispara rojo por ninguna droga.
  - **En el alta manual de Farmacia van sólo los saldos** (R10), no el rojo.
  - Para mostrar partes en el comprobante y el cajón: `partesDelMedicamento`, `cantidadConPartes` y
    `notaDePartes` en `dispensationModel.ts`, con test.

**3c · «Otro» y habilitación**

- [x] **3c-1 (P1, humano: ~2 días / CC: ~2h)** · SQL · `dispensation_habilitaciones` (R5),
  `candidatos_otro` (R12), `solicitar_habilitacion` + interna revocada (R3), resolver (R4), reescrituras
  de `mark_dispensation_ready`, `remove_dispensation_item`, `create_dispensation_request` y
  `dispensation_audit_trail` (misma firma, desde su última versión), marca y trigger de una entrega
  (R6), revocar `resolve_dispensation`. *Verifica:* sondas sin sesión + QA.
- [x] **3c-2 (P1, humano: ~1 día / CC: ~1h)** · Front · `FormularioOtro.tsx` (receta, sólo para quien
  puede subir), fila «Por habilitar» / «No habilitado» / «Pedir de nuevo», saldo de un «Otro» (D7, D20,
  D23, R5, R6).
- [x] **3c-3 (P1, humano: ~1 día / CC: ~1h)** · Front · Farmacia: señal en el tablero, sección de
  habilitación en el cajón, modal «No habilitar» con motivos de lista, `requisitos()` con la regresión
  crítica, etiquetas de `historial.ts` (D22, D26, D28, R13). *Verifica:* `npm run build` + QA con la
  farmacéutica.

  **Al implementar la 3c (2026-09-14):** migración `0124` (PR #173, **aplicada en prod el 2026-09-14**) y
  front en `feat/dispensacion-3c`. `npm run build` verde (1036 tests).
  - **Sumado al plan:** `quitar_habilitacion` (el mock tiene una ✕ en la fila «Por habilitar» y no había
    función) y `accionAlPie` en `SearchableSelect` («Otro medicamento» al pie, que no es `onCreate`).
  - **Sin FK de la habilitación al renglón**: sería una tabla puente entre pedido y renglón y podría dejar
    ambiguo el embed de los renglones. El renglón se resuelve por (pedido, medicamento).
  - **El trigger de «una entrega» no desactiva** si otro pedido abierto del paciente lleva el medicamento:
    la 0050 lo exige al entregar y ese pedido quedaría trabado.
  - **El alta manual de Farmacia no ofrece el saldo de un «Otro»**: se pide desde la tarjeta de la visita.
  - **Sondas:** tabla, funciones y el select completo del tablero sin ambigüedad; internas y
    `resolve_dispensation` dan `42501` con sesión. **`solicitar_habilitacion` SÍ puede leer Storage**
    (probado con una receta inexistente, sin escribir nada).
  - **QA logueado de sólo lectura:** candidatos reales (EFC18419), «Otro» al pie del desplegable, el
    formulario con la receta elegida y la fila «Sin solicitar · Con receta» (quitada sin mandar), el botón
    «Otro medicamento, con receta» cuando el paciente no tiene nada habilitado, tablero sin errores.
  - **Sin QA con datos reales, por decisión del Director:** habilitar, no habilitar, quitar, el cierre de
    «una entrega» y el saldo de un «Otro». La sección del cajón y el modal se midieron en un banco de pruebas.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — (codex no instalado) | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | CLEAR (PLAN) | T1-T2: 26 issues, 0 critical gaps · T3 (2026-09-13): 22 issues, 0 critical gaps, R1-R13 |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (FULL) | score: 6/10 → 9/10, 12 decisions (D17-D28), Historial simplificado |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** en las dos revisiones de arquitectura la voz externa fue un subagente Claude (codex
  no instalado). En T1-T2 coincidió con el buscador de SQL en D9, D10 y el candado de `delivered_by`.
  En T3 aportó 15 hallazgos; 13 entraron como correcciones (R2-R13), y dos tensiones se resolvieron
  a favor de la revisión: se mantuvo D12 (habilitación colgada del pedido) y se movió la cuenta del
  saldo y la ventana de 30 días a reglas puras con test. En R6 el Director eligió «una entrega» contra
  la recomendación («tratamiento»).
- **VERDICT:** ENG + DESIGN CLEARED. Tandas 1 y 2 en prod. Tanda 3 lista para implementar en tres
  entregas: 3a (sólo front), 3b y 3c (migración primero en las dos).

NO UNRESOLVED DECISIONS
