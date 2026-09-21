# Plan — Estudios en Farmacia: el recorte por protocolo

Pedido del Director, **2026-09-20**:

> *"Quiero que apliquemos la lógica a farmacia de asignar protocolos, predeterminado viene con
> todos el rol, pero se le puede quitar la vista a ciertos estudios."*

El caso que lo dispara: **alguien nuevo o externo** —una pasante, una farmacéutica que entra, un
monitor— que arranca con acceso a unos pocos estudios y después se le abre el resto.

**Cuatro migraciones y cuatro PRs.** No entra en una: hay **60 policies vivas** que nombran a
Farmacia sobre 34 tablas —de las cuales **42, sobre 24 tablas, hay que recortar**— y **37 RPC**
`security definer` que saltean la RLS. La PR 1 es la **0139** (última aplicada
en prod, la 0138). Las otras tres **no llevan número fijo**: el siguiente libre al
pushear cada una (D18 del Director) — la 0138 ya se tomó una vez en el medio de esta.

---

## El hueco

Coordinación se aísla por protocolo desde el día uno: `protocol_coordinators` (0002) +
`is_assigned_coordinator()` (0006:50) metido en toda la RLS del módulo, y desde la 0110 con pantalla
propia en Ajustes › Equipo y accesos. **Farmacia no tiene nada de eso.** Es central por diseño: sus
policies abren con `has_module('pharma')` o `has_min_role('pharma', …)` a secas, sin mirar de qué
estudio es la fila. El comentario del bloque de estudios del editor de accesos lo dice con todas las
letras hoy:

> *"Sólo aparece si el borrador tiene Coordinación — Farmacia es central y ve todos los protocolos."*
> — `src/shell/settings/AccesoEditor.tsx:186`

Eso estuvo bien mientras la farmacia fuera una persona que ve todo. Con gente entrando y saliendo,
hace falta la perilla.

El tamaño exacto del hueco, contado sobre las definiciones **vivas** de cada policy (varias se
redefinieron: `ver drogas` en la 0032 y otra vez en la 0074, `ver protocolos asignados` en la 0006 y
otra vez en la 0028, todas las de `ip_units` en la 0037):

| | Policies | Tablas |
|---|---|---|
| Nombran a Farmacia | **60** | 34 |
| **Hay que recortar** | **42** | **24** |
| Excepciones (catálogo global y ajustes) | 18 | 10 |

---

## Las cinco decisiones que fijan el diseño

Todas del Director, el 2026-09-20, antes de escribir una línea.

### D1 · Es RLS de verdad, no un filtro de pantalla

El dato no le llega **ni por URL, ni por la API, ni en un reporte**. Un filtro de front habría
costado una tarde, pero en una app auditable prometer un recorte que la base no aplica es peor que
no tenerlo: la próxima persona lee la pantalla y cree que el candado existe.

### D2 · Dos estados por persona, no una lista negra

`ve todos los estudios` (lo predeterminado, y como queda **todo el mundo** el día que esto se
aplique) o `sólo estos`. Al quitarle el primero, pasa a **lista cerrada**: los estudios que se den
de alta más adelante **tampoco los va a ver** hasta que alguien se los dé.

La alternativa —guardar los estudios *quitados* y que el resto se vea siempre— es más fácil de
explicar, pero abre solo cada protocolo nuevo. Para el caso que lo dispara (alguien acotado a
propósito) eso es exactamente la fuga que no queremos.

### D3 · Alcanza a todo Farmacia

Los seis submódulos: no aparece el estudio ni sus pacientes, ni su stock, ni sus recepciones, ni sus
dispensaciones, ni sus pedidos, y los números de Estadísticas se calculan sin él. La alternativa
barata —recortar la medicación pero dejar la grilla de pacientes entera— dejaba a la persona viendo
al paciente y no viendo su medicación, que no se puede explicar.

### D4 · El recorte es del MÓDULO, no de la persona

Alguien con Coordinación (estudio X asignado) y Farmacia (X afuera) **ve X como coordinadora y no
como farmacéutica**. Cada módulo da lo suyo y se suman, que es cómo funciona hoy la RLS: sus
policies son uniones de cláusulas. No hay que pelearse con eso.

### D5 · Una tarjeta propia, hermana de la de Coordinación

Dos tarjetas en el editor de accesos, cada una aparece si su módulo está en el borrador. La de
Farmacia arranca con un interruptor; al apagarlo se despliegan el mismo botón «Añadir estudio» y los
mismos chips de la de arriba. No hay control nuevo que aprender.

### D6 · Lo que no es de ningún estudio lo ve todo Farmacia

Decisión del **2026-09-21**, al arrancar la PR 2. Desde la 0035 existe el **stock ambulatorio**: la
medicación general de la farmacia, que no pertenece a ningún protocolo —lotes y recepciones con
`protocol_id` null, y las salidas ambulatorias que salen de ellos—. El caso del Director: *"viene el
director y te dice dale un Seretide a él"*.

El recorte es **por estudio**, y eso no es de ninguno: lo ve todo Farmacia, acotado o no. Se resuelve en
la función madre —`pharma_alcanza_protocolo(null)` da `true`— y no policy por policy. Lo mismo un
movimiento de stock **sin lote**, que tampoco se puede atribuir a un estudio. Un id de lote
**inexistente** sigue sin alcanzarse: null es "no hay", un id inventado es otra cosa.

Se descartaron dos alternativas: que nadie acotado lo vea (el monitor externo no vería los nombres y
documentos de quienes recibieron medicación ambulatoria, pero una pasante tampoco podría entregar un
Seretide), y que sea un ítem más de la lista (flexible, pero con columna nueva y cambios en la tarjeta).

---

## El modelo

Dos piezas, y las dos **auditadas** — que es lo que la 0110 dejó sentado sobre el control de acceso:
en un sistema ANMAT / ICH-GCP, *"quién le dio acceso a esto"* no puede ser irrecuperable.

```sql
-- El interruptor. Va en user_module_roles y no en una tabla nueva: es un modificador DEL ROL, la
-- tabla ya tiene exactamente una fila por (persona, módulo) —su unique de la 0002:24— y ya la
-- audita trg_audit_user_module_roles (0003). Hoy lo lee sólo Farmacia; Coordinación es lista
-- cerrada SIEMPRE (protocol_coordinators), así que para 'track' la columna no significa nada.
alter table public.user_module_roles
  add column if not exists ve_todos_los_estudios boolean not null default true;

-- La lista cerrada. Sólo se lee cuando el interruptor está apagado.
create table if not exists public.pharma_protocol_access (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id)     on delete cascade,
  protocol_id uuid not null references public.protocols(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (user_id, protocol_id)
);
```

Dos detalles que ya nos costaron una tarde cada uno y por eso van escritos así:

- **La columna `id` no es decorativa.** `audit_row()` (0003) hace
  `case when tg_op = 'DELETE' then old.id else new.id end`, y Postgres resuelve `old.id` **al
  planificar**, sin importar por qué rama vaya a pasar. Una tabla auditada sin `id` revienta en la
  primera escritura con `42703`, señalando el cuerpo de `audit_row` y no la tabla nueva. Pasó con la
  0111.
- **El default es `gen_random_uuid()`**, de `pg_catalog`, y no `uuid_generate_v4()`, que vive en el
  schema `extensions`. Acá da igual —es un default de columna, que Postgres resuelve al hacer el DDL
  y guarda por OID— pero la misma migración define funciones con `set search_path` acotado, y ahí un
  `uuid_generate_v4()` sin calificar aplica **en verde** y revienta en la primera llamada real con
  `42883`. Pasó con la 0113. La regla es una sola para todo el archivo.

### Por qué la bandera y no «cero filas = ve todos»

Sin bandera, el estado se calcularía: *"si no tiene filas, ve todo"*. Entonces quitarle a alguien su
último estudio lo devolvería a ver **el centro entero**, sin que nadie lo decidiera y sin un solo
error. Una ampliación de permisos en silencio es justo lo que no puede pasar acá, y es la misma
familia de problema que `gotcha-estado-calculado-por-prioridades`: nombrar un estado no es
contenerlo.

### Consecuencia asumida, y va escrita para que no sorprenda

Si a alguien le sacás Farmacia y se la volvés a dar, la fila de `user_module_roles` se borra y
vuelve con `ve_todos_los_estudios = true`: **el recorte se pierde**. Las dos escrituras quedan en el
`audit_log` y gerencia ve la tarjeta en `ve todos` al momento de re-darle el módulo, así que no es
invisible — pero hay que saberlo. Es el precio de que la bandera viva pegada al rol, que es lo que
la hace desaparecer sola cuando el rol desaparece.

---

## La regla

Siete funciones `security definer stable`, calcadas en forma de `is_assigned_coordinator` y
`coordina_visita` (0006:50-70): una madre y seis transitivas que resuelven su protocolo y delegan.

```sql
-- ¿Este protocolo está DENTRO del alcance de Farmacia de quien consulta?
--
-- OJO CON EL NOMBRE: dice "alcanza", no "ve". NO comprueba el módulo ni el nivel a propósito —
-- ver más abajo por qué el barrido tiene que SUMAR esta condición y nunca reemplazar la que ya
-- estaba.
create or replace function public.pharma_alcanza_protocolo(proto_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $$
  select coalesce(
    (select r.ve_todos_los_estudios from public.user_module_roles r
      where r.user_id = auth.uid() and r.module = 'pharma'), true)
  or exists (
    select 1 from public.pharma_protocol_access a
     where a.user_id = auth.uid() and a.protocol_id = proto_id);
$$;
```

Las seis transitivas, una por salto que hoy existe en la RLS:

| Función | Resuelve el protocolo por |
|---|---|
| `pharma_alcanza_lote(lot_id)` | `medication_lots.protocol_id` (not null desde la 0032) |
| `pharma_alcanza_recepcion(reception_id)` | `medication_receptions.protocol_id` (not null, 0002) |
| `pharma_alcanza_solicitud(request_id)` | `dispensation_requests.protocol_id` (0071, desnormalizado justamente porque Farmacia no puede leer `patient_visits`) |
| `pharma_alcanza_dispensacion(disp_id)` | `dispensations.request_id` → la anterior |
| `pharma_alcanza_paciente(patient_id)` | `enrollments.protocol_id` — **cualquiera** de los suyos |
| `pharma_alcanza_pedido(pedido_id)` | `pedidos_medicacion.protocol_id` (0128) |

`pharma_alcanza_paciente` usa `exists` y no `=` por un motivo concreto: **hay pacientes inscriptos
en dos protocolos a la vez** en producción. Con un `=` contra el primer enrolamiento, un paciente de
LTS17231 y ACT18301 aparecería o desaparecería según el orden que devolviera la consulta — es la
misma trampa que hace que todo `enrollments[0]` del front esté mal. La regla es: lo alcanza si
alcanza **alguno** de sus estudios.

### El barrido SUMA una condición, nunca reemplaza una

Ésta es la parte donde este plan se puede romper en silencio, así que va explícita.

**Once de las 42 policies a recortar no dicen `has_module('pharma')`**: dicen
`has_role('pharma','leader')` o `has_min_role('pharma','viewer'|'operator')`. Son las de Reposición
(`reposicion_pedidos` 0125, `pedidos_medicacion` y `pedido_medicacion_items` 0128), las dos de
escritura de `ip_units` (0037), las dos de `patient_medications` (0050), `protocol_medications`
(0032), `protocol_alerts` (0006), `dispensation_ip_documents` (0071) y `dispensation_habilitaciones`
(0124).

Si el barrido *sustituye* esas cláusulas por una llamada a `pharma_alcanza_protocolo(...)`, el
recorte queda bien **y el nivel se pierde**: un `viewer` de Farmacia gana permiso de escritura sobre
los pedidos. Un candado nuevo que abre otro.

Por eso las funciones **no comprueban el módulo**, y la transformación es siempre aditiva:

```sql
-- ANTES
using (public.has_module('pharma') or public.has_module('gerencia'))
-- DESPUÉS
using ((public.has_module('pharma') and public.pharma_alcanza_protocolo(protocol_id))
       or public.has_module('gerencia'))

-- ANTES
using (public.has_min_role('pharma', 'operator'))
-- DESPUÉS
using (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_lote(lot_id))
```

Y la cláusula de **gerencia queda siempre afuera del `and`**: gerencia sigue viendo todo el centro,
igual que en Coordinación.

### Cómo se verifica que no quedó ninguna afuera

Dos greps, no uno — y el segundo es el que se olvida:

```bash
grep -rn "has_module('pharma')"  supabase/migrations/*.sql
grep -rn "has_role('pharma'\|has_min_role('pharma'" supabase/migrations/*.sql
```

Todo lo que salga tiene que estar en la lista de excepciones de abajo, o llevar su
`pharma_alcanza_*` al lado. **Y hay que mirar la definición VIVA, no la primera**: varias policies
se redefinieron después (`ver drogas` en la 0032 y otra vez en la 0074; `ver protocolos asignados`
en la 0006 y otra vez en la 0028; todas las de `ip_units` en la 0037). La que manda es la última
`create policy` de cada nombre.

### Lo que queda afuera a propósito

**Dieciocho policies sobre diez tablas** que no cuelgan de ningún protocolo. Van listadas en el
comentario de la 0139 para que la próxima persona no crea que se las saltearon:

`medications`, `drugs`, `medication_codes`, `laboratorios`, `laboratorio_codes` (catálogo global
desde la 0032/0033 — un producto no es de un estudio), `farmacia_ajustes` (configuración del
centro), y `report_definitions`, `report_platforms`, `visit_definitions`, `procedures` (catálogos de
Coordinación que Farmacia lee para nombrar cosas).

---

## Cómo se escribe

La tabla **no se escribe directo desde el front**. Es la misma razón que hizo falta el RPC de la
0110: la consola es de **gerencia**, y una policy de escritura sobre `pharma_protocol_access` que
aceptara a gerencia dejaría de paso que un `operator` de Farmacia se auto-asigne estudios. Un
`insert` directo, además, afectaría **cero filas en silencio** — la RLS filtra callada.

Dos RPC `security definer`, los dos con compare-and-swap:

- **`set_pharma_todos_los_estudios(p_user_id, p_todos, p_expected)`** — el interruptor.
- **`set_pharma_protocol_access(p_user_id, p_protocol_id, p_asignado, p_expected)`** — un estudio
  por llamada, espejo exacto de `set_protocol_access` (0110 §3).

El `p_expected` no es ceremonia: es lo que impide que dos gerencias editando a la vez se pisen y
gane la última sin que ninguna se entere. Los mensajes de los guards salen **en castellano desde el
servidor** («Alguien más cambió este acceso mientras lo editabas») y el front los deja pasar tal
cual, mismo criterio que `data/team.ts`.

### Los 37 RPC de Farmacia

Son `security definer`: **saltean la RLS entera**. Una policy que se escape filtra de más; un RPC
que se escape deja **escribir** sobre un estudio que la persona no ve — que es peor. Cada uno lleva
una guarda al entrar, con el mismo texto sereno que ya usan los demás:

```sql
if not public.pharma_alcanza_protocolo(v_protocol_id) then
  raise exception 'No tenés acceso a este estudio.' using errcode = 'insufficient_privilege';
end if;
```

La lista completa, tomada de los `supabase.rpc(...)` de `src/data/pharma/`, se reparte entre las
PRs 2, 3 y 4 según la tabla que tocan. `42501` ya está traducido por `pharmaErrorMessage`.

---

## El historial

Vista **nueva**: `v_pharma_protocol_access_audit`, con `security_invoker = true` (hereda la policy
`"gerencia ve auditoria"` de `audit_log`, así que quien no es gerencia recibe cero filas) y `left
join` a `protocols` (un protocolo borrado deja sus líneas de auditoría en pie: `audit_log` es
inmutable, y perderlas al leer sería recortar el registro).

**No se extiende `v_protocol_access_audit`.** El motivo lo dejó escrito la 0110 para el caso
idéntico: si las filas de Farmacia entran por la vista de Coordinación, el front que está hoy en
producción las redacta como *«le dio acceso a los pacientes del estudio X»* — una frase impecable
que dice algo que no pasó. Con vista aparte, la migración queda **puramente aditiva** y el front
viejo no ve una sola fila nueva.

En pantalla siguen siendo **un solo historial**: `mezclarHistorial` (`src/lib/roles.ts`) pasa a
recibir tres listas en vez de dos, y el tope de 20 se sigue aplicando **después** de mezclar. Para
gerencia, *"qué le pasó al acceso de esta persona"* es una pregunta sola.

El trigger es el `audit_row()` genérico de la 0003, el mismo que ya usan las otras ocho tablas
auditadas. Los cambios del interruptor no necesitan trigger propio: `user_module_roles` ya está
auditada.

---

## La pantalla

En `src/shell/settings/AccesoEditor.tsx`, una segunda tarjeta hermana de la que ya existe. Las dos
pasan a decir el módulo en el título, porque con las dos visibles «Estudios que ve» repetido dos
veces no distingue nada:

```
┌─ Estudios en Coordinación ─────────────────────────────┐
│  Sobre qué pacientes puede trabajar                    │
│  Estudios asignados          [+ Añadir estudio ▾]      │
│  ──────────────────────────────────────────────        │
│  LTS17231 ✕   ACT18301 ✕                               │
└────────────────────────────────────────────────────────┘

┌─ Estudios en Farmacia ─────────────────────────────────┐
│  Sobre qué estudios puede trabajar                     │
│  Ve todos los estudios                        [ ●—— ]  │
│  ──────────────────────────────────────────────        │
│  (con el interruptor apagado)                          │
│  Estudios asignados          [+ Añadir estudio ▾]      │
│  LTS17231 ✕                                            │
│  ⚠ Los estudios que se creen más adelante tampoco      │
│    los va a ver.                                       │
└────────────────────────────────────────────────────────┘
```

- **Prendido** (lo predeterminado, y como queda todo el mundo hoy) la tarjeta es **un renglón solo**.
  Al apagarlo se despliegan el botón y los chips, con el mismo `SearchableSelect` en modo `sumar`
  y el mismo `EstudioChip` de la tarjeta de arriba.
- El interruptor es `StToggle` (`settings/primitives.tsx:21`), el mismo del bloque de
  administración.
- El **aviso ámbar** es la contracara de D2 y va ahí porque es el único lugar donde alguien puede
  enterarse **antes** de que pase. Mismo tono y mismo `--spira-acc-deep-warn` que el aviso de «sin
  ningún estudio» de Coordinación.
- **Si además administra accesos**, en lugar del ámbar va la aclaración de siempre: como gerencia,
  igual ve todo el centro. Mira el **borrador**, así que darle o quitarle la administración cambia
  el aviso en el acto, sin guardar.
- El borrador del interruptor arranca en `null` = *"todavía no lo tocaron"*, con el mismo `??` que
  ya usa `borradorProtos`: con un `useState(vigente)` el estado inicial se congelaría en el valor
  del primer render, cuando la consulta todavía viaja.
- **Guardado con botón**, como el resto del editor: los cambios se juntan y se aplican al confirmar,
  secuenciales, y el interruptor va **antes** que los estudios (al revés, el historial se lee como
  si le hubieran dado estudios a alguien que todavía ve todos).

---

## Las cuatro PRs

Las migraciones van **primero** en las cuatro: mientras nadie esté acotado, el filtro nuevo no
cambia una sola fila. Es el caso aditivo puro, y el que no funciona sin la migración es el front
nuevo.

### PR 1 — El modelo, la consola y la grilla de estudios · migración **0139**

Tabla, columna, las siete funciones, los dos RPC, el trigger, la vista de historial, la tarjeta de
Ajustes, y el recorte sobre `protocols` (0028), `enrollments` (0010), `patients` (0006),
`protocol_activities`, `protocol_procedures` (0089), `protocol_alerts` y `protocol_medications`
(0032).

**Se verifica mirando:** acotás a alguien a un estudio y la grilla de Estudios y pacientes de
Farmacia le queda corta. Con gerencia, entera.

### PR 2 — Stock y Recepción

`medication_lots`, `medication_receptions`, `reception_items`, `stock_movements`, `ip_units`,
`ambulatory_dispensations` + sus RPC (`create_reception`, `create_ip_reception`, `verify_reception`,
`void_reception`, `adjust_stock`, `reassign_lot_stock`, `dispensar_ambulatoria`, …).

**Se verifica mirando:** Stock y Recepción no listan el estudio oculto, y el total del tablero baja.

**Lo que encontró al hacerla (migración 0140):**

- **15 policies vivas** sobre las seis tablas; se recortan **13** (las otras dos son de borrado y sólo
  de gerencia). Siete comprueban **nivel** desde la 0009, que cambió `has_module` por `has_min_role`:
  a todas se les SUMA el alcance, y el test con una *viewer* sin recorte prueba que no se perdió.
- **Las ocho vistas** que leen estas tablas son `security_invoker`: heredan el recorte sin tocarlas.
- **Siete RPC escriben** y saltean la RLS: los siete de arriba. Cada uno se reemplaza con su cuerpo
  **vivo** (0032, 0113, 0128, 0085, 0113, 0039, 0116), extraído por script, más una guarda al principio.
  Un comparador verifica que, sin la guarda, cada uno es idéntico byte a byte al original.
- **Los RPC que sólo LEEN también saltean la RLS**, y no van en esta PR: `stock_de_la_visita`,
  `alternativas_sustitucion`, `candidatos_otro` (dispensaciones → PR 3) y `pedidos_por_recibir`,
  `reposicion_del_periodo` (reposición → PR 4). Hasta entonces, por ahí se sigue viendo el stock de un
  estudio oculto: es parte del recorte parcial de la regla operativa.
- **Las guardas no exceptúan a gerencia**, a propósito. Gerencia **ve** todo el centro (las policies de
  lectura la dejan afuera del `and`), pero operar el stock es de Farmacia: las policies de escritura
  nunca tuvieron cláusula de gerencia, y estos RPC piden nivel de Farmacia antes que nada. Sólo muerde a
  quien tiene gerencia **y** Farmacia acotada.
- **Nadie fuera de Farmacia** lee estas tablas ni sus vistas, así que D4 no se toca: con los dos
  módulos, el IP de un estudio que coordinás no desaparece de Coordinación.

### PR 3 — Dispensaciones

`dispensation_requests`, `dispensation_request_items`, `dispensations`, `dispensation_items`,
`patient_medications`, `dispensation_ip_documents`, `dispensation_habilitaciones`,
`track_dispensations`, `patient_timeline` + sus RPC (`create_dispensation_request`, `start_dispensation_preparation`, `deliver_dispensation`,
`scan_dispensation_item`, …).

**Se verifica mirando:** el tablero de Farmacia no muestra solicitudes del estudio oculto, ni
entregadas ni pendientes.

**Lo que encontró al hacerla (migración 0141):**

- **Las dispensaciones son compartidas**, y eso decide todo. El pedido lo crea Coordinación y lo
  ejecuta Farmacia, así que casi todas las policies y la mitad de los RPC autorizan por **dos caminos**.
  D4 manda que una coordinadora con Farmacia acotada siga pidiendo medicación para su estudio.
- **18 policies:** el alcance se suma **sólo** a la cláusula de Farmacia; las de gerencia, contable y
  Coordinación (`coordina_visita`, `is_assigned_coordinator`) quedan letra por letra.
- **29 RPC con guarda**, clasificados por **su propio chequeo de permiso** —no por el archivo que los
  llama, que es el mismo para las dos pantallas—:
  - **15 de Farmacia**: el cuerpo sólo autoriza a Farmacia. La guarda es el alcance, sin excepciones.
  - **14 mixtos**: el cuerpo autoriza también por gerencia o Coordinación. La guarda deja pasar **ese
    camino, copiado del propio cuerpo**, y sólo corta a quien entra únicamente por Farmacia. No hay una
    regla común de "qué es Coordinación": cada guarda repite la del chequeo que tiene abajo.
  - **Sin guarda**, a propósito: los cuatro de sólo Coordinación (`cancel_dispensation_request`,
    `close_visit_ip`, `close_enrollment`, `dispense`), `farmaceuticas_disponibles` (devuelve personas,
    no datos de un estudio), los triggers, y los dos internos sin `execute` para `authenticated`.
- **Tres cuerpos vivos decían `create function` a secas** (`contexto_dispensacion`,
  `deliver_dispensation`, `visitas_dispensables`): en su migración venían después de un `drop function`.
  Copiados tal cual habrían cortado en prod con *"function already exists"*. Pasan a `create or replace`,
  y el comparador admite exactamente ese cambio y ningún otro.
- **Un pedido siempre es de un estudio.** `dispensation_requests.protocol_id` puede ser null en filas de
  antes de la 0071, y con D6 eso las habría abierto a todo acotado. `pharma_alcanza_solicitud` pasa a
  resolverlo por la visita, que siempre existe (`visit_id` y `patient_visits.enrollment_id` son not null).
- **Las seis vistas** que leen estas tablas son `security_invoker`. `v_visit_ip_status` la usa
  Coordinación, y a alguien con los dos módulos le sigue mostrando el IP de sus estudios por la
  cláusula de `coordina_visita`.
- Dos funciones de alcance nuevas: `pharma_alcanza_visita` y `pharma_alcanza_inscripcion`.

### PR 4 — Reposición, Estadísticas y el barrido final

`pedidos_medicacion`, `pedido_medicacion_items`, `reposicion_pedidos` (ojo: **`has_min_role`**, no
`has_module`), las vistas `v_pharma_report_*` / `v_ip_*` / `v_medication_*`, y el cierre: los dos
greps tienen que dar **sólo** la lista de excepciones documentada.

**Se verifica mirando:** los números del período se calculan sin el estudio oculto, y el pedido de
reposición no lo incluye.

### La regla operativa

**No acotar a nadie en prod hasta que esté aplicada la migración de la PR 4.** Entre la 1 y la 4 el recorte es
parcial —la grilla filtra pero el stock no—, y en una app auditable una restricción a medias es peor
que ninguna: promete un candado que todavía no cierra. Va también en el handoff de la jornada.

Y, por lo mismo: **el front se despliega primero y la migración inmediatamente después sólo si el
cambio altera lo que el front YA pide.** Acá no es el caso en ninguna de las cuatro (todo lo nuevo
es aditivo y nadie está acotado), así que va **migración primero**.

---

## Qué se testea

El criterio de `estados.test.ts`: lo que puede fallar **en silencio**, no lo que se ve mal en
pantalla.

- **`pharma_alcanza_*` en PGlite**, con esquema de juguete: los tres estados (sin fila de rol, con
  `ve_todos = true`, con `ve_todos = false` + lista) por cada una de las siete funciones. Es una
  regla booleana que, invertida, dibuja la pantalla entera prolija con las filas equivocadas.
- **El paciente en dos protocolos**: alcanza uno, no alcanza el otro → tiene que verlo.
- **La composición de las policies**: que `has_min_role('pharma','operator') and alcanza(...)` no
  perdió el nivel. Un caso por cada una de las **once** policies que comprueban nivel en vez de
  módulo — que son las que el barrido puede degradar sin que se note.
- **`mezclarHistorial` con tres listas**: que el tope de 20 se aplique después de mezclar y que
  ninguna línea de Farmacia se redacte con el texto de Coordinación.

Lo que **no** se testea con vitest: que la tarjeta se despliegue al apagar el interruptor. Eso falla
de manera visible y se verifica mirando.

---

## Lo que este plan NO hace

- **No toca Coordinación.** Sigue con su lista blanca de `protocol_coordinators`, sin interruptor.
  Unificar los dos mecanismos es una decisión aparte y más cara, y hoy no la pide nadie.
- **No recorta `contable`.** Varias policies de Farmacia lo nombran (`has_module('contable')`), pero
  el módulo no está construido. Cuando se construya, hereda el patrón.
- **No agrega la dimensión `module`** a la tabla de accesos. El día que Lab quiera lo mismo, la
  tabla se renombra y gana la columna; inventarla hoy sería una dimensión con un solo valor posible.
