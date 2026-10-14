# Plan · Cargar una visita en otro día (y la fila de una visita realizada)

Pedido del Director, 2026-10-14: *«quise actualizar una visita que se me pasó la semana pasada. La marqué como
realizada, y primero se genera un espacio de atención médica ausente que no me gusta: me gustaría que el médico
quede pegado al botón. Y segundo, no tengo forma de marcar una visita otro día, porque se duplica.»* Lo trajo
junto con el handoff del botón de etapa, pensando que lo resolvía. Revisado con `/plan-eng-review` el mismo día,
con segunda opinión de un subagente independiente.

## Lo primero: el handoff ya estaba en prod, y las capturas eran de antes

- `Downloads\Spira — Identidad Visual (6)\design_handoff_boton_etapa` es **el mismo** que
  [`docs/design_handoff_boton_etapa/`](design_handoff_boton_etapa/) (sólo difieren los finales de línea). Se
  implementó y salió el 2026-10-14: #464 + 0155 + #470, `v0.112.0` ([plan](plan-boton-etapa-dividido.md)). El
  bundle de `spira-app.vercel.app` trae `retroceder_etapa_visita`, `registrar_llegada_adelantada` y «Pedir retest».
- Las capturas del Director eran de un bundle **anterior al 11/10**: la fila con el «✓ Realizada» fijo de 150 px
  y el ⋮ se fue con `c2ed0f0`, y el sello «Realizada 14 Oct 09:51» del modal se fue con #464. La pestaña corría
  código viejo ([[gotcha-pestana-con-bundle-viejo]]).
- Contra los dos problemas, el handoff **no** resuelve ninguno:
  1. **El hueco.** El de la captura ya no existe, pero en prod queda otro: en una visita realizada la fila
     dibuja `Coord/Médico · [Atención médica, gris] · ~100 px vacíos · [Acciones]`. El botón de etapa tiene
     ancho fijo de 216 px (`visitas.css:247`) y «Acciones» se arrima a la derecha de ese hueco (`:249`).
  2. **La duplicación.** «Registrar llegada fuera de fecha» registra la llegada HOY (y una citación pasada no
     se toca, #460). No hay forma de decir «esta visita pasó el 8».

## Por qué se duplica (verificado en el código)

```
 14/10 09:51  Marcar llegada ──► arrived_at = now()  (14/10)      mark_arrived
              Iniciar atención ─► real_date  = 14/10, attended_at = now(), coordinador = quien clickea  (0102)
              Finalizar ────────► ready_at   = now()  (14/10)      mark_ready
              «Fecha realizada» ► real_date  = 08/10               setRealDate (visits.ts:380)

 motivosDelDia(D)  (dayVisitsFilter.ts:46-52)
   ├ real_date.eq.D                 → entra el 08/10
   ├ arrived_at ∈ D                 → entra el 14/10   ┐
   └ ready_at   ∈ D                 → entra el 14/10   ┘  las marcas NO miran real_date (comentario :37)
                                                          → la misma visita, en dos días
```

El espejo del cliente hace lo mismo: `diasDeLaVisita` (`calendario.ts:198-199`). Y no es lo único que sale mal
al cargar tarde con los botones de siempre:

- **Estadísticas:** 0 min de espera y de atención (`agregados.ts:138-139`, `Equipo.tsx:123-124`), sellos a las
  09:51 bajo una visita del 08/10 (`Equipo.tsx:515-518`).
- **Atribución:** `start_visit_attention` pisa el coordinador con quien clickea (`0102:262`), y Equipo cuenta una
  atendida como de quien inició la atención (`agregadosEquipo.ts:13-15`): la visita queda a nombre de quien la
  cargó, no de quien la atendió.
- **IP:** la alerta se ancla en `coalesce(attended_at, real_date 00:00)` (`0119:342-343`): con el sello de hoy,
  Farmacia ve 48 h desde la carga en vez de una alerta vencida desde el 8.
- **Listón del modal:** «Fin de atención 09:51» al lado de una visita fechada el 8.

## Qué cambia

```
 (a) REGLA DEL DÍA — una marca POSTERIOR a la fecha realizada no pone la visita en su día.
     marcaTardia(marca, real_date) = marca && real_date && isoDayAR(marca) > real_date     (lib/visits.ts)
     servidor  motivosDelDia(D):  and(arrived_at ∈ D, or(real_date.is.null, real_date.gte.D))   (×3 marcas)
               motivosDelRango:   and(arrived_at ∈ rango, or(real_date.is.null, real_date.gte.desde))  superconjunto
     cliente   diasDeLaVisita:    las marcas tardías no suman día

 (b) «VINO OTRO DÍA…» — 0158 + ítem del menú del botón de etapa (Por llegar, con o sin «no vino»)
     [⌄] «Vino otro día…» ─┐
     «Marcar llegada» con  ├─► VinoOtroDiaModal
       citación pasada:    │     · Fecha (≤ ayer; ≥ la última visita del cronograma ya realizada que va antes)
       «¿Vino ese día?» ───┘     · ¿Quién la atendió?  desplegable (list_protocol_coordinators), por defecto el asignado
                                 · aviso si cae fuera de ventana (fueraDeVentana)
                                   │ Cargar el 8 oct
                                   ▼
                registrar_visita_en_otra_fecha(visita, fecha, atendio)        (0158, SECURITY DEFINER)
                  guardas: authz (gerencia o coordina el estudio) · por llegar · fecha < hoy AR ·
                           fecha ≥ anterior realizada · atendio ∈ protocol_coordinators
                  escribe: real_date = fecha · attended_at queda NULL (no se sabe; como antes de la 0102) ·
                           coordinador = atendio · no_show_at = null · cargada_en_otra_fecha_at = now()
                                   │
                «En atención» el 08/10 ─► la lista salta a ese día ─► «Finalizar visita» como siempre
                (screening / randomización siguen por su cierre clínico)
                «Volver» el mismo día lo deshace: la 0158 re-declara retroceder_etapa_visita para que
                la marca del inicio sea coalesce(attended_at, cargada_en_otra_fecha_at)

 (c) HONESTIDAD DE LO QUE SE MUESTRA
     por construcción  attended_at NULL → la alerta de IP se ancla en el 08/10, sin sello ni duraciones inventadas
     con marcaTardia   listón «Fin de atención 09:51» → «Fin de atención · cargada el 14 oct»
                       fila «llegó 09:51» sólo si no es tardía · Equipo: duraciones, sellos y línea de tiempo
     «Atención médica» apagada si la visita no es de hoy («La visita es del 8 oct»)

 (d) FILA DE UNA VISITA REALIZADA (D1 = A2, eligió el Director) — sin hueco, el médico pegado al botón
     antes  Coord/Médico  ░Atención médica░  ········  [Acciones ⌄]
     ahora                              Coord/Médico  [Acciones ⌄]
            «✓ Visto por médico» pasa a la tira de indicadores (debajo del nombre)

 (e) OTRO CAMINO QUE DUPLICABA — «Iniciar atención» desde el modal fecha con hoy (VisitDetail.tsx:270):
     llegó el 8, se inicia el 14 → real_date 14 y la llegada del 8 la pone en dos días. Pasa a
     real_date ?? día de la llegada ?? hoy.
```

## Step 0 · Alcance

**Lo que ya existe y se reusa:**

| Pieza | Qué existe | Uso |
|---|---|---|
| Menú y su ejecución | `accionesDeVisita` (puro, con test) + `useAccionesDeVisita` (modales en `capas`) | Ítem nuevo + caso nuevo |
| Modal de fecha | `RescheduleModal` (fecha + aviso de ventana) | Molde del modal nuevo |
| Coordinadores del estudio | `useProtocolCoordinators` → `list_protocol_coordinators` (`data/pharma/coordinators.ts:15`) | El desplegable «¿Quién la atendió?» |
| Validación de coordinador | `set_visit_coordinator` (0065) valida contra `protocol_coordinators` | Molde de la guarda de `p_atendio` |
| Deshacer el mismo día | `retroceder_etapa_visita` (0155) | Se re-declara en la 0158 (misma firma) |
| Ventana | `fueraDeVentana` (`lib/visits.ts:340`) | El modal la usa |
| Día argentino | `isoDayAR` (`lib/dates.ts:149`) | Base de `marcaTardia` |
| Permiso | `coordina` (`coordinaElEstudio`: gerencia o asignado; NO `canClinical`) | Habilita el ítem |
| Duraciones | `duracionesDe` (`agregados.ts:136`) | `Equipo.tsx:134` tiene su propio `duracion` → pasa por `duracionesDe` |
| Aviso global | `avisar()` (`AvisoGlobal`) | El aviso al cargar |

**Lo que falta:** la 0158 (columna + RPC + `retroceder` re-declarada + `v_track_visits` con la columna al final), una
regla (`marcaTardia`), un ítem, un modal y tres lugares que respeten la regla.

**Complejidad:** ~12 archivos fuente, 1 componente nuevo, 1 migración. Supera los 8 del chequeo. Se evaluó hacer
sólo (a) —deja de duplicarse— y descartarlo: cargar una visita pasada seguiría siendo marcar tres etapas hoy y
corregir la fecha a mano, a nombre de quien carga, con horas de hoy, 0 min en las estadísticas y la alerta de IP
corrida. **Alcance completo**; la migración la eligió el Director (D2).

## Decisiones

**D1 · Fila de una visita realizada → A2 (eligió el Director, en segunda vuelta).** En `fin_atencion` la columna
de acciones tiene sólo «Acciones», de ancho natural (`.spira-split--fila.spira-split--acciones { width: auto }`);
«Atención médica» no se dibuja y «✓ Visto por médico» pasa a la tira de indicadores (`IndicadoresVisita`, que
hoy no se dibuja si `resumen` es null: con «visto» sí). Todas las realizadas quedan con el mismo ancho de
acciones → alineadas entre sí. **Costo aceptado:** Coord/Médico de las realizadas queda ~280 px más a la derecha
que en las activas. *La primera vez se le dijo «~180 px» y «alineadas dentro de Finalizadas»: estaba mal (cada
`.vcal-row` es su propia grilla; 394 px de acciones → ~116). La segunda opinión lo detectó y se volvió a
preguntar con el número bien.* Con «Ordenar por» Estado / Protocolo / Médico / Coordinador / Sin separar las
realizadas se mezclan con las activas y ahí Coord/Médico salta de x: se mira en el QA.

**D2 · Migración 0158 con RPC propia (eligió el Director).** `registrar_visita_en_otra_fecha(p_visit_id,
p_fecha, p_atendio)`. Se descartó usar `start_visit_attention` tal cual: pisa el coordinador con quien carga
(atribución falsa en Equipo), sella la hora del click como inicio (alerta de IP corrida, sellos y duraciones a
parchear) y no tiene guardas de etapa. Con `attended_at` NULL la alerta de IP, los sellos y las duraciones
quedan bien **por construcción**. Columna nueva `cargada_en_otra_fecha_at timestamptz`: cuándo se cargó (lo
muestra el modal y sostiene el «Volver» del mismo día). Quién la cargó ya queda en `audit_log`.

**D3 · Regla del día: «marca posterior a la fecha realizada = carga tardía» (auto).** *Posterior* y no *distinta*:
una llegada la noche anterior al inicio sigue contando su día. Una visita que cruza la medianoche (inicio el 10,
fin el 11) pasa a salir sólo el 10: **se invierte a propósito** el test `calendario.test.ts:136-140` («si una
marca cayó otro día, la visita aparece en los dos»). Es raro y la visita *es* del 10. Arregla en el acto las
visitas ya cargadas así (Rafael Gibeaud y Emmanuel Azcurra, V4 W8 de 222714, si se cargaron igual), sin tocar
datos.

**D4 · No cierra la visita (auto).** La deja «En atención» con su fecha; se finaliza con el botón de siempre.
Cerrarla en el mismo paso duplicaría el cierre clínico de screening (IVRS) y randomización.

**D5 · Funciona también con «no vino» (auto).** Al ser una RPC, limpia `no_show_at` en el mismo paso: el paciente
vino. Deshacer la carga no restaura la falta (misma decisión que la llegada adelantada de la 0155).

**D6 · La fecha (auto).** Máximo **ayer** (para hoy está el camino de siempre). Mínimo: la fecha realizada de la
última visita del cronograma ya atendida que va antes que ésta en la misma inscripción; sin ninguna, dos años
atrás. Importa sobre todo en la randomización: al finalizarla, `randomization_date = real_date` (0030) genera el
tratamiento entero, y un tipeo no se deshace después de finalizar. La base lo valida y el modal lo pide al abrir
con la MISMA función (`fecha_minima_para_cargar_visita`, una llamada) para fijar el `min` del `DateField`.
Fuera de ventana avisa, no frena. *Al implementar:* `patient_visits_kind_shape` sólo deja definición de visita a
las «programada», así que el mínimo por `sort_order` aplica a ésas (incluida la randomización del cronograma, que
es programada con su rol); las sueltas —retest, continuación, vnp, una «randomizacion» suelta— no tienen mínimo.

**D7 · Entradas (auto).** El ítem «Vino otro día…» del menú (sólo Por llegar: igual que «no vino», fuera de esa
etapa no es una acción que exista → se actualiza la regla escrita en `accionesDeVisita.ts:23-25`) y un
«¿Vino ese día?» en la confirmación de «Marcar llegada» de una visita con citación pasada, que abre el mismo modal
con esa fecha. Es el momento exacto en que se cometió el error de esta vez.

**D8 · Un modal propio, `VinoOtroDiaModal` (auto).** La fecha adentro del menú anidaría el popover del
`DateField` en el del menú ([[gotcha-popover-anidado-portal-cierra-al-padre]]); un modal es lo que hace
«Reprogramar».

**D9 · Después de cargar, la lista salta al día elegido (auto).** Si no, la visita desaparece de la lista donde
se la cargó con un «falta finalizarla» y no hay cómo llegar a ella. `useAccionesDeVisita` recibe un
`onCargadaEn(fecha)` opcional; `DayVisitsView` le pasa su `setDate`.

**Numeración.** La 0157 la tomó la sesión de Tutoriales (policy de Storage del bucket, aviso del 2026-10-14):
ésta es la **0158**. Si al implementar ya hay otra, CI (`check-migraciones`) frena el número repetido.

**D10 · Un solo predicado (auto).** `marcaTardia` en `lib/visits.ts`, al lado de `fueraDeVentana` (sin cliente de
Supabase: vitest la carga). La usan el día del cliente, el listón, la fila y Equipo. La condición del servidor es
su espejo en PostgREST, con el mismo comentario y los mismos casos.

## Revisión

**1 · Arquitectura.**
- **Orden de despliegue: migración PRIMERO.** La 0158 es aditiva: columna nueva, RPC nueva, `retroceder` con la
  misma firma y comportamiento superconjunto, y la columna agregada **al final** de `v_track_visits`
  (`v_patient_visits` no hace falta: la columna se lee de la tabla por `self`, como `retest_of_visit_id` en la
  0145). Un front viejo no la ve. El front nuevo sin la 0158 da PGRST202 → «Falta aplicar una actualización de la
  base (0158)», como la 0155.
- **El riesgo de la migración es la vista.** `create or replace view` sólo acepta columnas nuevas al final; hay
  que copiar la definición vigente (0145) **tal cual** y repetir `with (security_invoker = true)`. Como
  toca vistas con RLS, **se prueba en el banco** antes de pasar el SQL: `node scripts/banco-rls/equivalencia.mjs
  0158 --control` (lo que ve cada perfil no cambia), más los casos de la RPC y del `retroceder` re-declarado.
- **Trampas conocidas de la casa:** `set search_path = pg_catalog, public` y todo calificado (0056/0058), nada de
  `uuid_generate_v4`, nunca dos signos peso pegados en un comentario (0071), sentencias idempotentes.
- **La regla del día** decide en silencio qué ve la lista, la cola del médico, Semana, Mes y los puntos del
  calendario. La sintaxis anidada `and(…,or(…))` ya corre en prod (`sinMarcasDespuesDe`, `dayVisitsFilter.ts:10-11`):
  no es el riesgo. El riesgo es que servidor y cliente decidan distinto, y los tests del servidor sólo comparan el
  texto (`dayVisitsFilter.test.ts`). **La verificación real es el preview**: la lista del 08 y del 14 con la
  visita de Rafael, y el Mes de octubre.
- **Cambio de comportamiento a propósito:** finalizar HOY una visita iniciada otro día ya no la suma a las
  Finalizadas de hoy.

**2 · Calidad.**
- DRY: `marcaTardia` única; el modal usa `fueraDeVentana`; `Equipo.tsx` deja su `duracion` propio por
  `duracionesDe`; el desplegable reusa `useProtocolCoordinators`.
- Comentarios que quedan viejos y se actualizan en el mismo cambio: la cabecera de `motivosDelDia` («las marcas
  van aparte y sin mirar `real_date`», `dayVisitsFilter.ts:37-38`), `diasDeLaVisita` y su «una visita de dos días
  entra en los dos» (`calendario.ts:203`), la cabecera de `DayVisitRowItem` («las ACCIONES quedan siempre en la
  misma x», `:31-32`), la de `AtencionMedica` («SIEMPRE presente», `:227-235`), el ancho fijo de
  `visitas.css:243-246`, la regla del menú (`accionesDeVisita.ts:23-25`) y el diagrama de `useAccionesDeVisita`.
- Se sacó del alcance pasar `accionesDeVisita.ts:235` y `RescheduleModal.tsx:29` a `fueraDeVentana`: no es de este
  cambio, y con fecha vacía `RescheduleModal` cambiaría de comportamiento.

**3 · Tests** (vitest; criterio de la casa: lo que falla en silencio).

```
CÓDIGO                                                     FLUJOS (navegador, no test)
lib/visits.ts                                              Vino otro día
  └ marcaTardia                        [GAP → test]          ├ desde el menú y desde «¿Vino ese día?»
      null · sin real_date · mismo día · posterior ·         ├ default y mínimo de la fecha; máx = ayer
      anterior · 23:30 AR (02:30 UTC del día siguiente)      ├ desplegable con el asignado por defecto
data/dayVisitsFilter.ts                                      ├ fuera de ventana avisa, no frena
  ├ motivosDelDia: 3 marcas con or(real_date…)  [GAP]        ├ la lista salta al día; «Finalizar» la cierra
  └ motivosDelRango: ídem con `desde`           [GAP]        ├ «Volver» el mismo día → Por llegar
views/track/visitas/calendario.ts                            ├ sin 0158: mensaje «Falta aplicar…»
  └ diasDeLaVisita              [GAP; REGRESIÓN]             └ doble click → `ocupado` (una sola llamada)
      real 08 + marcas 14 → [08] · cruza medianoche      Fila realizada (A2)
      → [10]  (INVIERTE calendario.test.ts:136) ·          ├ sin hueco; «Visto» en los indicadores
      llegó 09, real 10 → [09,10] · sin real_date igual    └ anchos 1185 / 980 / 820 / 560 · Ordenar por Protocolo
views/track/accionesDeVisita.ts                            Lista del 08 y del 14 con la visita de Rafael
  ├ itemVinoOtroDia             [GAP]                      Equipo con una visita cargada otro día
  │   sólo por_llegar · con y sin «no vino» · sin coordina
  │   → apagado con porqué · orden en el menú
  └ itemVolver con carga del día [GAP]
      inicio con attended_at NULL y cargada hoy → habilitado;
      cargada otro día → apagado; anterior a la 0102 → apagado
views/track/visitHeaderRules.ts
  └ rotuloDeMarca               [GAP]   mismo día → hora · tardía → «cargada el 14 oct» · null → nada
views/track/estadisticas/agregados.ts
  └ duracionesDe                [GAP; REGRESIÓN]  sello tardío → null · mismos días → igual que hoy
DayVisitRowItem (pura extraída)
  └ atencionMedicaHabilitada    [GAP]   en el centro y de hoy → sí · de otro día → no, con «La visita es del 8 oct»
VisitDetail
  └ fechaParaIniciar            [GAP]   real_date ?? día de la llegada ?? hoy
SQL (banco PGlite, scripts/banco-rls/)
  ├ registrar_visita_en_otra_fecha: authz (gerencia / coordina / otro → 42501) · etapa (concurrió, en atención,
  │   fin → rechaza) · fecha (hoy, futura, anterior a la previa → rechaza) · atendio fuera del estudio → rechaza ·
  │   no_show_at se limpia · attended_at queda NULL · cargada_en_otra_fecha_at se sella
  ├ retroceder re-declarada: carga de hoy → vuelve a Por llegar y limpia la columna · carga de otro día → rechaza ·
  │   los casos de la 0155 siguen igual
  └ equivalencia.mjs 0158 --control: ningún perfil ve otra cosa
```

**4 · Performance.** Sin consultas nuevas en la lista: el `or(real_date…)` agrega una comparación por condición a
un `or` de cinco ramas que ya existe. El modal hace dos consultas al abrirse (coordinadores del estudio y las
visitas de la inscripción para el mínimo), sólo cuando se abre. Sin N+1.

## Segunda opinión (subagente independiente)

Doce hallazgos; los que cambiaron el plan:

1. **Atribución** (`0102:262` + `agregadosEquipo.ts:13-15`): «sin migración» dejaba la visita a nombre de quien
   la carga → se preguntó (D2) y el Director eligió la 0158.
2. **El número de D1 estaba mal** (~280 px, no ~180; las vistas y las no vistas se desalineaban) → se volvió a
   preguntar y el Director eligió A2.
3. **IP anclada en `attended_at`** (`0119:342`) → resuelto por construcción con `attended_at` NULL.
4. **«Atención médica» habilitada en una visita de otro día** (`DayVisitRowItem.tsx:250`): el pedido caía en la
   cola de ese día → apagada.
5. **`VisitDetail.tsx:270` también duplica** → (e).
6. **La visita desaparecía de la lista donde se la cargó** → D9.
7. **«¿Vino ese día?»** en la confirmación de la llegada → D7. Y sacar `fueraDeVentana` de `RescheduleModal` del
   alcance.
8. **Sin guardas en la base** → vienen con la 0158.
9. **Fecha sin mínimo útil** (randomización) → D6.
10. **Riesgo mal calibrado** (la sintaxis ya corre en prod; los tests del servidor comparan texto) → Revisión §1.
11. **`calendario.test.ts:136` se invierte**, no «sigue verde» → D3.
12. **Sellos y línea de tiempo de Equipo** siguen mostrando 09:51 → T4; la regla escrita del menú → D7.

Sin tensión pendiente: las doce se tomaron. La única que se discutió es la de las duraciones de una visita que
cruza la medianoche: el subagente propuso una regla más fina, que tampoco la salva (fin el 11 es posterior al 10
y al día del inicio). Se queda la regla simple y esas duraciones salen vacías (D3).

## Fallas posibles

| Camino nuevo | Falla realista | Test | Manejo | ¿Silenciosa? |
|---|---|---|---|---|
| 0158 vistas | `security_invoker` perdido al recrear → RLS de más o de menos | banco (equivalencia) | — | **sí, cubierta por el banco** |
| 0158 RPC | front desplegado antes que la 0158 | — | PGRST202 → «Falta aplicar… (0158)» | no |
| `motivosDelDia` / `diasDeLaVisita` | servidor y cliente deciden distinto → punto sin visita | casos espejo | preview del 08 y del 14 | **sí, cubierta por test + preview** |
| `marcaTardia` | borde horario (UTC vs AR) | sí (23:30 AR) | — | sí, cubierta por test |
| «Vino otro día» | admin que no coordina | sí (`itemVinoOtroDia`) | ítem apagado + 42501 → banner | no |
| «Vino otro día» | fecha equivocada | — | «Volver» el mismo día; después, «Fecha realizada» | no |
| «Vino otro día» | llegada marcada en otra pestaña al mismo tiempo | banco (etapa) | la base rechaza: ya no está por llegar | no |

Sin brechas críticas: lo silencioso tiene test o banco, y el preview lo confirma.

## NOT in scope

- **El vencimiento de los reportes se cuenta desde que se tilda el procedimiento** (`completed_at`, `0144:232`),
  no desde la fecha de la visita: una carga tardía hace que un reporte vencido el 8 figure en plazo. Ya pasa hoy
  con cualquier tilde tardío; anclarlo en `real_date` toca `computed_status` y merece su propia migración → TODO.
- **El aviso al finalizar** («¿qué se hizo hoy?», `useAvisoAlFinalizar.tsx:33-38`) habla de hoy también en una
  visita cargada de otro día. Copy menor; se mira en el QA.
- **Limpiar las horas de las dos visitas ya cargadas** (09:51 del 14). Con (a) dejan de duplicarse y con (c)
  dejan de mostrarse como hora de la visita y de contar 0 min. Son el registro honesto de cuándo se marcó: tocarlas
  es SQL sobre datos reales sin necesidad. Siguen atribuidas a quien las marcó; si no es quien las atendió, se
  corrige con el coordinador del encabezado.
- **Restaurar el «no vino»** al deshacer una carga (D5).
- **Cerrar en el mismo paso** (D4).
- **Pasar `accionesDeVisita.ts:235` y `RescheduleModal.tsx:29` a `fueraDeVentana`**: limpieza aparte.

## What already exists

Todo lo de la tabla de Step 0 se reusa; no se reconstruye nada. Lo nuevo: la 0158, `marcaTardia`, el ítem
`vino-otro-dia`, `VinoOtroDiaModal` y `registrarVisitaEnOtraFecha` en `data/dayVisits.ts`.

## Paralelización

Implementación secuencial. Todo cuelga de la 0158 y de `marcaTardia`, y casi todo vive en `views/track/`. La fila
(d) se podría separar, pero son minutos y comparte `DayVisitRowItem` con (c).

## Implementation Tasks

- [x] **T1 (P1, humano ~4 h / CC ~20 min)** — base — `0158_visita_cargada_en_otra_fecha.sql`: columna,
  `registrar_visita_en_otra_fecha`, `fecha_minima_para_cargar_visita`, `retroceder_etapa_visita` re-declarada,
  columna al final de `v_track_visits` (con `security_invoker`; `v_patient_visits` no hizo falta: la columna se lee
  de la tabla por `self`, como `retest_of_visit_id`), índice de `supabase/README.md`
  - Verificado: `scripts/banco-rls/casos-0158.mjs` 38/38; `equivalencia.mjs 0158 --control` sin diferencias de
    permisos (control 12/12); 6 marcadores de dollar-quote (par); la vista y `retroceder` difieren de la
    0145/0155 sólo en lo marcado
- [ ] **T2 (P1, humano ~2 h / CC ~15 min)** — día — `marcaTardia` + `motivosDelDia`, `motivosDelRango`,
  `diasDeLaVisita` + tests (invierte `calendario.test.ts:136`) + comentarios de cabecera
  - Verify: preview, lista del 08 y del 14, Mes de octubre
- [ ] **T3 (P1, humano ~4 h / CC ~25 min)** — acción — `registrarVisitaEnOtraFecha` (+ errores en castellano);
  `itemVinoOtroDia` e `itemVolver` con la carga del día + tests; `VinoOtroDiaModal`; caso en
  `useAccionesDeVisita` + `onCargadaEn`; «¿Vino ese día?» en la confirmación de la llegada; `DayVisitsView` salta
  al día
- [ ] **T4 (P1, humano ~2 h / CC ~15 min)** — honestidad — `rotuloDeMarca` + `VisitActionBar`; «llegó HH:MM» de
  la fila; `duracionesDe` + sellos y línea de tiempo de `Equipo.tsx`; «Atención médica» apagada si no es de hoy
  (pura + test)
- [ ] **T5 (P1, humano ~1 h / CC ~10 min)** — fila A2 — realizadas sin «Atención médica»; «Visto por médico» en
  `IndicadoresVisita`; «Acciones» de ancho natural; comentarios
  - Verify: preview a 1185 / 980 / 820 / 560, con y sin «Visto», y «Ordenar por: Protocolo»
- [ ] **T6 (P2, humano ~30 min / CC ~5 min)** — (e) — `fechaParaIniciar` en `VisitDetail` (pura + test)
- [ ] **T7 (P2, humano ~15 min / CC ~3 min)** — docs — `TODOS.md`: vencimiento de reportes anclado en el tilde

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 2 decisiones del Director (D1 en dos vueltas, D2), 8 auto-decididas; 12 hallazgos de la segunda opinión, todos tomados; 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** segunda opinión de un subagente Claude (Codex no está instalado). Sin tensión pendiente.
- **VERDICT:** ENG CLEARED — listo para implementar. Orden: 0158 en prod primero, después el front.

NO UNRESOLVED DECISIONS
