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
