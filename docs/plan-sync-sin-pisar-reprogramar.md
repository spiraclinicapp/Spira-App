# Plan · Sincronizar el cronograma sin pisar las fechas que se dieron a mano

Pendiente que dejó «Cancelar turno» (`docs/plan-cancelar-turno.md`, NOT in scope; `TODOS.md`, P2): **«Generar /
actualizar cronograma» le devuelve la fecha teórica a toda visita automática sin atender que alguien movió a mano.**
Un turno acordado con el paciente vuelve a la fecha del cronograma sin aviso, y el preview lo cuenta como «visitas a
mover (no atendidas)», igual que un desfase de verdad.
Revisado con `/plan-eng-review` el 2026-10-16, en modo «la recomendada» (preferencia del Director), con una segunda
opinión independiente (subagente Claude; Codex no está en esta máquina) que cambió tres decisiones. Las decisiones
técnicas van auto-decididas con su porqué; las de producto quedan como **preguntas abiertas** al final, cada una con
la recomendación. **Las cinco, decididas por el Director el 2026-10-17 con la recomendada. En prod el 17: la #512
(`8118a23`) y la 0163, aplicada y confirmada por la API sin sesión. Queda el QA con sesión del preview (T3).**

> ⚠️ **Hasta la 0163 (ya aplicada el 17): no sincronizar los cuatro estudios de la prueba real** (LTS17231, ACT18301,
> 222714, Victorion). El cruce del listado (`supabase/scripts/pacientes-prueba-real/generar.mjs`, aplicado el
> 2026-09-28) les puso a las visitas pendientes **la fecha del listado del sitio**, con la ventana del cronograma. Un
> «Generar / actualizar cronograma» de antes de la 0163 las habría devuelto a la fecha teórica.

## Por qué pasa hoy

`sync_protocol_schedule` (última definición: `0161_cancelar_turno.sql` § 6, `:294-383`) compara cada visita automática
sin atender con la fecha que le daría el cronograma **ahora**, y pisa toda diferencia:

```sql
-- 0161:355-367, el MOVER
update public.patient_visits pv
   set estimated_date = case when pv.turno_cancelado_at is null then e.randomization_date + vd.offset_days end, …
 where … and pv.real_date is null
   and ((pv.turno_cancelado_at is null and pv.estimated_date is distinct from e.randomization_date + vd.offset_days)
     or …ventana distinta…);
```

La base **no guarda de dónde salió la fecha**. Una visita que el cronograma puso el 20 y Recepción reprogramó al 23 se
ve igual que una que quedó en el 20 cuando la definición pasó del día 28 al 35: las dos difieren de la teórica. El sync
no las puede separar, así que mueve las dos.

Quién mueve `estimated_date` de una programada, fuera del sync:

| Camino | Dónde | Toca la ventana |
|---|---|---|
| «Reprogramar» (`RescheduleModal`) y «Traer visita» (`FormTraerVisita`) | `rescheduleVisit`, `data/visits.ts:353` | No, a propósito (la ventana es del sponsor, `:343-345`) |
| La fecha del encabezado de la visita | `setEstimatedDate`, `data/visits.ts:384` (desde `VisitHeader.tsx:244`) | No |
| Llegada adelantada | `registrar_llegada_adelantada`, `0155:210` (la pasa a hoy) | No |
| «Volver» de una llegada adelantada | `retroceder_etapa_visita`, `0160:51` (le devuelve la citación) | No |
| Cancelar turno | `cancelar_turno_visita`, `0161` (la vacía) | No |
| El cruce de la prueba real | `generar.mjs:697-730` (fecha del listado) | **Sí, con la del cronograma** |
| Una pestaña con el bundle viejo, el editor de SQL | cualquiera de los de arriba, o a mano | — |

Y quién **da** la fecha del cronograma: `generate_patient_visits` (trigger de `enrollments`, `0029:47`, al randomizar) y
el sync (`INSERT` y `MOVER`). Los dos escriben la fecha **y la ventana juntas**. En la app nadie más toca la ventana; el
script de la prueba real la escribió consistente con el cronograma (`:728-730`).

## Qué cambia

```
                           ┌─────────────────────────────────────────────┐
  generate / sync  ──────► │ patient_visits                              │
  (dan la fecha)           │   estimated_date        = 23 oct  ◄──────── Reprogramar, encabezado, Traer visita,
                           │   fecha_del_cronograma  = 20 oct  (nueva)   llegada adelantada… (nadie las toca)
                           └─────────────────────────────────────────────┘
                                              │
         sync: ¿estimated_date = fecha_del_cronograma?   (si la columna está vacía, la deduce de la ventana: D6)
                     │                 │                     │                    │
                    sí               no                 tiene llegada,      turno cancelado
              (la puso el       (alguien la movió)      «No vino» o listo   (0161)
               cronograma)              │                     │                 │
                     ▼                  ▼                     ▼                 ▼
              MUEVE la fecha     CONSERVA la fecha     CONSERVA la fecha   sigue sin fecha
              y la ventana       mueve la ventana      mueve la ventana    mueve la ventana
              anota la teórica   anota la teórica      anota la que TENÍA  anota la teórica

  Preview:  2 visitas a crear · 5 cambian de fecha · 3 conservan la fecha que se les dio a mano
            · 1 conserva su fecha porque ya tiene algo marcado · 0 a borrar
            ⚠ 1 de las que conservan su fecha queda fuera de su ventana nueva: Ana Pérez · V5 W12 · 20 oct
```

## Step 0 · Alcance

| Subproblema | Qué ya existe | Se reusa |
|---|---|---|
| Separar «a mano» de «cambió la definición» | Nada: falta el dato. La ventana lo dice a medias (D6) | La ventana, para las filas de antes de la 0163 |
| No pisar una fecha | La rama del turno cancelado de la 0161 (`case … else`) | Se generaliza: «no se mueve» pasa a ser una clase de fila |
| Mover la ventana igual | El MOVER de la 0161 ya separa fecha y ventana | Tal cual |
| Mostrar nombre y visita sin pasar por encima de la RLS | `v_track_visits` (`security_invoker`) | Se piden por `id` |
| Probar la migración | `scripts/banco-rls/` (`casos-0161.mjs` como molde) | Tal cual |
| Pasarla sin que quede comentada | `scripts/sql-sin-comentarios.mjs` | Tal cual |

**Mínimo que cumple el pedido:** una columna, dos funciones re-declaradas (`generate_patient_visits` y
`sync_protocol_schedule`), una de lectura nueva que clasifica, y el modal. **Ningún escritor de fechas cambia y la
migración no escribe ningún dato.**
**Archivos:** la 0163, `casos-0163.mjs`, `supabase/README.md`, `data/visitDefinitions.ts`, `ScheduleSyncModal.tsx`,
un archivo de reglas puras con su test y `TODOS.md`. Siete, sin clases ni servicios nuevos: no dispara el chequeo de
complejidad.
**Búsqueda:** sin búsqueda web (es lógica de dominio). El patrón es de manual: guardar el valor derivado que se
asignó y comparar contra él, en vez de inferir el origen de una diferencia **[Layer 1]**.
**TODOS:** cierra «Coordinación · Cronograma: sincronizar deshace los «Reprogramar»». No bloquea ni es bloqueado por
«Reposición con el turno cancelado».

## Decisiones técnicas (auto-decididas con la recomendada)

**D1 · El dato: la fecha que le dio el cronograma (`fecha_del_cronograma date`).** «A mano» = `estimated_date` distinta
de esa columna. Es la decisión de fondo:

| | **B · guardar la fecha del cronograma (elegida)** | A · sello por trigger | A′ · sello desde el front | C · deducirla siempre de la ventana | 0 · sólo avisar en el preview |
|---|---|---|---|---|---|
| Qué guarda | La fecha que el cronograma le dio la última vez | `fecha_a_mano_at` cuando cambia la fecha y no es el sync | Lo mismo, escrito por `rescheduleVisit` y `setEstimatedDate` | Nada | Nada |
| Cubre todos los caminos | **Sí, por construcción**: la regla mira cómo quedó el dato | Sí, si el trigger sabe quién escribe (variable de sesión del sync) | No: llegada adelantada, «Volver», una pestaña vieja, el editor y el script no sellan | Sí | — |
| «Volver» que devuelve la citación original | Vuelve a ser del cronograma (es su fecha) | **Queda sellada**: cambió, aunque volvió a la del cronograma | Depende de cada escritor | Bien | — |
| Si la definición cambia el tamaño de la ventana | Bien | Bien | Bien | **Deja de poder deducir y las mueve, en silencio** | — |
| Toca escritores | Ninguno | Ninguno (un trigger nuevo + la variable en el sync) | Dos funciones del front y tres RPC | Ninguno | El modal |
| Arregla el problema | Sí | Sí | A medias | Casi siempre | **No**: lo cuenta, no lo evita |

B es la jugada de la 0161 (D1 de ese plan): **la regla vale por cómo queda el dato, no porque cada camino se acuerde.**
A se parece, pero la pregunta que guarda («¿la tocó una persona?») no es la que importa: «Volver» toca la fecha para
devolverla a la del cronograma, y A la daría por movida. C es B sin columna, leyendo la ventana como fecha teórica
vieja: se rompe justo cuando alguien cambia el tamaño de la ventana, que es uno de los motivos para sincronizar. Se usa
sólo para las filas que todavía no tienen la columna (D6). 0 es lo que el pedido llama «como mínimo»; con B el preview
lo distingue igual (D8) y además el sync no las pisa.

**D2 · Qué cuenta como «a mano»: toda fecha que no es la del cronograma, venga de donde venga.** Reprogramar, el
encabezado, «Traer visita», la llegada adelantada, una pestaña vieja, el editor y el script quedan cubiertos sin
tocarlos.
- **Una visita que nació libre** (`schedule_protocol_visit`, `0030:28`, no pone ventana) y después su definición pasó a
  automática: su fecha la eligió una persona, y se respeta (D6 no puede deducir nada: queda vacía, y la comparación es
  `is distinct from`).
- **El límite, a la vista:** una fecha puesta a mano que coincide con la del cronograma no se distingue de una que
  nunca se movió, y sigue al cronograma. Es su fecha: si la definición cambia, la acompaña.

**D3 · Con una fecha a mano, el sync conserva la fecha, mueve la ventana y anota la teórica nueva.**
- La ventana es del sponsor (`data/visits.ts:343-345`): se mueve igual que en el turno cancelado (D4 de la 0161).
- `fecha_del_cronograma` pasa a la teórica de hoy en las visitas **del cronograma, a mano y canceladas**. Así, si
  después alguien reprograma una justo a la fecha nueva del cronograma, vuelve a acompañarlo; y una cancelada que se
  reprograma a su fecha vieja después de un cambio de definición queda como «a mano», que es lo que pasó.
- **En las marcadas (D4) NO**: ahí se anota la que tenía (la deducida, si estaba vacía). Si después se desmarcan
  («No vino» deshecho, `mark_no_show`, `0067:91`; «Volver» desde Concurrió, que la 0160 deja hacer desde cualquier día),
  vuelven a estar donde el cronograma las había puesto y el próximo sync las acompaña. Anotarles la teórica nueva las
  dejaba «a mano» para siempre y el preview mentía («se les dio a mano»). *(Segunda opinión, punto 2.)*

**D4 · Una visita con algo marcado tampoco cambia de fecha** (llegada, «listo para irse» o «No vino»). *De paso, en la
misma condición.* Hoy la única guarda es `real_date is null`, así que el sync:
- le mueve la fecha a una visita **en Concurrió o En atención** (llegada marcada, sin `real_date`): sale de la lista
  de hoy con el paciente en el centro;
- le mueve la fecha a un **«No vino»**: la falta del 20 pasa a decir 27, quizás en el futuro. Es el registro de un
  día, y la app es auditable.
La ventana se mueve igual (de ella sale `ventana_vencida`, que es lo correcto). Es consistente con los CHECK de la 0161:
una cancelada no tiene marcas y un «No vino» no se cancela, así que no hay estados trabados.

**D5 · Quién escribe la columna: sólo los dos que dan la fecha del cronograma.**
- `generate_patient_visits` re-declarada (la de la `0029:47-64` tal cual + la columna en el `INSERT`). Cubre el caso que
  D6 no: una visita randomizada después de la 0163, reprogramada, y una definición que cambia el tamaño de su ventana
  antes del primer sync. Si alguna vez se re-declarara sin la columna, la visita cae en D6 y se deduce bien: la falla
  es benigna.
- `sync_protocol_schedule`: el `INSERT` y el `UPDATE`.
- **Sin trigger.** Un `BEFORE INSERT` que la copiara de `estimated_date` cuando hay ventana también andaría, pero
  descansa en que «tiene ventana» quiere decir «lo generó el cronograma». Explícito sobre ingenioso.

**D6 · Las filas de antes de la 0163: la ventana, leída al clasificar, sin relleno.** Ningún camino a mano toca la
ventana, así que la ventana guarda la fecha teórica de la última vez que el cronograma escribió: `window_start +
window_minus`, si da lo mismo que `window_end - window_plus` (o sea, si el tamaño de la ventana no cambió desde
entonces). Mientras la columna esté vacía, la clasificación usa eso:

```sql
coalesce(pv.fecha_del_cronograma,
  case
    when pv.window_start is null or pv.window_end is null then null                -- nació libre (D2)
    when pv.window_start + vd.window_minus = pv.window_end - vd.window_plus
      then pv.window_start + vd.window_minus                                         -- la que le dio el cronograma
    else pv.estimated_date                                                           -- no se puede saber: como hoy
  end)
```

| Fila de antes | Se deduce | El próximo sync |
|---|---|---|
| Nunca se movió, definición sin cambios | = su fecha | Nada que mover |
| Reprogramada, definición sin cambios | la teórica, ≠ su fecha | **La conserva** |
| Fecha del listado (prueba real) | la teórica, ≠ su fecha | **La conserva** |
| Nunca se movió, el `offset` cambió y no se sincronizó | la teórica VIEJA, = su fecha | La mueve, como hoy |
| Reprogramada, el `offset` cambió y no se sincronizó | la teórica vieja, ≠ su fecha | **La conserva** |
| El tamaño de la ventana cambió y no se sincronizó | = su fecha | La mueve, como hoy (no se puede saber) |
| Turno cancelado | (no hace falta) | Sigue sin fecha (0161) |
| Nació libre | vacía | La conserva (D2) |

El primer sync que se aplica en cada estudio **anota** la columna en las filas que toca (D3), y desde ahí deja de
deducir. **Por qué no un relleno en la migración** (era la versión anterior de este plan; segunda opinión, puntos 4, 9
y 10): escribía ~1.000 filas con su línea de auditoría y el trigger de `updated_at` apagado; volver a correrla después
de un cambio de ventana deshacía lo rellenado; y su sonda daba `false` con las canceladas de ventana cambiada. Leída al
clasificar, la deducción da lo mismo en cada caso de la tabla, la migración no escribe datos y correrla de nuevo no
cambia nada. Su única trampa sigue en pie: una ventana con los dos lados movidos en sentidos opuestos y la misma
cantidad (−3/+3 → −5/+1) deduce una fecha corrida; la visita sale como «a mano» y el sync la conserva. Se ve en el
preview; no se pierde.

**D7 · Una sola clasificación para contar y para aplicar.** Hoy el conteo del preview y el `UPDATE` repiten la
condición, y ya divergieron una vez: el MOVER no pedía la fecha de randomización que el preview sí pedía, y el sync
entero reventaba (lo encontró el banco con la 0161). Con cuatro conteos nuevos, repetirla cinco veces es buscarse otra.
Una función de lectura, `cronograma_por_sincronizar(p_protocol_id)`, devuelve cada visita sin atender del alcance
(programada, de definición automática, de inscripción activa con fecha de randomización) con su fecha teórica, su
ventana nueva, la fecha del cronograma vigente (D6) y su **clase**:

```
  turno cancelado ─────────────────────────────► 'cancelada'      (fecha NULL, no se toca)
  llegada / listo / «No vino» marcados ────────► 'marcada'        (D4)
  estimated_date ≠ fecha del cronograma (D6) ──► 'a_mano'         (D2)
  el resto ────────────────────────────────────► 'del_cronograma' (la única que cambia de fecha)
```

- El preview cuenta sobre ella y el `UPDATE … from cronograma_por_sincronizar(…)` aplica sobre ella: preview y aplicar
  cuentan lo mismo **por construcción**.
- **En modo aplicar, primero se bloquean las filas** (`perform … for update of pv` sobre las visitas sin atender del
  estudio) y recién después se clasifica. Un `UPDATE` que toma sus filas de una función no vuelve a evaluar las
  condiciones si otra sesión cambió la fila mientras tanto (las guardas viven adentro de la función, no sobre `pv`):
  sin el bloqueo, una visita atendida en ese instante podía cambiar de fecha igual. Hoy el `pv.real_date is null` de
  `0161:362` sí se re-evalúa. *(Segunda opinión, punto 8.)* El bloqueo dura lo que el sync: milisegundos, sólo al
  aplicar.
- `language sql stable`, sin `security definer`: si alguien la llamara directo, correría con su propia RLS. Igual va
  con `revoke all … from public, anon, authenticated`: es una pieza interna del sync, no una API. (En Supabase las
  funciones nuevas de `public` nacen ejecutables por `anon` y `authenticated`.) La llama el sync, que corre como su
  dueño.

**D8 · El contrato de la RPC: aditivo.** Las claves de hoy conservan su significado («lo que el `UPDATE` cambia»):

| Clave | Qué cuenta |
|---|---|
| `creates`, `deletes`, `attended_divergent`, `applied` | Lo de hoy |
| `moves` | Visitas a las que el `UPDATE` les cambia la fecha o la ventana. Mismo significado; ya no incluye las fechas conservadas que no cambian de ventana |
| `fechas` (nueva) | De ésas, las que cambian de **fecha** (clase `'del_cronograma'`) |
| `respetadas` (nueva) | `'a_mano'` cuya fecha difiere de la teórica: el sync de antes las habría movido |
| `con_marcas` (nueva) | `'marcada'` con la misma condición |
| `fuera_de_ventana` (nueva) | `id` de las `'a_mano'` a las que **este** sync les mueve la ventana y cuya fecha queda afuera |

- «Nada que aplicar» sigue siendo `creates + moves + deletes = 0`: la fórmula del modal no cambia.
- El `UPDATE` también escribe las filas donde sólo cambia la columna (anotar la deducida, o la teórica de una definición
  que se corrió sin cambiar la ventana). No se cuentan: es contabilidad, y si no hay nada más que aplicar, D6 sigue
  deduciendo lo mismo. *(Segunda opinión, punto 12.)*
- `respetadas` y `con_marcas` se repiten en cada preview mientras la fecha siga distinta de la teórica: dicen lo que el
  sync deliberadamente NO hace, y eso no caduca. `fuera_de_ventana` en cambio es un aviso que pide hacer algo, y sólo
  sale cuando este sync le cambia la ventana a la visita. Una reprogramada fuera de su ventana a propósito ya la avisó
  «Traer visita» (`FormTraerVisita.tsx:84`). *(Segunda opinión, punto 6, tomado a medias: P5.)*
- `fuera_de_ventana` son **ids**, no nombres: el sync es `security definer` y lo puede correr un admin de Coordinación
  que no coordina el estudio (`0161:298-301`), que por la RLS no ve esas visitas («ver visitas de mis protocolos»,
  `0146:347`). El modal pide nombre y código a `v_track_visits` por `id`, con la RLS de quien mira; si no ve ninguna,
  queda el número solo. **El modal no vuelve a calcular si está fuera de ventana**: `v_track_visits` todavía tiene la
  ventana vieja, y recalcular escondería justo las que el cambio dejó afuera. *(Segunda opinión, punto 5.)*
- `fecha_del_cronograma` no va a `v_track_visits` ni a `v_patient_visits`: nadie del front la lee. Las vistas se
  quedan como están (sus columnas salen de una lista fija, la 0144; una columna nueva en la tabla no las toca).

**D9 · Orden: la migración PRIMERO.** Es aditiva para el front de hoy: las claves que lee significan lo mismo y ninguna
columna que pida desaparece. En el rato entre la migración y el front, el modal viejo cuenta en «visitas a mover» las
conservadas a las que se les mueve la ventana: cosmético. El front nuevo sin la migración recibe una respuesta sin
`fechas`: el modal lo detecta y muestra las líneas de hoy, en vez de «undefined visitas». (Cuesta dos renglones y
cubre el error de orden que ya pasó con la 0068 y la 0092.)

**D10 · La migración no escribe ningún dato ni mueve ninguna fecha.** Lo que cambia es el próximo sync, y el admin lo
ve antes en el preview.

## Cómo sale en el preview

`ScheduleSyncModal.tsx`, con las líneas armadas por una función pura (`lineasDelPlan`, en `views/track/sincronizar.ts`):

| Línea | Cuándo | Copy (P5) |
|---|---|---|
| Crear | siempre, como hoy | «**2** visitas a crear» |
| Fechas | siempre | «**5** cambian de fecha (no atendidas)» |
| Sólo ventana | si `moves − fechas > 0` | «**4** sólo ajustan su ventana» |
| A mano | si `respetadas > 0` | «**3** conservan la fecha que se les dio a mano» |
| Marcadas | si `con_marcas > 0` | «**1** conserva su fecha porque ya tiene algo marcado» |
| Borrar | siempre, como hoy | «**0** visitas a borrar (no atendidas)» |
| Aviso (ámbar) | si `fuera_de_ventana` no está vacío | «1 de las que conservan su fecha queda fuera de su ventana nueva: Ana Pérez · V5 W12 · 20 oct.» |
| Aviso (ámbar) | como hoy | «2 visitas atendidas difieren del cronograma. Se dejan intactas.» |

- «Sólo ajustan su ventana» cuenta también las conservadas a las que se les mueve la ventana (D3). Va aparte porque
  sin esa línea, un cambio de tamaño de ventana daría «0 cambian de fecha» con «Aplicar» habilitado y sin decir por qué.
- Respuesta sin `fechas` (D9): las tres líneas de hoy.
- «Ya está al día» no cambia; si hay fechas conservadas, la línea «conservan…» va debajo, para que se sepa que no es
  un olvido.

## La migración 0163 · `sync_respeta_fechas_a_mano.sql`

Aditiva, sin datos. **Va PRIMERO, antes del front.** En orden de dependencias, cada sentencia idempotente (el editor no
tiene una transacción que abarque el archivo):

1. `alter table public.patient_visits add column if not exists fecha_del_cronograma date` + su `comment on column`.
2. `generate_patient_visits`: la de la 0029 tal cual + la columna (D5). Mismo `search_path`, mismo trigger (no se toca).
3. `cronograma_por_sincronizar(p_protocol_id uuid)`: `language sql stable`, `set search_path = pg_catalog, public`,
   todo calificado; `revoke all … from public, anon, authenticated` (D7).
4. `sync_protocol_schedule`: la de la 0161, con el bloqueo en modo aplicar, el conteo y el `UPDATE` sobre la función de
   3, la columna en el `INSERT` y las claves nuevas (D8). Lo de la 0161 (el turno cancelado, la guarda de
   randomización) queda dentro de la clasificación. `revoke`/`grant` y `comment` como hoy.
5. `notify pgrst, 'reload schema'`.

**Trampas de la casa, chequeadas al escribirla:** dollar-quotes en número par contando el crudo; ningún par de signos
peso dentro de un comentario; nada de `uuid_generate_v4`; el `returns table` de la función de 3 con nombres que no
choquen con columnas (calificar siempre, 0056/0058); el `select … into` del sync dispara el aviso de «tabla sin RLS»
del editor: **se corre sin activarla** (quinta trampa de `CLAUDE.md`).

**Cómo se le pasa al Director:** la copia sin comentarios (`node scripts/sql-sin-comentarios.mjs
supabase/migrations/0163_sync_respeta_fechas_a_mano.sql <salida>`), probada en el banco **aplicando esa copia**, con
la sonda en el mismo mensaje (decisión 101):

```sql
select
  exists (select 1 from information_schema.columns where table_schema = 'public'
          and table_name = 'patient_visits' and column_name = 'fecha_del_cronograma')                 as columna,
  (select prosrc like '%fecha_del_cronograma%' from pg_proc where proname = 'generate_patient_visits')    as generar,
  (select prosrc like '%cronograma_por_sincronizar%' from pg_proc where proname = 'sync_protocol_schedule') as sync,
  (select count(*) from pg_proc where proname = 'cronograma_por_sincronizar') = 1                        as clasificacion,
  not has_function_privilege('authenticated', 'public.cronograma_por_sincronizar(uuid)', 'execute')     as cerrada;
```

Las cinco en `true`. Y la confirmación **por la API sin sesión** antes de marcarla «Aplicada»: `patient_visits` con
`select=fecha_del_cronograma` tiene que dar `42501` y no `42703`, con una columna inventada al lado como control
(`gotcha-aplicada-sin-sonda`). Lo que la API no ve (el cuerpo de las funciones) lo dice la sonda.

Y, ya aplicada, cuánto conserva cada estudio (sólo lectura; el editor corre como dueño y puede llamarla):

```sql
select pr.code as estudio, c.clase, count(*) as visitas
from public.protocols pr, public.cronograma_por_sincronizar(pr.id) c
group by pr.code, c.clase
order by pr.code, c.clase;
```

## Medición (recomendada antes del primer sync, sólo lectura)

No pude medir prod desde acá: el navegador del preview no tiene permiso para abrir la app de producción. No hace falta
para decidir (D6 cubre los dos casos), pero dice cuánto se perdería hoy con un sync, y en los cuatro estudios de la
prueba real seguramente no es cero. Corre tal cual en el editor, no escribe nada y no trae datos de pacientes:

```sql
select pr.code as estudio,
  count(*) filter (where pv.estimated_date is distinct from e.randomization_date + vd.offset_days)       as difieren,
  count(*) filter (where pv.estimated_date is distinct from e.randomization_date + vd.offset_days
                     and pv.window_start = e.randomization_date + vd.offset_days - vd.window_minus
                     and pv.window_end   = e.randomization_date + vd.offset_days + vd.window_plus)       as movidas_a_mano,
  count(*) filter (where pv.window_start is distinct from e.randomization_date + vd.offset_days - vd.window_minus
                      or pv.window_end   is distinct from e.randomization_date + vd.offset_days + vd.window_plus) as sin_sincronizar,
  count(*) filter (where pv.arrived_at is not null or pv.ready_at is not null or pv.no_show_at is not null) as con_marcas
from public.patient_visits pv
join public.enrollments e on e.id = pv.enrollment_id
join public.visit_definitions vd on vd.id = pv.visit_def_id
join public.protocols pr on pr.id = e.protocol_id
where pv.kind = 'programada' and vd.date_mode = 'automatica' and pv.real_date is null
  and pv.turno_cancelado_at is null and e.status = 'activo' and e.randomization_date is not null
group by pr.code
order by pr.code;
```

`movidas_a_mano` es lo que hoy se perdería con un sync; `sin_sincronizar` > 0 dice que ese estudio tiene un cambio de
definición pendiente (ahí es donde D6 deduce la fecha vieja).

## Revisión

**1 · Arquitectura.**
- El corte vive en el dato (D1, D2): ningún escritor de fechas cambia, y los futuros (o un script) quedan cubiertos
  solos. El sync es el único lugar con lógica nueva, y su clasificación es una sola (D7).
- Concurrencia: el `UPDATE` sale de una función, así que el bloqueo previo es lo que impide mover una visita que se
  atiende en ese instante (D7). Hallazgo de la segunda opinión, tomado.
- Lo que se le devuelve al admin son conteos e ids; nombres, por la RLS (D8).
- Falla realista por camino nuevo: ver «Fallas posibles». Ninguna silenciosa sin banco.

**2 · Calidad.**
- DRY: la condición repetida del conteo y el `UPDATE` es justo lo que ya falló una vez (D7). Tomado.
- La rama del turno cancelado de la 0161 (`case when turno_cancelado_at is null then … end`) deja de ser un caso
  especial del `UPDATE`: pasa a ser una clase. Menos ramas, misma conducta (el banco la vuelve a probar).
- El modal: hoy arma el texto en el JSX. Las líneas pasan a una función pura (plural, condiciones, respuesta vieja),
  que es lo único del front que puede fallar sin verse (un «Aplicar» apagado con cambios pendientes).
- Descartado: la versión anterior arreglaba «de paso» que el conteo de borrados no pide `status = 'activo'` y el
  `DELETE` sí (`0161:331-337` contra `:369-373`). Es una rama muerta: `visit_def_id` tiene `on delete restrict`
  (`0002:125`) y `delete_visit_definition` borra las pendientes antes que la definición (`0026:163-164`), así que una
  programada huérfana no existe. *(Segunda opinión, punto 1.)*

**3 · Tests.** Framework: `vitest` (`npm run test`, dentro de `npm run build`) para lo puro; el banco PGlite
(`scripts/banco-rls/casos-0163.mjs`, molde `casos-0161.mjs`, fijado a la 0163: `crearBase({ hasta: 161 })`, foto,
aplicar la 0163 encima) para la base.

```
CÓDIGO                                                    FLUJOS
[+] 0163 sobre los datos de antes                         [+] El admin sincroniza
  ├ [GAP→banco] entra sin escribir ninguna fila             ├ [GAP→banco] sólo crear: las reprogramadas
  │    (audit_log igual) y la sonda da todo true            │    no se tocan y el preview las cuenta
  └ [GAP→banco] correrla dos veces: igual                   ├ [GAP→banco] cambió el offset: las del
[+] D6 · la deducción (columna vacía)                       │    cronograma se mueven, las de a mano no,
  ├ [GAP→banco] nunca movida → del_cronograma               │    y la que queda afuera sale en la lista
  ├ [GAP→banco] reprogramada → a_mano                       ├ [GAP→banco] cambió el tamaño de ventana:
  ├ [GAP→banco] fecha de listado (ventana teórica) → a_mano │    0 fechas, N ventanas, «Aplicar» habilitado
  ├ [GAP→banco] offset cambiado, sin mover → del_cronograma ├ [GAP→banco] un «No vino» y un Concurrió
  ├ [GAP→banco] offset cambiado + movida → a_mano           │    conservan su fecha (D4)
  ├ [GAP→banco] tamaño de ventana cambiado → del_cronograma └ [GAP→banco] fuera_de_ventana: sólo si este
  └ [GAP→banco] nació libre → a_mano                             sync le mueve la ventana
[+] generate_patient_visits                               [+] Las salidas de una fecha a mano
  └ [GAP→banco] randomizar → nacen con la columna = fecha   ├ [GAP→banco] reprogramada a la teórica nueva
[+] cronograma_por_sincronizar                            │    → vuelve a acompañar al cronograma (D3)
  ├ [GAP→banco] las cuatro clases                           ├ [GAP→banco] llegada adelantada → marcada;
  ├ [GAP→banco] fuera de alcance: inscripción cerrada,      │    «Volver» le devuelve la citación → del
  │    sin randomización, libre, atendida                   │    cronograma otra vez
  └ [GAP→banco] authenticated la llama → 42501              ├ [GAP→banco] «No vino», cambio de def, sync,
[+] sync_protocol_schedule                                  │    se deshace el «No vino» → del_cronograma
  ├ [GAP→banco] preview = aplicar, clave por clave          │    (D3, la anotada es la que tenía) [REGRESIÓN
  ├ [GAP→banco] a_mano: fecha igual, ventana nueva,         │    de la versión anterior de este plan]
  │    columna = teórica                                    ├ [GAP→banco] cancelada + cambio de def +
  ├ [GAP→banco] marcada con columna vacía: anota la         │    reprogramada a su fecha vieja → a_mano
  │    deducida, no la teórica                              └ [GAP→banco] nació libre, pasa a automática
  ├ [GAP→banco] sólo la columna distinta: se escribe al          → conserva su fecha, toma ventana
  │    aplicar otra cosa, y no se cuenta                  [+] Permisos (regresión)
  ├ [GAP→banco] cancelada: sigue NULL (regresión 0161)      ├ [GAP→banco] coordinadora sin admin → 42501
  ├ [GAP→banco] sin randomización: no revienta (0161)       ├ [GAP→banco] gerencia y track admin → corre
  └ [GAP→banco] creates/deletes/attended_divergent igual    └ [GAP→banco] equivalencia 0163 --control
[+] views/track/sincronizar.ts · lineasDelPlan                   sin diferencias de permisos
  ├ [GAP→test] plan vacío → «ya está al día»              [+] El modal
  ├ [GAP→test] respuesta sin `fechas` → las líneas de hoy   ├ [GAP→QA] con sesión, TEST-QA: el preview
  ├ [GAP→test] sólo ventanas → «Aplicar» habilitado         │    con una reprogramada
  ├ [GAP→test] singular / plural de cada línea              └ [GAP→QA] los nombres de fuera_de_ventana
  └ [GAP→test] conservadas sin nada más → «al día» + línea       por v_track_visits (y sin permiso: el número)

COBERTURA PLANEADA: 39/39 caminos con su prueba (banco 32, `equivalencia` incluida · vitest 5 · QA con sesión 2)
REGRESIONES: el sync de la 0161 (cancelada, guarda de randomización) → CRÍTICAS, en el banco
NO TESTEABLE EN EL BANCO: el bloqueo contra una sesión concurrente (PGlite es una sola conexión) → leído en la revisión
```

- `casos-0161` queda fijado a la 0161 y tiene que seguir 52/52; `casos-0158/0159/0160`, igual.
- `sembrar.mjs` llena columnas con valores al azar; `fecha_del_cronograma` al azar no rompe nada (no tiene CHECK), y los
  casos de la 0163 arman sus propias filas.

**4 · Rendimiento.** El sync corre por estudio, sobre cientos de visitas: una función `sql stable` que se lee dos
veces (preview y `UPDATE`) en vez de cinco subconsultas, y un bloqueo de esas mismas filas sólo al aplicar. La
migración no escribe datos. El modal suma una consulta a `v_track_visits` por `id`, sólo si hay fuera de ventana. Sin
hallazgos.

## Segunda opinión (subagente independiente)

Un subagente Claude con contexto limpio leyó el plan y las migraciones que cita (Codex no está instalado). Doce
puntos; ocho tomados, dos tomados a medias, dos descartados:

| # | Hallazgo | Qué se hizo |
|---|---|---|
| 1 | El arreglo «de paso» de los borrados es para un estado imposible (FK `on delete restrict`, `0002:125`) | **Tomado**: fuera (Revisión 2) |
| 2 | Anotar la teórica en una marcada la deja «a mano» para siempre al desmarcarse | **Tomado**: D3 anota la que tenía |
| 3 | El script de la prueba real escribe fechas y ventanas; hoy un sync borraría las fechas del listado | **Tomado**: aviso arriba, tabla de escritores, D6 lo cubre |
| 4 | Más simple: deducir de la ventana al clasificar, sin relleno ni re-declarar `generate_patient_visits` | **A medias**: sin relleno (D6); `generate` sigue escribiendo la columna (D5) |
| 5 | El modal no puede recalcular «fuera de ventana» con la ventana vieja | **Tomado**: confía en los ids del servidor (D8) |
| 6 | `respetadas`, `con_marcas` y `fuera_de_ventana` se repiten en cada preview | **A medias**: el aviso sólo cuando este sync mueve la ventana; los conteos quedan (P5) |
| 7 | El `revoke` no tapa una filtración: la función no es `security definer` | **Tomado**: corregido el porqué (D7) |
| 8 | `UPDATE … FROM función` no re-evalúa una fila cambiada por otra sesión | **Tomado**: bloqueo previo (D7) |
| 9 | Volver a correr el relleno lo deshacía | Sin relleno: no aplica |
| 10 | La sonda del relleno daba `false` con canceladas | Sin relleno: no aplica |
| 11 | La columna se puede escribir desde el cliente (la policy de UPDATE es de fila entera) | **Descartado**: NOT in scope |
| 12 | El `WHERE` del `UPDATE` tiene que incluir «sólo la columna distinta» | **Tomado**: D8 |

**CROSS-MODEL TENSION** (dos, decididas con la recomendada):
- **`generate_patient_visits` (punto 4).** La segunda opinión la sacaría: con la deducción alcanza. Se queda, porque
  cubre el caso que la deducción no ve (una randomizada después de la 0163, reprogramada, y un cambio de tamaño de
  ventana antes del primer sync: se pisaría en silencio), y su propia falla cae en la deducción, que es benigna. Cuesta
  re-declarar veinte renglones.
- **Los conteos que se repiten (punto 6).** La segunda opinión contaría sólo lo que este sync cambia. Se quedan los dos
  conteos tal cual: «3 conservan la fecha que se les dio a mano» es lo que el sync deliberadamente no hace, no
  caduca, y no pide nada. El aviso ámbar con nombres sí pide hacer algo: ése sólo sale cuando es nuevo. Queda a la vista
  del Director en P5.

## Fallas posibles

| Camino nuevo | Falla realista | Test | Manejo | ¿Silenciosa? |
|---|---|---|---|---|
| D6 deducción | deduce mal la fecha vieja (ventana cambiada a los dos lados) | banco | la visita sale como «conserva su fecha» en el preview | no: se ve |
| D6 deducción | tamaño de ventana cambiado sin sincronizar + reprogramada | banco | se mueve, como hoy | **sí, residual y anotada** (fila de la tabla de D6) |
| `generate_patient_visits` | re-declarada sin la columna | banco | cae en la deducción, que acierta | no: benigna |
| `cronograma_por_sincronizar` | queda ejecutable por `authenticated` | banco + sonda (`cerrada`) | igual corre con su RLS | no |
| sync | preview y aplicar cuentan distinto | banco (clave por clave) | — | **sí, cubierta** (y D7 lo hace estructural) |
| sync | una visita atendida mientras corre | — (una conexión) | el bloqueo previo | **sí, cubierta por diseño, leída** |
| sync | una marcada queda «a mano» al desmarcarse | banco | — | **sí, cubierta** |
| sync | se pierde la rama del turno cancelado | banco (regresión 0161) | — | **sí, cubierta** |
| 0163 aplicada | copia comentada o cortada en el editor (0160, 0161) | — | copia sin comentarios + sonda + API sin sesión | no, si se corren |
| front | desplegado antes que la migración | vitest (respuesta sin `fechas`) | las líneas de hoy | no |
| modal | un admin sin acceso a esas visitas | QA | queda el número, sin nombres | no |
| prod, hoy | alguien sincroniza un estudio de la prueba real antes de la 0163 | — | el aviso de arriba | **sí: depende de que se lea** |

Una brecha crítica que no es del código: la última fila. Se cierra con la 0163; hasta entonces, el aviso.

## NOT in scope

- **Elegir, en el preview, cuáles mover igual** (P3). Si una fecha a mano tiene que volver a la del cronograma, se
  reprograma de a una.
- **Que el cliente no pueda escribir la columna** (segunda opinión, punto 11). La policy de UPDATE de `patient_visits`
  es de fila entera (`0146:344-346`), así que una coordinadora podría escribir `fecha_del_cronograma` con un PATCH a
  mano. No le da nada que no tenga: la misma persona ya puede escribir `estimated_date`, que es lo que la columna
  protege. Cerrarla pide un trigger que sepa si escribe el sync (como `lleva_ip`, 0119): ese costo no compra permisos.
- **Mostrar «Reprogramada · era el 20 oct» en la ficha o el cronograma.** El dato queda en la base; ninguna pantalla lo
  pide hoy. Si se quiere, es sumar la columna al final de `v_track_visits`.
- **Mover las visitas atendidas que difieren** (`attended_divergent`): sigue siendo sólo un aviso.
- **La rama de borrados del sync**: muerta por la FK (Revisión 2), se deja como está.
- **Reposición con el turno cancelado** (`TODOS.md`): sin relación con esto.

## What already exists

Se reusa: el MOVER de la 0161 (separa fecha y ventana), `v_track_visits` con su RLS, el banco y `casos-0161.mjs` de
molde, `sql-sin-comentarios.mjs`. Nuevo: la columna, `cronograma_por_sincronizar`, la re-declaración de
`generate_patient_visits` y `sync_protocol_schedule`, y `lineasDelPlan`.

## Paralelización

Implementación secuencial: el front lee las claves nuevas de la RPC, y la migración va primero con su sonda. Lo único
separable (`lineasDelPlan` y su test) son minutos.

## Preguntas al Director · decididas

**Decidido por el Director el 2026-10-17: «dale con lo recomendado».** Las cinco quedan con la opción recomendada. Se
dejan las alternativas a la vista para saber qué se descartó.

**P1 · ¿Qué fechas se respetan?**
- **(Recomendada) Toda fecha que no es la que puso el cronograma, sin importar cómo llegó:** «Reprogramar», «Traer
  visita», la fecha del encabezado, la llegada adelantada, las del listado de la prueba real. Es la única forma de
  cubrir también una pestaña vieja y lo que se corrija desde el editor (D1, D2).
- Sólo las de «Reprogramar». Pide marcar desde el front (A′ de D1): la corrección del encabezado, «Traer visita» y las
  fechas del listado se seguirían pisando.

**P2 · Si cambió la definición y una fecha acordada queda fuera de la ventana nueva, ¿qué pasa?**
- **(Recomendada) Se respeta igual, y el preview lo avisa con el nombre del paciente, la visita y la fecha.** La fecha
  la acordó una persona con el paciente; quien sincroniza decide si hay que volver a llamarlo, y la tiene a mano.
- Se respeta y sólo se cuenta («1 queda fuera de su ventana»), sin nombres: menos trabajo, pero hay que salir a
  buscarla.
- Ésa sí vuelve a la fecha del cronograma: el paciente tiene un turno que la base ya no dice.

**P3 · ¿Hace falta un «llevarlas igual a la fecha del cronograma»?**
- **(Recomendada) No.** Si una tiene que volver, se reprograma de a una. Un «todas» en el preview sería volver a
  tener el problema a un clic.
- Una casilla en el preview, apagada: «También mover las que se reprogramaron a mano».

**P4 · Una visita con la llegada o «No vino» marcados, ¿cambia de fecha al sincronizar?**
- **(Recomendada) No (D4).** Su fecha es el registro de ese día: moverla reescribe cuándo faltó o llegó. La ventana
  sí se mueve.
- Como hoy: se mueve con las demás.

**P5 · ¿Cómo lo dice el preview?**
- **(Recomendada) Las líneas de «Cómo sale en el preview»:** «N cambian de fecha», «N conservan la fecha que se les
  dio a mano», «N conserva su fecha porque ya tiene algo marcado», «N sólo ajustan su ventana», y el aviso ámbar con
  los nombres sólo cuando el cambio deja una visita afuera. Los dos «conservan» salen en cada preview mientras la
  fecha siga distinta: dicen lo que el sync no hace.
- Una sola línea para las dos causas: «N conservan su fecha (las reprogramaron o ya tienen algo marcado)».
- Que los «conservan» sólo salgan cuando este sync les cambia algo (la postura de la segunda opinión): más silencio,
  pero el que sincroniza para crear una visita no se entera de que hay fechas que el sistema cuida.

## Implementation Tasks

- [x] **T1 (P1, humano ~5 h / CC ~30 min)** — base — `0163_sync_respeta_fechas_a_mano.sql` (columna,
  `generate_patient_visits`, `cronograma_por_sincronizar`, `sync_protocol_schedule`) + `scripts/banco-rls/casos-0163.mjs`
  + `equivalencia.mjs 0163 --control` + fila del índice en `supabase/README.md` (sin «Aplicada» hasta la sonda y la API)
  - Surgió de: D1–D10; Revisión 2 (DRY); Revisión 3 (todo el banco); segunda opinión 2, 4, 8, 12
  - Verificar: `node scripts/banco-rls/casos-0163.mjs` aplicando **la copia sin comentarios**; dollar-quotes en par;
    `node scripts/check-migraciones.mjs`
  - Verificado (2026-10-17): `casos-0163.mjs` 35/35, con el archivo y con la copia sin comentarios (la que va a prod;
    primer renglón SQL, ningún `--`). La 0163 entra sobre los datos sembrados sin escribir ninguna visita ni línea de
    `audit_log`, y correrla dos veces da lo mismo. **Control:** contra una copia sin las clases `a_mano` y `marcada`
    (el sync de antes) fallan justo los 15 casos de la conducta nueva. `equivalencia.mjs 0163 --control` sin
    diferencias de permisos (2028 comparaciones, control 12/12; 5 fotos distintas con las mismas filas: la columna
    nueva de `patient_visits`). 6 marcadores de dollar-quote, en par; ningún signo peso en comentarios.
    `check-migraciones` al día. `casos-0158/0159/0160/0161` no se corrieron: están fijados a su migración y no
    cargan la 0163.
- [x] **T2 (P1, humano ~2 h / CC ~15 min)** — front — `SchedulePlan` con las claves nuevas (`data/visitDefinitions.ts`);
  `lineasDelPlan` en `views/track/sincronizar.ts` + `sincronizar.test.ts`; `ScheduleSyncModal` con las líneas, el aviso
  de fuera de ventana (nombres por `v_track_visits`, sin recalcular) y la respuesta vieja
  - Surgió de: D8, D9; «Cómo sale en el preview»; Revisión 3 (vitest); segunda opinión 5
  - Verificar: `npm run build` verde
  - Verificado (2026-10-17): `npm run build` verde (130 archivos de test, 2216 tests; `sincronizar.test.ts` con 11).
    En el preview, con un banco temporal (la RPC y `v_track_visits` simuladas, sin sesión; borrado antes de
    commitear): los cinco casos (completo con el aviso y los nombres, al día con conservadas y «Aplicar» apagado,
    respuesta sin la 0163 con las tres líneas de antes, aviso sin nombres cerrado en «.», sólo ventanas con «Aplicar»
    habilitado) salen como en «Cómo sale en el preview», sin errores de consola.
- [ ] **T3 (P1)** — verificación — la 0163 aplicada con su sonda en verde y la API sin sesión; QA con sesión del preview
  del sync (`p_apply = false`) sobre TEST-QA con una visita reprogramada, y en un estudio real **sólo el preview**
  - Verificar: el modal muestra «conservan la fecha que se les dio a mano»; nada se escribe en estudios reales
  - Hecho (2026-10-17): la 0163, aplicada por el Director con la copia sin comentarios. La API sin sesión ve la columna
    y `cronograma_por_sincronizar` (`42501`, con controles inventados en `42703` y `PGRST202`), y el Director vio en el
    editor el `prosrc` de las dos funciones re-declaradas con `fecha_del_cronograma` (`true`). El bundle de prod
    (`8118a23`) trae el modal nuevo. **Falta el QA con sesión del preview.**
- [x] **T4 (P3)** — docs — la entrada de `TODOS.md`, borrada en el cierre del 17 (bitácora del 16, §21-§23); este plan
  con sus casillas.

## Segunda vuelta: el detalle (0164)

Pedido del Director el 17/10, después de ver el preview en prod: «En este caso tiene que darte un listado de las que
se van a cambiar, de las que siguen igual en base a los cambios que estes intentando aplicar». Con la 0163 el
preview cuenta, pero no dice cuáles. Decidido con la recomendada (preferencia del Director), sin otra ronda de
`/plan-eng-review`: es la misma función, una clave más en la respuesta y la misma clasificación.

- **E1 · El servidor manda el detalle; la app pone los nombres.** La 0164 re-declara `sync_protocol_schedule` con
  `detalle`: un renglón por visita que se crea, cambia de fecha, conserva su fecha (cuando el sync de antes la habría
  movido) o sólo toma la ventana nueva. Cada visita va en un solo grupo, con la visita, la fecha de hoy, la nueva y
  el motivo. **Ids y fechas, sin nombres**, por la misma razón que `fuera_de_ventana` (D8): el sync es `security
  definer`. La app lee nombre e IVRS de `enrollments` con su RLS (un renglón por inscripción, no por visita: una
  lista larga no choca con el tope de filas de PostgREST).
- **E2 · Se calcula en el cliente: no.** El cliente no tiene `fecha_del_cronograma` ni la deducción de la ventana; repetir
  la clasificación en TypeScript es la duplicación que D7 sacó del SQL.
- **E3 · Las que no cambian en nada no se listan.** Sólo las cuatro clases de arriba; «siguen igual» son las que
  conservan su fecha, con su motivo: «se la dieron a mano», «tiene «No vino»», «ya tiene la llegada marcada», «ya está
  lista para irse».
- **E4 · El modal lista por grupo**: «2 visitas a crear», «5 cambian de fecha (no atendidas)», «3 conservan su fecha»,
  «4 sólo ajustan su ventana», cada una con sus renglones (nombre, IVRS, visita, «20 oct → 27 oct» o «23 oct · se la
  dieron a mano»). La que queda fuera de su ventana nueva lo dice en su renglón, en ámbar. Sin la 0164 (la respuesta
  no trae `detalle`) el modal queda como en la 0163.
- **Verificación:** `casos-0164.mjs` (10 casos, con la copia sin comentarios; el control que manda las conservadas a
  otro grupo hace fallar 7); `sincronizar.test.ts` (20); el modal en el preview con un banco temporal.
- **Orden:** la 0164 primero (aditiva: el front de hoy no lee la clave nueva), después el merge del front.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 10 decisiones técnicas auto-decididas; 6 hallazgos propios (DRY, concurrencia, D4 de paso, modal puro, sonda, aviso de prod); 12 de la segunda opinión, 8 tomados, 2 a medias, 2 descartados; 0 critical gaps de código (1 operativa: no sincronizar la prueba real hasta la 0163); 5 preguntas de producto, decididas por el Director con la recomendada (2026-10-17) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** segunda opinión de un subagente Claude (Codex no está instalado). Dos tensiones (`generate` y los
  conteos que se repiten), decididas con la recomendada y anotadas; la segunda queda a la vista en P5.
- **VERDICT:** ENG CLEARED — implementado (T1, T2, T4). Orden: 0163 en prod con su sonda en verde y la API, después el
  front.

NO UNRESOLVED DECISIONS
