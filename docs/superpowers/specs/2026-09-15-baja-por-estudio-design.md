# La baja es por estudio, no por persona

**Fecha:** 2026-09-15 · **Estado:** diseño aprobado por el Director · **Origen:** reporte en
producción — «di de baja a unos pacientes en ACT y se ven dados de baja en LTS también».

## El problema

En la base hay **dos estados que se llaman «activo»** y nadie los sincroniza:

| Columna | De qué es | Valores |
|---|---|---|
| `patients.status` | la **persona** — una sola fila para todos los estudios | `activo` / `inactivo` |
| `enrollments.status` | la **inscripción** — una por estudio | `screening` / `activo` / `completado` / `discontinuado` |

«Editar paciente › Estado › Inactivo» escribe `patients.status`, y el punto verde/rojo de todas las
listas lo lee de ahí. Como LTS17231 es la **extensión** de ACT18301 —las mismas personas, inscriptas
dos veces— dar de baja en ACT marca a la persona de baja en LTS, en ENDURA y en cualquier estudio
donde esté. Ocho de veintitrés pacientes están en dos protocolos, así que no es un caso de borde.

Y hay un segundo agujero que apareció al preguntar: los pacientes que el Director dio de baja en
ACT18301 **no abandonaron, terminaron el estudio y pasaron a la extensión**. Hoy la app no sabe
decir eso: el único cierre de inscripción que existe es el desenlace «fallo de screening» de una
visita, que escribe `discontinuado`. No hay forma de registrar un cierre bueno.

## Decisiones del Director (2026-09-15)

1. **La baja es por estudio.** Alguien dado de baja en ACT tiene que seguir viéndose activo en LTS.
2. **El estado de la persona se deduce**, no se guarda: está activa si tiene al menos una inscripción
   abierta (`screening` o `activo`). Se va el campo «Estado» de «Editar paciente».
3. **Las visitas futuras sin atender se borran** al cerrar la inscripción. Lo atendido no se toca
   nunca; las que ya están en alerta siguen el camino de archivarlas con motivo y autor
   (decisión del 2026-09-05: en una lista con descarte auditable, esconder por regla es peor).
4. **El punto de estado sigue binario**: verde = abierta, rojo = cerrada, y el `title` dice cuál de
   los cuatro estados es. Se ofreció distinguir «completó» de «se discontinuó» con un tercer color y
   el Director prefirió no sumar un color a la lista.
5. **La acción vive en la ficha del paciente**, que ya está siempre parada en un estudio.

## Modelo

`enrollments.status` pasa a ser **el** estado dentro de un estudio.

`patients.status` deja de escribirse y de leerse. **Ninguna vista SQL la lee** (verificado sobre
`supabase/migrations/`: los únicos `status` en vistas son de `protocols`), así que el cambio es casi
todo TypeScript. La columna **no se borra**: es parte de la traza histórica del `audit_log`. Queda
marcada con un `comment on column` que la declara legacy, para que nadie la resucite creyendo que es
el estado vigente.

**Persona activa = existe una inscripción suya en `screening` o `activo`.** Se deriva en el front, que
ya trae las inscripciones de cada paciente en la misma consulta (`data/patients.ts`, el embed
`enrollments(...)`). Hace falta sumarle `status` a ese embed: hoy trae `id, enrollment_date,
randomization_date, ivrs_code, protocol:protocols(...)` y no el estado.

**Una persona SIN ninguna inscripción cuenta como activa.** Es el paciente recién dado de alta, antes
de inscribirlo a un estudio: la regla literal («alguna abierta») lo dejaría inactivo apenas se crea,
que es exactamente al revés de la verdad.

## La acción: «Cerrar participación»

Va en el bloque **Protocolo** de la ficha lateral (`PatientFichaView`), que ya recibe el protocolo en
contexto y su inscripción resuelta (`patient.enrollments.find(...)`).

Abre un modal con **un solo desplegable de motivo**, sin texto libre (regla de la casa: valores
preestablecidos para evitar errores del operador). El motivo determina el estado — quien opera elige
un hecho clínico, no un valor de enum:

| Motivo | Estado resultante |
|---|---|
| Completó el estudio | `completado` |
| Pasó a la extensión | `completado` |
| Retiró el consentimiento | `discontinuado` |
| Criterio de exclusión | `discontinuado` |
| Evento adverso | `discontinuado` |
| Pérdida de seguimiento | `discontinuado` |
| Decisión del investigador | `discontinuado` |

La confirmación dice qué va a pasar, con el número real contado antes:

> Se van a borrar **N visitas futuras sin atender**. Lo ya atendido no se toca. Si reabrís la
> inscripción, se recuperan con el botón de sincronizar del cronograma.

Esa última frase es verdad y está verificada: `sync_protocol_schedule` (0026) sólo opera sobre
inscripciones en `activo` (cuatro `where e.status = 'activo'`). O sea que cerrar la inscripción hace
que el cronograma **deje de regenerarle visitas** —borrarlas es estable— y reabrirla las recupera.

El mismo botón permite **reabrir** una inscripción cerrada por error: vuelve a `activo` y limpia el
sello del cierre.

## Dónde se ve

- **Ficha del paciente** y **listado del protocolo** (`PdPatientRow`): el punto pasa a leer la
  inscripción **del estudio en contexto**. Es el cambio que arregla el reporte.
- **Filtro «Activos» y KPI** de la ficha del protocolo (`ProtocolDetailView`): inscripciones abiertas
  de ese estudio. Se terminan las dos definiciones que el 2026-09-14 daban «10 activos» al lado de
  «9 de 10».
- **KPI «pacientes activos»** de Inicio (`InicioResumenView`) y Resumen (`TrackResumenView`):
  personas con al menos una inscripción abierta.
- **«Editar paciente»** (`EditPatientForm`): se va el campo «Estado».
- `EstadoPaciente` pasa a recibir el estado de la inscripción y a mapearlo a binario + `title`.

## Base — una migración, aditiva

- `enrollments` suma `closed_at`, `closed_reason`, `closed_by` y `closed_from_status`. Columnas
  propias y no una línea en `notes` (que es lo que hace hoy `discontinue_enrollment`), porque esto es
  traza regulatoria y se consulta.
- `close_enrollment(p_enrollment_id uuid, p_reason text)` — `SECURITY DEFINER`, misma autorización
  que `discontinue_enrollment` (gerencia / track-admin / operator asignado): setea el estado según el
  motivo, sella quién, cuándo y **de qué estado venía**, y borra en la **misma transacción** las
  visitas futuras.

  **Qué es «una visita futura», exactamente:** `kind = 'programada'`, `real_date is null` y
  `coalesce(window_end, estimated_date) >= current_date`. Las sueltas no se tocan (no salen del
  cuadro), lo atendido tampoco, y una con la ventana ya vencida queda donde está: esa ya produjo su
  alerta y el camino es archivarla con motivo y autor.
- `reopen_enrollment(p_enrollment_id uuid)` — devuelve la inscripción **al estado que tenía antes del
  cierre** (`closed_from_status`) y limpia el sello. Reabrir una que se cerró en screening tiene que
  volver a `screening`, no a `activo`: son dos cosas distintas y la de arriba dispara el cronograma.
- `discontinue_enrollment` **queda intacta**: la usa el desenlace «fallo de screening» de la visita.

**Orden de despliegue: la migración va PRIMERO.** Es puramente aditiva —columnas y funciones nuevas
que ningún front desplegado consulta— y el que no funciona sin ella es el front nuevo.

Dos trampas a revisar al escribirla, las dos con antecedente en este repo:

- `closed_by` es una FK nueva **desde** `enrollments` hacia `users`. El gotcha conocido es agregar una
  FK a una tabla **ya embebida** en un `select`, que vuelve el embed ambiguo (`PGRST201`). Acá la FK
  sale de `enrollments`, y nadie embebe `users` desde `enrollments` — pero hay que confirmarlo
  grepeando los `select(...)` del front antes de aplicar.
- Adentro de la función, calificar todo lo que no sea de `public` ni `pg_catalog`, y usar
  `gen_random_uuid()` si hiciera falta un uuid en runtime.

## Fase 0 — corregir lo que ya pasó en producción

Va **antes** que el código: la app tiene que decir la verdad desde hoy, no dentro de tres días.

Son dos pasos y ninguno es masivo por categoría (regla dura del repo: nunca barrer «todo lo de tipo
X»). La lista de pacientes a corregir **sale del `audit_log`**, que tiene exactamente las filas que el
Director cambió y cuándo — no de un `where status = 'inactivo'`, que barrería también bajas
legítimas anteriores:

1. Sonda de sólo lectura sobre `audit_log`: qué pacientes pasaron a `inactivo`, quién y cuándo.
2. Con esa lista explícita: volverlos a `activo` como personas y marcar sus inscripciones de
   ACT18301 como `completado`, con motivo «Pasó a la extensión».

## Tests

Sólo lo que puede fallar **en silencio** —lo que falla a la vista se verifica mirando—:

- La derivación «persona activa = alguna inscripción abierta», incluida la persona con dos
  inscripciones en estados distintos.
- El mapeo motivo → estado: si queda al revés, la pantalla se ve perfecta y el dato miente.
- Qué visitas entran en el borrado: atendidas nunca, ventana vencida nunca, futuras sin atender sí.
  Esta regla vive en SQL, así que no la cubre `vitest`: se prueba corriendo la función contra
  **PGlite** (Postgres real en WASM) en el scratchpad, antes de pasarle la migración al Director.

## Fuera de alcance

- Cerrar varias inscripciones de una (acción masiva desde el listado). El Director eligió la ficha
  como única puerta; si cerrar de a ocho duele, se evalúa después con el caso en la mano.
- Tocar el filtrado de alertas por estado de inscripción: la decisión del 2026-09-05 sigue en pie.
- Borrar `patients.status` de la base.
