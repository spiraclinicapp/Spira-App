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

## ~~Pharma · dispensación ambulatoria (feature propia, con pantalla de alta)~~ — HECHO el 2026-09-08 (v0.64.0, migración 0116)

> **Cerrada.** Spec en `docs/superpowers/specs/2026-09-08-dispensacion-ambulatoria-design.md`, mock
> en `docs/mock-salida-ambulatoria.html`, plan en
> `docs/superpowers/plans/2026-09-08-salida-ambulatoria.md`. Salió como **tabla propia
> `ambulatory_dispensations`** y un modal en el kebab de Farmacia Ambulatoria, tal como estaba
> diseñado acá desde agosto. La entrada se deja entera: el razonamiento de por qué NO se aflojó
> `dispensation_requests` sigue valiendo, y la corrección sobre Reportes de más abajo es un
> pendiente vivo.
>
> **LO QUE QUEDA ABIERTO, y es su propia tanda:** que estas salidas aparezcan en **Reportes de
> Farmacia**. No es gratis (ver la corrección al final de la entrada): hay que reescribir la vista
> `0083` para que salga del libro en vez de `from dispensations`. Hoy las salidas ambulatorias se
> ven **sólo** en el bloque "Últimas salidas" del apartado.

<details><summary>La entrada original, para contexto</summary>

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
- **Depende de / bloqueado por:** ~~el handoff de diseño~~ **NADA — ya está desbloqueada.** El
  diseño se cerró el 2026-09-08 con el Director (siete decisiones) y hay spec y mock en el repo:
  `docs/superpowers/specs/2026-09-08-dispensacion-ambulatoria-design.md` y
  `docs/mock-salida-ambulatoria.html`. Lo que sigue es escribir el plan de implementación.
- **⚠️ CORRECCIÓN — esta entrada afirmaba algo FALSO.** Decía: *"Reportes ya lee del libro
  compartido, así que cuando esto exista aparece en el reporte sin tocar nada."* Verificado contra
  el `.sql` el 2026-09-08: la vista de Reportes (`0083`) arranca `from public.dispensations d` y
  llega al libro por un join con `reference_type = 'dispensation'`; hasta el índice de apoyo
  (`0083:40-42`) es **parcial** sobre ese valor. Una salida ambulatoria no tiene fila en
  `dispensations`, así que **no aparecería**. Que aparezca exige reescribir la vista para que salga
  del libro — código que alimenta números que se le muestran al sponsor — y por eso quedó
  explícitamente fuera del alcance del spec. Quinta vez en el proyecto que un "ya está resuelto"
  resulta falso por haberse verificado contra el front y no contra el schema.
- **RE-PEDIDO el 2026-09-08:** el Director volvió a pedir la funcionalidad, con estas palabras:
  *"quiero poder dispensar libremente, no que esté anidado a una visita y a un paciente
  necesariamente"*. Se difirió otra vez **a propósito**, en la `/plan-eng-review` de ese día
  (`docs/superpowers/plans/2026-09-08-dispensacion-libre-vnp.md`, decisión D1): el caso urgente
  —dispensar sin cronograma— se resolvió haciendo la VNP dispensable desde Farmacia, que no
  toca el modelo. Lo que sigue abierto acá es estrictamente el stock **ambulatorio**, que entra
  por recepción tipada (0035) y no tiene por dónde salir. La decisión de diseño (tabla propia,
  no aflojar `dispensation_requests`) se reconfirmó y sigue en pie.
  Anotado porque el pedido llegó como si fuera nuevo, con el análisis rehecho desde cero,
  estando esta entrada escrita desde el 2026-08-15.
- **⚠️ EL DIRECTOR CORRIGIÓ EL ENCUADRE EL MISMO DÍA, Y ESTO ES LO QUE PEDÍA.** Con la tanda de la
  VNP ya desplegada, aclaró:

  > *"Sigue sin ser una dispensación libre. Es decir, por ahí pasa que viene el director y te dice
  > dale un Seretide a él. Para estos casos se utilizaría la farmacia ambulatoria, pero no estaría
  > asociado a ningún paciente activo; puede que sea el hijo del director, por ejemplo, que no
  > figura en ningún lado."*

  **La VNP no cubre este caso y no puede cubrirlo.** Una VNP resuelve "el paciente enrolado vino
  sin cita": sigue habiendo paciente, enrolamiento y protocolo, y por eso entra en el modelo
  actual. Acá **no hay ninguna de las tres cosas** — el destinatario puede no existir como fila en
  `patients`, y darlo de alta como paciente de investigación sólo para entregarle un inhalador
  sería meter dato falso en una base auditable (el mismo argumento por el que se descartó el
  "protocolo sintético"). Requisito que se desprende del ejemplo y que hay que llevar al diseño:
  **el destinatario tiene que poder ser alguien que no está en el sistema**, así que la pantalla de
  alta necesita resolver cómo se lo identifica sin inventarle un enrolamiento.

  **Esta entrada deja de ser "algún día": es el próximo trabajo.** Lo único que la bloquea sigue
  siendo el handoff de diseño de la pantalla de alta.

</details>

**Cómo se resolvió el requisito del destinatario** (el que quedaba abierto arriba): **nombre
obligatorio en texto libre + documento opcional**, sin ficha de persona reutilizable. Alcanza para
que el inventario pueda decir a dónde fue la medicación, y no obliga a darle de alta una identidad
a alguien que no es sujeto de investigación. Se suma **quién autoriza**, obligatorio y por
desplegable (FK a `users`): la farmacéutica ejecuta pero no decide, y sin esa columna sería la
única persona registrada en una decisión que no tomó.

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

---

## Ajustes · Preferencias — Idioma (i18n de la app)

- **Qué:** el selector Español/English que la maqueta de Preferencias mostraba, con la
  traducción real detrás.
- **Por qué:** se cortó de la sección al hacerla funcional (plan `docs/plan-ajustes-funcional.md`,
  2026-08-25). No es una preferencia: es traducir la app entera.
- **Pros:** abriría Spira a centros o monitores que no trabajan en castellano.
- **Contras:** **no es un toggle.** Hoy todo el copy está literal en los componentes, sin
  librería de i18n ni claves. Es un proyecto propio, no un control de Ajustes. Y hay una
  decisión de producto atrás: los comentarios y el dominio del repo son en castellano
  rioplatense por convención explícita.
- **Contexto:** el control existía en `PrefsSection.tsx` como `useState` que no hacía nada.
  Dejar un toggle que promete inglés y no lo entrega viola la regla de honestidad de datos.
- **Empezar por:** decidir si Spira va a ser multilingüe (decisión de producto, no técnica).
  Recién después, elegir librería y extraer el copy.
- **Depende de / bloqueado por:** decisión de producto del Director.

---

## Ajustes · Preferencias — Densidad de listas y tablas

- **Qué:** el selector Cómoda/Compacta que la maqueta mostraba, con efecto real sobre el
  espaciado de listas y tablas.
- **Por qué:** se cortó al hacer funcional la sección (mismo plan). Requiere que los
  espaciados sean variables, y hoy no lo son.
- **Pros:** en pantallas chicas entrarían bastantes más filas por vista, que es un pedido
  natural de quien trabaja todo el día contra una lista.
- **Contras:** los paddings y gaps están escritos a mano en estilos inline por toda la app.
  Hacerlo de verdad es tokenizar el espaciado en `tokens.css` y migrar los consumidores:
  un proyecto de sistema de diseño, no un control.
- **Contexto:** `PrefsSection.tsx` lo tenía como `useState` inerte.
- **Empezar por:** `src/styles/tokens.css` — definir la escala de espaciado como variables y
  medir cuántos componentes habría que migrar antes de comprometerse.
- **Depende de / bloqueado por:** nada técnico; es cuestión de tamaño.

---

## Ajustes · Preferencias — Zona horaria

- **Qué:** dejar elegir la zona horaria en vez de tomar la del navegador.
- **Por qué:** se cortó al hacer funcional la sección (mismo plan), y de los tres cortes es
  el único con consecuencia clínica.
- **Pros:** un monitor o un sponsor mirando desde otro huso vería las fechas como las ve el centro.
- **Contras:** ⚠️ **cambiar la zona horaria cambia qué día es "hoy"**, y de eso dependen la
  Agenda, las ventanas de visita, los vencimientos y las alertas. Una ventana que se calcula
  contra un "hoy" distinto puede marcar una visita fuera de plazo cuando no lo está —
  o al revés. En un sistema auditable eso no es una preferencia cosmética.
- **Contexto:** `PrefsSection.tsx` lo mostraba como "Tomada de tu navegador" con un botón
  Cambiar inerte. Ese botón inerte era, de hecho, la decisión correcta.
- **Empezar por:** `src/lib/dates.ts` — auditar cada cálculo que asume la zona local antes de
  permitir que sea configurable.
- **Depende de / bloqueado por:** que exista un caso de uso real (hoy no lo hay: todos
  trabajan en Mendoza).

---

## Equipo y accesos · registrar los intentos rechazados

- **Qué:** dejar rastro de los intentos de cambiar un acceso que el sistema rechaza (sin
  permiso, auto-despojo de gerencia, último administrador, conflicto de concurrencia).
- **Por qué:** los cambios exitosos quedan auditados por `trg_audit_module_roles` desde la
  0003, pero los rechazados no dejan nada: el `raise exception` revierte la transacción y se
  lleva puesto cualquier insert que se hubiera hecho dentro.
- **Pros:** en un sistema regulado, los intentos rechazados son justamente lo que se mira
  para detectar a alguien tanteando los límites de sus permisos.
- **Contras:** escribir fuera de una transacción que revierte no es trivial: hace falta una
  tabla aparte escrita por una función autónoma, o un canal fuera de la transacción. Es
  complejidad real sobre la superficie más delicada de la app.
- **Contexto:** surgió en la `/plan-ceo-review` de Ajustes (2026-08-25, sección 8). Se difirió
  a propósito: con diez personas en el centro y quien administra siendo de confianza, el costo
  supera al valor de hoy. Cuando el equipo crezca, la pregunta vuelve.
- **Empezar por:** los RPC de `supabase/migrations/0095_consola_de_accesos.sql` — cada `raise`
  es un punto donde habría que registrar.
- **Depende de / bloqueado por:** que la consola de accesos esté en producción.
- **Prioridad:** P3.

---

## Equipo y accesos · exportar la matriz de accesos

- **Qué:** un botón que baje un CSV (o una hoja imprimible y firmable) con quién tenía qué
  acceso a una fecha determinada.
- **Por qué:** es el tipo de entregable que se pide en una auditoría de sistemas, y los datos
  ya están todos en la pantalla.
- **Pros:** barato de construir una vez que la consola existe: son horas, no días. La app ya
  genera comprobantes imprimibles en Farmacia, así que el camino técnico está probado.
- **Contras:** es especulativo. Nadie pidió todavía este papel y no sabemos qué formato acepta
  una inspección. Construir un entregable regulatorio a ciegas suele terminar en rehacerlo
  contra el requisito real.
- **Contexto:** propuesto como expansión E3 en la `/plan-ceo-review` de Ajustes (2026-08-25) y
  diferido deliberadamente por el Director. Ver `docs/plan-ajustes-funcional.md`.
- **Empezar por:** la vista de equipo de `0095_consola_de_accesos.sql`, que ya devuelve la
  matriz completa; y el patrón de impresión de las constancias de dispensación.
- **Depende de / bloqueado por:** conocer el requisito real, o que el Director decida un
  formato propio.
- **Prioridad:** P3.

---

## ~~Coordinación · "Tareas personales"~~ — HECHO el 2026-09-06 (v0.58.0, migraciones 0108/0109)

Se construyó completa: tabla, RLS, auditoría, cuatro RPC, capa de datos, reglas puras con 21 tests,
pantalla y modal. Plan y decisiones en `docs/plan-tareas.md`. **QA logueado hecho con dos cuentas**,
incluida la prueba de que gerencia NO ve las tareas ajenas.

Lo que sigue abierto de esta feature está abajo, en su propia entrada (la navegación).

<details><summary>La entrada original, para contexto</summary>

## Coordinación · "Tareas personales" (el submódulo Inicio › Tareas está vacío)

- **Qué:** la agenda de pendientes propios de quien coordina — dar de alta una tarea con título,
  duración estimada y vencimiento, verla vencida o por vencer, y marcarla hecha. Es el sujeto real
  del handoff `design_handoff_resumen_tareas_enfoque` (sus cuatro variantes A/B/C/D exploran
  únicamente DÓNDE ponerla), y hoy no existe ni una línea de código.
- **Por qué:** `inicio/tareas` ya está declarado en `src/modules/registry.ts` con ícono y todo, pero
  no está en `VIEW_REGISTRY`, así que cae al `Placeholder`. Es un renglón del menú que promete una
  pantalla que no existe. El handoff lo confirma como necesidad de producto, no como capricho de
  diseño: la coordinadora hoy lleva esos pendientes en papel o en la cabeza.
- **Pros:** la casa ya está reservada (submódulo declarado y ruteado). El patrón de datos es el más
  simple de la app — una tabla propia, sin desnormalizaciones ni vistas—, y el handoff ya trae
  cuatro layouts dibujados y descartados entre sí, así que la parte de diseño está medio hecha.
- **Contras:** es una feature entera, no un ajuste: tabla + migración + RLS + trigger de auditoría +
  capa de datos + vista + modal de alta. Y el handoff dibuja la CARD, no el MODELO: no dice quién ve
  la tarea de quién, si se comparte, si se asigna a otra persona, qué pasa al vencer, ni si entra al
  `audit_log`. Todo eso hay que decidirlo antes de escribir la migración.
- **Contexto:** surgió en la `/plan-eng-review` del 2026-09-01 (ver
  `docs/plan-resumen-coordinacion-enfoque.md`, decisión D1). Se difirió a propósito: el resto del
  handoff se pudo aplicar sin migraciones y ésta las necesita todas. **Ojo con la trampa conocida:**
  una postergación deliberada sin fecha de vencimiento es indistinguible de "no se hace" a los tres
  días — si el Director la quiere, conviene abrirle su `/office-hours` antes que su PR.
- **Empezar por:** `/office-hours` para fijar el modelo (visibilidad, asignación, ciclo de vida) →
  migración con RLS y auditoría → `src/data/tareas.ts` → vista en `src/views/` + alta en
  `src/views/registry.tsx` bajo `inicio/tareas`. El layout ya está: el handoff prefiere la variante
  compacta junto al título (D) o la columna completa a la derecha (B).
- **Depende de / bloqueado por:** una decisión de producto sobre el modelo. Nada técnico.
- **Prioridad:** P2.

</details>

---

## ~~Shell · Inicio no tiene barra de submódulos~~ — HECHO el 2026-09-06 (v0.59.0, PR #129)

**Resuelto por disolución, no por parche.** Tareas se mudó a Coordinación (`track/tareas`, último
del menú) y se retiraron `tareas` y `alertas` de los submódulos de Inicio. Con eso a Inicio le queda
UNA sola vista, así que su panel oculto dejó de ser un defecto y `AppShell.tsx:420` no se tocó.
Entró además el test de invariante *"todo submódulo de un módulo operativo tiene vista registrada"*,
que es lo que habría cazado este defecto y el de `inicio/tareas` sin que nadie mirara.

**Lo único que queda abierto de esto** es el costo asumido: gerencia y Farmacia no llegan a Tareas
por clic, porque no tienen el módulo Coordinación. El Director lo aceptó con un "por ahora"
explícito (2026-09-06). Vuelve el día que alguien de Farmacia pida tareas; las salidas serían el
panel en Inicio —lo que se descartó al ver el mock— o Tareas como módulo propio del riel.

Plan y decisiones: `docs/plan-resumen-tareas-en-el-mosaico.md`.

<details><summary>La entrada original, para contexto</summary>

## Shell · Inicio no tiene barra de submódulos: Tareas y Pendientes no se pueden abrir con el mouse

- **Qué:** `AppShell.tsx:420` dibuja el panel de submódulos con la condición
  `{moduleKey !== 'inicio' && !sinAcceso && (…)}`. **El módulo Inicio queda excluido a propósito**,
  así que sus tres submódulos —Resumen, **Tareas** y **Pendientes**— no tienen ningún renglón que
  clickear. A Resumen se llega porque es el destino por defecto al entrar; a los otros dos **sólo
  se llega escribiendo la URL**.
- **Cómo apareció:** el Director abrió el preview a buscar Tareas y no la encontró (2026-09-06).
  Es el error inverso del que esta misma jornada arregló: antes había un renglón que prometía una
  pantalla inexistente; ahora hay una pantalla sin renglón.
- **Por qué se me pasó, y vale anotarlo:** la vista se registró, se verificó que renderiza y se le
  hizo el QA completo con dos cuentas — **navegando siempre por URL**. Nunca se comprobó que se
  pudiera *llegar* haciendo clic. **Registrar una vista no es hacerla alcanzable**, y son dos
  comprobaciones distintas.
- **Opciones** (decisión de producto, no técnica):
  1. **Dibujar el panel también en Inicio.** Es quitar una condición. Consecuencia: Inicio pierde
     los 220 px de ancho completo que hoy usa su Resumen, que está diseñado como tablero.
  2. **Tarjetas en el Resumen de Inicio.** Encaja con lo que ese Resumen ya hace (tiene tarjetas de
     módulo con "Entrar a Coordinación") y no toca el ancho. Deja la URL como único acceso directo.
  3. **Mover Tareas al riel** como su propio módulo. El más caro y el que más cambia el modelo
     mental del shell.
- **Contexto:** el Director prefirió **dejar Tareas funcional como está** y resolver el "cómo va a
  quedar" en una sesión aparte (2026-09-06), junto con el rediseño del Resumen contra el handoff
  `design_handoff_resumen_tareas_enfoque`. **Las dos cosas son el mismo problema**: dónde vive
  Tareas en la navegación y cómo se ve en el Resumen.
- **✅ DECIDIDO (2026-09-06): ninguna de las tres. Tareas se MUDA a Coordinación.** La review había
  elegido la opción 1 (dibujar el panel en Inicio); el Director la descartó **al ver el mock**:
  *"esto no va en el Inicio, el Inicio sigue como está ahora, eso pasaría a ir en Coordinación por
  ahora"*. Tareas pasa a ser submódulo de `track` —precedente: `protocolos`, compartida por track y
  pharma— y se retiran `tareas` y `alertas` de los submódulos de Inicio.
  **Con eso el problema se disuelve en vez de arreglarse:** a Inicio le queda UNA sola vista, así
  que su panel oculto deja de ser un defecto y `AppShell.tsx:420` no se toca.
  Plan e implementación: `docs/plan-resumen-tareas-en-el-mosaico.md`, tarea **T6**.
  Mock: `docs/mock-resumen-tareas-en-el-mosaico.html`.
  **Esta entrada se cierra cuando ese PR mergee, no antes.**
- **Lo que el cambio deja abierto, y hay que anotarlo:** gerencia y Farmacia **pierden el acceso por
  clic** a Tareas, porque no tienen el módulo Coordinación. El Director lo asumió con un "por ahora"
  explícito. Vuelve el día que alguien de Farmacia pida tareas; las salidas serían el panel en
  Inicio (lo que se acaba de descartar) o Tareas como módulo propio del riel.
- **⚠️ CORRECCIÓN:** esta entrada decía que `/inicio/alertas` funciona escrita a mano. **No
  funciona.** `inicio/alertas` está en `modules/registry.ts:66` pero **no** en `REGISTERED_VIEWS`
  (`views/registryKeys.ts:14`), así que `resolveView` cae al `Placeholder` (`registry.tsx:44`).
  Hoy no se nota porque el panel está oculto; al dibujarlo aparecería un renglón "Pendientes" que
  lleva a "En construcción" — el defecto inverso al que esta entrada viene a arreglar. Por eso T6
  también lo **saca** del menú de Inicio (Pendientes ya vive completo en Coordinación) y agrega el
  test de invariante *"todo submódulo de un módulo no-`proximamente` tiene vista registrada"*, que
  es lo que habría cazado esto y lo de `inicio/tareas` sin que nadie mirara.
- **Mientras tanto:** `/inicio/tareas` funciona escrita a mano. `/inicio/alertas` NO.
- **Prioridad:** P1 — hay una feature entera en producción que nadie puede encontrar.

---

</details>

## Coordinación · KPI "Visitas asignadas a mí" (el coordinador YA está en la vista — ver la corrección adentro)

- **Qué:** reemplazar o acompañar el KPI "Próximas visitas" del Resumen de Coordinación con uno que
  cuente sólo las visitas de las que esa persona es coordinadora.
- **Por qué:** el handoff lo pide explícitamente y es la diferencia entre "cómo viene el centro" y
  "cómo viene mi día", que es lo que el submódulo promete en el menú ("Cómo viene el día"). Con 23
  pacientes en 6 protocolos, el número global ya empieza a no decirle nada a nadie en particular.
- **Pros:** el dato EXISTE: `patient_visits` tiene `coordinator_id` y `coordinator_name` desde la
  migración 0065, y el RPC `set_visit_coordinator` ya los escribe. Es exponerlo, no inventarlo.
- **⚠️ CORRECCIÓN (2026-09-06, `/plan-eng-review`).** Esta entrada decía que `v_track_visits` no los
  proyecta y que hacía falta una migración. **Es falso, y era el mismo error dos veces.**
  `0102_sello_de_atencion.sql:168` los proyecta (`v.coordinator_id, v.coordinator_name, -- 0065`) y
  `src/data/visits.ts:51` ya los declara, con un comentario que dice textualmente que "esa ausencia
  hizo creer que la vista no los tenía". **No hace falta ningún SQL.**
- **Contras (los de verdad):** el campo casi nunca está poblado **en visitas futuras**, que es
  justo lo que este KPI mira. Se escribe cuando alguien ATIENDE la visita (`start_visit_attention`,
  0102, retrospectivo) o a mano desde el encabezado (`VisitHeader.tsx:357`, opcional y hoy sin uso
  real). El propio código lo dice: `TrackResumenView.tsx:578` — "son futuras, así que ninguna tiene
  coordinador todavía". Un KPI en cero permanente se lee como app rota, no como "no tenés nada".
- **Contexto:** quedó fuera del alcance de la `/plan-eng-review` del 2026-09-01
  (`docs/plan-resumen-coordinacion-enfoque.md`). La del 2026-09-06
  (`docs/plan-resumen-tareas-en-el-mosaico.md`, hallazgo 1) resolvió mostrar el dato como
  **subtítulo** del KPI "Próximas visitas", visible sólo cuando hay alguna asignada.
- **DISPARADOR:** el día que el equipo empiece a asignar coordinador **por adelantado**. Ahí el
  subtítulo deja de alcanzar y la tarjeta propia del handoff pasa a tener sentido.
- **Empezar por:** mirar cuántas visitas futuras tienen `coordinator_id` no nulo. Si son pocas, el
  problema no es el KPI: es que el flujo de asignación no se usa.
- **Depende de / bloqueado por:** nada técnico. Depende del uso.
- **Prioridad:** P3.

## Farmacia · El umbral de stock bajo es configurable en la base y el front lo ignora

- **Qué:** que "Bajo" y "Agotado" en Stock salgan de `v_medication_stock` (`is_low_stock`,
  `low_stock_threshold`) en vez del `≤ 5` escrito a mano en `stock/agrupacion.ts` (`STOCK_BAJO`).
- **Por qué:** el umbral correcto depende del medicamento — cinco unidades de un inhalador que se
  dispensa de a uno no es lo mismo que cinco de algo que se entrega por caja. Hoy la farmacéutica
  puede configurar ese número y el front no lo mira, así que el campo es decorativo.
- **Pros:** el dato EXISTE desde la migración **0032** y ya está expuesto en `useStock()`
  (`src/data/pharma/stock.ts`), usado por `PatientMedicationsCard`. No hace falta migración.
- **Contras:** `v_medication_stock` incluye los medicamentos ASIGNADOS a un protocolo con stock
  **cero**, que hoy la pantalla no lista (lee `v_medication_lots_detail`, que sólo tiene lotes). O
  sea que cablearla cambia **qué filas se muestran**, no sólo cómo se rotulan — y eso es una
  decisión de producto ("¿Stock muestra lo que hay o lo que debería haber?"), no un detalle de
  implementación. Además suma una segunda consulta con su propio estado de carga.
- **Contexto:** quedó fuera del alcance de la `/plan-eng-review` del 2026-09-01
  (`docs/plan-stock-agrupacion-por-medicamento.md`, decisión **D8**). El mock del handoff marcaba
  "Bajo" en un lote de **6** unidades, que con el `≤ 5` de hoy no se marca: es justamente el síntoma
  de que el umbral debería venir de la base.
- **Empezar por:** decidir con el Director si Stock debe listar medicamentos sin lotes. Si sí, el
  cambio es agregar `useStock(null)` en `MedicamentosView` y cruzar por `medication_id` en
  `construirGrupos`; si no, alcanza con leer el umbral y seguir listando sólo lo que tiene lotes.
- **Prioridad:** P2.

## Coordinación · El scopeo de la RLS nunca se probó con una cuenta acotada

- **Qué:** entrar con una cuenta que tenga **sólo** el módulo `track` y confirmar que el Resumen,
  Alertas y sus filtros muestran lo de SUS protocolos — ni de más, ni de menos.
- **Por qué:** la policy `"ver solicitudes"` (`0006_rls_policies.sql:251`) tiene tres caminos —
  `has_module('gerencia')`, `has_module('pharma')` y `coordina_visita(visit_id)`. **La cuenta de QA
  tiene los cinco módulos**, así que siempre entra por el segundo y ve el centro entero: el tercer
  camino, el único que usa una coordinadora real, **nunca se ejecutó**.
- **Qué se rompería sin ruido:** `TrackResumenView` trae las dispensaciones sin gate de rol, y con
  cero filas pinta *"Sin dispensaciones pendientes."* **La RLS filtra en silencio: no tira error,
  devuelve cero filas.** Si `coordina_visita()` quedara más angosto de lo que debe, esa frase sería
  falsa para esa persona, sin ningún síntoma, en la pantalla que contesta "cómo viene el día". Lo
  mismo, más callado, en las opciones de los filtros de Alertas: se arman con las filas visibles.
- **Contras / por qué se difirió:** montar una cuenta de laboratorio prueba la policy, no el uso.
  El Director decidió (2026-09-01) esperar a la coordinadora real, que además va a ejercitar los
  protocolos que de verdad coordina en vez de un caso armado.
- **DISPARADOR (esto no es "algún día"):** apenas exista **la primera cuenta de coordinación real**
  — o antes, si se toca `coordina_visita()`, la policy `"ver solicitudes"`, o se agrega una tarjeta
  al Resumen que lea datos de otro módulo. Cualquiera de esas tres cosas lo vuelve urgente.
- **DISPARADOR 2 — el lado de FARMACIA (agregado 2026-09-08, CORREGIDO el mismo día).**
  ⚠️ La primera redacción de este disparador decía que `registrar_vnp` (0114) y
  `dispensar_ambulatoria` (0116) habían pasado el QA "entrando por gerencia", dejando su rama
  `has_min_role('pharma','operator')` sin ejecutar. **Eso es falso, verificado contra el `.sql`:**
  en la 0116 (línea 192) ese chequeo es **el único que hay** —no existe bypass por gerencia— y en
  la 0114 (línea 74) es **la primera condición del `or`**, que en plpgsql corta apenas encuentra un
  true. La cuenta de QA tiene `pharma` operator+, así que en las dos **esa rama sí se ejecutó**.
  Es la misma clase de error que este archivo ya cometió cinco veces: afirmar sobre permisos sin
  leer la función.
  **Lo que SÍ queda sin probar, y es más chico:** (a) que una cuenta **sin** `pharma` sea
  correctamente RECHAZADA —el caso negativo, que la cuenta de QA no puede producir—, y (b) las
  tres ramas de respaldo de `registrar_vnp` (gerencia, track admin, track operator asignado), que
  el `or` nunca llega a evaluar. Ninguna de las dos es un camino inalcanzable como el de
  `coordina_visita()`: son casos que faltan, no ramas muertas.
  Sigue el texto original del disparador de Coordinación, que **sí** describe una rama inalcanzable:
  apenas se
  agregue una RPC o una policy con authz propia de `pharma`, hay que probarla con una cuenta que
  tenga **solo** el módulo `pharma`. El primer caso es `registrar_vnp`
  (`docs/superpowers/plans/2026-09-08-dispensacion-libre-vnp.md`), cuya rama
  `has_min_role('pharma','operator')` **la cuenta de QA nunca ejecuta**: con los cinco módulos
  entra siempre por `has_module('gerencia')`, así que el botón anda perfecto en el QA y puede
  tirar 42501 en el mostrador real, con el paciente esperando. Es el patrón idéntico al de
  `coordina_visita()` descrito arriba, y este PR no dispara la entrada tal como estaba redactada
  —no toca `coordina_visita()` ni la policy "ver solicitudes"— aunque abre la misma clase de
  agujero. Por eso el disparador aparte.
- **Empezar por:** crear el usuario en el dashboard (Auth → Users, **Auto Confirm**; no hay
  auto-registro) y darle UN solo módulo:
  `insert into user_module_roles (user_id, module, role) values ('<uuid>', 'track', 'member');`
  Después: Inicio, Coordinación › Resumen y Coordinación › Alertas, comparando los números contra
  los que ve la cuenta de QA. **Si son iguales, algo está mal** — tienen que ser distintos.
- **Prioridad:** P2.

---

## Resumen · las otras cuatro tarjetas del mosaico siguen dentro de `TrackResumenView.tsx`

- **Qué:** mover `ReportesCard`, `AlertasCard`, `DispensacionesCard` y `ProximasVisitasCard` a
  archivos propios en `src/views/resumen/`, como ya nace `TareasCard.tsx`.
- **Por qué:** el PR del 2026-09-06 deja el archivo con **cuatro tarjetas adentro y una afuera**.
  La mezcla es deliberada, pero sin esta nota es indistinguible de un descuido, y el próximo que
  agregue una tarjeta va a tener que adivinar cuál de los dos criterios seguir.
- **Pros:** el archivo de la vista baja de ~1250 a ~350 líneas y pasa a ser lo que dice ser (la
  orquestación, no los componentes). Cada tarjeta gana su comentario de cabecera y su historia de
  git propia, que hoy están todas mezcladas en un solo blame.
- **Contras:** ~700 líneas de puro movimiento. Sobre un working copy **compartido** con el Director,
  un diff así es conflicto casi garantizado si él toca el Resumen en paralelo. Y un diff de
  movimiento esconde cualquier cambio real que se cuele adentro.
- **Contexto:** salió del hallazgo 6 de la `/plan-eng-review` del 2026-09-06
  (`docs/plan-resumen-tareas-en-el-mosaico.md`). Se eligió 6A —sólo la tarjeta nueva sale— para no
  inflar el diff del PR que había que revisar contra el handoff.
- **Empezar por:** `ProximasVisitasCard`, que es la más autocontenida (no comparte helpers locales
  salvo `card`, `cardTitle`, `filaAncha` y `MAX_FILAS`, que hay que subir a un módulo compartido
  primero). Después las otras tres.
- **Depende de / bloqueado por:** una ventana **sin trabajo paralelo** sobre el Resumen. Confirmarlo
  con el Director antes de empezar, no después.
- **Prioridad:** P3.

---

## Coordinación · `useMyTasks` trae el histórico completo (y el atajo obvio está mal)

- **Qué:** acotar la consulta de tareas cuando el volumen lo justifique — por ejemplo, las abiertas
  más las cerradas de los últimos N días.
- **Por qué:** `useMyTasks` (`src/data/tareas.ts:81`) hace `select('*, task_assignees(*)')` sin
  filtro: trae todas mis tareas de siempre, hechas incluidas. Desde el 2026-09-06 la disparan **dos**
  pantallas (`Inicio › Tareas` y la tarjeta del Resumen de Coordinación), y la tarjeta usa tres
  filas. Crece para siempre y nunca se achica.
- **⚠️ LA TRAMPA, que es lo caro de esta entrada:** el filtro obvio —`completed_at is null` en el
  servidor— **ESTÁ MAL**. En modo `cada_uno` la tarea cierra cuando cierran TODOS sus asignados, y
  ese hecho vive en `task_assignees.completed_at`, no en la columna de la tarea (ver `estaHecha` en
  `src/views/tareas/estados.ts`). Con ese filtro, una tarea grupal terminada por todo el mundo
  seguiría apareciendo como pendiente. Y un `.limit(3)` tampoco sirve: el orden es por `due_date` y
  las hechas vienen intercaladas, así que las tres primeras pueden ser tres tareas ya cerradas.
  **Es el patrón de "filtrá por la columna del HECHO, no por el estado derivado".**
- **Pros:** la carga deja de depender del histórico; el Resumen —que ya dispara ocho consultas— abre
  más liviano.
- **Contras:** cualquier acotación tiene que respetar los dos modos de cierre, o duplica la lógica de
  `estaHecha` en SQL y crea una segunda definición de "pendiente" desincronizada desde el día uno.
  La salida sana probablemente sea una **vista** que exponga el "hecha" ya resuelto, no un filtro
  suelto en el `select`.
- **Contexto:** hallazgo 11 de la `/plan-eng-review` del 2026-09-06. Se eligió 11A —reusar el hook y
  filtrar en el cliente con `estaHecha`— porque con el volumen actual el costo es despreciable y el
  riesgo de corrección del atajo es alto.
- **Empezar por:** medir el volumen real (`select count(*) from tasks`) antes de tocar nada. Si son
  cientos, evaluar una vista con el "hecha" resuelto en el servidor.
- **Depende de / bloqueado por:** ver el volumen después de unos meses de uso real.
- **Prioridad:** P3.

---

## Resumen · la tarjeta "Pacientes" del handoff (y por qué no se portó tal cual)

- **Qué:** la quinta tarjeta que dibujan las variantes A, C y D de
  `design_handoff_resumen_tareas_enfoque`: "Pacientes · 12 vistos hoy", con avatares y un pie
  "Buscar paciente".
- **Por qué:** es la única pieza del bundle que queda sin portar. Sin esta nota, dentro de tres meses
  alguien la ve en el mock y rehace el mismo análisis desde cero.
- **Pros:** el dato de arriba **existe**: "N visitas hoy" sale de `useVisitsForDay`, la misma consulta
  que ya usa `InicioResumenView`. La razón por la que se difirió el 2026-09-01 —"métrica inventada,
  sin consulta que la sostenga"— **ya no aplica**.
- **⚠️ EL CONFLICTO, que es el dato que no está en el handoff:** el mock la resuelve con **avatares de
  INICIALES** (`MA`, `RB`, `CD`, "y 9 más" — `source/Resumen - Tareas enfoque (variantes).html:213`).
  Eso es exactamente el `PrivacyAvatar` que el Director mandó **eliminar el 2026-08-04**, cuando
  decidió que el nombre completo del paciente se muestra en toda la app y el IVRS queda como
  identificador secundario. Portarla tal cual reintroduce un patrón retirado por decisión explícita;
  portarla bien exige rediseñarla con nombres — o sea apartarse del mock justo en la tarjeta que se
  agrega para parecerse a él.
- **Contras:** además del conflicto, el mosaico se acaba de rebalancear a 3 y 2 (2026-09-06); una
  sexta tarjeta lo vuelve a desbalancear y hay que decidir dónde va.
- **Contexto:** quedó fuera del alcance en D1=B de la `/plan-eng-review` del 2026-09-06
  (`docs/plan-resumen-tareas-en-el-mosaico.md`).
- **Empezar por:** decidir con el Director **cómo se muestran esos pacientes sin volver a las
  iniciales** — nombres cortos en fila, o directamente otra forma de tarjeta. Recién después, código.
- **Depende de / bloqueado por:** esa decisión de diseño.
- **Prioridad:** P3.

---

## Testing · render tests para lo que hoy sólo verifica el ojo

- **Qué:** sumar `@testing-library/react` a la suite para poder testear componentes, no sólo reglas
  puras.
- **Por qué:** hay 41 archivos de test y 717 tests, todos sobre reglas puras — **cero render tests**.
  Los 15 ítems del checklist de §12 del handoff de notificaciones (el punto oculto en cero, la
  columna de acción siempre reservada, el guion cuando no hay fecha, el truncado con `title`, el
  popover que voltea, `Descartar` deshabilitado sin motivo) son 100% ojo humano. Ninguno lo agarra
  `npm run build`.
- **Pros:** el gate dejaría de depender de que alguien mire; las regresiones de UI que este repo ya
  sufrió —el borde que desaparece al salir del hover, el badge que se corre, la fila corrida 40 px—
  se agarrarían en CI en vez de en producción.
- **Contras:** es infraestructura de test nueva, no es gratis, y **CLAUDE.md fija a propósito el
  criterio contrario**: se testea lo que falla EN SILENCIO, y lo que falla de manera visible se
  verifica mirando. Este TODO propone **revisar** ese criterio, no saltearlo por la ventana.
- **Contexto:** surgió en la `/plan-eng-review` del handoff de notificaciones (2026-09-06,
  `docs/plan-campana-notificaciones.md`). El disparador fue que la reescritura de la campana
  introduce doce comportamientos visuales y ninguno es testeable hoy: la cobertura del plan es 22
  reglas puras y 15 verificaciones a ojo.
- **Empezar por:** decidir con el Director si el criterio de CLAUDE.md se revisa. Si sí,
  `vite.config.ts` (entorno jsdom) → un primer test sobre `NotificationsMenu`, que es la vista con
  más comportamiento visual por línea.
- **Depende de / bloqueado por:** esa decisión, porque el TODO contradice de frente una regla escrita.
- **Prioridad:** P3.

---

## Diseño · los bundles de handoff llegan con la paleta vieja

- **Qué:** pedirle a diseño que regenere `spira-app-tokens.css` desde el `src/styles/tokens.css` del
  repo, y que feche los bundles.
- **Por qué:** el bundle de notificaciones (05/09/2026) trae tres tokens **anteriores a la
  recalibración de la rampa de grises** (PR #95):

  | Token | En el bundle | En el repo |
  |---|---|---|
  | `--spira-muted` | `#7C8C87` | `#61706C` |
  | `--spira-faint` | `#A6B0AC` | `#838C89` |
  | `--spira-ink-soft` | `#556966` | `#465A57` |

  No es cosmético: sobre esos valores, la afirmación de accesibilidad de §9 del propio handoff es
  falsa (su `muted` da 3,52:1, no 4,5:1). El README §11 del bundle sí tiene los valores buenos, así
  que **el bundle se contradice a sí mismo**, y quien implemente "desde el CSS" en vez de "desde la
  tabla" se lleva los viejos. Y **no es la primera vez**: ya hubo un handoff con paleta vieja en
  este repo. Es un costo recurrente, no un incidente.
- **Pros:** el próximo bundle llega con los tokens vivos, y la medición de contraste que hace diseño
  vale contra la app real en vez de contra una paleta que ya no existe.
- **Contras:** es coordinación, no código; depende de que el generador de bundles lea el `tokens.css`
  del repo, cosa que no se controla desde acá.
- **Contexto:** surgió en la `/plan-eng-review` del handoff de notificaciones (2026-09-06), diffeando
  los 40 tokens del bundle contra los 54 del repo.
- **Empezar por:** mandarle a diseño el diff de los tres tokens de arriba. **Cómo se detecta en el
  futuro:** diffear el `:root` del bundle contra `src/styles/tokens.css` **antes** de leer nada más
  — es lo primero que hay que hacer con un bundle nuevo.
- **Depende de / bloqueado por:** nada del lado del repo.
- **Prioridad:** P3.

---

## Equipo y accesos · la baja no limpia `protocol_coordinators`

- **Qué:** `dar_de_baja` (`supabase/migrations/0098_baja_y_actividad_de_cuentas.sql:127`) borra
  las filas de `user_module_roles` y pone `is_active = false`, pero **deja intactas** las
  asignaciones de `protocol_coordinators`. Una persona dada de baja conserva sus protocolos.
- **Por qué:** hoy es **inerte** y no hay fuga: sin ninguna fila en `user_module_roles`, todas
  las policies que gatean por `has_min_role('track', …)` la rechazan, así que la asignación no
  le habilita nada. El problema es de lectura, no de seguridad — y aparece recién con E4: la
  ficha de una cuenta dada de baja va a mostrar "3 protocolos" asignados y nadie va a poder
  distinguir si eso es un acceso vivo o basura de la baja.
- **Pros:** la baja pasa a significar una sola cosa ("no entra y no ve nada") en vez de dos con
  una excepción; la pantalla nueva deja de mostrar un acceso que en la práctica no existe.
- **Contras:** al reactivar una cuenta habría que reasignarle los protocolos a mano — hoy
  vuelven solos porque nunca se fueron. Y toca un RPC que ya está en producción: un
  `create or replace` con la firma cambiada dejaría una sobrecarga viva (ya pasó en este repo).
- **Contexto:** surgió en la `/plan-eng-review` del 2026-09-07 sobre el modal de Ajustes, al
  revisar qué escribe y qué no escribe cada operación de cuenta. Ver
  `docs/plan-ajustes-capas-protocolos-plataformas.md`, tanda 2.
- **Empezar por:** `0098_baja_y_actividad_de_cuentas.sql:127` (el cuerpo de `dar_de_baja`, donde
  ya hay un `delete from public.user_module_roles`) y el bloque de protocolos de `AccesoEditor`.
- **Depende de / bloqueado por:** que E4 (elegir protocolos por usuario) esté en producción —
  antes de eso el síntoma no se ve en ninguna pantalla.
- **Prioridad:** P3.

---

## Coordinación · alerta de protocolo activo sin coordinadora

- **Qué:** una clase nueva en Pendientes: protocolo con `status = 'activo'` y cero filas en
  `protocol_coordinators`.
- **Por qué:** sus pacientes desaparecen de Coordinación **sin ningún error** — gerencia y
  Farmacia los siguen viendo, así que ni siquiera parece un problema de datos. El síntoma llega
  semanas después como "falta un paciente", que es carísimo de diagnosticar. El aviso que trae
  E4 cubre sólo el camino de la pantalla ("con esto, PROT-01 se queda sin coordinadora"); la
  baja de una cuenta y el SQL a mano lo esquivan.
- **Pros:** el único agujero que la RLS no puede señalar sola pasa a tener un vigilante
  permanente, en la pantalla donde ya se mira lo que hay que resolver.
- **Contras:** es una feature, no un ajuste: vista nueva + clase de alerta + descarte. Y
  Pendientes ya junta cuatro clases (ventanas vencidas, reportes fuera de plazo, por
  reprogramar, tareas); una quinta necesita que el orden de prioridad se piense de nuevo.
- **Contexto:** surgió en la `/plan-eng-review` del 2026-09-07, al decidir si bloquear o avisar
  cuando se le quita el último protocolo a alguien (se eligió avisar, para no impedir revocarle
  el acceso a quien se va). Ver `docs/plan-ajustes-capas-protocolos-plataformas.md`, decisión 8.
- **Empezar por:** `v_track_alerts` y el patrón de la `0107_alerta_por_reprogramar.sql`, que es
  la clase de alerta más parecida y la más reciente.
- **Depende de / bloqueado por:** nada. Se puede hacer antes o después de E4.
- **Prioridad:** P3.

---

## Equipo y accesos · un acceso inerte se muestra pero no se puede quitar

- **Qué:** la grilla de módulos de `AccesoEditor` filtra los `proximamente` (2026-09-07), así que si
  una persona tiene `lab` o `contable` en la base, la ficha lo **nombra** —en "Con esto ve…", con el
  aviso de que el módulo no está construido— pero **no ofrece ningún control para revocarlo**. La
  pantalla te dice que el acceso existe y no te deja resolverlo.
- **Por qué:** hoy no molesta y por eso es P3: el 2026-09-07 quedaron en **cero** (se revocaron las
  cuatro filas que había) y desde la UI ya no se puede crear otro. Pero el hueco sigue abierto para
  tres caminos: una carga por SQL a mano, un import, o —el más probable— que un módulo **ya
  asignado** se marque `proximamente` en el registro. En cualquiera de los tres, gerencia queda
  mirando un acceso que no puede tocar, y la salida vuelve a ser un script.
- **Pros:** cierra el círculo de la regla de `proximamente`: lo que la pantalla muestra, la pantalla
  lo resuelve. Y saca del medio la única operación de accesos que hoy exige salir de la app.
- **Contras:** la salida NO es volver a listar Lab y Contable en la grilla — eso es exactamente lo
  que el Director pidió sacar, y reintroducirlo por un caso que hoy no existe sería peor. Lo que
  corresponde es una acción puntual ("Quitar") en el renglón de `inertes` del bloque "Con esto ve…",
  que sólo se dibuja **cuando el acceso existe de verdad**. Es UI nueva en un bloque que hasta hoy
  era de solo lectura, y hay que decidir si entra al borrador (se guarda con el botón) o se aplica
  en el acto como las acciones de cuenta.
- **Contexto:** salió del QA logueado del 2026-09-07, al ver que los chips "Lab · Administrador" de
  la lista del equipo eran accesos reales. Se limpiaron con `set_module_access` desde el cliente de
  la app (no con el `.sql`, porque no hay acceso SQL a producción), y ahí quedó claro que la consola
  no tenía cómo hacerlo sola. Ver `docs/bitacora/2026-09-07.md` §3 y §10, y
  `supabase/_limpiar_accesos_inertes.sql`.
- **Empezar por:** `src/shell/settings/AccesoEditor.tsx` — `MODULOS_ASIGNABLES` (línea ~61, el filtro
  que crea el hueco) y el `descripcion.inertes.map(...)` del bloque "Con esto ve…", que es donde
  iría el control. La regla de las dos mitades está en `describeAccess`, en `src/lib/roles.ts`.
- **Depende de / bloqueado por:** nada. Pero conviene esperar a que aparezca el caso: mientras no
  haya un solo acceso inerte, esta pantalla no tiene nada que resolver.
- **Prioridad:** P3.

---

## Pharma · Reportes no ve los movimientos entre ámbitos

- **Qué:** desde la 0113 el stock se puede mover de un protocolo a otro (o a Ambulatoria) con
  `reassign_lot_stock`, pero los Reportes de Farmacia no lo muestran en ningún lado: siguen
  contando los ingresos **por recepción**. Si entraron 40 unidades al estudio A y después se
  movieron 10 al B, el reporte de A va a seguir diciendo 40 y el de B, cero.
- **Por qué:** no es un bug — el reporte responde *"qué entró"*, no *"dónde está"*, y las dos
  preguntas son legítimas. El problema es que ahora hay una tercera vía por la que el stock de un
  ámbito cambia sin que ninguna recepción lo explique, y quien concilie el papel con la pantalla no
  tiene dónde ver la diferencia.
- **Pros:** cierra la conciliación: entradas por recepción + entradas por reasignación − salidas por
  dispensación = lo que hay en el estante. Hoy esa cuenta no cierra y no hay forma de saber por qué.
- **Contras:** kits y unidades no se suman entre sí (regla de la 0083), y una reasignación tampoco
  es un ingreso: mezclarla en la columna de recepciones inflaría el total con stock que ya estaba en
  la casa. Tiene que ser una **fila o sección propia**, y eso es diseño, no una columna más.
- **Contexto:** salió de la `/plan-eng-review` de `docs/plan-reasignar-stock.md` (2026-09-07). Se
  dejó fuera del PR a propósito: el núcleo era poder mover el stock, y ampliar Reportes en el mismo
  diff mezclaba dos discusiones. Se verificó que el tipo nuevo **no rompe ni duplica** nada:
  `v_pharma_report_items` filtra `movement_type = 'dispensacion'` y `v_pharma_report_receptions` lee
  `reception_items`, así que ninguna de las dos ve los asientos de `reasignacion`.
- **Empezar por:** `supabase/migrations/0083_reportes_vistas.sql` — decidir si la vista nueva sale de
  `stock_movements` filtrando `movement_type = 'reasignacion'` (los dos asientos vienen emparejados
  por `reference_id`, así que una transferencia es un `group by` de dos filas). Después
  `src/views/pharma/reportes/agregados.ts` y `Tablas.tsx`.
- **Depende de / bloqueado por:** que aparezca el caso. Mientras nadie haya reasignado nada, la
  sección estaría siempre vacía.
- **Prioridad:** P3.

---

## Core · la huella de borrado de un paciente cuenta Coordinación y el guard que bloquea es de Farmacia

- **Qué:** que la confirmación de "Eliminar paciente" cuente también las solicitudes de
  dispensación de Farmacia, o que directamente avise que el borrado no va a proceder. Hoy promete
  un borrado que el servidor rechaza.
- **Por qué:** son dos preguntas distintas contestadas contra dos tablas de módulos distintos.
  La **huella** (`patientFootprint`, `src/data/patients.ts:196`) cuenta `track_dispensations` — la
  tabla de Coordinación de la 0023 (kit_code, dispensed_by). El **guard** que efectivamente
  bloquea (`delete_patient`, `0024_delete_patient.sql:30`) mira `dispensation_requests`, que es la
  de Farmacia. Un paciente puede tener 0 en la primera y N en la segunda, que es exactamente lo
  que pasa cuando dispensás desde el mostrador.
- **Cómo se ve:** el modal dice *"Se eliminarán 1 visita y **0 dispensaciones**, y todo el registro
  de la atención del paciente. Es permanente."*, el usuario reescribe el nombre completo para
  confirmar —una fricción deliberada, pensada para una acción irreversible— y recién ahí la base
  responde *"No se puede eliminar: el paciente tiene dispensaciones de farmacia registradas.
  Marcalo como Inactivo en lugar de borrarlo."*. El mensaje del servidor es correcto y sereno; el
  problema es que llega **después** de que la pantalla afirmó lo contrario y cobró el peaje.
- **Pros:** el usuario sabe antes de escribir el nombre que ese paciente no se borra, y por qué.
  Y el número deja de ser engañoso: "0 dispensaciones" en un paciente que tiene dispensaciones es
  falso a secas, en una app cuyo criterio es no mostrar nunca un dato inventado como real.
- **Contras:** la huella es un `count` scopeado por RLS de Track a propósito (el comentario de
  `patients.ts:189` lo dice). Sumarle Farmacia significa o un `count` más contra
  `dispensation_requests` —que Coordinación **no puede leer** para todos los protocolos— o un RPC
  que devuelva la huella completa server-side. La segunda es la buena y es la que cuesta.
- **Contexto:** encontrado el 2026-09-08 en el QA logueado de la dispensación libre
  (`docs/superpowers/plans/2026-09-08-dispensacion-libre-vnp.md`), al intentar borrar el paciente
  `TEST-*` que se había usado para probar el camino completo del mostrador. **No lo introdujo esa
  tanda**: el desajuste existe desde que conviven la 0023 y la 0024, y sólo se hace visible cuando
  un paciente junta una solicitud de Farmacia, que antes de la 0115 era más difícil de lograr.
  El guard de la 0024 está bien como está — los registros de medicación son regulados y no se
  cascadean; lo que hay que arreglar es lo que la pantalla promete antes.
- **Empezar por:** `src/data/patients.ts:181-198` (`PatientFootprint` / `patientFootprint`) y
  `src/views/EditPatientForm.tsx:257`. El guard a espejar está en
  `supabase/migrations/0024_delete_patient.sql:30-38`. Si se hace por RPC, conviene que devuelva
  también `puede_borrarse boolean`, así la pantalla decide con un solo dato en vez de recalcular
  la regla del servidor.
- **Depende de / bloqueado por:** nada. Es independiente de todo lo demás.
- **Prioridad:** P2 — no rompe datos ni pierde nada, pero le miente al usuario justo en el paso
  previo a una acción irreversible.

---

## Ajustes · mockear «Mi cuenta», «Preferencias» y «Plataformas»

- **Qué:** decidir si las otras tres secciones del modal de Ajustes se rediseñan con el mismo
  vocabulario que quedó en «Equipo y accesos» (línea en prosa, ⓘ con título y cuerpo, chips con
  ×, rótulos de sección en versalitas).
- **Por qué:** al aplicar el handoff de Equipo y accesos, **una** de las cuatro secciones del
  modal habla el idioma nuevo y las otras tres el viejo, a un click de distancia.
- **Pros:** el modal queda coherente; y el `InfoTip` y las primitivas nuevas ya estarían
  construidos, así que las tres secciones restantes serían aplicar, no inventar.
- **Contras:** es trabajo de **diseño**, no de ingeniería: hoy no hay mock de ninguna de las
  tres. Diseñarlas a ojo desde el código es exactamente lo que ya costó una reescritura.
- **Contexto:** es el pendiente que el propio handoff escribe en su §07, palabra por palabra:
  *"Definir si se mockean también «Mi cuenta», «Preferencias» y «Plataformas» con este nivel de
  detalle."* Estado de cada una hoy: **Preferencias** es la más limpia (tres controles vivos,
  ninguna maqueta, ver `PrefsSection.tsx`); **Mi cuenta** y **Plataformas** tienen más
  superficie. Se difirió a propósito en la `/plan-eng-review` del 2026-09-09 (decisión D1).
- **Empezar por:** abrir el modal con el idioma nuevo ya en producción y mirar el contraste
  entre secciones — esa es la evidencia que decide si vale la pena.
- **Depende de / bloqueado por:** que `docs/plan-ajustes-equipo-reskin.md` esté en prod, y que
  el Director produzca los mocks.
- **Prioridad:** P3.

---

## Capa de datos · los hooks de auditoría consultan aunque el id sea `null`

- **Qué:** que `useAccessAudit` y `useProtocolAccessAudit` **no viajen a Supabase** cuando el
  `userId` que reciben es `null`.
- **Por qué:** hoy no se saltean nada: filtran por un UUID centinela y mandan la consulta igual.

  ```ts
  // src/data/team.ts:86
  .eq('target_user_id', userId ?? '00000000-0000-0000-0000-000000000000')
  ```

  Cualquiera que monte uno de estos hooks "apagado" paga una consulta por montaje sin
  enterarse. Medido: si el popup de solo lectura de Equipo y accesos se montara **por fila**,
  serían 2 consultas × 23 personas = **46 viajes** al abrir Ajustes, para no mostrar nada.
- **Pros:** arreglo chico y bien delimitado que protege a cualquier consumidor futuro sin que
  tenga que conocer la trampa.
- **Contras:** hay que averiguar primero si `useSupabaseQuery` admite un "no consultes"
  (`enabled`) o si hay que agregárselo — eso decide si son 6 líneas o 30, y lo segundo alcanza
  a **toda** la capa de datos.
- **Contexto:** lo encontró la revisión de performance de la `/plan-eng-review` del 2026-09-09
  (`docs/plan-ajustes-equipo-reskin.md`, sección 4). Esa tanda **esquiva** el problema montando
  un único popup a nivel de sección, igual que ya hace con el editor; la causa sigue intacta y
  la esquiva es una convención que hay que recordar.
- **Empezar por:** `src/lib/useSupabaseQuery.ts` (ver si ya hay forma de no consultar) →
  `src/data/team.ts:79` y `src/data/protocolAccess.ts:66`.
- **Depende de / bloqueado por:** nada. Es independiente.
- **Prioridad:** P3 — no rompe nada hoy, sólo gasta.
