# Spira · Diseño — Visitas con procedimientos propios: retest, no programada y continuación

- **Fecha:** 2026-09-23
- **Estado:** aprobado (brainstorming) — pendiente plan de implementación
- **Módulo:** Track (en la UI, **Coordinación**)
- **Antecedentes:** `2026-06-15-modelo-visitas-design.md` (nacen `vnp`/`retest` como visitas sueltas) y
  `2026-06-21-cronograma-cuadro-completo-design.md` (las no planificadas siguen sin definición).

## Contexto

El centro necesita dos cosas que hoy la app no sabe hacer:

1. **Visitas no programadas con contenido**: un retest de laboratorio, una extracción de hematología, un
   procedimiento puntual.
2. **Desdoblar una visita**: en la V3, por el motivo que sea, se para, y lo que quedó sin hacer se hace
   otro día.

**Lo que ya existe.** `vnp` y `retest` son valores de `visit_kind` desde la 0022. Se agendan desde
«Agendar visita» (`RegisterVisitFlow`) vía `register_visit_event` (0030), pero **solo después de
randomizar**. Son visitas **sueltas**: `visit_def_id` nulo, sin ventana.

**Lo que falta, y por qué.** Todo lo que calcula «qué procedimientos debe esta visita» sale del
cronograma: `protocol_activities` unido por `pa.visit_def_id = pv.visit_def_id`. Una suelta no tiene
definición, así que **un retest hoy no lleva procedimientos, ni reportes, ni sabe qué repite**. Del
desdoblamiento no hay nada: ni en la base, ni en el front, ni en los docs.

**Una trampa que condiciona todo el diseño.** Desde la 0137, una visita queda «Realizada, con pendientes»
mientras tenga un **reporte sin evolucionar**. Si de la V3 se difiere un laboratorio con reporte y la V3
lo sigue debiendo, ese reporte queda en `pendiente` para siempre y **la V3 no cierra nunca**. Por eso
diferir tiene que **sacar** el procedimiento de lo que la V3 debe, no solo anotar que se mueve.

## Decisiones (del brainstorming, Director, 2026-09-23)

1. **La continuación es una visita nueva e independiente** (no «la V3 en dos días»):
   - La V3 se cierra con lo que se hizo.
   - Lo pendiente vive en otra visita con fecha propia, y en el EDC se carga como no programada.
   - No hereda la ventana de la V3.
2. **Un solo mecanismo**, sin tipos con reglas propias:
   - Retest, VNP, hematología y continuación son todas «visita suelta con su lista de procedimientos».
   - Hematología no es un tipo: es un retest o una VNP cuyo procedimiento es la extracción.
3. **Trazable de punta a punta**:
   - La V3 registra qué difirió y a qué visita lo mandó.
   - Si la continuación se borra, lo diferido vuelve a estar pendiente en la V3.
   - Nada se pierde en silencio.
4. **Sin restricción de etapa**: retest y VNP se pueden agendar en cualquier momento de la inscripción,
   también **antes de randomizar**. El retest de screening es el caso más común.
5. **Diferir siempre crea una visita nueva.** Mandar lo pendiente a una visita que ya existe (la V4, un
   retest ya cargado) queda **fuera de alcance**, pero el modelo lo admitiría sin rehacerse.
6. **Enfoque: lista efectiva derivada** (enfoque 1 de 3). Descartados:
   - **Materializar la lista en cada visita**: obliga a rellenar todas las visitas existentes, y editar
     el cronograma deja de impactar solo en las visitas futuras.
   - **Continuación como segunda fila de la V3**: contradice la decisión 1 y rompe `sync_protocol_schedule`,
     que empareja por (inscripción, definición).
7. **Motivo sin columna nueva**:
   - `vnp` y `retest` siguen como están.
   - «Continuación de V3» se **deriva** de tener procedimientos diferidos desde otra visita: un dato, una
     casilla. No hace falta ningún valor nuevo en el enum.

## Modelo de datos

### Tabla nueva `visit_added_procedures`

Procedimientos que una visita lleva **además** de su cronograma. Para una suelta, que no tiene cronograma,
son todos los que lleva.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()`. La necesita `audit_row()` (se resuelve al planificar, ver 0111). |
| `visit_id` | uuid not null → `patient_visits` | `on delete cascade`: borrar la continuación devuelve lo diferido **por construcción**. |
| `procedure_id` | uuid not null → `procedures` | `on delete restrict`, como `visit_procedure_completions` (0064). |
| `deferred_from_visit_id` | uuid null → `patient_visits` | La visita de la que vino. `on delete restrict` (ver abajo). Nulo = agregado a mano. |
| `added_by` | uuid not null default `auth.uid()` → `users` | |
| `added_at` | timestamptz not null default `now()` | |

**Restricciones**
- `unique (visit_id, procedure_id)`.
- `check (deferred_from_visit_id is distinct from visit_id)`.
- El procedimiento tiene que estar en `protocol_procedures` del estudio de la inscripción. Lo valida la
  RPC: de ahí cuelgan los `report_definitions`, y sin eso el retest no traería reportes.
- `deferred_from_visit_id` y `visit_id` tienen que ser **de la misma inscripción**. También lo valida la RPC.

**Por qué `restrict` en el origen.** Sin él, una cadena V3 → C1 → C2 con C1 borrada deja a C2 con una fila
huérfana (o con el origen en nulo), mientras la V3 recupera el procedimiento: **el mismo procedimiento
queda pendiente en dos visitas**. Con `restrict`, no se puede borrar una visita que difirió cosas mientras
la continuación exista.

**Seguridad y auditoría**
- RLS: `select` / `insert` / `delete` con `has_module('gerencia') or coordina_visita(visit_id)`, el mismo
  predicado de los tildes (0064).
- Las escrituras van por RPC.
- Trigger `audit_row`.

### Vista nueva `v_visit_procedures (visit_id, procedure_id, origen)`

La **lista efectiva** de cada visita, con `security_invoker = true`:

```
  lo del cronograma   (protocol_activities por visit_def_id, con origen 'cronograma')
− lo diferido desde esta visita   (filas de visit_added_procedures cuyo deferred_from_visit_id = esta visita)
+ lo agregado a esta visita   (con origen 'diferido' si trae deferred_from_visit_id, o 'agregado' si no)
```

Una cadena V3 → C1 → C2 queda consistente sin reglas extra:
- La fila de C1 que vino de la V3 sigue existiendo, así que la V3 sigue sin deberlo.
- La fila de C2 que vino de C1 se lo resta a C1.

### Recableado: todo lo que calcula «qué debe esta visita»

Estas vistas pasan de `protocol_activities pa … where pa.visit_def_id = pv.visit_def_id` a
`v_visit_procedures vp … where vp.visit_id = pv.id`, **sin cambiar sus columnas**:

| Vista | Última versión | Qué se recablea |
|---|---|---|
| `v_patient_visits` | 0137 | Las ramas 5 (`item_vencido`) y 6 (`realizada`) de `computed_status`. |
| `v_procedure_report_alerts` | 0126 | El join de la línea 181. |
| `v_protocol_report_status` | 0126 | El join de la línea 240. |

- Todas se recrean con `create or replace` **repitiendo `with (security_invoker = true)`**, con la sonda
  de `reloptions` al final (ver gotcha de la 0137).
- Si `create or replace` falla por columnas, **no se fuerza con `cascade`**: se corta y se revisa.

Con esto, el retest y la continuación **heredan sin reglas nuevas**: reportes, vencimientos
(`item_vencido`), cierre por reportes, alertas y el tablero «Reportes pendientes».

**`v_track_visits`** (última: 0126) suma **al final** las columnas de la visita de origen, para que el
título se componga sin una segunda consulta: `origin_visit_id`, `origin_code`, `origin_name` y
`origin_kind`. Sale del `deferred_from_visit_id` de cualquiera de las filas de la visita (una
continuación tiene un solo origen: ver `set_added_procedures`). `patient_visits` **no cambia**.

### RPCs (atómicas, `security definer`, authz en el servidor)

- **`register_visit_event`** (0030) gana `p_procedure_ids uuid[] default '{}'`:
  - **Deja de rechazar el retest antes de randomizar.**
  - El retest exige al menos un procedimiento. La VNP puede ir vacía (una consulta es válida).
  - Cambia la firma, así que hay que **dropear la versión vieja** explícitamente, o queda una sobrecarga
    viva (gotcha `create or replace` con firma nueva).
  - Revisar también `registrar_vnp` (0114/0141, la de Farmacia): no se le agregan procedimientos, pero
    no debe romperse.
- **`diferir_procedimientos(p_visita_origen uuid, p_procedure_ids uuid[], p_fecha date)`**:
  - Crea la continuación (`kind = 'vnp'`, `estimated_date = p_fecha`) y sus filas con
    `deferred_from_visit_id = p_visita_origen`, en una sola transacción.
  - Solo acepta procedimientos que la visita origen **debe** (están en su lista efectiva) **y que no están
    tildados**. Cualquier otro se rechaza con un mensaje sereno.
  - Devuelve el id de la continuación.
- **`set_added_procedures(p_visit uuid, p_procedure_ids uuid[])`**: reemplaza lo **agregado a mano** de
  un retest o una VNP.
  - Quitar un procedimiento **diferido** lo devuelve a su origen (es borrar la fila).
  - No deja quitar uno ya tildado.
  - Agregar a mano solo acepta procedimientos del estudio y nunca con origen, así que una continuación no
    junta dos orígenes.

### Guardas

- **No tildar lo diferido.** Un trigger `before insert` en `visit_procedure_completions` rechaza tildar,
  en una visita, un procedimiento que ya difirió. Hoy el tilde es un `insert` directo desde el front
  (`toggleVisitProcedure`); la RLS no alcanza para esto.
  - Ojo con el gotcha de los triggers-guarda: sin `security definer` (mata el `current_user`) y
    cortando antes de cualquier `for share` (sin definer, el lock pide permiso de UPDATE).
- **No borrar una suelta con trabajo hecho.** Borrar una visita suelta (`deleteVisitEvent`, `delete`
  directo) con procedimientos tildados o reportes avanzados queda bloqueado por trigger, con mensaje claro.
  Hoy no hace falta porque una suelta no tiene nada, pero con esto el `cascade` borraría tildes y reportes.
- **`sync_protocol_schedule` contra el `restrict`.** Si intenta borrar una V3 que difirió cosas, el
  `restrict` lo frena. Tiene que salir un mensaje sereno, no un `23503` crudo: sumar el código al
  `*ErrorMessage` que corresponda.

### Orden de despliegue

En principio la migración es **aditiva**, así que va **primero**: tabla, vista y RPC nuevas; el
recableado no cambia columnas; `v_track_visits` suma columnas al final.

**A confirmar en el plan, antes de fijar el orden:**
- Que el front desplegado tolere filas de `v_protocol_report_status` y `v_procedure_report_alerts` de
  visitas **sin definición** (hoy nunca las ve).
- Que tolere que un retest o una VNP pasen de `completa` a `realizada` / `item_vencido`.

Si algo de eso rompe, la migración va **segunda** y se avisa en el chat junto con el SQL.

**Numeración:** la siguiente libre al momento de pushear, mirando `origin/main`. No se fija en este doc.

## UI

**Mock en el repo antes del código** (regla del repo): el modal «Pasar pendientes a otro día», el bloque
de la V3 y el paso «¿Qué lleva?». Copy según `PRODUCT.md` y `DESIGN.md`: en la UI se dice **Coordinación**.

### A. Agendar un retest o una VNP con procedimientos

- Mismo modal «Agendar visita» (`RegisterVisitFlow`), con un paso nuevo después de tipo y fecha:
  **«¿Qué lleva?»**.
- Muestra los procedimientos **del estudio** (`protocol_procedures`) como casillas, agrupados por
  categoría. Es una lista cerrada, sin texto libre.
- El retest exige al menos uno; la VNP puede ir vacía.
- Retest y VNP se ofrecen **en cualquier etapa** (`availableEventKinds` / `POST_RANDO_KINDS`,
  `src/data/visitEvents.ts`).
- Después se corrige desde el detalle con **«Editar procedimientos»**. Solo se pueden quitar los que no
  están tildados.

### B. Pasar pendientes de la V3 a otro día

- En el detalle de la visita, en el panel «Resumen de la visita», aparece el botón **«Pasar pendientes a
  otro día»** mientras haya procedimientos sin tildar y la vista no sea de solo lectura.
- Vale antes de la visita (si ya se sabe que va en dos días) o durante la atención.
- El modal muestra:
  - lo que la visita todavía debe, como casillas **sin preselección** (lo que se difiere se elige a
    propósito);
  - la fecha de la continuación.
- Confirmar llama a `diferir_procedimientos`.
- La V3 queda con un bloque **«Pasaron a otra visita · N procedimientos · 25/9»** y un **botón con
  nombre** para abrir la continuación. La tarjeta no se vuelve link a otra entidad.
- Los diferidos se ven en gris con «→ 25/9», **no se pueden tildar** y sus reportes **no cuentan** para
  el cierre.

### C. La continuación

- Encabezado: **«Continuación de V3»**, más la fecha de la V3 y un botón para volver a ella.
- Se comporta como cualquier visita: llegada, atención, tildes, reportes y dispensación. Farmacia ya
  acepta sueltas (0115/0138): no hay nada que cambiar ahí.
- Para deshacer:
  - quitar un procedimiento lo devuelve a la V3;
  - borrarla, si no tiene nada tildado, devuelve todo;
  - si tiene algo tildado, el borrado se bloquea con mensaje sereno.
- Se puede volver a diferir desde la continuación (C1 → C2).

### D. Dónde se ve

**Título, una sola regla.** `visitTitle` / `visitCode` (`src/lib/visits.ts`) suman un caso:
- con origen, **«Continuación de V3»** (compacto: **«Cont. V3»**), componiendo el título del origen con
  la misma regla;
- sin origen, «Retest» / «VNP», como hoy.

Lo heredan la ficha, la Agenda, el día, las alertas, las notificaciones, el CSV (`visitasCsv.ts`) y
Farmacia.

- **Ficha y línea de tiempo:** orden por fecha, como hoy (`orderVisits`; las sueltas desempatan
  últimas).
- **Agenda y visitas del día:** la tira de procedimientos (`useDayProcedureRows`, `resumenVisita.ts`) sale
  de la lista efectiva.
- **Alertas y «Reportes pendientes»:** los reportes de un retest aparecen y vencen solos, vía las vistas
  recableadas.
- **Cronograma del protocolo:** no cambia (es la matriz de definiciones; las sueltas nunca estuvieron).

### Front: lectura de procedimientos

- `useVisitProcedureStatus` (`src/data/procedures.ts:174`) hoy devuelve `[]` si `visitDefId` es nulo.
  Pasa a leer `v_visit_procedures` por `visit_id`, con el `origen` y, si fue diferido, a qué visita.
- `VisitProcedures.tsx` deja de necesitar `visitDefId`.

## Tests

El criterio del repo (`estados.test.ts`): se testea lo que falla **en silencio**.

- **Vitest, reglas puras del front:**
  - qué se puede diferir (en la lista efectiva, sin tildar, no diferido ya);
  - el título de la continuación, incluido el compacto;
  - que un diferido no cuenta en `visitClosed` (el espejo de la rama 6).
- **PGlite, en seco, como la 0137** (esquema de juguete + `set role` para que la RLS aplique):
  - la lista efectiva en sus tres orígenes;
  - borrar la continuación devuelve lo diferido;
  - el `restrict` de la cadena C1 → C2;
  - el trigger que impide tildar un diferido;
  - **la V3 cierra** (`completa`) con un diferido cuyo reporte queda en `pendiente`;
  - un retest con un reporte vencido da `item_vencido`;
  - retest antes de randomizar aceptado; retest vacío rechazado.
- **Sonda al final de la migración:** ninguna vista viva conserva `pa.visit_def_id = pv.visit_def_id`
  (`pg_views.definition`). Olvidarse uno de los joins es justo el error que no se ve en pantalla.
- **QA en el navegador** sobre el protocolo **TEST-QA / paciente TEST-001**:
  - retest antes y después de randomizar;
  - diferir, deshacer y borrar la continuación;
  - verificar el cierre de la V3.

  No se crea nada permanente en estudios reales.

## Fuera de alcance

- Diferir a una visita que **ya existe** (decisión 5).
- Ventana o plazo para la continuación: es independiente (decisión 1), sin ventana, y por lo tanto nunca
  da `ventana_vencida`.
- Motivo libre o categorías nuevas de visita no programada.
- Cambios en el cronograma del protocolo o en `sync_protocol_schedule`, más allá del mensaje del
  `restrict`.
