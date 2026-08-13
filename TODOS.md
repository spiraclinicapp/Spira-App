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
