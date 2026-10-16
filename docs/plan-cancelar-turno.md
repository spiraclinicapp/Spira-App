# Plan · Cancelar turno (sacar una visita del turnero sin borrarla del cronograma)

Pedido del Director, 2026-10-15: poder **sacar una visita del turnero** (la lista del día en Coordinación › Visitas)
**sin borrarla del cronograma** del paciente. La visita queda **pendiente, sin fecha, lista para reprogramar**.
Revisado con `/plan-eng-review` el mismo día, en modo «la recomendada» (preferencia del Director), con un barrido de
todos los lectores de `estimated_date` y una segunda opinión independiente (subagente Claude; Codex no está en esta
máquina). Las decisiones técnicas van auto-decididas con su porqué; las de producto quedan como **preguntas
abiertas** al final, cada una con la recomendación. **No hay código ni SQL todavía.**

## Por qué hoy no se puede

| Camino | Qué hace | Por qué no sirve |
|---|---|---|
| «Marcar como no vino» (`mark_no_show`, 0067) | Deja la visita **en su día**, marcada como falta, y la manda a Pendientes | Miente: el paciente avisó, no faltó. Y la visita sigue en la lista de ese día |
| «Reprogramar» (`RescheduleModal` → `rescheduleVisit`, `data/visits.ts:338`) | Mueve `estimated_date` | Siempre a **una** fecha: hay que inventarla |
| «Eliminar visita» | Borra la fila | Sólo sueltas: la policy «track borra visitas sueltas» (0022, reescrita en `0146:342`) no deja borrar programadas ni randomización |

Y la base **no deja** una programada sin fecha: `patient_visits_kind_shape` (`0030:19-23`) exige
`kind = 'programada' and visit_def_id is not null and estimated_date is not null`. Un `estimated_date = null` hoy
rebota con 23514.

## Qué cambia

```
 Por llegar, con turno ──[⌄] «Cancelar turno» ──► confirma en el lugar del ítem (como Eliminar / Volver de otro día)
                                                     «¿Cancelar el turno del 20 oct?»
                                                     «Sale de la lista de ese día y queda en Pendientes, sin fecha.
                                                      No se borra del cronograma.»      [Mantener turno] [Cancelar turno]
                                                                  │
                                                                  ▼
                       cancelar_turno_visita(visita)                          (0161, SECURITY DEFINER)
                         authz: gerencia, o operador de Coordinación que coordina el estudio (= mover fechas)
                         guardas: programada (D14) · por llegar · sin «no vino» · con turno ·
                                  sin pedido de medicación en curso · sin procedimientos realizados
                         escribe: citacion_cancelada = estimated_date · estimated_date = NULL ·
                                  turno_cancelado_at = now() · turno_cancelado_by = auth.uid()
                                                                  │
         ┌────────────────────────────────────────────────────────┼─────────────────────────────────────────────┐
         ▼                                                        ▼                                             ▼
  TURNERO (por construcción)                       ESTADO = «Por reprogramar»                        CRONOGRAMA DE LA FICHA
  sin estimated_date, sin real_date y sin          v_patient_visits, rama 3:                         la fila sigue en su lugar
  marcas: no entra en motivosDelDia /              no_show_at  OR turno_cancelado_at                 (se ordena por la citación vieja),
  motivosDelRango / diasDeLaVisita → ni Día,       → Pendientes, campana, ficha, Resumen y           fecha «—», pastilla «Sin turno»;
  ni Semana, ni Mes, ni cola del médico,           Estadísticas (en el período de la citación        «Próxima visita · V5 · Sin turno»
  ni Próximas visitas, ni «Se pasó la fecha»       vieja), con su rótulo: «Turno cancelado»
                                                                  │
                                                                  ▼
                       SALIDA = darle fecha, por cualquier camino: «Reprogramar» (cara principal del modal),
                       «Agendar» en Pendientes, «Una visita pendiente del estudio», la fecha del encabezado.
                       Un trigger limpia el sello cuando la visita vuelve a tener fecha (D9).
```

## Step 0 · Alcance

**Lo que ya existe y se reusa (no se reconstruye):**

| Pieza | Qué existe | Uso |
|---|---|---|
| Menú y su ejecución | `accionesDeVisita` (puro, con test) + `useAccionesDeVisita` (`correr`, `avisar`) | Ítem nuevo + un `case` |
| Confirmación en el lugar del ítem | `AccionDeVisita.confirmar` + `confirmacionDe` (`BotonEtapa.tsx:186-209`, 0160) | La pregunta de «Cancelar turno» |
| Molde de RPC | `registrar_llegada_adelantada` (`0155:210-263`): authz a mano, `for update`, guardas con mensaje | `cancelar_turno_visita` |
| Molde de guardas | `retroceder_etapa_visita` (0155/0160): procedimientos, dispensación | Las mismas consultas |
| Permiso de mover fechas | `coordinaElEstudio` (`lib/coordinaElEstudio.ts`) = la policy de UPDATE (`0146:344`) | Habilita el ítem |
| Estado «sin fecha nueva» | `computed_status = 'por_reprogramar'` (0066/0107) + su cadena: Pendientes, campana, ficha, Resumen, Estadísticas | El turno cancelado ES «por reprogramar» |
| Rótulo de una visita | `visitStateLabel` (`lib/visits.ts:478`): lo leen el cronograma y la pelotita | «Sin turno» en un solo lugar |
| Salida | `rescheduleVisit`, `RescheduleModal`, `FormTraerVisita`, la fecha del encabezado | Sin cambios: el trigger limpia el sello |
| Columnas nuevas en la vista | Patrón `self` de la 0158 (`v_track_visits`, columnas al final) | Las tres columnas |
| Re-declarar `v_patient_visits` | Bloque `format()` de la 0144 (`0144:190-260`) | Una rama del `case` |
| Banco de SQL | `scripts/banco-rls/` (`casos-0160.mjs`, `equivalencia.mjs`) | `casos-0161.mjs` |
| Aviso al pie | `avisar()` (`AvisoGlobal`) | «Turno cancelado: la visita quedó en Pendientes.» |

**Lo que falta:** la 0161 (tres columnas, dos CHECK, un trigger, la RPC, dos vistas y tres funciones re-declaradas
con un cambio cada una), un predicado (`turnoCancelado`), un ítem, un caso en `useAccionesDeVisita` y que una decena
de superficies digan «Turno cancelado» o «Sin turno» donde hoy dirían «No vino», «Agendada» o «—».

**Complejidad: ~26 archivos fuente, 0 componentes nuevos, 1 migración.** Supera los 8 del chequeo. Se evaluaron dos
versiones más chicas:
- **RPC + ítem + la rama de la vista, rótulos después: se descarta.** La cancelada aparecería en Pendientes, la
  campana y el modal **diciendo «No vino»**, y en el cronograma como «Agendada» y en el primer renglón (D5). Un
  rótulo equivocado en una app auditable es un dato falso con cara de dato ([[honestidad-datos-auditable]]).
- **La alternativa mínima de verdad: dejar la cancelada como `proxima`** y mostrarla sólo en Pendientes, como «Se
  pasó la fecha». Ahorra re-declarar `v_patient_visits` y `dismiss_alert` y casi todos los rótulos, a cambio de no
  estar en la campana ni en las alertas de la ficha, ni contar como pendiente. Es una decisión de producto: va como
  **P4**, con la recomendación.

**Alcance completo**, sin componentes nuevos: todo son reglas puras, copy y re-declaraciones de un cambio.

## Decisiones técnicas (auto-decididas con la recomendada)

**D1 · La fecha se vacía (`estimated_date = NULL`); no se marca encima de una fecha que sigue puesta.** Es la
decisión de fondo:

| | A · vaciar la fecha (**elegida**) | B · sello encima de la fecha vieja |
|---|---|---|
| Sale del turnero | **Por construcción**: toda consulta por fecha (servidor y cliente) la deja afuera sola | Sólo donde alguien se acuerde de filtrar el sello |
| Falla si un lector se olvida | La visita no aparece en una lista por fecha (y se ve en Pendientes, D3) | **La visita sale en un día en que nadie la espera**, con la lista prolija |
| Costo en la base | Aflojar el CHECK + que `sync_protocol_schedule` no la re-feche (D4) | Ninguno en la base; todo en los lectores |
| Lectores a tocar | Los que ordenan o rotulan (cronograma, campana, Pendientes) | Además, **todos** los que filtran por fecha: Día, Semana, Mes, cola del médico, Próximas visitas, Estadísticas, CSV, «Se pasó la fecha», «Traer visita» |

B tiene el modo de falla que la casa más teme (`dayVisitsFilter.ts:1-6`: «La lista se dibuja igual de prolija con el
paciente equivocado adentro»). A lo cambia por «falta en una lista por fecha», que es justo lo pedido, y el riesgo de
que desaparezca en silencio se cierra con D3. Es la misma jugada que `attended_at` NULL en la 0158 (D2 de ese plan):
la regla vale por cómo queda el dato, no porque cada pantalla se acuerde.

**D2 · Tres columnas.** `turno_cancelado_at timestamptz` (cuándo), `turno_cancelado_by uuid references users on
delete set null` (quién) y `citacion_cancelada date` (la fecha que tenía; como `citacion_antes_de_adelantar` de la
0155). Las tres van a `v_track_visits`. El «quién» no se muestra con nombre (la RLS de `users` oculta las filas
ajenas), pero la campana lo necesita para no avisarle a uno su propia cancelación (D17); el `audit_log` lo tiene
igual. `citacion_cancelada` hace falta para que la fila no salte de lugar en el cronograma (D5), para el período de
Estadísticas (D15), para la fecha que propone «Reprogramar» (D9) y para el texto «era el 20 oct».

**D3 · El estado es `por_reprogramar` (rama 3 de `v_patient_visits`), no uno nuevo.**
`0144:213-214` pasa de `no_show_at is not null` a `(no_show_at is not null or turno_cancelado_at is not null)`.
- Un valor nuevo del enum `visit_status` sería **breaking** (el front viejo no lo conoce: la 0068 dejó la Agenda en
  blanco) y pediría una migración aparte para el `ADD VALUE`.
- `por_reprogramar` ya significa «sin fecha nueva, hay que agendarla» (`visits.ts:124`), ya está en Pendientes, la
  campana, la ficha, el Resumen y Estadísticas, y ya cede ante `ventana_vencida` cuando la ventana cierra
  (`0144:212`). Lo único que dice mal es la CAUSA («No vino»): se corrige el rótulo, no el estado (D7).
- La alternativa (`proxima` + una clase sólo del front) es la P4.

**D4 · `sync_protocol_schedule` no re-fecha un turno cancelado.** Su MOVER (`0029:128-137`) compara
`pv.estimated_date is distinct from rando + offset`: un NULL es distinto, así que al sincronizar el cronograma le
devolvería la fecha teórica y **la visita volvería al turnero en un día que nadie acordó**. Se re-declara (copia de la
0029, la última definición) con un solo cambio: con el sello, `estimated_date` queda NULL y **la ventana sí se mueve**
(la ventana es del sponsor, `visits.ts:331-334`); el conteo del preview (`v_moves`, `0029:99-103`) cuenta igual que
el UPDATE, para que preview y aplicar digan lo mismo. `generate_patient_visits` no hace falta: sólo inserta si no
existe la visita de esa definición.
*Al implementar, de paso:* el banco mostró que el MOVER de la 0029 no pedía `e.randomization_date is not null`. Una
inscripción activa sin fecha de randomización y con automáticas pendientes (una definición pasada de libre a
automática, por ejemplo) recibía `NULL + offset` y el sync entero reventaba contra `kind_shape`, ya antes de la 0161.
El preview no la contaba (`desired` exige la fecha). La re-declaración le suma esa guarda, marcada, con su caso en
el banco: ahora aplicar toca lo mismo que cuenta el preview.

**D5 · Ordenar no es ubicar en el tiempo.** Hoy una sola función, `effectiveDate` (`lib/visits.ts:199-202`,
`estimated_date ?? real_date ?? ''`), sirve para las dos cosas. Con la cancelada se separan:
- **Para ordenar** (`orderVisits`, `flowWindow`): una función nueva, `fechaParaOrdenar`, con la citación vieja
  (`estimated_date ?? citacion_cancelada ?? real_date`). Sin ella la cancelada **se iría al primer renglón** del
  cronograma, arriba del screening, y `flowWindow` (`:416`) centraría el cronograma recortado en ella.
- **Para ubicar en el tiempo** (`todaySplit`, el `segState` de `PdVisitFlow`): `effectiveDate` queda como está y la
  sigue salteando (`:245-246`), porque una visita sin turno no tiene lugar en el tiempo. Si se usara la citación vieja
  acá, la cancelada podría salir como «Hoy · V5», como «Anterior: V5» (algo que nunca pasó) o pintar el tramo del
  flujo como hecho. `PdVisitFlow` (`:36`) deja su `eff()` propio y usa `effectiveDate` (DRY).

Y con eso:
- `visitStateLabel` (`:478`) devuelve **«Sin turno»** antes de mirar fechas (hoy diría «Agendada» o «En ventana»):
  la pastilla del cronograma y la pelotita (`VisitDot`).
- `ventanaAbierta` (`:384`) da `false` con el turno cancelado: la fila no se tiñe de verde. El verde dice «se puede
  hacer hoy» y siempre va respaldado por la palabra «En ventana» (`:503-513`); un turno cancelado primero necesita
  fecha. La urgencia de la ventana la dice el renglón de Pendientes (D10).
- La fila de «Estudios y pacientes» (`PdPatientRow`, `COLUMNAS_FILA_PACIENTE` en `visits.ts:271`) suma
  `turno_cancelado_at` y `citacion_cancelada` a sus columnas, para que el cronograma desplegado ordene bien. Anterior /
  Actualidad / Próxima son lugares en el tiempo: **no eligen nunca una cancelada** (hoy `ordered[todayIdx-1]`,
  `:75`, podría), y Próxima muestra la siguiente con fecha. La V5 sin turno está en el cronograma desplegado y en
  Pendientes.
- `currentVisit` (`:277-288`, la primera sin `real_date`) **la sigue eligiendo** si es la primera pendiente, y es
  correcto: es la próxima visita del paciente, y el «Reprogramar» del encabezado de la ficha
  (`PatientFichaView.tsx:156`) apunta justo a ella. Cambia el rótulo: «Próxima visita · V5 · Sin turno» en vez de
  la fecha «—» (`PatientFichaView.tsx:431-463`). El `title` de la fecha en el cronograma (`PdFullSchedule.tsx:108`,
  hoy «Citada para el —») dice «Turno del 20/10, cancelado el 15/10».
- La adherencia (`adherence`, `:291`) y `v_protocol_kpis` la siguen contando como planificada, a propósito: lo es.

**D6 · Un turno cancelado no recibe marcas: lo dice la base.** Un CHECK nuevo, `patient_visits_turno_cancelado`:
```
(turno_cancelado_at is null and citacion_cancelada is null)
or (turno_cancelado_at is not null and citacion_cancelada is not null and estimated_date is null
    and arrived_at is null and real_date is null and ready_at is null and no_show_at is null)
```
y `kind_shape` se afloja sólo para el caso cancelado:
`(kind = 'programada' and visit_def_id is not null and (estimated_date is not null or turno_cancelado_at is not null)) or (…sueltas igual…)`.
Juntos: **en una programada, sin fecha ⇔ turno cancelado**. Así `mark_arrived`, `mark_no_show`,
`start_visit_attention`, `registrar_llegada_adelantada` y `registrar_visita_en_otra_fecha` fallan fuerte sobre una
cancelada (desde una pestaña vieja, por ejemplo) en vez de dejar una visita «cancelada y atendida». El peor de esos
caminos perdería el dato para siempre: la llegada adelantada guarda la citación para devolverla al «Volver»
(`0155:257`), y una citación NULL no se guarda, así que deshacer esa llegada dejaría la visita con la fecha de hoy.
Se descartó re-declarar esas cinco funciones para que limpien el sello (el patrón de `mark_arrived` con el «no vino»,
0067): son cinco cuerpos más para un caso que la pantalla no ofrece (D8). El 23514 de este CHECK se traduce en un
helper de `data/dayVisits.ts`, que reconoce el nombre del constraint como hace `markNoShow` (`:366-373`): «La visita
tiene el turno cancelado: primero reprogramala.». Lo usan `errorDeEtapa` (`:386-392`), `markNoShow` y `markArrived`.
Datos legacy: ninguna fila tiene el sello y ninguna programada está sin fecha (lo prohíbe el CHECK de hoy), así que
los dos CHECK entran sin tocar datos.

**D7 · Mismo estado, dos causas, dos rótulos.** Un predicado puro `turnoCancelado(v)` en `lib/visits.ts` (al lado de
`marcaTardia`, sin cliente de Supabase) y los rótulos por causa:

| Dónde | Hoy | Turno cancelado |
|---|---|---|
| Pendientes, renglón (`TrackAlertsView.tsx:921-923`) | «Reporte de procedimiento fuera de plazo» (**bug actual**, ver abajo) | «Turno cancelado el 15 oct · la ventana cierra en 5 días · V3 W4» |
| Campana (`notificaciones.ts:73-74`, `:141-145`) | «No vino» + fecha de la cita | «Turno cancelado» + el día en que se canceló |
| Ficha, alertas (`fichaAlertas.ts:23`) | «No vino · sin fecha nueva · V3 W4» | «Turno cancelado · sin fecha nueva · V3 W4» |
| `esNoVino` (`calendario.ts:251-253`) | `computed_status = 'por_reprogramar'` → «No vino» | Excluye el turno cancelado |
| Encabezado del menú y listón del modal (`VisitActionBar.tsx:76,162`) | «No vino · 1 de 4» | «Sin turno · 1 de 4» |
| Tarjetas por protocolo de Pendientes (`PendientesProtocoloCards.tsx:135`) | «No vino 3» (usa el `short` de cada estado) | «Por reprogramar 3»: es un conteo de la clase, que ahora junta las dos causas |
| Descartar desde la campana (`NotificationsMenu.tsx:313`) | «… No vino» | «… Turno cancelado» |
| Glosario (`glosario.ts:76`; lo muestran el chip y las leyendas del Resumen y de Pendientes) | «El paciente no vino y la visita hay que volver a agendarla.» | «La visita no tiene fecha: el paciente no vino o se canceló el turno. Hay que volver a agendarla.» |

En la campana la fecha es **la del hecho**, como en «No vino»: el día que faltó / el día que se canceló.

**Bug encontrado en el camino (va en este cambio):** en Pendientes, toda alerta que no es `ventana_vencida` dice
«Reporte de procedimiento fuera de plazo» (`TrackAlertsView.tsx:921-923`), así que **hoy un «No vino» ya se lee como
un reporte vencido**. Es el mismo error que la ficha tenía y se corrigió el 2026-09-28 (`fichaAlertas.ts:8-12`); en
Pendientes quedó. El motivo del renglón pasa a una función pura con test (`motivoDeAlertaDeVisita`) que distingue las
cuatro: ventana vencida, no vino, turno cancelado y reporte vencido.

**D8 · La visita cancelada, abierta en el modal.** La cara principal es **«Reprogramar»** (hoy la del modal es
«Marcar llegada», también con «no vino»; para un turno cancelado no se espera a nadie). En el menú:
- **Reprogramar**: habilitado, bajada «Turno cancelado el 15 oct»;
- **Cancelar turno**: apagado, «El turno ya está cancelado»;
- **Vino otro día** y **No vino**: no aparecen (hablan de si el paciente vino, y no hay día en el que lo esperen;
  la regla de la cabecera de `accionesDeVisita.ts:26-29` se amplía con este caso);
- Volver, Copiar y Eliminar, como en Por llegar.

El encabezado (`VisitHeader.tsx:198`) muestra «Sin turno» en «Fecha programada», y escribir una fecha ahí la
reprograma (el trigger de D9 limpia el sello). «Pedir medicación» desde el modal dice «Sin turno: reprogramala para
pedir medicación» (P3).

**D9 · La salida: un trigger limpia el sello cuando la visita vuelve a tener fecha.** `BEFORE UPDATE` sobre
`patient_visits`: si la fila nueva tiene `turno_cancelado_at` **y** `estimated_date`, y sigue sin llegada, inicio ni
fin, se vacían `turno_cancelado_at`, `turno_cancelado_by` y `citacion_cancelada`. Así:
- **Toda** salida anda sin tocarla: `rescheduleVisit` (`RescheduleModal`, `FormTraerVisita`), el `setEstimatedDate`
  del encabezado, y también las pestañas con el bundle viejo, que de otro modo rebotarían con el 23514 crudo.
- `rescheduleVisit` **no** suma columnas a su parche. Eso importa: un `PATCH` con columnas que la base todavía no
  tiene da PGRST204 y rompería **toda** reprogramación de la app si el front llegara antes que la migración.
- Las marcas siguen frenadas (D6): `mark_arrived` no pone fecha, y `registrar_llegada_adelantada` pone fecha **y**
  llegada, así que el trigger no limpia y el CHECK rechaza.
- `sync_protocol_schedule` no le pone fecha (D4), así que el trigger no lo convierte en una salida silenciosa.

`RescheduleModal` propone `citacion_cancelada` si todavía es hoy o después (un clic equivocado se deshace en dos
clics); si ya pasó, arranca vacío. **Y con la fecha vacía no deja guardar:** hoy no tiene esa guarda (`:32-45`), y con
`''` la comparación de ventana da «fuera de ventana» (`'' < window_start`, `:29-30`) y, si se confirma,
`rescheduleVisit(id, '')` rebota con el error crudo de Postgres. Con una cancelada que se abre sin fecha, ese camino
deja de ser teórico.

**«Una visita pendiente del estudio» (Agendar):** `visitasParaTraer` (`retomar.ts:85-90`) hoy descarta
`estimated_date = null`; pasa a incluir las canceladas, ordenadas por `citacion_cancelada`, con `marcaDePendiente` →
«Turno cancelado». Y desde la ficha (paciente fijo) esa opción hoy sólo aparece con la preselección `traer`
(`AgendarVisitaModal.tsx:150`, `opciones.ts:109`), mientras la lista ofrece las definiciones libres del cuadro
(`:111-117`): elegir la de la visita cancelada rebota con «Ya hay una visita pendiente de esta etapa» (`0030:46-50`).
Con un turno cancelado, la ficha ofrece «Una visita pendiente del estudio» y no lista como nueva la definición de esa
visita.

**D10 · Pendientes: «Agendar» y el tacho, en las dos causas.** El renglón de «por reprogramar» suma el botón
«Agendar» que ya tiene «Se pasó la fecha» (`TrackAlertsView.tsx:1039-1047`): es la acción que resuelve las dos. Y
lleva la urgencia, como «Se pasó la fecha»: «la ventana cierra en 5 días» (`cierreDeVentana`, `retomar.ts:129`).

El turno cancelado **se puede archivar**, como el «No vino», y para eso `dismiss_alert` se re-declara (copia de la
0107) con un cambio en el ancla de `por_reprogramar`: `coalesce(estimated_date::timestamptz, turno_cancelado_at,
'-infinity')`. Hoy el ancla de una cancelada sería `-infinity` (`0107:88-90`), y eso es un P1: el descarte es
compartido, `sameAnchor(…, null)` coincide con `-infinity` (`alertDismissalModel.ts:173-174`), así que archivar una
cancelación **taparía todas las siguientes de esa visita**. Y no alcanza con sacar el tacho del front nuevo: una
pestaña con el bundle viejo lo ofrece en todo `por_reprogramar` (`TrackAlertsView.tsx:974-977`,
`NotificationsMenu.tsx:313`). Con el ancla en el momento de la cancelación, cada cancelación es un hecho nuevo y
vuelve a avisar. El espejo del cliente (`anclaDeLaVisita`, `alertDismissalModel.ts:112-116`) hace lo mismo y compara
ese caso con `sameInstant`. Hace falta el tacho, además, porque una visita **libre** (screening y randomización del
cuadro) no tiene ventana: la rama 2 nunca entra, `close_enrollment` no la borra (`0127:134`, `window_end` NULL) y,
sin descarte, su alerta duraría mientras la inscripción siga abierta.

El filtro de antigüedad (`refDate`, `TrackAlertsView.tsx:128-130`, hoy `window_end ?? estimated_date`) usa, para un
turno cancelado sin ventana, el día de la cancelación: si no, con cualquier antigüedad elegida la fila desaparece
(`:289-290`).

**D11 · Permisos: el de mover fechas, también para Reprogramar.** La RPC pide gerencia o un operador de Coordinación
que coordina el estudio (`0155:239-244`, la regla de la policy de UPDATE); el front, `coordina`. **Recepción queda
incluida**: la RLS de lectura (`0146:347`) sólo deja ver una visita a gerencia o a quien coordina su estudio, así que
para toda visita que se ve, «operador de Coordinación» y «coordina» son la misma persona; lo que `coordina` suma es
**gerencia** (decisión 94). Por lo mismo, `itemReprogramar` y la cara «Reprogramar» de la fila pasan de `recepcion` a
`coordina` (`accionesDeVisita.ts:179`, `DayVisitRowItem.tsx:197`): `recepcion` es `hasMinRole('track','operator')`,
que no cuenta a gerencia, y la base (`0146:344`) sí la deja. Si no, gerencia cancela un turno que después no puede
reprogramar desde el mismo menú.

Las guardas de la RPC (pedido, procedimientos) son reglas de la acción, no de la fila: quien coordina el estudio
puede, igual que hoy, escribir la visita con un UPDATE directo (la policy lo deja). El CHECK fija la forma del dato;
no se agrega más candado que ése.

**D12 · Orden del menú.** «Cancelar turno» va **tercero, debajo de Reprogramar**: las dos hablan del turno (a otra
fecha / sin fecha) y leerlas juntas es lo que ayuda a elegir. Se dibuja en las del cronograma (`programada` y
`randomizacion`, las que «Eliminar» no deja borrar); en una suelta no, porque ahí la acción es «Eliminar», que está
habilitada dos renglones más abajo. Y la bajada de Eliminar en una del cronograma pasa de «Las visitas del cronograma
no se borran» a «Del cronograma: cancelá el turno», que dice a dónde ir.

**D13 · Numeración: la 0161.** Libre en `origin` y en las ramas locales al 2026-10-15. Si al implementar ya hay otra,
CI (`check-migraciones`) frena el número repetido.

**D14 · La randomización legacy (`kind = 'randomizacion'`) NO se cancela: se reprograma.** El pedido incluía ese
`kind`, y el barrido mostró por qué no: en los estudios sin cuadro, agendar esa visita **fija la fecha de
randomización de la inscripción** (`register_visit_event`, `0145:550-553`), y con ella se genera el tratamiento
entero. Cancelar el turno dejaría el tratamiento colgado de una randomización que no va a pasar ese día, sin que
nada lo diga. El ítem sale apagado, «Fija la fecha del tratamiento: reprogramala», y la RPC la rechaza con el mismo
texto. **La randomización del cuadro** (la de todos los estudios actuales) es `programada` con rol `randomizacion`: la
fecha de randomización se fija al finalizarla (`mark_ready_with_outcome`, 0030), no al agendarla, y **ésa sí se
cancela**.

**D15 · Estadísticas: en el período de la citación vieja.** La RPC del Equipo filtra `real_date between … or
(real_date is null and estimated_date between …)` (`0143:207-208`) y `enPeriodo` repite la regla en el cliente
(`agregados.ts:45-49`). Sin cambios, una cancelada no estaría en ningún período, y eso esconde algo: si su ventana
vence, es una visita **perdida** (`esPerdida` cuenta `ventana_vencida`, `agregados.ts:53-55`) que no aparecería en la
métrica que mira un monitor. Así que:
- `estadisticas_equipo_track` se re-declara (copia de la 0143) con `coalesce(estimated_date, citacion_cancelada)` en
  el filtro y `citacion_cancelada` **al final** de su `returns table`. Cambiar el `returns table` no se puede con
  `create or replace`: va `drop function` + `create` + los `grant`, en ese orden y seguidos. Un front viejo ignora la
  columna de más.
- `enPeriodo` pasa a `real_date ?? estimated_date ?? citacion_cancelada`, y `VisitaEstadistica` suma el campo.

Resultado: la cancelada cuenta en el período de su turno, como pendiente mientras la ventana siga abierta y como
perdida si vence. Cancelar un turno no cambia los números del período en que estaba.

**D16 · Farmacia.** `visitas_dispensables` (0141) sigue devolviendo la visita, sin fecha
(`PanelNuevaDispensacion.tsx:175`). Una visita sin turno **no se ofrece para un pedido nuevo**: «Nueva dispensación»
de Farmacia la saca de la lista (una `programada` sin `visit_date` es, por D6, exactamente un turno cancelado) y el
modal de Coordinación dice por qué (D8). Es la otra mitad de P3: si cancelar se frena con un pedido abierto, tampoco
se abre uno sobre un turno cancelado. Lo hace el front; la base no lo impide (NOT in scope).

Lo que sí queda afuera, a propósito: Reposición calcula el fin del cronograma de cada paciente con `max(estimated_date)`
de sus visitas automáticas (`reposicion_del_periodo`, `0151:557-566`), que ignora los NULL. Si se cancela **la
última** visita de un tratamiento y no se reprograma antes del cálculo, ese paciente figura como «terminó su
cronograma» (D23 de Reposición: no suma, pero **se lista**, así que se ve). Arreglarlo es re-declarar una función de
160 renglones de Farmacia por un caso raro y transitorio: va a NOT in scope, con TODO.

**D17 · Campana: cada cancelación es una novedad, y la propia no avisa.** La clave de novedad es
`${clase}:${a.id}` (`NotificationsMenu.tsx:299`): si un «No vino» anterior de esa visita ya se leyó, la cancelación
no encendería el punto. Para un turno cancelado la clave suma el momento de la cancelación
(`por_reprogramar:<id>:<turno_cancelado_at>`), y `propia` (hoy `false` fijo, `:314`) es
`turno_cancelado_by === yo`: quien cancela no recibe su propia acción como novedad.

## Las reglas puras, en `accionesDeVisita.ts`

Nueva clave `'cancelar-turno'` en `ClaveAccion`. `VisitaParaAcciones` suma `turno_cancelado_at` y
`citacion_cancelada`. `AccionDeVisita.confirmar` suma un rótulo opcional para el botón que NO confirma
(`noConfirmar?: string`): con «Cancelar» al lado de «Cancelar turno» los dos botones dirían lo mismo (P5).

```ts
/**
 * «Cancelar turno» (0161): la visita sale del turnero sin salir del cronograma; queda sin fecha y por
 * reprogramar. Sólo las del cronograma —una suelta se elimina—, sólo Por llegar y sin «no vino».
 * La randomización legacy (kind 'randomizacion') fija la fecha del tratamiento al agendarse: se reprograma.
 * Mover fechas es de quien coordina el estudio o de gerencia (`coordina`, como la base).
 */
function itemCancelarTurno(v: VisitaParaAcciones, p: PermisosDeVisita, hoy: string): AccionDeVisita | null {
  if (v.kind !== 'programada' && v.kind !== 'randomizacion') return null
  const base = { clave: 'cancelar-turno' as const, titulo: 'Cancelar turno', icono: 'calendarX' as const }
  if (v.kind === 'randomizacion') return { ...base, bajada: 'Fija la fecha del tratamiento: reprogramala', habilitada: false }
  if (v.turno_cancelado_at) return { ...base, bajada: 'El turno ya está cancelado', habilitada: false }
  if (v.operational_stage === 'fin_atencion') return { ...base, bajada: 'La visita está completa', habilitada: false }
  if (v.operational_stage !== 'por_llegar') return { ...base, bajada: 'Ya concurrió al centro', habilitada: false }
  if (v.no_show_at) return { ...base, bajada: 'Tiene «no vino»: ya está por reprogramar', habilitada: false }
  if (!v.estimated_date) return { ...base, bajada: 'No tiene turno', habilitada: false }
  if (!p.coordina) return { ...base, bajada: 'Lo cancela quien coordina el estudio', habilitada: false }
  const turno = v.estimated_date === hoy ? 'de hoy' : `del ${formatDayMonth(v.estimated_date)}`
  return {
    ...base, bajada: 'Queda sin fecha, para reprogramar', habilitada: true,
    confirmar: {
      pregunta: `¿Cancelar el turno ${turno}?`,
      detalle: 'Sale de la lista de ese día y queda en Pendientes, sin fecha. No se borra del cronograma.',
      noConfirmar: 'Mantener turno',
    },
  }
}
```

- `accionesDeVisita` lo pone tercero (D12). La cabecera (`:11-42`) se actualiza: el diagrama del orden, la regla
  «aparecen y desaparecen» (ahora también «Cancelar turno» en las sueltas, y «vino otro día» / «no vino» en un turno
  cancelado) y que `confirmar` ya no es sólo de «Volver».
- `itemReprogramar`: con el turno cancelado, bajada «Turno cancelado el 15 oct»; permiso `coordina` (D11).
- `itemVinoOtroDia` e `itemNoVino`: `null` con el turno cancelado (D8).
- `itemEliminar`: la bajada nueva de D12.
- `BotonEtapa.confirmacionDe` (`:197`): el botón de la izquierda dice `a.confirmar?.noConfirmar ?? 'Cancelar'`.
- `useAccionesDeVisita` (`:61-101`): `case 'cancelar-turno'` → `correr(visita, () => cancelarTurno(visita.id),
  'Turno cancelado: la visita quedó en Pendientes.')` → `onCambio()`. En la lista del día la fila se va sola (D1); el
  aviso dice a dónde fue. `cancelarTurno` vive en `data/dayVisits.ts`, con `errorDeEtapa` (PGRST202 → «Falta
  aplicar una actualización», 42501 → «Cancelar el turno es de quien coordina el estudio.»).
- Ícono `calendarX` (Lucide `CalendarX`): no está en el set de `components/Icon.tsx`, se suma.

## Cómo sale en cada lugar

| Lugar | Qué se ve | Por qué |
|---|---|---|
| Visitas · Día / Semana / Mes, cola del médico | **No está** | D1: ninguna rama de `motivosDelDia` (`dayVisitsFilter.ts:51-57`) ni de `diasDeLaVisita` (`calendario.ts:198-207`) la toma |
| Resumen · Próximas visitas | No está | Filtra por `estimated_date` (`visits.ts:110-111`) |
| Pendientes · «Por reprogramar» | **Sí**, terracota, «Turno cancelado el 15 oct · la ventana cierra en 5 días · V3 W4», con «Agendar» y tacho | D3, D7, D10 |
| Pendientes · «Se pasó la fecha» | No está (sale de ahí si se cancela desde ahí) | Pide `computed_status = 'proxima'` y `estimated_date < hoy` (`visits.ts:194-195`) |
| Campana | **Sí**, «Turno cancelado · 15/10»; no le avisa a quien canceló | D3, D7, D17 |
| Resumen · Pendientes, Inicio | Sí, contada con las «por reprogramar» | `useActiveAlerts` |
| Ficha · cronograma | En su lugar, fecha «—», pastilla «Sin turno» en el color de «Por reprogramar», sin el verde de ventana | D5 |
| Ficha · «Próxima visita» y su «Reprogramar» | «V5 · Sin turno», si es la primera pendiente; el botón la reprograma | D5 |
| Ficha · alertas del paciente | «Turno cancelado · sin fecha nueva · V3 W4» | D7 |
| Estudios y pacientes · fila del paciente | Anterior / Actualidad / Próxima sólo con visitas fechadas; la V5, en el cronograma desplegado | D5 |
| Modal de la visita | Listón «Sin turno · cancelado el 15 oct», cara «Reprogramar», «Fecha programada: Sin turno» | D8 |
| Agendar · «Una visita pendiente del estudio» | Sí, con «Turno cancelado»; también desde la ficha | D9 |
| Estadísticas | En el período de su turno: pendiente; perdida si la ventana vence | D15 |
| Farmacia · Nueva dispensación | No se ofrece | D16, P3 |
| Farmacia · Reposición | Si era la última del tratamiento: «terminó su cronograma» hasta que se reprograme | D16 (NOT in scope) |

Si la ventana cierra sin fecha nueva, pasa a «Ventana vencida» (la rama 2 gana, `0144:212`) y se documenta como
cualquier desvío. Si la inscripción se cierra, la 0127 borra las pendientes con ventana futura (una cancelada libre,
sin ventana, queda) y `alertasVigentes` deja de mostrar las de inscripciones cerradas (`activeAlertsFilter.ts`).

## La migración 0161 · `cancelar_turno.sql`

Aditiva. **Va PRIMERO, antes del front**: ningún front viejo puede crear un turno cancelado (sólo la RPC nueva lo
hace), así que mientras no haya front nuevo ninguna fila cambia de estado; los CHECK sólo aflojan o hablan de
columnas nuevas; el trigger sólo actúa sobre filas con el sello; las vistas y la RPC de Estadísticas suman columnas
al final; `sync_protocol_schedule` y `dismiss_alert` hacen lo mismo con todo lo que no está cancelado. El front
nuevo sin la 0161 da PGRST202 en la RPC → «Falta aplicar una actualización», y `COLUMNAS_FILA_PACIENTE` pediría
columnas que no existen: por eso, primero la migración y su sonda.

En orden de dependencias, cada sentencia idempotente (el editor no tiene una transacción que abarque el archivo):

1. Las tres columnas (`add column if not exists`) + sus `comment on column`.
2. `kind_shape` aflojado (`drop constraint if exists` + `add`) y el CHECK nuevo `patient_visits_turno_cancelado`
   (D6).
3. El trigger de D9: función `limpia_turno_cancelado()` (`set search_path = pg_catalog, public`, todo calificado) y
   `drop trigger if exists` + `create trigger … before update on public.patient_visits`.
4. `v_patient_visits`: el bloque `format()` de la 0144 **tal cual** (la lista de columnas sale de `pg_attribute`;
   nunca `pv.*`) con la rama 3 cambiada (D3). `security_invoker` repetido.
5. `v_track_visits`: la definición de la 0158 tal cual + `self.turno_cancelado_at`, `self.turno_cancelado_by`,
   `self.citacion_cancelada` **al final**.
6. `sync_protocol_schedule`: la de la 0029 tal cual + D4.
7. `dismiss_alert`: la de la 0107 tal cual + el ancla de D10.
8. `estadisticas_equipo_track`: `drop function` + la de la 0143 con D15 + `revoke`/`grant` + `comment`.
9. `cancelar_turno_visita(p_visit_id uuid) returns void`, `security definer`, `set search_path = pg_catalog, public`,
   todo calificado (0056/0058), `for update of pv`, sin `uuid_generate_v4`:
   - 42501: sin sesión; ni gerencia ni (`has_min_role('track','operator')` y `is_assigned_coordinator`);
   - 23503: la visita no existe;
   - 23514 con mensaje en castellano: suelta («Una visita suelta no tiene turno: se elimina.»), randomización legacy
     («Fija la fecha del tratamiento: reprogramala.»), ya cancelada («El turno ya estaba cancelado. Actualizá la
     pantalla.»), no por llegar («La visita ya no está por llegar. Actualizá y probá de nuevo.», el de la 0155), con
     «no vino», sin fecha, con procedimientos realizados, con un pedido de medicación en curso (P3);
   - escribe `citacion_cancelada = estimated_date`, `estimated_date = null`, `turno_cancelado_at = now()`,
     `turno_cancelado_by = auth.uid()`. `citacion_antes_de_adelantar` no se toca: en Por llegar está siempre vacía
     (la limpia `retroceder`, `0155:188`) y el banco lo verifica.
10. `revoke`/`grant` a `authenticated`, `comment on function`, `notify pgrst, 'reload schema'`.

**Trampas de la casa, chequeadas al escribirla:** dollar-quotes en número par (contando el crudo, con los de
`format()`); ningún par de signos peso dentro de un comentario; en `estadisticas_equipo_track`, los nombres del
`returns table` calificados en el cuerpo (0056/0058).

**La sonda va en el mismo mensaje que el SQL** (decisión 101), y la PR del front no se abre antes de que dé verde:
```sql
select
  (select count(*) from pg_proc where proname = 'cancelar_turno_visita') = 1                              as rpc,
  (select prosrc like '%turno_cancelado_at%' from pg_proc where proname = 'sync_protocol_schedule')       as sync,
  (select prosrc like '%turno_cancelado_at%' from pg_proc where proname = 'dismiss_alert')                as descarte,
  (select prosrc like '%citacion_cancelada%' from pg_proc where proname = 'estadisticas_equipo_track')    as estadisticas,
  pg_get_viewdef('public.v_patient_visits'::regclass) like '%turno_cancelado_at%'                         as estado,
  exists (select 1 from information_schema.columns where table_schema = 'public'
          and table_name = 'v_track_visits' and column_name = 'citacion_cancelada')                       as vista,
  (select pg_get_constraintdef(oid) like '%turno_cancelado_at%' from pg_constraint
    where conname = 'patient_visits_kind_shape')                                                          as forma,
  exists (select 1 from pg_constraint where conname = 'patient_visits_turno_cancelado')                   as candado,
  exists (select 1 from pg_trigger where tgname = 'trg_limpia_turno_cancelado')                           as salida;
```
Las nueve en `true`. `forma` importa sola: si después del `drop` del `kind_shape` el `add` fallara, la tabla quedaría
sin ese CHECK y ninguna otra columna lo diría. **Y el aviso:** la RPC usa `select … into` de PL/pgSQL; si el editor
ofrece «activar RLS» para una tabla nueva, se corre **sin** activarla (quinta trampa de `CLAUDE.md`).

## Revisión

**1 · Arquitectura.**
- El corte vive en la base (D1, D3, D6, D9): qué lista la ve, qué marcas acepta y cómo sale lo decide el dato. Lo que
  sí tiene que acordarse cada pantalla es el rótulo (D7), que es donde un olvido se VE («No vino» en vez de «Turno
  cancelado») en vez de esconderse.
- **El riesgo de la migración son las dos vistas**: `create or replace` sólo acepta columnas nuevas al final y hay que
  repetir `security_invoker`. Se prueba en el banco: `equivalencia.mjs 0161 --control` (cada perfil ve lo mismo) y un
  caso que compara `computed_status` de todas las visitas sembradas antes y después: sólo cambia la cancelada.
- **El segundo riesgo son las tres re-declaraciones** (`sync_protocol_schedule`, `dismiss_alert`,
  `estadisticas_equipo_track`): cada una es la última definición tal cual más un cambio, y el banco prueba lo nuevo
  y que lo viejo siga igual. La de Estadísticas lleva `drop` + `create`: entre las dos sentencias no existe (un
  instante).
- Seguridad: la RPC repite la authz de la policy de UPDATE; no habilita a nadie nuevo. El trigger no da permisos:
  corre dentro del UPDATE que la RLS ya dejó pasar.

**2 · Calidad.**
- DRY: un predicado (`turnoCancelado`); `fechaParaOrdenar` / `effectiveDate` con un nombre por uso, y `PdVisitFlow`
  sin su copia; un `motivoDeAlertaDeVisita` para Pendientes (que hoy no tiene y por eso tiene el bug); un rótulo por
  causa para la campana y la ficha; un helper para el 23514 del CHECK. `confirmar` gana un campo opcional en vez de
  una segunda confirmación. La salida es una (el trigger) en vez de tres caminos del front.
- Comentarios y diagramas que quedan viejos y se actualizan en el mismo cambio: la cabecera de `accionesDeVisita.ts`
  (orden y regla), el de `useAccionesDeVisita` (`:14-27`), `esNoVino` (`calendario.ts:240-250`), `rescheduleVisit` y
  `no_show_at` en `visits.ts:61-67` y `:330-337` («la salida del estado Por reprogramar»: ahora de las dos causas, y el
  sello lo limpia el trigger), el de `useVisitAlerts` (`visits.ts:120-129`, «el paciente no vino»), `anclaDeLaVisita`
  (`alertDismissalModel.ts:98-111`), `fichaAlertas.ts:6-19`, el de `CLASES` de la campana (`notificaciones.ts:69-73`),
  `effectiveDate` (`lib/visits.ts:199`) y `visitStateLabel` (`:487-513`, el verde siempre con su palabra).

**3 · Tests** (vitest; criterio de la casa: lo que falla en silencio).

```
CÓDIGO                                                     FLUJOS (navegador, no test)
lib/visits.ts                                              Cancelar turno
  ├ turnoCancelado               [GAP → test]                ├ desde la fila (hoy) y desde el modal (otro día)
  ├ fechaParaOrdenar/orderVisits [GAP; REGRESIÓN]            ├ la confirmación en el lugar del ítem; «Mantener turno»
  │   cancelada en su lugar, no primera                      ├ la fila se va de la lista; el aviso dice «Pendientes»
  ├ flowWindow                   [GAP] centrado en su lugar  ├ en Pendientes con «Agendar», tacho y la ventana
  ├ todaySplit                   [GAP; REGRESIÓN] la sigue   ├ en la campana al recargar; no le avisa a quien canceló
  │   salteando (no es Hoy, ni Anterior, ni Próxima)         ├ el modal: cara «Reprogramar», menú del estado cancelado
  ├ currentVisit                 [GAP] la elige si es la     ├ Reprogramar propone la fecha vieja → vuelve al turnero
  │   primera pendiente                                      ├ Reprogramar sin fecha: no deja guardar
  ├ ventanaAbierta               [GAP] false si cancelada    ├ la fecha del encabezado también la saca de cancelada
  └ visitStateLabel              [GAP] «Sin turno»           ├ «Agendar» desde Pendientes y desde la ficha
views/track/PdVisitFlow          usa effectiveDate (DRY)     ├ el cronograma: en su lugar, «Sin turno», sin verde;
views/track/PdPatientRow         [GAP] no elige canceladas   │   «Próxima visita · V5 · Sin turno»
views/track/accionesDeVisita.ts                              ├ archivar una cancelada; cancelarla otra vez → vuelve
  ├ itemCancelarTurno            [GAP]                       ├ Farmacia: no la ofrece en Nueva dispensación
  │   habilitado · cada apagado con su porqué · suelta →     ├ Estadísticas: cuenta en el período de su turno
  │   null · randomización legacy apagada · confirmar con    ├ gerencia sin rol de Coordinación: cancela y reprograma
  │   «de hoy» / «del 20 oct» y noConfirmar                  └ sin la 0161: «Falta aplicar una actualización»
  ├ estado cancelado             [GAP]                     Pendientes
  │   reprogramar con su bajada · sin vino otro día ni         ├ un «No vino» ya no dice «Reporte de procedimiento…»
  │   no vino · cancelar apagado                               └ con un filtro de antigüedad, la cancelada sigue
  ├ itemReprogramar con coordina [GAP; CAMBIO A PROPÓSITO]   gerencia sí, operador que no coordina no
  └ orden del menú               [GAP]
views/track/visitas/calendario.ts
  ├ esNoVino                     [GAP] excluye la cancelada
  └ diasDeLaVisita               [GAP] cancelada → []  (fija D1 del lado del cliente)
views/track/retomar.ts
  ├ visitasParaTraer             [GAP; CAMBIO] incluye la cancelada, ordenada por citacion_cancelada
  ├ visitasConFechaPasada        [GAP] no la incluye
  └ marcaDePendiente             [GAP] «Turno cancelado»
views/track/agendar/opciones.ts  [GAP] ficha con cancelada: ofrece «traer» y no la definición de esa visita
views/TrackAlertsView (puras extraídas)
  ├ motivoDeAlertaDeVisita       [GAP; REGRESIÓN CRÍTICA]  «No vino» ya no es «Reporte de procedimiento…» · las cuatro
  └ refDate                      [GAP] cancelada sin ventana → el día de la cancelación
data/alertDismissalModel.ts
  └ isVisitAlertDismissed        [GAP; REGRESIÓN] ancla = momento de la cancelación (sameInstant); una segunda
                                 cancelación no queda tapada; «No vino» igual que hoy
views/fichaAlertas.ts            [GAP] la cancelada con su texto
views/PendientesProtocoloCards   rótulo «Por reprogramar» (visible; se mira)
shell/notificaciones.ts          [GAP] rótulo y fecha por causa (ajusta notificaciones.test.ts:201); clave y `propia`
views/track/RescheduleModal (puras extraídas)
  ├ fechaPropuesta               [GAP] citación vieja si es ≥ hoy; vacía si pasó
  └ sin fecha no guarda          [GAP] y '' no cuenta como «fuera de ventana»
views/track/estadisticas/agregados.ts
  └ enPeriodo                    [GAP; CAMBIO] cancelada → período de citacion_cancelada (agregados.test.ts:50)
views/pharma/…/PanelNuevaDispensacion
  └ visitas que se ofrecen       [GAP] programada sin fecha → afuera
data/dayVisits.ts
  └ error del CHECK              [GAP] el 23514 de patient_visits_turno_cancelado → «primero reprogramala»
SQL (banco PGlite, scripts/banco-rls/casos-0161.mjs)
  ├ cancelar_turno_visita: authz (gerencia / coordinadora / admin de Coordinación que no coordina → 42501 /
  │   operador sin el estudio → 42501) · programada sí; suelta y randomización legacy no · concurrió, en atención,
  │   fin → rechaza · «no vino» → rechaza · ya cancelada → rechaza · pedido solicitado / preparando → rechaza ·
  │   procedimiento realizado → rechaza · escribe las cuatro columnas · citacion_antes_de_adelantar sigue NULL
  ├ estado: cancelada → por_reprogramar; con la ventana vencida → ventana_vencida; el resto de las sembradas igual
  ├ el CHECK: mark_arrived, mark_no_show, start_visit_attention, registrar_llegada_adelantada y
  │   registrar_visita_en_otra_fecha sobre una cancelada → 23514
  ├ el trigger: update de sólo estimated_date (como rescheduleVisit y setEstimatedDate) → limpia el sello → 'proxima';
  │   fecha + llegada a la vez → no limpia y el CHECK rechaza; una fila sin sello → no cambia nada
  ├ sync_protocol_schedule: preview y apply cuentan igual; la cancelada sigue sin fecha y con la ventana movida;
  │   las demás se mueven como antes
  ├ dismiss_alert: ancla de la cancelada = turno_cancelado_at; la de un «No vino», igual que la 0107
  ├ estadisticas_equipo_track: la cancelada entra por citacion_cancelada; el resto igual que la 0143
  ├ legacy: los dos CHECK entran sobre los datos sembrados
  └ equivalencia.mjs 0161 --control: ningún perfil ve otra cosa
```

**4 · Performance.** Sin consultas nuevas en las pantallas: la rama 3 suma un `or` sobre una columna de la misma
fila; las columnas de `v_track_visits` salen del `self` que la 0158 ya junta; el `coalesce` de Estadísticas no cambia
el plan. El trigger es un `if` sobre la fila nueva, sin lecturas. La RPC lee una fila con `for update` y un par de
`exists` por `visit_id`, como las de la 0155. Sin N+1.

## Segunda opinión (subagente independiente)

Quince hallazgos (2 P1, 6 P2, 7 P3). Los que cambiaron el plan:

1. **P1 · El descarte con ancla `-infinity` tapa todas las cancelaciones siguientes**, y una pestaña con el bundle
   viejo lo ofrece → `dismiss_alert` re-declarada con el ancla en la cancelación, y tacho en las dos causas (D10).
2. **P1 · `todaySplit` usa la misma `effectiveDate`**: con la citación vieja adentro, la cancelada salía como Hoy /
   Anterior → dos funciones, una para ordenar y otra para ubicar en el tiempo (D5).
3. **La fila de «Estudios y pacientes»** no traía las columnas y su Anterior podía elegir la cancelada (D5).
4. **Estadísticas escondía una cancelada perdida** (D15 decía lo contrario) → la RPC cuenta por la citación vieja.
5. **Una cancelada libre alertaba para siempre sin descarte** → resuelto con el tacho de D10.
6. **La salida como trigger** en vez de tres caminos del front, que además evita el PGRST204 de un parche con
   columnas nuevas (D9).
8. **Desde la ficha, «Una visita pendiente del estudio» no aparecía** y la definición rebotaba (D9).
9. **P3 y D16 se contradecían** → tampoco se abre un pedido sobre un turno cancelado (D16).
10. **La traducción del 23514** ahora nombra a sus llamadores (D6). 11. **La sonda** verifica también `kind_shape`.
12. **La clave de la campana** y `propia` (D17). 13. **El verde de ventana** no convive con «Sin turno» (D5).

Los otros tres se tomaron como están: **7** (dejar la cancelada en `proxima`, la alternativa mínima) va al Director
como P4, con la recomendación en contra; **14** (las guardas se pueden saltear con un UPDATE directo) se deja anotado
en D11: quien puede hacerlo es quien coordina el estudio, que hoy ya puede escribir la visita entera; **15** (los
enlaces por día a una cancelada caen en la lista de hoy) va a NOT in scope.

## Fallas posibles

| Camino nuevo | Falla realista | Test | Manejo | ¿Silenciosa? |
|---|---|---|---|---|
| 0161 vistas | `security_invoker` perdido al recrear → RLS de más o de menos | banco (equivalencia) | — | **sí, cubierta por el banco** |
| 0161 `sync` | re-declarada sin la rama → el sync re-fecha las canceladas | banco | — | **sí, cubierta por el banco** |
| 0161 `kind_shape` | el `add` falla después del `drop` → la tabla sin CHECK | — | la sonda (`forma`) | no, si la sonda se corre |
| 0161 aplicada | copia comentada o cortada en el editor (0160) | — | la sonda de nueve columnas | no, si la sonda se corre |
| 0161 RPC | front desplegado antes que la migración | — | PGRST202 → «Falta aplicar…» | no |
| trigger | limpia de más (una fila sin sello) o de menos (no limpia al reprogramar) | banco | — | **sí, cubierta por el banco** |
| descarte | una segunda cancelación queda tapada | test + banco | — | **sí, cubierta** |
| `orderVisits` / `todaySplit` | la cancelada salta al primer renglón, o sale como «Hoy» | sí | — | sí, cubierta por test |
| rótulos | un lector nuevo de `por_reprogramar` dice «No vino» de un turno cancelado | `motivoDeAlertaDeVisita`, ficha, campana | — | sí, cubierta por test donde existe hoy |
| marcas | pestaña vieja marca la llegada de una cancelada | banco (CHECK) | 23514 → «primero reprogramala» | no |
| Cancelar | doble clic / otra pestaña ya la canceló | banco | `ocupado` + «El turno ya estaba cancelado» | no |
| Cancelar | clic equivocado | — | confirmación en el lugar; Reprogramar propone la fecha vieja | no |
| Reposición | se cancela la última visita del tratamiento → «terminó su cronograma» | — | el paciente se lista (D23 de Reposición) | no: se ve, pero no suma stock (NOT in scope) |

Sin brechas críticas: lo silencioso tiene test o banco, y el preview lo confirma. Reposición queda visible y anotada.

## NOT in scope

- **Cancelar una visita suelta.** Para eso está «Eliminar» (el pedido es para las del cronograma).
- **Un motivo de cancelación con columna** (P6). Si la ventana se pierde, el motivo va en la desviación (0130).
- **«Deshacer» en el aviso.** La confirmación ya frena el clic equivocado y «Reprogramar» propone la fecha vieja.
- **Que «Marcar llegada» de una cancelada pase sola** (re-declarar cinco funciones para que limpien el sello, D6).
- **Que la base impida un pedido de medicación sobre un turno cancelado** (D16 lo hace el front): re-declarar los
  caminos de pedido y dispensación por un caso que la pantalla no ofrece.
- **Reposición con el turno cancelado** (D16): `max(coalesce(estimated_date, citacion_cancelada))` en el CTE
  `cronograma` de `reposicion_del_periodo` (0151). Se propone como TODO.
- **`sync_protocol_schedule` también deshace los «Reprogramar».** Su MOVER devuelve a la fecha teórica toda
  programada automática sin atender que se haya movido, y el preview lo cuenta como «visitas a mover (no atendidas)»
  (`ScheduleSyncModal.tsx:75`) sin decir que eran turnos acordados. Es previo a este cambio; se propone como TODO.
- **«Reprogramar» de la randomización legacy no mueve la fecha de randomización** (D14): previo, y sólo en estudios
  sin cuadro.
- **El resto de «gerencia puede todo» en Recepción** («No vino», la llegada, «Volver» la llegada usan `recepcion`, que
  no cuenta a gerencia): la revisión general ya está propuesta como sesión aparte (handoff del 14, tercera parte).
  Acá sólo Reprogramar, porque es la salida de esta acción (D11).
- **Los enlaces por día a una cancelada** (el del feedback, «Ver en Visitas»): `diaDeLaVisita` da vacío
  (`VisitDetail.tsx:115-127`) y caen en la lista de hoy sin abrir la visita. «Ver en Visitas» ya se oculta sin día.
- **Que la campana se entere sin recargar** (`TODOS.md`, «las cuatro superficies…»): ya pasa con todas las clases.
- **Una métrica de turnos cancelados en Estadísticas.**

## What already exists

Todo lo de la tabla de Step 0 se reusa; no se reconstruye nada. Lo nuevo: la 0161, `turnoCancelado`,
`fechaParaOrdenar`, el ítem `cancelar-turno`, `cancelarTurno` en `data/dayVisits.ts`, `motivoDeAlertaDeVisita`, el
helper del 23514 y el campo `noConfirmar`.

## Paralelización

Implementación secuencial. Todo cuelga de la 0161 (aditiva, va primero) y de `turnoCancelado`; las reglas del menú,
los rótulos y Pendientes comparten `views/track/` y `lib/visits.ts`. Lo único separable es el bug de Pendientes
(D7), y son minutos.

## Preguntas al Director · decididas

**Decidido por el Director el 2026-10-16: «dale con lo recomendado».** Las seis quedan con la opción recomendada, que
es la que ya estaba escrita en el plan. Se dejan las alternativas a la vista para saber qué se descartó.

**P1 · ¿En qué etapas se ofrece?**
- **(Recomendada) Sólo Por llegar.** Con la llegada marcada el paciente ya vino: si fue un error, primero «Volver a
  Por llegar» (está arriba de todo en el mismo menú) y después «Cancelar turno». En Concurrió y En atención el ítem
  sale apagado, «Ya concurrió al centro», como Reprogramar.
- Que «Cancelar turno» en Concurrió haga las dos cosas de una: dos acciones distintas en un clic, con las guardas de
  «Volver» adentro.

**P2 · ¿Se puede cancelar un turno que ya pasó, o uno marcado «no vino»?**
- **(Recomendada) Uno que pasó sin marcar, sí; uno con «no vino», no.** El que pasó sin marcar está en «Se pasó la
  fecha»: si el paciente había avisado, cancelarlo es lo honesto y la visita pasa a «Por reprogramar». El «no vino» ya
  está por reprogramar, y cancelarlo le borraría la falta del día en que faltó (sale de la lista de ese día). El ítem
  dice «Tiene «no vino»: ya está por reprogramar».
- Permitir también con «no vino», limpiando la falta.

**P3 · ¿Y la medicación?**
- **(Recomendada) Un turno cancelado no tiene medicación en curso.** Cancelar se frena si hay un pedido abierto: con
  uno solicitado, «Tiene un pedido de medicación sin atender: cancelalo antes de cancelar el turno»; preparándose o
  atendido, «Farmacia ya está preparando la medicación de esta visita: avisale antes de cancelar el turno». Y a la
  inversa, sobre un turno cancelado no se abre un pedido nuevo (ni desde la visita ni desde «Nueva dispensación»):
  primero se reprograma. Sin esto, Farmacia prepara medicación para una visita que no tiene fecha.
- Dejarlo pasar en los dos sentidos: el pedido sigue colgado de la visita y vale cuando se reprograme.

**P4 · ¿Dónde se ve el turno cancelado?**
- **(Recomendada) Como «Por reprogramar», en todos lados, con su propio rótulo («Turno cancelado»).** Es la misma
  tarea que «No vino» (darle fecha): sale en Pendientes, en la campana, en las alertas de la ficha y en Estadísticas.
  Es la versión de este plan.
- **Sólo en Pendientes**, como «Se pasó la fecha» (la cancelada sigue siendo `proxima` para la base). Es la versión
  mínima de verdad: no se re-declaran `v_patient_visits` ni `dismiss_alert`, y se caen la mitad de los rótulos. A
  cambio, no avisa en la campana, no figura entre las alertas de la ficha ni como pendiente en Estadísticas, y
  Pendientes suma una clase propia (sin tacho, como «Se pasó la fecha»).

**P5 · ¿Cómo se llama?**
- **(Recomendada) «Cancelar turno», y en la confirmación «Mantener turno» / «Cancelar turno».** Es como lo dice
  Recepción y como lo dice el paciente por teléfono. El botón que no confirma no puede decir «Cancelar» al lado de
  «Cancelar turno».
- «Anular turno» (y el botón de siempre, «Cancelar»).
- «Sacar del turnero».

**P6 · ¿Pide motivo?**
- **(Recomendada) No.** La acción queda en un clic más la confirmación. Si el turno no se reprograma a tiempo y la
  ventana vence, el motivo se escribe donde un monitor lo va a buscar: la desviación documentada (0130).
- Sí, con un desplegable (paciente avisó / el centro / el sponsor / otro): pasa a ser un modal y suma una columna.

## Implementation Tasks

- [x] **T1 (P1, humano ~6 h / CC ~35 min)** — base — `0161_cancelar_turno.sql` (columnas, los dos CHECK, el trigger,
  `v_patient_visits`, `v_track_visits`, `sync_protocol_schedule`, `dismiss_alert`, `estadisticas_equipo_track`,
  `cancelar_turno_visita`) + `scripts/banco-rls/casos-0161.mjs` + `equivalencia.mjs 0161 --control` + índice de
  `supabase/README.md`
  - Verificado (2026-10-16): `casos-0161.mjs` 52/52, con el antes y el después de la 0161 sobre los mismos datos
    (estado y etapa de cada visita, lo que devuelve Estadísticas y lo que ve una coordinadora: iguales; la sonda, diez
    en `true`); `casos-0158/0159/0160` 38/38, 6/6 y 27/27 (`casos-0160` fijado a la 0160); `equivalencia.mjs 0161
    --control` sin diferencias de permisos (2028 comparaciones, control 12/12; 10 fotos distintas con las mismas
    filas: las columnas nuevas de `patient_visits` y `v_track_visits`); 14 marcadores de dollar-quote, todos en par;
    `check-migraciones` al día. `sembrar.mjs` no inventa turnos cancelados (el CHECK los rechazaría).
- [x] **T2 (P1, humano ~1,5 h / CC ~15 min)** — reglas — `turnoCancelado`, `fechaParaOrdenar`, `effectiveDate`
  exportada (`PdVisitFlow` deja su `eff()`), `todaySplit`, `currentVisit`, `ventanaAbierta`, `visitStateLabel`
  (`lib/visits.ts`); `COLUMNAS_FILA_PACIENTE` y `PdPatientRow`; `esNoVino` (`calendario.ts`) + tests
- [x] **T3 (P1, humano ~3 h / CC ~20 min)** — acción — `itemCancelarTurno` y el estado cancelado en
  `accionesDeVisita.ts` (+ cabecera) + test; `noConfirmar` en `BotonEtapa`; `cancelarTurno` y el helper del 23514 en
  `data/dayVisits.ts`; el `case` en `useAccionesDeVisita`; `calendarX` en `Icon.tsx`; permiso `coordina` para
  Reprogramar (fila y menú)
- [x] **T4 (P1, humano ~2 h / CC ~15 min)** — salidas — `RescheduleModal` propone la fecha vieja y no guarda sin
  fecha (puras + test); `visitasParaTraer` / `marcaDePendiente` y `opciones.ts` (la ficha) + tests; el encabezado
  («Sin turno»); la cara «Reprogramar» y el listón del modal
- [x] **T5 (P1, humano ~3 h / CC ~25 min)** — rótulos — `motivoDeAlertaDeVisita` (arregla el bug de Pendientes),
  `refDate` y la ventana en el renglón + «Agendar» en «por reprogramar»; `anclaDeLaVisita` / `isVisitAlertDismissed`;
  tarjetas por protocolo; campana (rótulo, fecha, clave, `propia`); ficha (alertas y «Próxima visita»); glosario;
  cronograma («Sin turno», sin verde); `enPeriodo` y `VisitaEstadistica`; «Nueva dispensación» y «Pedir medicación»
  sin turno + tests
- *T2–T5 hechas el 2026-10-16 (commit «feat(visitas): Cancelar turno…»): `npm run build` verde, 2202 tests (siete archivos de test nuevos o ampliados). Lo que quedó distinto del plan: el permiso de la cara «Reprogramar» de la fila también pasó a `coordina`; «Pedir medicación» con el turno cancelado se resuelve dejando el panel de dispensación en solo lectura.*
- [ ] **T6 (P1)** — verificación — `npm run build` verde + preview (banco sin sesión) + QA con sesión sobre TEST-001
  (protocolo TEST-QA), con la 0161 aplicada y su sonda en verde. Lo creado en el QA, borrado al final.
- [ ] **T7 (P3)** — docs — `TODOS.md`: `sync_protocol_schedule` deshace los «Reprogramar»; Reposición con el turno
  cancelado (D16)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 17 decisiones técnicas auto-decididas; barrido de lectores de `estimated_date` (~60 lugares); 15 hallazgos de la segunda opinión, 12 tomados y 3 resueltos de otra forma; 0 critical gaps; 6 preguntas de producto, decididas por el Director con la recomendada (2026-10-16) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** segunda opinión de un subagente Claude (Codex no está instalado). Sin tensión pendiente: la única
  discrepancia de fondo (dejar la cancelada en `proxima`) va al Director como P4.
- **VERDICT:** ENG CLEARED — listo para implementar. Orden: 0161 en prod con su sonda en verde, después el front.

NO UNRESOLVED DECISIONS
