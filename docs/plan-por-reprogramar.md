# Plan — El Resumen de Coordinación deja de mirar hacia adelante

Pedido del Director (2026-09-05): **rehacer el panel "Próximas visitas · 7 días"** del Resumen de
Coordinación y convertirlo en **"Por reprogramar"**.

> **Visitas por reprogramar** = visitas con el estado *Por reprogramar*, **o** visitas cuya fecha
> citada ya pasó y que todavía no fueron marcadas como atendidas o realizadas.

Es un cambio de eje, no un ajuste: la tarjeta pasa de anunciar *quién viene* a listar *qué quedó
sin resolver*. La columna derecha del mosaico —"lo que depende de otros"— se vuelve, abajo, trabajo
propio y atrasado. Se asume a sabiendas: no hay ninguna otra pantalla que junte estas visitas, y la
que más se mira es ésta.

Sin migraciones. Todo el dato necesario ya está en `v_track_visits`.

---

## Lo que ya existe (y por lo tanto no se reimplementa)

| Pieza | Dónde vive hoy |
|---|---|
| `no_show_at` en la vista | `v_track_visits` — 0067, reproyectada por la 0102 |
| Estado `por_reprogramar` | `computed_status`, rama 3 del `case` — 0102:86 |
| Chip clínico "Por reprogramar" / "No vino" | `VISIT_STATES` — `views/visitStates.tsx:30` |
| Fila de visita con teclado y link a ficha | `VisitSummaryRow` |
| Pie que despliega en la tarjeta (no navega) | `VerMasLocal` — `TrackResumenView.tsx` |
| Filtro por ámbito "Lo mío" | `esDeMisProtocolos` — `views/resumen/ambito.ts` |
| Etiquetas de día hacia atrás ("Ayer") | `dayGroupLabel` — `lib/dates.ts:222` |

**Lo único que falta en la base es una línea de TypeScript:** `no_show_at` no está declarado en
`TrackVisitRow` (`data/visits.ts`) aunque la vista lo emite desde la 0067. Es la misma ausencia que
en su momento hizo creer que la vista no traía `coordinator_id`.

---

## La regla

En columnas crudas, sin pasar por `computed_status`:

```
real_date is null
AND estimated_date is not null
AND ( no_show_at is not null  OR  estimated_date < hoy )
AND enrollment_status in ('activo', 'screening')
```

**Por qué no se filtra por `computed_status = 'por_reprogramar'`, que sería lo obvio:** el `case` de
la vista pone **ventana vencida por encima de por reprogramar** (0102, ramas 2 y 3). Una visita
marcada "No vino" cuya ventana *además* venció deja de tener estado `por_reprogramar` y pasa a
`ventana_vencida`. Filtrar por el estado dejaría afuera justo la que más necesita fecha nueva: la
que el paciente no vino *y* ya se pasó de ventana. Por eso la condición se escribe sobre
`no_show_at`, que es el hecho, y no sobre el estado, que es una lectura del hecho con prioridades.

`estimated_date is not null` deja afuera las visitas **sueltas** (`kind <> 'programada'`), que no
tienen fecha citada ni ventana. Hoy el agrupador de la tarjeta las descarta con un `continue`
silencioso; acá se descartan en la consulta, que es donde se ve.

---

## Decisiones tomadas

### D1 · Las de ventana vencida se muestran igual, aunque Alertas ya las liste

`ventana_vencida` es `real_date is null AND window_end < hoy`: entra de lleno en la definición. Y la
tarjeta de Alertas —columna izquierda, abajo— ya la muestra. **Se duplican, a propósito.**

Las dos listas piden acciones distintas sobre la misma fila: Alertas dice *hay un desvío que
documentar o descartar*; ésta dice *hay que darle fecha nueva*. Y tienen ciclos distintos: una
alerta **descartada** (0070) desaparece de Alertas y de la campana, y la visita sigue sin fecha —
si esta tarjeta la excluyera por estar "ya en Alertas", desaparecería de las dos.

Descartadas: excluirlas (esconde la reprogramación más urgente) y sacarlas de Alertas (vacía a
medias un submódulo que tiene su propio sistema de descartes y su campana).

### D2 · La más atrasada primero, sin límite hacia atrás

`order('estimated_date', ascending)`. Es una lista de trabajo pendiente: lo más viejo es lo más
grave. Sin corte hacia atrás — un corte a 30 días escondería lo peor sin decirlo, y esconder trabajo
es exactamente lo que esta tarjeta existe para no hacer. Lo que no entra en las tres filas lo dice
el pie, con su número.

### D3 · Sólo enrolamientos `activo` y `screening`

Es un filtro que **ninguna otra consulta de visitas tiene hoy**, y se agrega acá porque acá cambia
el resultado. Con una ventana de siete días hacia adelante, un paciente discontinuado no aparece;
con una lista sin límite hacia atrás, sus visitas abiertas encabezan la lista para siempre y nada
las cierra nunca. Una visita de alguien que salió del estudio no se va a reprogramar: listarla como
pendiente es inventar trabajo, y arriba de todo.

`completado` queda afuera por lo mismo: el enrolamiento cerró.

### D4 · Lista plana, sin agrupar por día

Es el punto donde esta tarjeta se aparta de la que reemplaza, y no por gusto. "Próximas visitas"
agrupaba por día porque en siete días hacia adelante varias visitas caen el mismo día y el
encabezado ordena. Hacia atrás pasa lo contrario: las fechas están dispersas, así que agrupar da
**un encabezado por fila** — tres encabezados para las tres filas que entran en la tarjeta.

En su lugar, **cada fila lleva su atraso**: `No vino · hace 12 días` / `Citada el 28/08 · hace 8
días`. Es el mismo dato que daba el encabezado, ocupando un tercio del espacio y diciendo además
cuánto hace, que es lo que decide a cuál agarrar primero.

**Consecuencia:** `views/resumen/recorte.ts` (`recortarGrupos`) y su test quedan sin ningún
consumidor. Se borran. Existían para un problema —cortar sin dejar un encabezado de día huérfano—
que esta tarjeta ya no tiene.

### D5 · El pie despliega, no navega

`VerMasLocal`, el mismo que usa Dispensaciones. El criterio ya está escrito en el archivo: el pie
navega sólo cuando la lista completa existe como pantalla. *Visitas del día* muestra **un día**, así
que mandar ahí desde una lista de atrasadas repartidas en semanas sería prometer una pantalla que no
va a mostrar lo que se estaba mirando.

La **fila** sí sigue navegando a `track/visitas` con `{visitId, visitDate}` — que es donde se
reprograma, desde el menú ⋮ de la fila. Ese salto ya funciona con fechas pasadas porque va con la
fecha puesta.

### D6 · El KPI sigue a la tarjeta

`KpiKey.visitas` → `reprogramar`. Rótulo **"Por reprogramar"**, subtítulo "sin atender fuera de
fecha", destino igual (`track/visitas`, chip "Visitas"). El punto pasa a ámbar cuando hay alguna,
como el de "Pendientes vencidos".

Es la regla que el propio archivo ya tiene escrita para el ámbito: *un número y su lista tienen que
contar lo mismo; si el KPI dice 7 y la tarjeta lista 3, el que está mal es el que mira.*

### D7 · `useUpcomingVisits` no se toca

Sigue viva y sin cambios: la usa el **buscador global** (`shell/search/searchIndex.ts:184`). El hook
nuevo se agrega al lado.

### D8 · El ámbito sigue con `esDeMisProtocolos`

Y ahora con más razón que antes: estas visitas tienen `real_date is null` por definición, y
`coordinator_id` lo sella la misma operación que escribe `real_date` (`start_visit_attention`,
0102). Filtrar con `loAtendiYo` vaciaría la tarjeta entera apenas alguien prenda "Lo mío" — el
mismo error que `esAlertaMia` documenta para Alertas.

---

## Qué se toca

### 1 · `src/data/visits.ts`

- Declarar `no_show_at: string | null` en `TrackVisitRow`, con el comentario de rigor citando la
  0067 (la vista ya lo emite; sólo faltaba el tipo).
- Hook nuevo `useVisitsPorReprogramar()`, al lado de `useUpcomingVisits`:

```ts
c.from('v_track_visits').select('*')
  .is('real_date', null)
  .not('estimated_date', 'is', null)
  .in('enrollment_status', ['activo', 'screening'])
  .or(`no_show_at.not.is.null,estimated_date.lt.${hoy}`)
  .order('estimated_date', { ascending: true })
  .order('patient_code', { ascending: true })
```

### 2 · `src/views/resumen/reprogramar.ts` — nuevo, con test

Dos reglas puras. Están acá y no adentro del JSX por el motivo de siempre: **invertidas no tiran
ningún error, dibujan la tarjeta prolija diciendo otra cosa.**

- `motivoDeAtraso(v, hoy): 'ausente' | 'atrasada'` — `ausente` si tiene `no_show_at` (el paciente no
  vino y se marcó), `atrasada` si sólo se pasó la fecha. Son dos hechos distintos y la fila los
  tiene que decir distinto: en el primero alguien ya hizo algo, en el segundo nadie tocó nada.
- `atrasoEnDias(estimatedDate, hoy): number` — un signo al revés diría "en 8 días" sobre algo que se
  atrasó hace 8, y se vería perfecto.

Tests: los dos motivos, el caso de la visita marcada ausente **con fecha futura** (se marcó por
error: es `ausente`, con atraso 0 o negativo, y no se rompe), el atraso de una fecha de hoy, y el
cruce de mes.

### 3 · `src/views/VisitSummaryRow.tsx`

Prop opcional `nota?: ReactNode`, dibujada donde hoy van los `ProcDots` (línea 3). **No compite por
ancho con la línea 2**, así que el presupuesto medido de esa fila —el que documenta su cabecera— no
se toca. La tarjeta nueva no pasa `procs`, así que en la práctica las dos líneas 3 no coexisten; el
comentario lo deja dicho.

### 4 · `src/views/TrackResumenView.tsx`

- `VisitasCard` → `PorReprogramarCard`. Cabecera con `CardHeader` (título **"Por reprogramar"** +
  contador a la derecha, como Dispensaciones), lista plana, `VerMasLocal` al pie.
- Cada fila: `VisitSummaryRow` con el chip clínico (`<VisitChip status={v.computed_status} compact />`,
  igual que hoy) y la `nota` de atraso.
- El KPI, según D6.
- Vacío propio: *"No hay visitas por reprogramar."*
  Vacío de ámbito: *"No hay visitas por reprogramar en tus protocolos."*
  `hayEnTodo`: `(porReprogramar.data ?? []).length > 0`.
- El `onChanged` del modal de visita refresca `porReprogramar` en lugar de `upcoming`.

### 5 · Bajas

- `src/views/resumen/recorte.ts` + `recorte.test.ts` (D4).
- `KPI_DESTINOS.visitas` → `reprogramar` en `views/resumen/destinos.ts` y su test.

---

## Verificación

`npm run build` verde (typecheck + vitest + build) **y** mirarlo en el preview: la tarjeta con
filas, vacía, en error, y con el alternador de ámbito en las dos posiciones.

Lo que **no** se puede verificar desde acá y hay que mirar en prod: cuántas filas trae de verdad la
consulta sin límite. Si la carga histórica dejó visitas sin `real_date` en enrolamientos activos, la
lista puede arrancar más larga de lo esperable — el pie lo va a decir con su número, que es
justamente para eso.

---

## Fuera de alcance

- Reprogramar **desde** la tarjeta. El gesto sigue siendo abrir la visita y usar el menú ⋮.
- Tocar Alertas, su campana o su sistema de descartes (ver D1).
- Cualquier filtro por `enrollment_status` en las otras consultas de visitas. La inconsistencia
  queda anotada acá a propósito: se agrega donde cambia el resultado, no en barrido.

---

## Nota de zona horaria

El `hoy` de la consulta es `todayISO()` (hora argentina), mientras que el `computed_status` de la
vista resuelve `ventana_vencida` con `current_date`, que es **UTC** y adelanta el día a partir de
las 21:00 AR. La inconsistencia es preexistente —viene de la 0004 y las migraciones sucesivas la
dejaron intacta a propósito, porque tocarla movería de estado visitas ya cargadas— y acá sólo se
nota en una franja de tres horas: entre las 21:00 y la medianoche, una visita puede mostrar el chip
"Ventana vencida" un día antes de que la condición `estimated_date < hoy` la levante. No se corrige
en este cambio; queda anotado para que no se diagnostique como un error de la tarjeta.
