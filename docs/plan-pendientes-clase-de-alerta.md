# Plan — Pieza 3: lo atrasado se muda a Pendientes como una clase de alerta más

Continuación de [`plan-por-reprogramar.md`](plan-por-reprogramar.md). Las piezas **1 y 2** están en
prod (PRs [#120](https://github.com/spiraclinicapp/Spira-App/pull/120) y
[#121](https://github.com/spiraclinicapp/Spira-App/pull/121), release `v0.55.0`): el submódulo se
llama **Pendientes** y el Resumen volvió a mirar hacia adelante. Falta lo que da sentido a las dos:
**que las visitas sin atender fuera de fecha vivan en Pendientes**.

> **Hoy no se ven en ninguna parte.** Al retirar la tarjeta "Por reprogramar" quedó un hueco
> deliberado: eran **49** en producción y sólo sigue visible el grado rojo (`ventana_vencida`), que
> ya era alerta. Este plan lo cierra.

**Una migración: la `0107`.** Es **aditiva** ⇒ va **primero**, el front después.

---

## El hallazgo que achicó la pieza a la mitad

El plan anterior definía "por reprogramar" en **tres** grados. Al ir a implementarlo aparecieron dos
hechos que dejan el tercero afuera:

**`window_start` y `window_end` son `not null`** (`0002_tables.sql:128-129`). Toda visita programada
tiene ventana. Así que el tercer grado —*pasó la fecha citada, la ventana sigue abierta*— es
exactamente **una visita dentro de su tolerancia**, que no es un desvío: la ventana existe para eso.
Una visita citada el lunes con ventana hasta el viernes y atendida el miércoles habría figurado como
alerta el martes, estando perfecta. Es la explicación más probable de buena parte de esas 49.

**Y ese grado no tiene estado propio:** el `case` de la vista lo resuelve como `proxima`, igual que
una visita de la semana que viene. Distinguirlo exigiría un valor nuevo en el enum `visit_status`, y
eso arrastra `ALTER TYPE ADD VALUE` en su propio archivo (la trampa de la 0053), recrear las dos
vistas, y **desplegar el front antes que la migración** — porque los **ocho** accesos del tipo
`VISIT_STATES[a.computed_status].color` **no tienen guarda** y con un valor desconocido tiran error.
(La única guarda que existe está en `visitStates.tsx:79`, dentro de `VisitChip`.)

Con dos grados, **nada de eso hace falta**: los dos ya son valores de `visit_status`.

---

## Lo que ya existe (y por lo tanto no se reimplementa)

| Pieza | Dónde vive hoy |
|---|---|
| El estado `por_reprogramar` | `computed_status`, rama 3 del `case` — 0102:86 |
| Su color y sus rótulos | `VISIT_STATES` — `visitStates.tsx:30` (`#8A5A3C`, "Por reprogramar" / "No vino") |
| La superficie teñida por severidad | `alertItemStyle` — ya toma cualquier tono vía `color-mix` |
| El tinte de la cabecera por la PEOR presente | `severidadMaxima` + `SEVERIDAD_TINTA` — `alertSeverity.ts` |
| Descartar, con huella y auditoría | `alert_dismissals` + `dismiss_alert` — 0070, firma actual en 0092 |
| El archivo de descartados, con restaurar | `TrackAlertsView`, panel "Descartados" |
| Los filtros y el buscador de la pantalla | `alertFilters.ts` — ya sirven para las dos listas |
| **Ordenar por gravedad** | `priorizarAlertas` — `visitRules.ts:86`, **con test y sin ningún consumidor** |

`alertSeverity.ts` ya dejó escrito el camino:

> *"⚠️ SI ALGÚN DÍA HAY UN TERCER TIPO DE ALERTA hay que agregarlo a `GRAVEDAD` y ordenarlo acá."*

Y la firma del RPC alcanza **tal cual**: `dismiss_alert(p_kind, p_visit_id, p_reason,
p_report_definition_id, p_detail)`. No se agrega parámetro ⇒ **no hay sobrecarga viva** (el gotcha de
`create or replace` con firma distinta).

---

## La regla

La clase de alerta de visita pasa de dos estados a **tres**:

```
computed_status in ('ventana_vencida', 'item_vencido', 'por_reprogramar')
```

- `ventana_vencida` — roja. Ya era alerta.
- `por_reprogramar` — **nueva**. El paciente no vino y todavía no tiene fecha nueva (`no_show_at`
  puesto, ventana sin vencer).
- `item_vencido` — ámbar. Ya era alerta. Es un **reporte** fuera de plazo sobre una visita atendida:
  no compite con los otros dos, que exigen `real_date is null`.

---

## Decisiones tomadas

### D1 · Dos grados, no tres

Ver el hallazgo de arriba. Lo que queda afuera es una visita **dentro de su ventana**, y la ventana
es la tolerancia. Con esto la migración se reduce a `dismiss_alert` y la huella.

### D2 · La huella de "no vino" ancla en `estimated_date`, no en `window_end`

`dismiss_alert` guarda `status` + `anchor` para que un descarte valga **sólo mientras la condición
sea la misma**. Para `ventana_vencida` el ancla es `window_end` y describe la condición. Para
`por_reprogramar` **no sirve**: la ventana todavía no venció, así que `window_end` está en el
**futuro** y no dice nada de lo que se descartó. Lo que define esa condición es **a qué cita no
vino**: `estimated_date`.

El ancla queda **por estado**, y es retrocompatible: los descartes ya guardados son todos
`ventana_vencida` con su `window_end`, y siguen leyéndose igual.

### D3 · Si después vence la ventana, la alerta VUELVE

Consecuencia directa de D2 y del `status` como parte de la huella: al pasar de `por_reprogramar` a
`ventana_vencida` el descarte deja de coincidir y la alerta reaparece, **ahora en rojo**.

Es lo correcto: la situación empeoró. Y es la dirección segura — una alerta que vuelve molesta; una
que se esconde es lo que la 0070 llama peligro regulatorio.

### D4 · `por_reprogramar` va segundo en `GRAVEDAD`

`['ventana_vencida', 'por_reprogramar', 'item_vencido']`. Un paciente que no vino y no tiene fecha
nueva pesa más que un reporte fuera de plazo: el primero es una visita del protocolo que no ocurrió,
el segundo es un dato que falta cargar.

*(El orden del `case` de la vista no dice nada al respecto: la rama 3 exige `real_date is null` y la
5 exige lo contrario, así que nunca compiten.)*

### D5 · La tinta de `por_reprogramar` reusa `--spira-acc-deep-warn`

`SEVERIDAD_TINTA` necesita una entrada nueva. El color del estado es `#8A5A3C`, un terracota que
**como texto no llega a AA** sobre papel y **no se aclara en tema oscuro** — el problema que ese
archivo ya documenta para el ámbar.

Se reusa el token `warn` en vez de crear uno nuevo. **Lo que se pierde es poco y lo que se conserva
es lo que importa:** el *fondo* de la cabecera sigue saliendo de `VISIT_STATES[severidad].color`, así
que una cabecera de "no vino" y una de "reporte vencido" **se ven distintas**; lo único que comparten
es el color del texto y el ícono. Y en los ítems de la lista la distinción es total, porque
`alertItemStyle` recibe el hex del estado.

### D6 · La campana recorta a 10, con el pie al submódulo

Corrige un defecto **preexistente**, no una consecuencia del ensanchamiento: el panel hace
`rows.map(...)` **sin recortar** y hoy ya renderiza 43 ítems. El badge no cambia —
`count > 9 ? '9+'` ya está topeado— pero el desplegable hay que scrollearlo entero para llegar al pie.

Las 10 salen ordenadas con **`priorizarAlertas`**, que existe con test y **no tiene ningún
consumidor**: esta pieza le da uno en vez de dejarla envejecer.

### D7 · El vocabulario de ítem sigue diciendo "alerta"

Se revisó acá, como quedó pendiente de la #121, y **se mantiene**: lo que se descarta sigue siendo
una alerta en la base (`alert_dismissals`, `dismiss_alert`, los motivos, el `audit_log`). El
contenedor es *Pendientes* y el ítem es una alerta de una clase — no hay contradicción.

### D8 · El catálogo de motivos NO se toca

Los cinco de la 0070 cubren esta clase, y uno le calza exacto: **"La visita se reprogramó"**. Sin
tocar el `check` del `reason` ⇒ una cosa menos en la migración.

---

## ⚠️ Decisión ABIERTA — necesita tu visto bueno antes de implementar

### D9 · ¿La clase filtra por `enrollment_status`?

En el plan anterior (D3) la lista de atrasadas se limitó a enrolamientos `activo`/`screening`,
porque las visitas abiertas de un paciente **discontinuado** encabezan para siempre y nada las
cierra. **Ese razonamiento vale igual acá**: un "no vino" de alguien que salió del estudio va a
alertar eternamente.

**Pero acá el filtro no es gratis:** `useVisitAlerts` **no filtra** `enrollment_status` hoy, así que
agregarlo **haría desaparecer alertas de ventana vencida que hoy se muestran**. Es un cambio de
comportamiento sobre datos clínicos existentes, y no lo decido solo.

Las tres salidas:

| | Qué implica |
|---|---|
| **A. Filtrar toda la clase** | Coherente y limpio. **Desaparecen alertas rojas que hoy están a la vista.** Habría que contar cuántas antes de aplicarlo. |
| **B. Filtrar sólo `por_reprogramar`** | Nada de lo que hoy se ve cambia, y la clase nueva no arrastra basura. El costo: dos reglas en la misma lista, y hay que poder explicar por qué. |
| **C. No filtrar** | Cero riesgo de esconder algo. Las visitas de discontinuados alertan para siempre — y son justamente las que el descarte de la 0070 existe para archivar, con motivo y autor. |

**Recomiendo C**, y me corrijo respecto del plan anterior: en una lista **que tiene descarte
auditable**, esconder por regla es peor que dejar que alguien archive con motivo. El filtro de la
pieza 1 tenía sentido porque aquella tarjeta **no tenía** cómo descartar; Pendientes sí.

---

## Qué se toca

### 1 · `supabase/migrations/0107_alerta_por_reprogramar.sql`

`create or replace function public.dismiss_alert(...)` — **misma firma**, cuerpo de la 0092 con dos
cambios:

- la validación acepta el estado nuevo:
  `if v_status not in ('ventana_vencida', 'item_vencido', 'por_reprogramar')`
- el ancla se elige por estado:
  ```sql
  v_anchor := case
    when v_status = 'por_reprogramar'
      then coalesce(v_estimated_date::timestamptz, '-infinity'::timestamptz)
    else coalesce(v_window_end::timestamptz,   '-infinity'::timestamptz)
  end;
  ```

Con el `select ... into` calificando `tv.*` (los nombres de un `returns table` compiten con los de
columna — el error de la 0056 y la 0058, dos veces el mismo).

**Aditiva y no breaking:** no toca ninguna tabla ni vista, y el front desplegado sigue funcionando
igual. **Va PRIMERO**, el front después: quien no anda sin ella es el front nuevo.

### 2 · `src/data/visits.ts`

`useVisitAlerts` suma `'por_reprogramar'` al `.in(...)`.

### 3 · `src/views/alertSeverity.ts` (+ test)

`AlertSeverity` suma el estado, `GRAVEDAD` queda en el orden de D4, `SEVERIDAD_TINTA` suma su
entrada. El test ya cubre el caso "un estado que no está en la lista se ignora"; se le agrega el
grado nuevo y el desempate de D4.

### 4 · `src/data/alertDismissalModel.ts` (+ test)

`isVisitAlertDismissed` elige el ancla por estado (D2). El `Pick` suma `estimated_date`.

**Es el cambio que más silenciosamente puede fallar de toda la pieza:** un descarte que compare
contra el campo equivocado **silencia de más** — y una alerta que no aparece no deja rastro en
pantalla. Test obligatorio de los cuatro cruces (estado × ancla).

### 5 · `src/shell/NotificationsMenu.tsx`

Recorte a 10 con `priorizarAlertas` (D6). El pie ya lleva al submódulo desde la #121.

### 6 · Lo que cambia solo, y hay que mirar

Al ensanchar `useVisitAlerts` se mueven **cuatro** pantallas sin tocarlas:

- **Pendientes** — la lista principal (el objetivo).
- **El Resumen de Coordinación** — la tarjeta de alertas y el KPI derivado.
- **Inicio** — la cifra de la tarjeta de Coordinación.
- **La ficha del paciente** — "Alertas del paciente" (`PatientFichaView:52`), que usa el mismo hook.

Las cuatro son deseables y consistentes. Se listan para que ninguna sorprenda en el QA.

---

## Orden de despliegue

1. **La `0107` primero** (aditiva). El front viejo no la nota.
2. **El front después.** Si se invirtiera, la lista mostraría los "no vino" pero **descartarlos
   fallaría** con *"Esa visita no está en alerta"* — degradado, no roto.

Como la migración va **primera**, el `.sql` puede viajar en la misma PR que el front sin riesgo. Es
el caso opuesto al de la 0092.

---

## Verificación

`npm run build` verde + mirar la pantalla. Lo que hay que ver, y con qué cuenta:

- En **Pendientes**, las visitas "No vino" aparecen con su superficie terracota, y la cabecera se
  tiñe por la peor presente.
- **Descartar una** funciona y pide motivo. Al recargar sigue descartada.
- **La huella:** reagendar una visita descartada la saca de la lista (cambia `no_show_at` y el
  estado). Dejar vencer la ventana de una descartada la **devuelve en rojo** (D3).
- **La campana** muestra 10 como mucho, las rojas arriba, y el pie lleva a la pantalla completa.
- El **conteo** del Resumen, el de Inicio y el de la campana tienen que **coincidir entre sí** con el
  ámbito en "Todo".

**Con la cuenta de coordinadora, no con la del Director** — la de él tiene los cinco módulos y tapa
las fallas de RLS.

---

## Fuera de alcance

- **El tercer grado** (atrasada con la ventana abierta). Ver D1; si alguna vez se quiere, es un valor
  nuevo de enum, dos archivos de migración y deploy front-primero.
- **Reprogramar desde la alerta.** El gesto sigue siendo abrir la visita. `RescheduleModal` ya es
  autónomo, así que es barato — pero es otra pieza.
- **El preselector de Pendientes** (pieza 4) y las **tareas** (pieza 5).
- **Renombrar el vocabulario de ítem** (D7).

---

## Apunte: una corrección al handoff del 2026-09-05

Ese handoff (y la bitácora) listan como trampa que *"la campana no filtra por ámbito, así que el
badge saltaría de 43 a ~90"*. **Es falso:** `badge = count > 9 ? '9+' : String(count)`, o sea el
badge **ya dice "9+"** y el ensanchamiento no lo mueve. Lo que crece sin tope es la **lista del
panel**, que hace `rows.map(...)` sin recortar. El problema es real, la descripción estaba mal — y
mandaba a mirar el lugar equivocado. Es lo que resuelve **D6**.
