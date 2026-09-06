# Plan — Tareas (pieza 5): el submódulo `Inicio › Tareas` deja de estar vacío

Última pieza del rediseño que arrancó con el panel del Resumen (ver
[`plan-por-reprogramar.md`](plan-por-reprogramar.md) y
[`plan-pendientes-clase-de-alerta.md`](plan-pendientes-clase-de-alerta.md)). Es la más grande de
las cinco y la única que **no empieza en código**: `TODOS.md` la tenía anotada como *"bloqueado por
una decisión de producto sobre el modelo. Nada técnico."*

**Una migración: la `0108`.** Es **aditiva** (tablas nuevas) ⇒ va **primero**, el front después.

---

## Lo que había, y lo que resultó falso

`inicio/tareas` está declarado en `modules/registry.ts` con ícono y todo **desde hace meses**, y no
está en `VIEW_REGISTRY`: cae al `Placeholder`. Es un renglón del menú que promete una pantalla que
no existe.

**El handoff `design_handoff_resumen_tareas_enfoque` NO resuelve esta pantalla.** `TODOS.md` afirma
que *"el layout ya está: el handoff prefiere la variante compacta junto al título (D) o la columna
completa a la derecha (B)"*. Eso es cierto para otra cosa: **las cuatro variantes A/B/C/D exploran
dónde poner una CARD de tareas dentro del mosaico del Resumen de Coordinación**, no cómo es la
pantalla de Tareas. Y la casa elegida (D1) es una **pantalla propia**.

Lo que sí aporta el handoff, y se usa:

- **Los campos**: título, **duración estimada** y **vencimiento**.
- **Los tags de estado** y sus colores: `vence 25/08` y `urgente` → `warnDeep` (#8A631F);
  `atrasada` → `danger` (#A6483B).
- El patrón de renglón y de footer, que ya está implementado en la app.

**La pantalla hay que diseñarla.** Este plan define el MODELO y deja la pantalla descrita, no
dibujada: si querés un mock antes, es el momento de pedirlo (la regla de la casa es que el mock va
al repo ANTES de implementar).

---

## Decisiones tomadas

### D1 · Vive en `Inicio › Tareas`, su propia pantalla

Y **no** en Pendientes. Vale anotarlo porque **contradice a propósito** el reencuadre del mismo día
—*"Pendientes … está incluyendo avisos de reportes pendientes, visitas por reprogramar, ventanas
vencidas, tareas pendientes no dentro de mucho"*—: al bajar al detalle, el Director eligió la
pantalla propia.

Y hay una razón que lo sostiene: **Pendientes es todo automático** (estado calculado por la base,
que nadie escribe y que se archiva con motivo), y una tarea es lo primero que alguien **escribe**.
Se crean, se editan y se borran; no se "descartan". Meterlas ahí obligaría a que la misma lista
tenga dos ciclos de vida y dos gestos de cierre.

`inicio` es el módulo que **todos tienen** por definición del shell, así que Tareas queda disponible
para Farmacia igual que para Coordinación — y por eso la RLS **no puede apoyarse en el protocolo**
(ver D5).

### D2 · Se asignan a otras personas, y a varias

Tres formas, y las tres caben en el mismo modelo:

| | Qué es |
|---|---|
| **Personal** | Me la creo yo, para mí. Un asignado: yo. |
| **Asignada** | Se la creo a otra persona. Un asignado: ella. |
| **Grupal** | Una tarea, varios asignados. |

Más **replicar**: al crear, elegir varias personas y marcar *"una para cada una"* ⇒ se insertan **N
tareas independientes** en vez de una grupal. No pide nada en el schema: es el mismo alta ejecutada
N veces.

### D3 · El cierre se elige al crearla

Las dos formas, con un interruptor en el alta:

- **`cualquiera`** — la cierra cualquiera de los asignados y queda cerrada para todos. Es el encargo
  único: *"que alguien llame al laboratorio"*.
- **`cada_uno`** — cada persona cierra la suya y la tarjeta muestra el avance (**"2 de 4"**). Es el
  caso de *"todos firmen el training"*, donde el dato que importa es **quién falta**.

Por eso el "hecha" vive en **dos lugares distintos según el modo**, y no es duplicación:
`tasks.completed_at` para `cualquiera` (el hecho es uno solo) y `task_assignees.completed_at` para
`cada_uno` (el hecho es de cada persona). Ver D8: la lectura se unifica en una regla pura con test.

### D4 · Quién puede editar qué

| Quién | Qué puede |
|---|---|
| El **autor** | Todo: editar, reasignar, borrar |
| Un **asignado**, tarea **individual** | Sólo **marcarla hecha** |
| Un **asignado**, tarea **grupal** | También **editarla** |

Decisión del Director. La lógica: una tarea que otro te asignó es un **encargo** —cambiarle el
título o la fecha sería cambiar lo que te pidieron—, mientras que una grupal es **trabajo
compartido** y quien lo hace puede ajustarlo.

**"Grupal" se define por la cantidad de asignados** (más de uno), no por un campo aparte: un campo
podría quedar en desacuerdo con la lista, y entonces habría dos verdades.

**Nadie puede marcar hecha la parte de otro.** En `cada_uno`, cada quien cierra la suya; en
`cualquiera`, cerrar es cerrar la tarea, no la parte de nadie.

### D5 · La RLS: autor o asignado

`select` para quien la creó **o** está asignado. Nada más — ni gerencia, ni por protocolo.

**No se apoya en el protocolo a propósito**, y no es una omisión: Tareas vive en `inicio`, que todos
tienen (D1), y *"reponer las heladeras"* no es de ningún estudio. Apoyarse en `protocol_coordinators`
dejaría a Farmacia sin poder usar la pantalla.

**Gerencia NO ve las tareas ajenas.** Es lo contrario de lo que hace el resto de la app, y es
deliberado: una lista personal de pendientes que el jefe puede leer deja de usarse a los tres días,
y entonces la feature no sirve para lo que fue pedida. Las tareas **no son un registro clínico**.

### D6 · El vínculo es opcional

`patient_id`, `visit_id`, `protocol_id`, los tres nullable. *"Pedir turno con el laboratorio"* no
cuelga de nadie; *"llamar a Fulano por el consentimiento"* sí.

**Las tres FKs van `on delete set null`, no `restrict`.** Es el punto fino de la migración: el grafo
de esta app es casi todo `restrict`, pero acá `restrict` haría que **una tarea bloquee el borrado de
un paciente** — `delete_patient` (0024) borra enrollments y patients directo, así que fallaría con
un error de FK crudo, y el mensaje sereno que esa función ya prepara para el caso de Farmacia no lo
cubriría. Con `set null` la tarea sobrevive sin su vínculo, que es lo correcto: es el pendiente de
una persona, no un dato del paciente.

### D7 · Auditoría: sí, en `tasks`

Trigger `audit_row()` (0003) sobre `tasks`. Es transversal en esta app y no se le hacen excepciones.

**No** sobre `task_assignees`: sus cambios son parte de la misma operación —crear o reasignar una
tarea— y auditarlos por separado llenaría el log de dos filas por gesto. Marcar hecha **sí** queda
registrada, porque toca `tasks` en modo `cualquiera` y porque `task_assignees.completed_at` guarda
la marca con su persona.

### D8 · Las reglas puras, con test

Tres, y las tres fallan **en silencio**:

- **`estadoDeTarea(tarea, asignados, hoy)`** → `hecha` | `vencida` | `por_vencer` | `pendiente`.
  Tiene que leer el "hecha" **del lugar que corresponde según el modo** (D3). Si lo lee del otro,
  una tarea cerrada sigue apareciendo pendiente —o peor, una abierta se muestra hecha— y la pantalla
  se dibuja perfecta.
- **`avanceDeTarea(asignados)`** → `{ hechas, total }` para el "2 de 4". Un off-by-one dice que
  falta gente que ya cerró.
- **`puedeEditar(tarea, asignados, userId)`** → la regla de D4. Invertida, alguien edita el encargo
  que le hicieron, o no puede tocar la grupal que está haciendo.

### D9 · Cualquiera le puede asignar a cualquiera

Sin reglas de quién a quién. Es una lista de pendientes, no un permiso, y en un centro de diez
personas poner burocracia ahí inventa un problema que no existe. **Queda anotado por si cambia de
opinión**: acotarlo después es una línea en el RPC, no una migración.

---

## El modelo

```sql
create table public.tasks (
  id                uuid primary key default uuid_generate_v4(),
  title             text not null,
  detail            text,
  due_date          date,                    -- vencimiento; nullable (una tarea sin fecha vale)
  estimated_minutes integer,                 -- "duración estimada" del handoff; nullable
  completion_mode   text not null default 'cada_uno'
                      check (completion_mode in ('cualquiera', 'cada_uno')),   -- D3
  completed_at      timestamptz,             -- sólo para 'cualquiera'
  completed_by      uuid references public.users(id),
  patient_id        uuid references public.patients(id)        on delete set null,  -- D6
  visit_id          uuid references public.patient_visits(id)  on delete set null,
  protocol_id       uuid references public.protocols(id)       on delete set null,
  created_by        uuid not null default auth.uid() references public.users(id),
  created_by_name   text not null,           -- snapshot: la RLS de users sólo muestra la fila propia
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);

create table public.task_assignees (
  task_id      uuid not null references public.tasks(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  user_name    text not null,                -- snapshot, mismo motivo
  completed_at timestamptz,                  -- sólo para 'cada_uno'
  primary key (task_id, user_id)
);
```

**Los `*_name` desnormalizados** siguen el patrón que la app ya usa desde la 0048 (`author_name`) y
la 0065 (`coordinator_name`): la RLS de `users` sólo deja ver la fila propia, así que un join
ocultaría en silencio el nombre de todos los demás.

**Las mutaciones van por RPC**, no por `update` directo: crear una tarea con N asignados toca dos
tablas y tiene que ser atómico, y la regla de edición (D4) depende de la cantidad de asignados —
una policy con esa subconsulta sería difícil de leer y de auditar. Cuatro funciones
`security definer`: `create_task` (con `p_replicar` para D2), `set_task_done`, `update_task`,
`delete_task`. Cada una chequea el permiso **a mano y como primera verificación**, porque un
`security definer` no lo hace la RLS (la lección de la 0096).

---

## Cómo lo partiría

Son cuatro entregas y la primera bloquea a las demás:

| | Qué | Bloquea |
|---|---|---|
| **1** | Este plan | — |
| **2** | La migración `0108` — tablas, RLS, RPCs, auditoría. **Se aplica antes de mergear el front.** | 3 y 4 |
| **3** | `src/data/tareas.ts` + las tres reglas puras con sus tests | 4 |
| **4** | La pantalla `inicio/tareas` + el modal de alta, y su entrada en `VIEW_REGISTRY` | — |

La 3 y la 4 pueden ir juntas si la pantalla sale corta.

---

## Verificación

`npm run build` verde + mirarlo en el navegador. Lo que hay que ver, y **con dos cuentas**, porque
lo que esta feature promete es justamente que una no vea lo de la otra:

- Una tarea personal se crea, se edita y se marca hecha.
- Una **asignada** aparece en la lista de la otra persona, que **sólo la puede marcar hecha** — sin
  botón de editar, y el RPC la rechaza si se la llama igual.
- Una **grupal en `cada_uno`** muestra **"2 de 4"** y cada quien cierra la suya.
- Una **grupal en `cualquiera`** la cierra uno y queda cerrada para todos.
- **Replicar en tres personas** crea tres tareas independientes: editar una no toca a las otras.
- **La RLS**: una tarea ajena no aparece, ni siquiera para gerencia (D5).
- **El vínculo**: borrar un paciente con una tarea colgada **no falla** y la tarea queda sin vínculo
  (D6). Se prueba con un `TEST-*` propio, nunca con datos reales.

---

## Fuera de alcance

- **Una card de Tareas en el Resumen** (las cuatro variantes del handoff). Se decide cuando la
  pantalla exista y se sepa qué vale la pena asomar.
- **Tareas en Pendientes** (D1).
- **Recurrencia** ("todos los lunes"), recordatorios y notificaciones.
- **Adjuntos** y comentarios en una tarea.
- Cualquier regla de **quién le puede asignar a quién** (D9).
