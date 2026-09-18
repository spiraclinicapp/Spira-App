# Plan — Documentar la desviación: la salida que le falta a la ventana vencida

Nace de un reencuadre del Director (2026-09-17): *"me hace ruido que el módulo se llame Pendientes
y haya alertas por ventana vencida; la ventana vencida es un aviso, no un pendiente"*. Al bajar al
detalle, el diagnóstico se corrió de lugar dos veces y vale dejar el recorrido escrito, porque la
conclusión no se parece al punto de partida.

Continúa la línea de [`plan-pendientes-clase-de-alerta.md`](plan-pendientes-clase-de-alerta.md) y
[`plan-por-reprogramar.md`](plan-por-reprogramar.md).

**Una migración: la `0130`.** Es **aditiva** (tabla y RPC nuevos, ningún front viejo los consulta)
⇒ va **primero**, el front después.

---

## El problema, medido

La propuesta inicial era mandar la ventana vencida a un panel de notificaciones. **Ese panel ya
existe** —la campana del topbar (`shell/NotificationsMenu.tsx`) muestra las mismas cinco clases,
ventana vencida incluida—, así que el cambio hubiera sido **sacarla de Pendientes**, no crearle un
lugar. Y la campana es peor destino para lo que sobra: topea en 10 ítems, no tiene filtros ni
buscador, y su pie remite justamente a Pendientes.

**El panel no se llena por caudal, se llena por sedimento.** Medido contra prod el 2026-09-17, con
los cuatro protocolos de la prueba real:

| Dato | Valor |
|---|---|
| Ventanas vencidas hoy | **0** (la pantalla dice "0 de 0 pendientes") |
| Ancho de ventana (mediana, los 4 protocolos) | 6 días |
| Visitas que cierran ventana en 30 días | 16 |
| …en 12 meses | 231 |

Entran unas pocas por mes: manejable como trabajo diario. Lo que no es manejable es que **ninguna
se va sola**. La regla es `real_date is null and current_date > window_end`
([`0120`](../supabase/migrations/0120_visita_espera_entrega_ip.sql)): sin fecha real, la visita
queda vencida para siempre. Una lista que recibe tres por mes y no drena tiene 36 al año.

**Y la razón por la que nadie la drena es que no hay cómo.** Hoy una ventana vencida sale de dos
maneras: registrando la visita, o **descartando la alerta** con un motivo de catálogo genérico
("Ya resuelta fuera del sistema", "No aplica a este protocolo"). Ninguna dice lo que de verdad
pasó, que es **una desviación de protocolo**. Nadie silencia un desvío clínico — así que se
acumula. Mudarla de pantalla habría mudado el sedimento intacto.

**Spira no tiene hoy ningún concepto de desviación**: cero apariciones en las 129 migraciones. Pero
el hecho **ya se calcula**: `fueraDeVentana()` ([`lib/visits.ts`](../src/lib/visits.ts)) alimenta
la pastilla roja del encabezado de visita, el ícono del cronograma y la métrica de adherencia del
Resumen de Inicio. La app sabe cuándo hubo desvío y lo señala; lo que no hace es **dejar
registrarlo**.

---

## Alcance

**Entra:** la visita que **no se hizo** y cuya ventana pasó (`ventana_vencida`).

**No entra:** la visita que **sí se hizo, fuera de ventana**. Es la misma desviación clínica y es
la más frecuente, pero hoy se escapa en silencio (al cargarse la fecha real el estado pasa a
realizada y nunca entra a Pendientes). Se ofreció junto con ésta y el Director acotó: *"el 1, y
anotá el 2"*. Queda en `TODOS.md` como P2, con su disparador. El caso 1 tenía un agujero
estructural —una lista que no drena—; el 2 es un dato que falta.

---

## Decisiones tomadas

### D1 · La ventana vencida **es** un pendiente; lo que le falta es una salida

No se muda a notificaciones. El reencuadre correcto no es *"esto no es un pendiente"* sino *"esto
es un pendiente que no tiene cómo terminarse"*. Alguien tiene que decidir qué pasó con esa visita:
eso es trabajo real, y va en la lista de trabajo.

### D2 · Documentar ≠ descartar. Conviven, y dicen cosas distintas

- **Descartar** (0070, ya existe) = *"esta alerta no correspondía"* (cargada por error, no aplica).
- **Documentar** (esto) = *"el desvío ocurrió, y acá está el porqué"*.

Que sólo existiera la primera es exactamente por qué nadie vaciaba la lista: la única forma de
sacar algo era declarar que no correspondía. Los dos botones conviven en el ítem de ventana
vencida; para el resto de las clases, el descarte sigue solo.

### D3 · Tabla propia `protocol_deviations`, no un motivo más en `alert_dismissals`

Cuesta más, y aun así: el listado de desviaciones es un **entregable que el monitor pide**, y
sacarlo de una tabla llamada "descartes de alertas" es mentir sobre qué es ese dato. Además es
donde entra el caso 2 el día que se tome.

### D4 · El catálogo de motivos (seis, sin texto libre)

Definido por el Director:

1. El paciente no concurrió y no avisó
2. El paciente no pudo venir y pidió otra fecha
3. Motivo clínico del paciente (internación, evento adverso, enfermedad intercurrente)
4. El centro no pudo (feriado, agenda, falta de producto)
5. El cronograma estaba mal generado
6. Otro (explicar)

**Se evaluó y se descartó un séptimo**, *"el paciente salió del estudio antes de esta visita"*: no
explica **por qué se venció la visita** —se venció antes, por alguna de las otras causas—, y el
caso operativo que había detrás se resuelve en D8, no con un motivo.

### D5 · Detalle obligatorio SIEMPRE, no sólo en "Otro"

Se aparta a propósito de `alert_dismissals`, donde la explicación sólo se exige en "Otro"
(`MOTIVO_OTRO`). Un motivo de catálogo solo no le alcanza a quien lea esto dentro de ocho meses, y
ese lector es un monitor. El desplegable evita el texto libre **para clasificar**; el detalle está
para **explicar**. Son dos cosas.

### D6 · La visita **no cambia de estado**

Sigue siendo `ventana_vencida` en la vista. Documentar no revierte el hecho clínico: lo explica.
Nada se borra, nada se mueve.

### D7 · La alerta documentada sale de la lista activa, y se ve en su solapa

Misma mecánica que el descarte: el pendiente era documentarla, y ya está.

Se lee **con el patrón que la pantalla ya tiene**, no con uno nuevo: hoy los descartes viven en un
panel que se despliega con un toggle cuyo estado viaja en la URL (`descartadas`) y se titula
**"Descartados"** — no es una solapa. Lo documentado va en su propio panel gemelo, al lado.
En la visita se ve una marca "Desviación documentada · motivo".

### D8 · Inscripción cerrada ⇒ sus vencidas dejan de pedir acción

**El hallazgo:** al cerrar una inscripción, la `0127` borra las visitas pendientes **futuras**
(`window_end >= current_date`,
[`0127`](../supabase/migrations/0127_cierre_de_inscripcion.sql)); las que ya se habían pasado de
ventana **se conservan**. Y está bien que se conserven: son evidencia de algo que pasó mientras el
paciente estaba en el estudio. Lo que está mal es que **`useVisitAlerts` no filtra por
inscripción** ([`data/visits.ts`](../src/data/visits.ts)), así que siguen reclamando para siempre
sobre un paciente que ya no está.

**Hoy no hay ni un caso** (7 inscripciones cerradas, 59 visitas, todas completas o realizadas): la
regla lo permite, todavía no se manifestó.

Decisión del Director: **salen de la lista activa**, no se borran ni se ocultan. Quedan en el
panel de desviaciones marcadas **"sin documentar"**, con su contador a la vista. La lista de
trabajo tiene que contener lo que alguien puede resolver hoy; un desvío de un paciente que se fue
hace cuatro meses es historia, y la historia se consulta, no reclama.

### D9 · La regla se escribe por EXCLUSIÓN de los cerrados, nunca por `= 'activo'`

`enrollment_status` es un enum de **cuatro** valores: `screening`, `activo`, `completado`,
`discontinuado` (0001). Los cerrados son los dos que la `0127` escribe: `completado` y
`discontinuado`. **Una inscripción en `screening` está abierta** y sus visitas tienen que seguir
pidiendo acción.

Filtrar por `enrollment_status === 'activo'` haría desaparecer en silencio los pendientes de todo
paciente en selección, y un quinto valor futuro se caería solo del tablero. Va por exclusión, y con
test.

### D10 · El ancla, para que una desviación vieja no tape una nueva

Igual que `alert_dismissals` (`anclaDeLaVisita`): la desviación se guarda contra el `window_end`
del momento. Si la visita se reprograma y vuelve a vencerse con otra ventana, es **otro** desvío y
vuelve a pedir su documentación. Único `(visit_id, anchor)`.

---

## Modelo de datos (migración 0130)

Tabla `public.protocol_deviations`:

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `uuid pk default gen_random_uuid()` | **Obligatoria**: `audit_row()` hace `old.id` y Postgres lo resuelve al PLANIFICAR, sin importar la rama (pasó con la 0111) |
| `visit_id` | `uuid not null` → `patient_visits(id)` | |
| `anchor` | `date not null` | el `window_end` del momento (D10) |
| `reason` | `text not null` + `check` del catálogo | los seis de D4 |
| `detail` | `text not null` + `check (length(btrim(detail)) > 0)` | D5 |
| `recorded_by` | `uuid not null` | |
| `recorded_by_name`, `recorded_by_role` | `text` | desnormalizados, mismo motivo que `author_name` en 0048 y el autor en 0070: la RLS de `users` sólo muestra la fila propia |
| `created_at` | `timestamptz default now()` | |

Más: `unique (visit_id, anchor)`, índice por `visit_id`, RLS de lectura con el mismo alcance que la
visita (Track se aísla por protocolo), trigger `audit_row`, y alta por RPC
`record_protocol_deviation(p_visit_id, p_reason, p_detail)` `security definer` que valida el
permiso sobre el protocolo de esa visita.

**Chequeado antes de escribir esto:** la FK nueva a `patient_visits` **no rompe ningún embed de
PostgREST** — no hay un solo `patient_visits(...)` en los `select` del front (el gotcha de la 0076,
que volteó el tablero de Farmacia, necesita que la tabla esté embebida).

**Dentro de la función, calificar todo lo que no sea de `public` ni `pg_catalog`**, y usar
`gen_random_uuid()` (pg_catalog) y no `uuid_generate_v4()` (schema `extensions`): sin calificar
aplica en verde y revienta en la primera llamada real con `42883` (pasó con la 0113).

**Punto abierto menor:** la FK va `on delete cascade`. Una visita con desviación documentada no es
candidata al borrado de la `0127` (ésta sólo toca `window_end >= current_date`, y una desviación
sólo existe sobre una ventana ya cerrada), **salvo** que la visita se reprograme hacia el futuro y
recién después se cierre la inscripción. En ese caso la fila se iría con la visita; el rastro queda
igual en el `audit_log`, que es inmutable. Vale revisarlo si alguna vez se documenta una desviación
sobre una visita que después se reprograma.

---

## La pantalla

- **El ítem de ventana vencida** suma "Documentar desviación" junto al descarte que ya tiene. El
  descarte sigue siendo la acción discreta (no queremos invitar a silenciar); ésta es la que
  resuelve, así que va con más peso visual — pero **sin borde de color**: realce por elevación,
  como todo lo pulsable de la casa.
- **El modal**: desplegable de motivo (los seis, sin texto libre) + detalle obligatorio. El botón
  de confirmar sólo se habilita con los dos completos, con la misma regla pura y testeada que
  `descarteListo`.
- **El panel de desviaciones**, gemelo del de "Descartados" y con su mismo gesto: lo documentado,
  con motivo, autor y fecha; y las de inscripciones cerradas marcadas "sin documentar" (D8), con
  su contador.
- **En la visita** (`VisitHeader` / `VisitDetail`): marca "Desviación documentada · motivo".
- Copy en castellano rioplatense; errores de Postgres traducidos a texto sereno (`23505` duplicado
  = ya está documentada, `42501` = sin permiso), como el resto de `data/`.

---

## Lo que este plan NO hace

- No cambia el estado de ninguna visita.
- No toca `RegisterVisitFlow` ni el flujo de cargar la fecha real (eso es el caso 2).
- No borra ni oculta nada: todo lo que sale de la lista activa queda consultable y contado.
- No renombra el submódulo. "Pendientes" queda: con la salida puesta, el rótulo pasa a ser cierto.

---

## Verificación

Lo que se testea es **lo que puede quedar al revés sin verse** (el criterio de la casa):

1. **El filtro por inscripción cerrada (D9).** Por exclusión de `completado`/`discontinuado`, con
   un caso explícito de `screening` que **sí** tiene que seguir alertando. Si queda al revés,
   desaparecen pendientes reales y no hay nada roto que mirar.
2. **La regla "esta alerta ya está documentada"**, con su ancla. Silencia de más o de menos, mudo
   en los dos sentidos.
3. **El formulario listo** (motivo + detalle no vacío), como `descarteListo`: vive en la frontera
   entre el modal y el RPC, y su falla es que el detalle llegue vacío al `audit_log`.

Y a mano, en el navegador: documentar una desviación, ver que el ítem sale de la lista, que aparece
en la solapa con autor y fecha, y que la campana baja su número en el mismo gesto (la señal común
de `dismissalsVersion` tiene que cubrir también las desviaciones, o la campana queda con el número
viejo — ya pasó con los descartes).

`npm run build` verde es el gate.

---

## Orden de despliegue

La `0130` es **aditiva**: tabla y RPC nuevos que ningún front desplegado consulta. Va **primero**,
el front después. (La regla de "front primero" es para lo que altera lo que el front YA pide; no es
este caso.)

**Ojo con el número.** La `0128` todavía no está aplicada en prod, y la `0129` (guarda de Recepción)
vive sin pushear en la rama `fix/recepcion-guarda-borrado-y-renglones`. Esta migración se numeró
primero como `0131`, porque la `0130` estaba reservada para la limpieza de Reposición; el Director
la corrió a **`0130`** el 2026-09-17, ya que esa limpieza depende de un deploy de Farmacia que
todavía no pasó y no tenía sentido que frenara esta feature. La limpieza toma un número posterior.

La consecuencia práctica: mientras la `0129` no esté en `main`, esta rama deja un hueco de
numeración y **`scripts/check-migraciones.mjs` falla en CI**. Es el mismo motivo por el que la
guarda de Recepción está esperando sin pushear, y se resuelve igual — el archivo `.sql` no sale a
una PR hasta que las anteriores estén. El front, en cambio, no depende de eso: verificado en el
navegador que funciona con la tabla ausente.
