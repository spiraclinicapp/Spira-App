# TODOS — Spira App

Deuda técnica y mejoras diferidas, capturadas con contexto para que quien las
tome dentro de unos meses entienda el porqué y por dónde empezar.

---

## Pharma · converger el formateo de fecha de vencimiento a un solo helper

**Bundleado (2026-07-13):** se resuelve como parte del submódulo de Dispensación (ver design doc
`~/.gstack/projects/spiraclinicapp-Spira-App/Tutuca-main-design-20260713-215031.md`), porque el
comprobante de dispensación agrega un tercer formato si no se converge ahora. Esta entrada queda
como contexto histórico; borrarla cuando ese PR se mergee.


- **Qué:** `MedicamentosView` formatea vencimientos con su `formatFecha` local
  (`dd/mm/yyyy`); el detalle de Recepción (v0.16+) usa `formatDayMonthYear` de
  `lib/dates.ts` (`dd mmm yyyy`). Converger ambas al helper compartido.
- **Por qué:** hoy el mismo dato (fecha de vencimiento) se lee distinto en dos
  vistas del mismo módulo. Es una inconsistencia menor de presentación, no un bug.
- **Pros:** una sola fuente de formato de fecha en Pharma; borra un formateador
  ad-hoc (`formatFecha` en `MedicamentosView.tsx`).
- **Contras:** cambia el formato visible de los vencimientos en Medicamentos
  (`dd/mm/yyyy` → `dd mmm yyyy`); conviene confirmarlo con el Director antes.
- **Contexto:** surgió en la `/plan-eng-review` del handoff "Recepción · detalle de
  renglones". Ahí se extrajo `ESTADO_CFG`/`estadoFromExpiry` a
  `src/views/pharma/expiryState.tsx` (compartido). El formateo de fecha quedó
  fuera de ese PR a propósito para no agrandar el diff a Medicamentos.
- **Empezar por:** `src/lib/dates.ts` (elegir/definir el helper canónico) →
  `src/views/pharma/MedicamentosView.tsx` (`formatFecha`, línea ~294).
- **Depende de / bloqueado por:** decisión de formato del Director (`dd/mm/yyyy`
  vs `dd mmm yyyy`) para todo Pharma.

---

## Dispensación · el cajón en tablet

- **Qué:** diseñar e implementar el cajón de dispensación para pantalla chica.
- **Por qué:** hoy está fijado a 720 px + riel de 240 px, pensado para el escritorio
  de farmacia. En una tablet el riel se come un tercio del ancho útil.
- **Pros:** la farmacéutica podría preparar desde el mostrador sin volver al escritorio.
- **Contras:** **no está diseñado.** El handoff (§8.6) es explícito: *"la ruta natural es
  cajón full-width y riel colapsado a una tira horizontal de 3 pasos arriba del
  contenido. No está diseñado — hay que diseñarlo antes de implementarlo."*
- **Contexto:** surgió en la `/plan-eng-review` del handoff "Dispensación · paso a paso B"
  (2026-08-11). Se dejó fuera del PR a propósito: implementar un responsive sin mock ya
  costó una reescritura completa en este repo.
- **Empezar por:** pedir el mock. Recién después `DispensacionDrawer.tsx`.
- **Depende de / bloqueado por:** mock de tablet en el repo.

---

## Dispensación · volver atrás de un paso

- **Qué:** permitir revertir `lista → preparando` (y quizás `entregada → lista`), con permiso.
- **Por qué:** hoy el avance es de una sola dirección. Si la farmacéutica marca lista por
  error, el único camino es `cancelDispensationPreparation`, que devuelve la solicitud a
  Solicitadas y deshace todo — más de lo que quería.
- **Pros:** corregir un click equivocado sin perder la preparación entera.
- **Contras:** `mark_dispensation_ready` **descuenta stock y emite comprobante**. Revertir
  tiene que devolver el stock y decidir qué pasa con el N° de comprobante ya emitido (hoy
  `cancelDispensationPreparation` lo reserva para no dejar huecos en la numeración). Es una
  operación auditable delicada, no un botón "atrás".
- **Contexto:** el handoff lo deja abierto en §14 y §8.3 (*"No hay 'volver atrás' en el
  prototipo. Definir si producción necesita revertir un paso, probablemente sí, con permiso"*).
- **Empezar por:** `supabase/migrations/0054_*.sql`, ver cómo `cancel_dispensation_preparation`
  devuelve el stock; reusar esa mecánica acotada a un paso.
- **Depende de / bloqueado por:** decisión del Director sobre el rol que puede revertir.

---

## Dispensación · más de un código de barras por producto

- **Qué:** aceptar varios EAN válidos para el mismo medicamento en el escaneo.
- **Por qué:** en la vida real un producto puede traer más de un código válido (envase
  distinto, relote, importador). Hoy el modelo asume uno.
- **Pros:** menos "este código no corresponde" sobre medicación que sí es la correcta.
- **Contras:** `medication_codes` ya es 1 código ↔ 1 medicamento por diseño, y varias
  pantallas se apoyan en eso (la recepción no ofrece asociar código a medicamentos que ya
  tienen uno). Aflojarlo toca más que la dispensación.
- **Contexto:** el handoff lo deja abierto en §14 (*"El prototipo asume uno por item"*).
  No hay caso real reportado todavía — es un riesgo conocido, no un problema activo.
- **Empezar por:** `supabase/migrations/`, tabla `medication_codes` y su índice único.
- **Depende de / bloqueado por:** que aparezca un caso real. No adelantarse.

---

## Dispensación · motivo obligatorio en la sustitución

- **Qué:** volver obligatorio el motivo al sustituir un medicamento.
- **Por qué:** la sustitución queda en la trazabilidad; sin motivo, el registro dice qué
  cambió pero no por qué.
- **Pros:** auditoría completa de una decisión clínica.
- **Contras:** fricción en el mostrador. El handoff (§5.5) lo deja explícitamente a decidir:
  *"Hoy el prototipo sustituye en un click. Si se requiere motivo, el panel necesita un
  select/textarea + validación antes de habilitar 'Usar este'."*
- **Contexto:** en el PR de "orden y claridad" (2026-08-11) el campo se implementa
  **opcional**. Volverlo obligatorio es un `not null` + validación en el panel.
- **Empezar por:** la RPC `substitute_dispensation_item` (parámetro `p_reason`) y
  `PanelSustitucion.tsx`.
- **Depende de / bloqueado por:** decisión del Director. Conviene mirar primero cuántas
  sustituciones reales se registran sin motivo.

---

## Visitas · retroceder una etapa y ver el historial de la visita

- **Qué:** el anexo con chevron del botón primario de la barra de acción, con sus dos acciones:
  deshacer la última marca de etapa y ver quién hizo qué y cuándo en esta visita.
- **Por qué:** hoy una marca es irreversible desde la pantalla. Si Recepción marca la llegada del
  paciente equivocado, queda una visita "en curso" que nunca ocurrió y no hay vuelta atrás.
- **Pros:** corregir un click equivocado sin pedirle nada a soporte; y darle a la coordinadora la
  trazabilidad de su propia visita, que hoy no puede ver.
- **Contras:** son **dos** trabajos, no uno. (a) Un RPC nuevo que limpie la última marca
  (`arrived_at` / `real_date` / `ready_at` según la etapa) con sus reglas de permiso. (b) El
  historial, que es la parte delicada: el dato **ya está guardado** (el trigger
  `trg_audit_patient_visits` de la 0003 escribe cada UPDATE en `audit_log`), pero la policy de
  `audit_log` es **solo lectura para gerencia** (0006). Exponerlo a coordinación es una decisión de
  gobernanza ANMAT / ICH-GCP, no un detalle de UI.
- **Contexto:** surgió en la `/plan-eng-review` del handoff "Visitas · encabezado" (2026-08-13),
  decisión D3. Se dejó fuera a propósito: el encabezado no lo necesita para funcionar y el anexo se
  engancha después al botón primario que ese PR ya deja construido.
- **Empezar por:** `supabase/migrations/0023_track_visita_dia.sql` (ver cómo marcan `mark_arrived` /
  `mark_ready`) para el deshacer; y `supabase/migrations/0006_rls_policies.sql` (policy de
  `audit_log`) para el historial. Lo segundo, recién después de hablarlo.
- **Depende de / bloqueado por:** decisión del Director sobre qué rol puede deshacer una marca, y
  sobre si la auditoría se abre más allá de gerencia.

---

## Visitas · desacoplar la etapa operativa de la fecha real

- **Qué:** darle al "inicio de atención" su propia marca con hora (`attended_at` o similar), en vez
  de deducir la etapa de que `real_date` esté cargada.
- **Por qué:** hoy un mismo dato cumple dos papeles: `real_date` es a la vez "cuándo ocurrió la
  visita" y "la atención empezó". De ahí salen **dos síntomas distintos con una sola causa** —
  editar la fecha real mueve la ruta (por eso el encabezado tuvo que aceptar la regla de compromiso
  "corregir sí, crear no"), y la barra no puede mostrar "Inicio de atención · 10:31" porque
  `real_date` es un `date` sin hora, mientras que las otras dos etapas sí la tienen
  (`arrived_at` / `ready_at` son `timestamptz`).
- **Pros:** el campo de fecha real puede volverse siempre editable, como pedía el handoff; y la
  barra muestra hora en las tres etapas en vez de dos de tres.
- **Contras:** es una migración de **modelo**, no un ajuste. La etapa se calcula en
  `v_patient_visits` (0068) con tres condiciones encadenadas; hay que sumar la columna, hacer
  backfill desde `real_date` para las visitas viejas y revisar todo lo que lee la etapa (agenda,
  ficha, Visitas del día, la cola del médico, los tableros).
- **Contexto:** surgió en la `/plan-eng-review` del handoff "Visitas · encabezado" (2026-08-13),
  decisión D4. El handoff afirma que "corregir la fecha real no mueve la ruta"; con el modelo
  actual sí la mueve, y el plan se quedó con la regla de compromiso para no reabrir la 0068.
- **Empezar por:** `supabase/migrations/0068_estados_visita.sql`, la expresión
  `case when pv.ready_at ... when pv.real_date ... when pv.arrived_at ...`.
- **Depende de / bloqueado por:** nada técnico. Si se hace, la regla "corregir sí, crear no" del
  encabezado queda obsoleta y se puede simplificar.

---

## Pharma · dispensación ambulatoria (feature propia, con pantalla de alta)

- **Qué:** habilitar que la farmacia ambulatoria **dispense**, no sólo reciba: tabla propia
  `ambulatory_dispensations` (paciente sin visita ni protocolo), su FEFO sobre lotes con
  `protocol_id is null`, escritura en `stock_movements`, y la **pantalla de alta**, que es la parte
  que casi se pierde en el dimensionamiento.
- **Por qué:** desde la 0035 la recepción está tipada (`protocolo` / `investigacion` /
  `ambulatoria`), así que entra stock ambulatorio. Pero `dispensation_requests.visit_id` es
  `not null` contra `patient_visits`, o sea que **toda** dispensación cuelga de una visita de un
  paciente enrolado. El stock ambulatorio entra y no sale nunca.
- **Pros:** cierra un agujero operativo real; le da a Reportes la tercera categoría de la barra de
  composición que el handoff dibuja; y no toca el flujo de protocolo (el que ya se rompió cinco
  veces seguidas, 0054 a 0058).
- **Contras:** es un proyecto, no una tarea. Y trae dos trampas que hay que resolver ANTES de
  escribir la migración: `stock_movements.reference_type` es un CHECK con lista cerrada de cinco
  valores (`0002_tables.sql:335`) y `movement_type` es el enum `stock_movement_type`
  (`0001_extensions_enums.sql:79`). Reusar `reference_type='dispensation'` deja `reference_id`
  apuntando a dos tablas distintas y la ambulatoria cae en silencio del join del reporte; un valor
  nuevo obliga a rehacer el constraint sobre una tabla insert-only de audit trail y, si además se
  quiere un `movement_type` propio, a un `ALTER TYPE ... ADD VALUE` **en archivo aparte aplicado
  antes** (no se puede usar el valor nuevo en la misma transacción; precedente 0053).
  Ojo también: `stock_movements.reference_id` no es FK y no tiene índice (`0005_indexes.sql:22-23`
  sólo cubre `medication_id` y `created_at`), así que PostgREST no puede embeber por ahí.
- **Contexto:** surgió en la `/plan-eng-review` del handoff `design_handoff_pharma_reportes`
  (2026-08-15). El alcance original iba a meter esta tabla adentro de la PR de Reportes; la voz
  externa señaló que nacía **vacía y sin forma de llenarla**, y se decidió separarla. La decisión de
  diseño ya está tomada: tabla propia (se descartó aflojar `dispensation_requests` porque el FEFO
  filtra `ml.protocol_id = v_protocol_id` en `0050:316`, que con null nunca matchea, y se descartó
  el "protocolo sintético" por dato falso en base auditable).
- **Empezar por:** pedir el handoff de diseño de la pantalla de alta. Después
  `supabase/migrations/0050_pharma_dispensacion.sql:316` (el FEFO a espejar) y
  `0035_pharma_recepcion_tipos.sql` (la rama ambulatoria que ya existe del lado de la entrada).
- **Depende de / bloqueado por:** nada técnico. Reportes ya lee del libro compartido, así que
  cuando esto exista aparece en el reporte sin tocar nada.

---

## Core · focus trap en `components/Modal.tsx` (y los primeros tests de componente)

- **Qué:** agregar trap de foco y devolución del foco al disparador en el `Modal` compartido, con
  `initialFocus` explícito para los casos que ya manejan el foco a mano.
- **Por qué:** `src/components/Modal.tsx:34` sólo maneja Escape. `role="dialog"` y `aria-modal`
  están, pero el foco se escapa detrás del backdrop y al cerrar no vuelve. PRODUCT.md declara
  WCAG 2.1 AA.
- **Pros:** arregla la accesibilidad de los **20** componentes que usan el Modal de una sola vez.
- **Contras:** el riesgo está concentrado donde peor conviene. `PanelPreparando.tsx` re-enfoca el
  campo del lector de códigos de barras en cinco lugares (líneas 76, 89, 93, 102, 224) y
  `DispensacionDrawer.tsx:318` monta con `autoFocus`. Un trap que reclame el foco al montar le pisa
  el escaneo, y **el repo no tiene un solo test de componente** que lo detecte: todo vitest es
  aritmética pura que evita montar nada a propósito.
- **Contexto:** surgió en la `/plan-eng-review` del handoff de Reportes (2026-08-15), decisión 5.
  Primero se decidió hacerlo dentro de esa PR; la voz externa marcó el riesgo del lector y se sacó
  a PR propia. El handoff de Reportes lo pide explícitamente como requisito de producción.
- **Empezar por:** `src/components/Modal.tsx:33-36`, y montar la red antes que el trap: el primer
  test de componente del repo debería ser el del cajón de dispensación con el escaneo.
- **Depende de / bloqueado por:** nada. Conviene después de que Reportes esté mergeado, para que
  el QA de los 20 modales no se mezcle con el de la pantalla nueva.

---

## Pharma · adherencia real (unidades previstas + pantalla de carga)

- **Qué:** `protocol_medications.expected_units` (nullable) más la pantalla para cargarla, para
  calcular adherencia como entregado sobre previsto.
- **Por qué:** el handoff de Reportes muestra "Adherencia promedio 92%" y una columna por paciente.
  Ese número no tiene antecedente: `protocol_medications` sólo asocia medicamento con protocolo,
  sin cantidades. Sin las dos piezas (columna **y** pantalla), la adherencia es null para el 100%
  del universo y el bloque queda muerto en pantalla.
- **Pros:** completa el bloque de la modal de Consumo tal como está diseñado, y abre la puerta a
  alertas de subdispensación más adelante.
- **Contras:** necesita definición clínica que todavía nadie pidió (cuánto se prevé por visita, y si
  varía por brazo del estudio). Es carga manual protocolo por protocolo.
- **Contexto:** surgió en la `/plan-eng-review` del handoff de Reportes (2026-08-15), decisión 3.
  El reemplazo que sí sale el día uno es el **cumplimiento del pedido** (entregado sobre
  solicitado), con datos que ya se registran: `dispensation_request_items.quantity` contra
  `dispensation_items.quantity`, cuyo comentario en `0002_tables.sql` dice "puede diferir de lo
  solicitado". Queda pendiente definir su **eje**: por pedido es directo, por medicamento se
  complica porque la 0075 partió el conteo en dos columnas y la 0076 permite **sustituir** el
  renglón, así que "lo solicitado" por medicamento no es lo que se pidió originalmente.
- **Empezar por:** definir con el equipo clínico qué significa "previsto"; después
  `supabase/migrations/0050_pharma_dispensacion.sql` (donde nace `protocol_medications`).
- **Depende de / bloqueado por:** definición clínica. No lo bloquea nada técnico.

---

## Pharma · `v_billing_dispensations`: vista muerta y apoyada en datos que se borran

- **Qué:** decidir si se dropea o se reescribe sobre `stock_movements` la vista
  `v_billing_dispensations` (0004).
- **Por qué:** no la usa nadie en el front (grep limpio sobre `src/`), y **cuelga de
  `dispensation_items`**, que se borra en los caminos de cancelación y reversión (`0054:330`,
  `0055:158`, `0057:89`, `0058:90`, `0071:608`). Como `entregada` es irreversible desde la 0073, hoy
  coincide con el libro para lo entregado, pero es una coincidencia, no una garantía de diseño. Si
  Contable la adopta tal cual, va a leer números que pueden cambiar solos.
- **Pros:** o se borra una vista muerta, o se convierte en la vista de facturación de verdad,
  apoyada en el libro insert-only. La vista del reporte de Farmacia la reemplaza conceptualmente.
- **Contras:** trabajo que no se ve, y el riesgo hoy es teórico porque nadie la consulta. Además,
  si se reescribe, hereda el mismo muro de RLS: no puede joinear `patient_visits`.
- **Contexto:** surgió en la `/plan-eng-review` del handoff de Reportes (2026-08-15), en la sección
  "What already exists". Es el momento natural de decidirlo, porque la vista nueva del reporte
  resuelve el mismo problema bien.
- **Empezar por:** `supabase/migrations/0004_views.sql:60-82`, y la vista del reporte cuando exista.
- **Depende de / bloqueado por:** conviene después de la vista de Reportes, para reusar su forma.

---

## Core · barrer `--spira-faint` de todo el texto de lectura (contraste AA)

- **Qué:** revisar los usos de `--spira-faint` en la app y pasar a `--spira-ink-soft` los que
  son texto que alguien lee. Dejar `faint` sólo para marcas de ausencia: los guiones "—" de
  celda vacía, los separadores "·", los rellenos de barra apagada.
- **Por qué:** medido sobre blanco, `--spira-faint` (#A6B0AC) da **2,23:1** y
  `--spira-muted` (#7C8C87) da **3,52:1**. WCAG AA pide **4,5:1** para texto normal y 3:1 para
  texto grande, y "grande" empieza en negrita de 14px, así que un rótulo de 10 u 11px en negrita
  cuenta como texto normal. `--spira-ink-soft` (#556966) da **5,84:1** y pasa cómodo.
  PRODUCT.md declara WCAG 2.1 AA como objetivo y avisa exactamente de este punto flaco de la
  paleta serena; `tokens.css` lo dice en un comentario del propio token. O sea: el sistema ya
  sabe, y la app no lo sigue en todos lados.
- **Pros:** cierra la brecha entre lo que el proyecto declara y lo que hace; es un cambio de
  token, mecánico y fácil de revisar, sin lógica de por medio.
- **Contras:** toca prácticamente todas las vistas, así que el QA visual se multiplica; y cambia
  el aspecto de pantallas que hoy nadie reportó como problemáticas.
- **Contexto:** surgió en la `/plan-design-review` del handoff de Reportes (2026-08-15),
  decisión 1A. Ahí se decidió arreglarlo **sólo en la pantalla nueva** (sus cinco tablas nacen
  en `ink-soft`) y dejar el barrido del resto acá, por el mismo criterio con el que el focus
  trap del `Modal` se sacó a su propia PR: no mezclar un cambio transversal con una pantalla
  nueva. Consecuencia asumida: por un tiempo conviven dos criterios, y se va a notar si se
  ponen tablas viejas y nuevas lado a lado.
- **Empezar por:** `grep -rn "spira-faint" src/` y clasificar cada uso en dos baldes, texto de
  lectura contra marca de ausencia. Casos ya vistos: `DoctorQueueView.tsx:117` (rótulo en
  negrita), `DoctorQueueView.tsx:306` (`viaLabel`, 11,5px), `DayVisitsView.tsx:261`
  ("finalizadas", en negrita). Los `·` de `DayVisitsView.tsx:257-260` son separadores y quedan.
- **Depende de / bloqueado por:** nada. Conviene después de que Reportes esté mergeado, para
  que el QA de todas las vistas no se mezcle con el de la pantalla nueva.

---

## Core · converger los tres controles de fecha a uno solo

- **Qué:** unificar `DateField`, `DateNavButton` y `DateRangeField` en un componente con modo
  (`single` | `range`) y las mismas capacidades en los tres usos.
- **Por qué:** hoy son tres componentes que se parecen y no hacen lo mismo, y la diferencia no
  responde a ninguna decisión de diseño: responde a en qué orden se escribieron.

  | | Tipear la fecha | Mes/año | Rango | Dónde se usa |
  |---|---|---|---|---|
  | `DateField` | sí | sí | no | formularios (alta de paciente, vencimientos) |
  | `DateNavButton` | no | **no** | no | Dispensaciones, Visitas del día |
  | `DateRangeField` | no | sí (desde 2026-08-16) | sí | Reportes |

  `DateRangeField` nació sin mes/año justamente porque el desplegable era una función local dentro
  de `DateField.tsx` y no se veía desde afuera. Se extrajo a `CalendarCaption.tsx` y ahora lo
  comparten los dos, pero `DateNavButton` sigue sin él: en Dispensaciones, ir a una fecha de hace
  seis meses son seis clicks de chevron.
- **Pros:** un solo control que aprender y mantener; el próximo arreglo vale para todas las
  pantallas; se termina la duda de cuál usar al construir una vista nueva.
- **Contras:** toca Dispensaciones, Visitas del día, la ficha del paciente y los formularios de
  alta, que hoy funcionan bien y no pidieron nada. El QA se multiplica por cada pantalla con fecha.
- **Contexto:** salió de la `/impeccable critique` del calendario de Reportes (2026-08-16), que
  puntuó **1/4 en "Consistencia y estándares"** justamente por esto. Ahí se decidió arreglar sólo
  el nuevo y anotar la convergencia, por el mismo criterio con el que el focus trap del `Modal` se
  sacó a su propia PR: no mezclar una refactorización transversal con el arreglo de una pantalla.
  El snapshot completo está en `.impeccable/critique/`.
- **Empezar por:** `src/components/CalendarCaption.tsx` (ya es el pedazo compartido) y decidir si
  el componente unificado nace de `DateField` (el más capaz) o es uno nuevo que los tres envuelven.
  Lo más barato con valor inmediato: pasarle `captionLayout="dropdown"` a `DateNavButton`, que son
  dos líneas y cierra la brecha más visible sin unificar nada.
- **Depende de / bloqueado por:** nada. Conviene después de que Reportes esté mergeado.

---

## Pharma · hora real de llegada de una recepción

- **Qué:** `medication_receptions.reception_date` es un `date`: guarda el día, no la hora. Sumar la
  hora de llegada al alta y migrar la columna a `timestamptz`.
- **Por qué:** cuando entran dos cargamentos el mismo día, el día solo no alcanza para reconstruir
  qué pasó. Es el tipo de dato que se busca justo cuando algo salió mal.
- **Pros:** el encabezado de la card puede mostrar fecha y hora como pedía el handoff; el registro
  gana precisión para una auditoría.
- **Contras:** cambia el tipo de una columna con datos reales y suma un campo obligatorio a un alta
  que hoy es rápida. Hay que decidir qué hora se asume para las filas viejas (¿00:00? ¿`created_at`?)
  y ninguna respuesta es del todo honesta.
- **Contexto:** salió del `/plan-eng-review` del reskin de Recepción (2026-08-17, decisión **A1** en
  `docs/plan-recepcion-reskin-2c.md`). El mock mostraba "22 jul 2026 · 09:14" y **no hay hora**. Lo
  único con hora es `created_at`, que es cuándo se tipeó el registro, no cuándo llegó la caja: si se
  carga el lunes lo del viernes, difieren por días. Se decidió mostrar la fecha sola antes que
  rotular mal un dato, y dejar `created_at` visible por separado como "Cargada".
- **Empezar por:** preguntar si el dato hace falta. Si la mercadería siempre se carga al recibirla,
  entonces `created_at` ya es la hora de llegada y esto se resuelve con una aclaración de copy, sin
  tocar la base.
- **Depende de / bloqueado por:** nada técnico. Sí una confirmación de cómo se usa en el mostrador.

---

## Pharma · excursión de temperatura (cadena de frío)

- **Qué:** registrar si un cargamento sufrió una excursión de temperatura, quién la reporta y qué
  pasa con el stock afectado.
- **Por qué:** en un estudio clínico una excursión puede inutilizar un cargamento entero, y es de lo
  primero que un monitor pregunta. Hoy Spira no tiene dónde anotarlo.
- **Pros:** cierra un hueco real de trazabilidad regulatoria en el módulo que custodia la
  medicación.
- **Contras:** no es un campo, es un modelo: rango tolerado por producto, quién declara la
  excursión, si el stock queda en cuarentena o se descarta, y qué pasa con lo ya dispensado.
- **Contexto:** el handoff de Recepción "2c" escribe *"Sin excursión de temperatura"* en la nota de
  la card de investigación, como si el dato existiera. **No existe**: lo más cercano es
  `storage_location` (heladera / estante / ambiente, migraciones 0038/0039). En el reskin se resolvió
  mostrando `storage_location` en vez de un texto fijo que afirmaría algo que nadie verificó — el
  mismo criterio de honestidad que rige para el resto de la app.
- **Empezar por:** una definición del Director Médico sobre qué se registra y con qué consecuencia.
  Sin esa respuesta no hay schema que diseñar, y adivinarlo es caro: un campo de temperatura que
  nadie completa es peor que no tenerlo, porque parece que el control existe.
- **Depende de / bloqueado por:** decisión de dominio del Director Médico.

---

## Pharma · `medication_codes.code_type` miente: el default marca todo como EAN-13

- **Qué:** reclasificar los códigos que no son EAN-13 válidos y sacarle el `default 'ean13'` a la
  columna, para que cada alta tenga que declarar qué tipo de código está cargando.
- **Por qué:** hoy el campo que distingue el código de barras de la caja de un código interno del
  centro no sirve para decidir nada. `code_type` se creó con `default 'ean13'` (0032:45) y nadie
  eligió nunca el tipo al dar de alta: **de seis códigos distintos en Recepción, tres están mal
  tipados** (`01`, `02`, `0` — de uno y dos dígitos, declarados como códigos internacionales) y
  **ninguno** figura como `interno`. Medido contra producción el 2026-08-17.
- **Pros:** el campo vuelve a significar algo, y la pantalla puede confiar en el dato declarado en
  vez de adivinar por la forma del código.
- **Contras:** toca datos reales y hay que decidir caso por caso; sacar el default obliga a tocar
  el alta de medicamentos, que hoy no pregunta el tipo.
- **Contexto:** salió del reskin de Recepción (`docs/plan-recepcion-reskin-2c.md`). El mock muestra
  un qualifier "interno" al lado de los códigos cortos, y la única fuente para eso era `code_type`.
  Se resolvió con `esCodigoDeBarras()` en `recepcion/derivados.ts`, que decide por la FORMA (trece
  dígitos numéricos), porque la forma es verificable y el campo declarado no. Esa función lleva un
  comentario que apunta acá: cuando los datos se arreglen, puede volver a mirar `code_type`.
  **Ojo:** los códigos `0`, `01` y `02` huelen a datos de prueba de la carga inicial del catálogo —
  conviene mirarlos antes de reclasificar, no vaya a ser que haya que borrarlos.
- **Empezar por:** listar `medication_codes` donde el código no matchee `^[0-9]{13}$`, y decidir
  con el Director cuáles son internos de verdad y cuáles son basura de prueba.
- **Depende de / bloqueado por:** nada técnico. Sí una pasada del Director por la lista.

---

## Pharma · Recepción no escala al día de volumen

- **Qué:** verificación en lote, atajos de teclado y ordenamiento en la lista de Recepción.
- **Por qué:** todo se hace de a una recepción, con un modal de confirmación cada vez. Cuando
  llegan seis cargamentos juntos, la confirmación deja de ser una red de seguridad y pasa a ser un
  peaje. No hay atajos (25 elementos focusables, ninguno con acelerador) ni forma de ordenar por
  fecha o cantidad.
- **Pros:** la pantalla dejaría de estar diseñada sólo para el caso cuidadoso y serviría también
  para el día cargado, que es cuando más errores se cometen.
- **Contras:** verificar en lote choca de frente con la confirmación individual, que existe porque
  la acción es irreversible. Hay que resolver esa tensión, no elegir un lado: quizá confirmar una
  vez para el lote entero, mostrando el total que va a entrar.
- **Contexto:** `/impeccable critique` del 2026-08-17 puntuó "flexibilidad y eficiencia" en 2/4, y
  la persona del power user falla en los tres ejes. Una idea que salió y vale evaluar antes de
  construir: **hacer la verificación reversible por 30 segundos desde el toast** en lugar de
  confirmarla por modal. Resuelve el peaje y es más honesto que un "¿estás seguro?".
- **Depende de / bloqueado por:** nada. **La anulación ya existe** (migraciones 0086/0087, plan en
  `docs/plan-anular-recepcion.md`), así que la confirmación previa a verificar se puede aflojar sin
  dejar a la farmacéutica sin salida — y la idea del "deshacer por 30 segundos desde el toast" pasó
  a ser viable: ahora hay una operación real detrás de ese deshacer.

---

## Pharma · el lote fantasma que deja una anulación

- **Qué:** decidir qué se hace con la fila de `medication_lots` que queda en cero después de anular
  la recepción que la creó.
- **Por qué:** el caso que originó la anulación es **un lote tipeado mal**. Se anula, el stock
  vuelve, y la fila del lote queda con `quantity_on_hand = 0` y el número equivocado adentro,
  listada para siempre en Medicamentos y en Stock. El callejón sin salida no se cierra: se muda una
  pantalla. La primera persona que use la feature para lo que fue construida va a preguntar esto.
- **Pros:** la corrección quedaría completa de punta a punta.
- **Contras:** el lote **no se puede borrar** sin más: `stock_movements` lo referencia con
  `on delete restrict` y el libro es insert-only. Las salidas reales son ocultar los lotes en cero
  de las vistas de listado, o marcarlos de alguna forma. Ojo que hoy `v_medication_lots_detail`
  (0041) y los hooks de lotes **no** filtran por `quantity_on_hand > 0`; el selector FEFO (0050) y
  los reportes (0083) sí los excluyen, así que el problema es de presentación y no operativo.
- **Contexto:** lo anticipó el review final de la rama de anulación (2026-08-18) y lo confirmó el QA:
  quedó `TEST-ANULAR-0818` en cero, visible en Farmacia Ambulatoria.
- **Empezar por:** `src/data/pharma/stock.ts` y `supabase/migrations/0041_*.sql`, decidiendo si el
  filtro va en la vista o en el front.
- **Depende de / bloqueado por:** decisión de producto: un lote en cero **con historial** sí tiene
  que poder consultarse; el que estorba es el que nunca tuvo movimiento real.

---

## Pharma · el Producto de Investigación no tiene libro de movimientos

- **Qué:** evaluar si el IP necesita su propia tabla de movimientos, como `stock_movements` para la
  medicación de base.
- **Por qué:** hoy el stock de IP se **deriva**: `v_ip_stock` (0071) resta lo entregado a lo
  recibido, sobre las recepciones verificadas. No hay asientos. Eso significa que **una anulación
  de IP cambia los reportes retroactivamente y sin dejar rastro del cambio**: anular en septiembre
  una recepción de julio modifica lo que dice el reporte de julio, y nada explica por qué. En la
  medicación de base la misma pregunta se contesta sola —dos asientos en el libro, con motivo y con
  el id de la recepción—, que es exactamente para lo que ANMAT pide un libro insert-only.
- **Pros:** el IP dejaría de ser el único stock del sistema que no puede explicar su propio número.
- **Contras:** es un cambio de modelo, no un parche. Y hay que decidir qué pasa con lo ya ocurrido:
  un backfill de asientos desde las recepciones existentes es reconstruir historia, con todo lo que
  eso implica en un sistema auditable.
- **Contexto:** salió del review final de la rama de anulación (2026-08-18), como respuesta a "dónde
  va a doler esto en seis meses". Relacionado: `deliver_dispensation` (0071) **no valida
  disponibilidad de kits** en ningún momento, así que `void_reception` es hoy el único lugar del
  sistema que la enforcea, y lo hace con una lectura sin lock. Un `v_ip_stock` negativo es posible.
- **Empezar por:** decidir con el Director si el IP se contabiliza por movimientos o sigue
  derivándose. Recién después, el schema.
- **Depende de / bloqueado por:** decisión de dominio.

---

## Resumen · dos consultas bajan una tabla entera para calcular un entero

- **Qué:** reemplazar por conteo server-side las dos consultas que hoy descargan filas
  completas nada más que para contar. `useReceptions(null, null)` en la portada y
  `usePatients()` en el resumen de Coordinación.
- **Por qué:** `useReceptions(null, null)` trae hasta 500 recepciones con todas sus columnas
  (`TECHO_RECEPCIONES`, `src/data/pharma/receptions.ts:82`) y después hace
  `filter(r => r.status === 'pendiente').length` para mostrar UN número en la tarjeta de
  Farmacia. `usePatients()` hace lo mismo: trae todos los pacientes para contar los activos
  de un KPI. Las dos están en el camino crítico de una pantalla de resumen y las dos
  transportan PII que esa pantalla no muestra.
- **Pros:** saca dos descargas grandes del camino crítico de las dos pantallas que más se
  abren; deja de mover datos de paciente hacia una vista que solo quiere un entero.
- **Contras:** toca la capa de datos, y `useReceptions` la comparte `RecepcionView`, así que
  el cambio arrastra una vista de Farmacia que no tiene nada que ver con el resumen.
- **Contexto:** PRE-EXISTENTES, no las introdujo ningún PR reciente. Salieron de contar las
  consultas de las dos pantallas de resumen durante la `/plan-eng-review` del port del
  vocabulario de Visitas del día (2026-08-18). Dato que agrava: `useSupabaseQuery` no tiene
  caché ni dedupe (76 líneas, fetch-on-mount), así que se re-disparan enteras en cada entrada
  a la pantalla. Ojo con el techo de 500: el día que el centro lo pase, el síntoma no va a ser
  lentitud sino un número MAL, en silencio.
- **Empezar por:** `select('id', { count: 'exact', head: true })` con el filtro de estado en
  `src/data/pharma/receptions.ts` (hook de conteo aparte, sin tocar `useReceptions`) y el
  equivalente para pacientes activos en `src/data/patients.ts`.
- **Depende de / bloqueado por:** nada.

---

## Diseño · converger `card` (7 copias) y el resto de los estilos sueltos

- **Qué:** hay siete `const card` duplicados en `src/views/` (`InicioResumenView:16`,
  `TrackResumenView:14`, `TrackAlertsView:19`, `PatientFichaView:25`, `ProtocolDetailView:16`,
  `track/VisitDetail:227`, `pharma/recepcion/ReceptionCard:299`) y además
  `src/views/pharma/reportes/estilos.ts:22` YA exporta uno. Lo mismo con `cardTitle` y con
  `TIPO_LABEL` (copy de UI duplicado entre los dos resúmenes).
- **Por qué:** el mismo contenedor visual definido ocho veces. El día que se pida más aire o
  otro radio, se cambia uno y los otros siete quedan viejos, en pantallas distintas que nadie
  compara. `TIPO_LABEL` es peor por ser copy: se desincroniza el TEXTO que lee el usuario.
- **Pros:** un solo contenedor para toda la app; el próximo ajuste de tarjeta es una línea.
- **Contras:** los siete NO son iguales — el de Reportes usa `borderRadius: 16` y los demás
  `--spira-radius-lg`. Converger cambia el radio visible en la ficha del paciente, el detalle
  de protocolo y el detalle de visita: es un barrido de sistema de diseño con verificación
  visual en varias pantallas, no un refactor mecánico.
- **Contexto:** salió de la `/plan-eng-review` del port del vocabulario de Visitas del día
  (2026-08-18). El plan original iba a crear un `views/resumenStyles.ts` con estas constantes;
  la voz externa mostró que eso creaba un TERCER hogar en vez de converger. `btnOutline` sí se
  resolvió en ese PR (converge a `components/buttons.ts`, que ya era el canónico y usa el borde
  en longhands); `card` quedó afuera por tamaño.
- **Empezar por:** decidir el radio canónico con el Director (`16` vs `--spira-radius-lg`).
  Recién después, promover `estilos.ts` a compartido o crear `views/cardStyles.ts`.
- **Depende de / bloqueado por:** decisión de radio del Director.

---

## Accesibilidad · barrido de contraste del resto de la app (sobre todo en oscuro)

- **Qué:** auditar con la fórmula de WCAG el contraste de todos los componentes que pintan texto
  del color de un estado sobre ese mismo color con alpha. Medir, no mirar.
- **Por qué:** midiendo los chips para la revisión de diseño del resumen aparecieron **16**
  combinaciones por debajo de 4.5:1 — 5/5 tonos de protocolo, 4/4 chips operativos y 7/7 chips
  clínicos fallan en al menos un tema, y en oscuro la mayoría cae entre 2.58 y 3.04. PRODUCT.md
  compromete WCAG 2.1 AA.
- **Pros:** cierra la brecha entre lo que el producto promete y lo que hace; y deja el patrón
  correcto escrito, así el próximo chip teñido no nace roto.
- **Contras:** cambia la cara de componentes en pantallas que hoy nadie está tocando, así que
  necesita verificación visual del Director en Farmacia, la ficha, el modal de visita y Reportes.
- **Contexto:** salió de la `/plan-design-review` del port del vocabulario al resumen (2026-08-18).
  Esa PR ya corrige los TRES componentes que el resumen propaga (`ProtoTag`,
  `OperationalStageChip`, `VisitChip`): el texto pasa a `--spira-ink` y el tono queda en el fondo
  y en el punto. Lo que queda es el resto del sistema. Dato para no equivocar el umbral: los chips
  son 12px peso 600, o sea texto NORMAL (4.5:1) — "texto grande" arranca en 18.66px bold.
  Relacionado: solo la familia `--spira-acc-deep-*` tiene versión clara para oscuro, o sea que el
  tema oscuro se fue armando por parche.
- **Empezar por:** los que usan `color + alpha` del mismo tono — `components/Badge.tsx`,
  `components/Chip.tsx`, `views/pharma/expiryState.tsx` y las pastillas de `track/VisitHeader.tsx`.
  Se mide sin instalar nada: `getComputedStyle` en el preview + luminancia relativa, ~15 líneas.
- **Depende de / bloqueado por:** nada.

---

## Track · convergir el guardado del modal viejo de procedimientos

- **Qué:** llevar `VisitProceduresModal.tsx` al guardado atómico (un solo "Guardar cambios" que
  aplica todo el modal), como quedó el modal "Editar procedimiento" que estrena la fase 1 de
  Procedimientos del estudio.
- **Por qué:** hoy ese modal edita el catálogo con guardados sueltos que se aplican al toque; lo
  dice su propio comentario (`VisitProceduresModal.tsx:62`, "persiste al toque, no espera al
  'Guardar' del..."). Cuando el modal nuevo guarde todo junto, este va a quedar como la única
  pantalla de Coordinación donde apretar **Cancelar** no cancela lo que ya tocaste.
- **Pros:** los dos modales de procedimientos se comportan igual; desaparece el último botón del
  módulo que promete algo que no hace.
- **Contras:** toca una pantalla que hoy funciona y que nadie reportó; el cambio es de
  comportamiento y no visual, así que hay que verificarlo a mano (borrar algo, cancelar, confirmar
  que sigue ahí).
- **Contexto:** salió de la `/plan-eng-review` del handoff "Cronograma · Procedimientos y Reportes"
  (2026-08-23), pregunta 5. Ojo con el alcance real: la parte de ese modal que edita
  `has_report`/`report_eta_hours` **se muere sola** en la fase 3 (esas columnas se retiran). Lo que
  queda por convergir es el guardado del set de procedimientos de la visita.
- **Empezar por:** `src/views/track/VisitProceduresModal.tsx` (`saveReport`, línea ~62) y la RPC
  `set_visit_procedures` (0061), que ya es el patrón atómico a imitar.
- **Depende de / bloqueado por:** que cierre la fase 3 de Reportes, para no tocar dos veces el
  mismo archivo.

---

## Base · el proyecto no puede testear su propio SQL

- **Qué:** montar un Supabase local (Docker) que corra las migraciones en orden y permita testear
  las reglas que viven en SQL — vistas, policies de RLS y guards de transición.
- **Por qué:** hay ~90 migraciones con reglas de negocio adentro y ninguna tiene test. Cuando una
  vista cambia, la única verificación es mirar la pantalla. La regla que decide si una visita está
  "realizada" o "completa" (`v_patient_visits.computed_status`) pinta el estado en Visitas del día,
  la Agenda, la ficha del paciente y el resumen de Inicio: si queda al revés no explota nada, solo
  muestra mal.
- **Pros:** red para las reglas más caras del sistema; y se podrían ensayar las migraciones antes
  de aplicarlas a mano en producción, que hoy es un tiro sin ensayo.
- **Contras:** Docker en la máquina, correr las 90 migraciones, sembrar datos y sumarlo al build —
  que hoy tarda poco, y eso es parte de por qué se corre siempre.
- **Contexto:** salió de la `/plan-eng-review` del handoff "Cronograma · Procedimientos y Reportes"
  (2026-08-23), pregunta 8, como la opción descartada para no agrandar la función. Lo que se hizo
  en su lugar: espejar la regla en `views/track/reportes/estados.ts` con sus casos borde testeados
  y derivar el SQL de esos mismos casos. Ese espejo es útil igual (el front lo necesita para la
  tarjeta y el cierre de visita), pero deja dos copias de la misma regla.
- **Empezar por:** las tres vistas que más duelen — `v_patient_visits`, `v_track_visits` y
  `v_procedure_report_alerts`.
- **Depende de / bloqueado por:** nada.
