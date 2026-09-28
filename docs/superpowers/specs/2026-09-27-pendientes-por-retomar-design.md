# Spira · Diseño — Pendientes por retomar y retest atado a una visita

- **Fecha:** 2026-09-27
- **Estado:** aprobado (brainstorming) — pendiente plan de implementación
- **Módulo:** Track (en la UI, **Coordinación**)
- **Antecedente directo:** `2026-09-23-visitas-retest-y-continuacion-design.md` (0144, `v0.90.0`). Este
  diseño **se monta sobre ése**: reusa la continuación, la lista efectiva y sus guardas, y cambia cómo se
  llega a ellas.

## Contexto

La 0144 dejó andando la continuación («Pasar pendientes a otro día») y el retest con procedimientos. En el
uso aparecen tres huecos:

1. **Nada te avisa al finalizar.** «Pasar pendientes a otro día» es un botón chico al pie del «Resumen de
   la visita». Se toca «Finalizar atención» con procedimientos sin tildar y no pasa nada: si esos
   procedimientos tienen reporte, la visita queda «realizada con pendientes» para siempre; si no tienen,
   se pierden en silencio. Hoy **un procedimiento sin hacer en una visita finalizada no está registrado
   como pendiente en ningún lado.**
2. **Pasar a otro día obliga a poner fecha en el momento.** En la práctica, al cierre de la visita no se
   sabe cuándo vuelve el paciente. Lo natural es dejarlo pendiente y retomarlo el día que se hace.
3. **El retest es suelto.** Se agenda solo desde la ficha, «¿Qué lleva?» ofrece todos los procedimientos
   del estudio y el retest no sabe qué visita repite.

Y desde **Visitas** (las de hoy) no hay manera de sumar una visita: «hoy voy a hacer tal visita / tal
retest» exige ir a la ficha de cada paciente.

## Decisiones (del brainstorming, Director, 2026-09-27)

1. **Al finalizar, lo que no se hizo queda pendiente SIN fecha.** No se crea ninguna visita. Se retoma el
   día que se hace, desde «Agendar visita → Continuar pendientes».
2. **«Pendiente para otro día» es una marca explícita**, no algo que se deduzca de «finalizada y sin
   tildar». La deducción no distingue «se hace otro día» de «no se hace», que es justo el agujero de hoy.
3. **Enfoque A: marca en la visita de origen** (de 3). Descartados:
   - **Continuación sin fecha** (crear la visita al finalizar, con `estimated_date` nula): mete una visita
     sin fecha en la ficha, la Agenda, el CSV, las estadísticas y todo lo que ordena o filtra por fecha;
     cada una tendría que saber tratarla. Y retomar una parte obliga a partirla.
   - **Deducirlo de «finalizada y sin tildar»**: ver decisión 2.
4. **Un solo flujo «Agendar visita» en dos lugares**: la ficha del paciente (con fecha elegible, para
   dejarlo agendado a futuro) y **Visitas** (botón nuevo «Agregar visita», fecha = el día que se mira).
5. **El retest cuelga siempre de una visita**, y solo ofrece los procedimientos **que se hicieron** en
   ella: si no se hizo, no es un retest, es un pendiente. El retest suelto deja de poder crearse.
6. **Lo que espera aparece en Pendientes** (alertas), como «Procedimientos por retomar». Es una
   postergación deliberada: si nada la muestra, se olvida.
7. **«Una visita del estudio» lista las próximas ya agendadas** para otro día (no las faltas ni las de
   ventana vencida), de todos los pacientes del estudio. Elegir una la trae a hoy.
8. Números que fijó el diseño y el Director confirmó al aprobarlo: el retest ofrece visitas atendidas de
   los **últimos 60 días**; en «Continuar pendientes» los procedimientos marcados vienen
   **preseleccionados** (ya se eligieron a propósito al marcarlos).
9. **Un procedimiento sin reporte se da por hecho cuando la visita se atendió**, salvo que se lo haya
   dejado para otro día (decidido al armar el plan, 2026-09-27). En la app solo se tildan los
   procedimientos que dejan reporte (el tilde vive en el panel «Reportes pendientes»); uno sin reporte no
   tiene casilla en ningún lado y queda «sin tildar» para siempre. Sin esta regla, el aviso al finalizar
   saldría en casi todas las visitas y el retest no podría repetir nada sin reporte (un ECG). Descartado:
   sumar una casilla para todos los procedimientos (obliga a tildar signos vitales en cada visita).
   - «Hecho» = tildado, **o** sin `report_definitions` en el estudio y con la visita atendida
     (`real_date`), estando en su lista efectiva.

## Modelo de datos

### Tabla nueva `visit_pending_procedures`

«Este procedimiento de esta visita queda para otro día». Sin fecha: la fecha la pone la continuación.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()`. La necesita `audit_row()` (se resuelve al planificar, ver 0111). |
| `visit_id` | uuid not null → `patient_visits` | `on delete cascade`: la marca es de la visita; si la visita se va, la marca con ella. |
| `procedure_id` | uuid not null → `procedures` | `on delete restrict`, como `visit_procedure_completions` (0064) y `visit_added_procedures` (0144). |
| `marked_by` | uuid not null default `auth.uid()` → `users` | |
| `marked_at` | timestamptz not null default `now()` | Da el «hace N días» de Pendientes. |

- `unique (visit_id, procedure_id)`. Constraints **nombradas** (el front puede tener que embeber por FK).
- RLS igual que `visit_added_procedures` tal como quedó en la 0144: `select` si se ve la visita (subselect
  sobre `patient_visits` con la RLS de quien consulta); **sin** `insert` / `delete` para `authenticated`.
  Escrituras solo por RPC, que autorizan con `puede_registrar_visitas(protocolo)`.
- Trigger `audit_row`.
- No hay `update`: una marca se pone o se quita.

### `v_visit_procedures`: resta también lo marcado

La lista efectiva pasa a ser:

```
  lo del cronograma          (protocol_activities por visit_def_id)
− lo diferido desde esta visita
− lo marcado para otro día en esta visita      ← nuevo
+ lo agregado a esta visita
```

- Con eso **la visita cierra** aunque el reporte del procedimiento marcado siga en `pendiente`: las
  vistas recableadas en la 0144 (`v_patient_visits`, `v_procedure_report_alerts`,
  `v_protocol_report_status`) salen de `v_visit_procedures` y lo heredan sin tocarlas.
- **Mismas columnas**: `create or replace` sin `cascade`, repitiendo `with (security_invoker = true)` y con
  la sonda de `reloptions` al final (gotcha de la 0137). Si `create or replace` falla por columnas, se
  corta y se revisa.
- La resta es **solo** de lo marcado que no fue retomado: al retomar, la marca se borra y pasa a restar la
  fila diferida (0144). Nunca restan las dos a la vez, pero si lo hicieran el resultado sería el mismo.

### Columna nueva `patient_visits.retest_of_visit_id`

- `uuid null`, FK nombrada a `patient_visits(id)` **`on delete set null`**, por la misma razón que
  `vap_origen_fk` (0144): los borrados del sistema (`delete_patient`, `close_enrollment`,
  `delete_visit_definition`, `sync_protocol_schedule`) no se traban. La **app** no puede borrar una
  visita que tiene retests: lo ataja `guard_borrar_visita` (ver Guardas).
- `check (retest_of_visit_id is null or kind = 'retest')`.
- Un dato, una casilla: el origen del retest es de la visita, no de cada procedimiento. (La continuación,
  en cambio, deriva su origen de las filas de `visit_added_procedures`, como en la 0144.)
- **Los retests existentes quedan con origen nulo** y se siguen llamando «Retest». No se inventa un
  origen para ellos.

### RPCs (atómicas, `security definer`, authz en el servidor)

- **`dejar_pendientes(p_visit uuid, p_procedure_ids uuid[])`**
  - Marca. Solo acepta procedimientos que la visita **debe** (están en su lista efectiva) y **no están
    tildados**. Cualquier otro se rechaza con un mensaje sereno.
  - Idempotente sobre lo ya marcado (`on conflict do nothing`).
  - Autoriza con `puede_registrar_visitas(protocolo)`, como las RPC de la 0144.
- **`quitar_pendiente(p_visit uuid, p_procedure_id uuid)`**
  - Borra la marca: «al final se hizo hoy». El procedimiento vuelve a la lista efectiva y se puede tildar.
- **`continuar_pendientes(p_visita_origen uuid, p_procedure_ids uuid[], p_fecha date)`**
  - Crea la continuación con el mecanismo de la 0144 (visita `vnp`, `estimated_date = p_fecha`, filas en
    `visit_added_procedures` con `deferred_from_visit_id = p_visita_origen`) y **borra esas marcas**, en
    una sola transacción.
  - Solo acepta procedimientos **marcados** en el origen. Se puede retomar **una parte**: lo que no se
    elige sigue marcado.
  - Devuelve el id de la continuación.
  - Por dentro reusa la lógica de `diferir_procedimientos`. Cuidado con su validación: `diferir` exige que
    el procedimiento esté en la lista efectiva del origen, y lo marcado **ya no está** (la vista lo
    resta). O se factoriza la inserción en una función interna que ambas llamen, o `continuar` hace su
    propia validación («está marcado») y su propio insert. Lo decide el plan; **no** se llama a `diferir`
    tal cual.
- **`register_visit_event`** (0144) gana `p_retest_of uuid default null`:
  - Cambia la firma: **dropear la versión vieja** explícitamente, o queda una sobrecarga viva (gotcha
    `create or replace` con firma nueva). Revisar que `registrar_vnp` (Farmacia) no se rompa.
  - Si viene, valida: `kind = 'retest'`; el origen es **de la misma inscripción**; el origen está
    **atendido** (`real_date` no nula); y cada procedimiento del retest está **hecho en el origen**
    (decisión 9: tildado en `visit_procedure_completions`, o en la lista efectiva del origen y sin
    `report_definitions` en el estudio). Cualquier falla, mensaje sereno.
  - Si no viene, se acepta como hoy (compatibilidad con el front desplegado). La regla «el retest cuelga
    de una visita» la pone el front nuevo, que siempre lo manda.

### Guardas

- **No tildar lo marcado.** `guard_tildar_diferido` (0144) se extiende: rechaza también tildar un
  procedimiento marcado en esa visita, con «Quedó para otro día. Quitá la marca si se hace hoy.».
  Mismas reglas del trigger-guarda: sin `security definer` y cortando antes de cualquier `for share`
  (las preguntas las hace una función definer, como `procedimiento_diferido`).
- **No borrar una visita con retests.** `guard_borrar_visita` (0144) suma el caso: la app no borra una
  visita de la que cuelga un retest («Esta visita tiene un retest. Borralo primero.»). `postgres` sigue
  pasando primero, como ahora.
- **Editar un retest o una VNP no borra lo marcado.** `set_added_procedures` (0144) reemplaza lo agregado
  a mano con la lista que manda la pantalla, y la pantalla lee la lista efectiva, que ya no trae lo
  marcado: sin cuidado, guardar la edición borraría la fila del procedimiento marcado y dejaría la marca
  colgando de algo que la visita ya no lleva. Se recrea conservando lo marcado, igual que ya conserva lo
  diferido.
- **Deshacer devuelve la marca** (decidido al ejecutar la PR A, 2026-09-27). Si se borra una fila diferida
  de `visit_added_procedures` —se deshace o se borra la continuación, o se le quita el procedimiento con
  «Editar procedimientos»—, el procedimiento vuelve a su visita de origen **marcado para otro día**, no
  como algo que debe: «deshacer» significa que no se retomó, no que se olvidó. Así la visita de origen
  sigue cerrada y el procedimiento reaparece en Pendientes. Vale también para las continuaciones de la
  v0.90.0. Lo hace un trigger `after delete` (definer, porque escribe una tabla sin escritura directa),
  que no marca si el origen ya no existe (borrados en cascada del sistema) ni si el procedimiento está
  tildado en el origen.
- **Borrar una visita con marcas**: el `cascade` se lleva las marcas. No hace falta guarda: la marca no
  representa trabajo hecho.

### Orden de despliegue

**Aditiva, va primero.** Tabla, columna nueva nula, RPCs nuevas, `register_visit_event` con un parámetro
más con default, y `v_visit_procedures` con las mismas columnas. El front viejo no escribe marcas ni
manda origen de retest, así que no ve diferencia. El front nuevo no anda sin la migración.

Revisar en el plan que la versión nueva de `v_visit_procedures` no deje fuera de la lista nada que el
front viejo espere ver: sin marcas, la resta nueva es vacía.

**Numeración:** la siguiente libre al momento de pushear, mirando `origin/main`. No se fija en este doc.

## UI

**Mock en el repo antes del código** (regla del repo): el modal de finalizar, el paso «¿Qué vas a
hacer?» de «Agendar visita» y la lista de Pendientes. Copy según `PRODUCT.md` / `DESIGN.md`, avisos
cortos y sin tecnicismos; en la UI se dice **Coordinación**.

### 1. Al finalizar la atención

- Al tocar **«Finalizar atención»**, si la visita tiene procedimientos **con reporte** en su lista
  efectiva **sin tildar** (lo marcado ya no está en esa lista, así que no cuenta; los que no tienen
  reporte se dan por hechos, decisión 9), antes de avanzar aparece un modal. **Se tilda lo que SE HIZO,
  no lo que queda** (corrección del Director sobre el mock, 2026-09-27: «vos marcás los que sí hiciste y
  si le das a continuar avisa que estos van a quedar pendientes»):
  - **Paso 1 — «¿Qué se hizo?»** Título «Esta visita tiene procedimientos sin marcar». La lista como
    casillas, **sin preselección**: se tilda lo que se hizo. Tildar acá es lo mismo que tildarlo en la
    visita (`visit_procedure_completions`, arranca el plazo del reporte). Botón **«Continuar»**.
  - Si quedó todo tildado, «Continuar» tilda y finaliza directo.
  - **Paso 2 — el aviso**, sólo si quedó algo sin tildar: «Estos procedimientos van a quedar pendientes
    para otro día» con la lista, y **«Volver»** / **«Finalizar»**. «Finalizar» tilda lo elegido, llama a
    `dejar_pendientes` con el resto y después avanza.
  - **No hay «Finalizar sin pasarlos»**: lo que no se hizo queda pendiente. Si un procedimiento no se va
    a hacer nunca, eso es una desviación o un cambio del cronograma, no una salida de este modal.
  - Cerrar el modal (Esc, ✕) cancela: no se tilda, no se marca y no se finaliza.
- Sin pendientes, no aparece nada y se finaliza como hoy.
- Se intercepta en **los dos lugares** desde donde se finaliza: la fila de Visitas (`DayVisitsView` →
  `advance`) y el detalle (`VisitDetail`, que ya tiene su `ConfirmarAvance`). La regla «hay pendientes»
  es una función pura compartida, no una condición copiada en dos lados.
- Si un tilde o `dejar_pendientes` falla, **no se avanza**: se muestra el error y la visita queda en
  atención. Reintentar no vuelve a tildar lo que ya se tildó.

### 2. La visita de origen, con marcas

- En `VisitProcedures`, lo marcado se ve **en gris**, con **«Queda para otro día»**, no se puede tildar y
  tiene un botón chico **«Se hace hoy»** que llama a `quitar_pendiente`.
- El botón del Resumen **«Pasar pendientes a otro día»** pasa a ser **«Dejar para otro día»**: mismas
  casillas sin preselección, **sin fecha**, llama a `dejar_pendientes`. Sirve también antes de la visita
  («ya se sabe que va en dos días»).
- Lo que ya fue retomado se sigue viendo como hoy: el bloque «Pasaron a otra visita · N · fecha» con
  «Abrir la visita» y «Deshacer» (`DesdoblamientoVisita`).
- `PasarPendientesModal` deja de pedir fecha. La creación con fecha vive en «Continuar pendientes».

### 3. «Agendar visita»: un flujo, dos lugares

**Primer paso — ¿qué vas a hacer?**

| Opción | Cuándo aparece | Qué lista | Qué pasa al elegir |
|---|---|---|---|
| **Una visita del estudio** | Solo desde **Visitas** (la ficha ya tiene «Reprogramar») | Las **próximas ya agendadas** para otro día: `real_date` nula, sin ausencia, fecha posterior al día que se mira, ventana no vencida. Programadas y sueltas. «V4 · Juan Pérez · 2/10». | Se trae al día que se mira con `rescheduleVisit` (la de siempre, con su aviso si cae fuera de ventana). |
| **Continuar pendientes** | Siempre que haya visitas con marcas | Las visitas con marcas: «V3 · Juan Pérez · 12/9 · Hematología, ECG». | Se ven sus procedimientos marcados, **todos preseleccionados**; se destilda lo que no se hace. Llama a `continuar_pendientes`. |
| **Retest** | En cualquier etapa (como en la 0144) | Las visitas **atendidas** de los **últimos 60 días**, la más reciente primero. | Se ven solo los procedimientos **hechos** en esa visita (decisión 9: tildados, o sin reporte), sin preselección, al menos uno. Llama a `register_visit_event` con `p_retest_of`. |
| **VNP** | Como hoy | — | Procedimientos del estudio, opcionales (sin cambios). |
| Visitas libres del cuadro | Antes de randomizar, con cuadro (como hoy) | — | Sin cambios (`schedule_protocol_visit`). |

**Desde Visitas** (`DayVisitsView`): botón **«Agregar visita»** en la cabecera.
- La fecha es **el día que se está mirando**, fija.
- Primer campo: **estudio**, solo los que la persona puede registrar (`puede_registrar_visitas`).
- Las listas de cada opción traen **todos los pacientes** de ese estudio, con buscador (nombre como
  identidad primaria + IVRS en mono, regla de identidad; el IVRS es el de esa inscripción).
- VNP desde Visitas pide además el paciente.

**Desde la ficha** (`PatientFichaView`): el mismo componente, con paciente e inscripción ya fijos y la
fecha **editable** (para dejarlo agendado a futuro: «el jueves vuelve a completar»).

`RegisterVisitFlow` hoy es un selector único de tipo. El plan decide si se extiende o si se arma un
componente nuevo que lo envuelva; lo que **no** se hace es tener dos flujos que diverjan.

### 4. Pendientes: «Procedimientos por retomar»

- Lista nueva en `TrackAlertsView`, al lado de «IP sin entregar» y «Reportes pendientes».
- Una fila por **visita** con marcas: paciente, estudio, «V3 · 12/9», los procedimientos y **«espera hace
  N días»** (desde la marca más vieja).
- **No se puede descartar**: solo sale cuando las marcas se retoman o se quitan. Botón con nombre
  **«Agendar»**, que abre el flujo con el paciente fijo y «Continuar pendientes» elegido sobre esa visita.
- Tono **neutro**, sin umbral de vencimiento por ahora (lo que no se puede descartar no se olvida).
- Respeta el alcance habitual de Pendientes (por protocolo / coordinación) y la RLS de la tabla.
- **No lista inscripciones cerradas** (`inscripcionCerrada`): con el paciente fuera del estudio no hay
  nada que retomar, y como la fila no se puede descartar quedaría para siempre. Mismo criterio que las
  ventanas vencidas de inscripciones cerradas, que salen de la lista activa.

### 5. Títulos

- `visitTitle` / `visitCode` (`src/lib/visits.ts`) suman: retest con origen → **«Retest de V1»**
  (compacto **«Retest V1»**), componiendo el título del origen con la misma regla, como «Continuación de
  V3».
- Retest sin origen: «Retest», como hoy.
- `v_track_visits` suma **al final** las columnas del origen del retest (`retest_of_visit_id`,
  `retest_of_code`, `retest_of_name`, `retest_of_kind`), por la misma razón que las `origin_*` de la 0144: componer el
  título sin una segunda consulta. Lo heredan la ficha, la Agenda, el día, las alertas, las
  notificaciones, el CSV y Farmacia.

## Tests

Criterio del repo (`estados.test.ts`): se testea lo que falla **en silencio**.

- **Vitest, reglas puras:**
  - «hay pendientes al finalizar»: lista efectiva con reporte y sin tildar, sin contar lo marcado; uno
    sin reporte nunca dispara el aviso;
  - qué visitas ofrece el retest (atendidas, 60 días, orden) y qué procedimientos (tildados o sin
    reporte);
  - qué visitas lista «Una visita del estudio» (próximas, sin ausencia, sin ventana vencida, posteriores
    al día mirado);
  - el título «Retest de V1» y su compacto;
  - la fila de Pendientes: agrupación por visita y «hace N días» (ojo con CI en UTC).
- **PGlite, en seco** (esquema de juguete + `set role` para que aplique la RLS), como la 0144:
  - la lista efectiva resta lo marcado;
  - **la V3 cierra** (`completa`) con un procedimiento marcado cuyo reporte queda en `pendiente`;
  - `dejar_pendientes` rechaza un tildado y uno fuera de la lista;
  - no se puede tildar lo marcado; `quitar_pendiente` lo vuelve tildable;
  - `continuar_pendientes` parcial: lo elegido pasa a la continuación y lo demás sigue marcado; rechaza
    un procedimiento no marcado;
  - `register_visit_event` con `p_retest_of`: rechaza otra inscripción, un origen sin atender y un
    procedimiento con reporte no tildado en el origen; acepta uno tildado y uno sin reporte;
  - la app no borra una visita con retest; `postgres` sí, y el retest queda con origen nulo.
- **Sondas al final de la migración:** `reloptions` de las vistas recreadas, y que la versión vieja de
  `register_visit_event` ya no exista (una sola sobrecarga).
- **QA en el navegador** sobre **TEST-QA / TEST-001**: finalizar con pendientes y dejarlos; verlos en
  Pendientes; retomar una parte desde Visitas; retest desde Visitas y desde la ficha; el título; «Se hace
  hoy». No se crea nada permanente en estudios reales.

## Fuera de alcance

- Un procedimiento que **no se va a hacer nunca** (ni hoy ni otro día): desde el aviso al finalizar
  queda pendiente, y sale con «Se hace hoy» + tilde o documentándolo por otra vía. Una salida propia
  («no corresponde») es otra conversación.
- Umbral de vencimiento o color de alerta para lo que espera.
- Retomar pendientes **dentro de una visita que ya existe** (la V4): sigue fuera, como en la 0144.
- Dar origen a los retests viejos.
- Cambios en Farmacia: la continuación y el retest siguen siendo sueltas, que Farmacia ya acepta.
