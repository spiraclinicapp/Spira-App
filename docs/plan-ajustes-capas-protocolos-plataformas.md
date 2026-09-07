# Plan — Ajustes: capas, permisos, protocolos y plataformas

**Origen:** `/plan-eng-review` del 2026-09-07, sobre el pedido del Director de seguir
trabajando el modal de Ajustes.
**Estado:** revisado y aprobado. Sin implementar.
**Ramas:** ninguna todavía. Se parte en **tres tandas** con PRs independientes.

---

## Lo que se pidió, textual

1. Un apartado para **configurar las plataformas** usadas, ligado al link que aparece en el
   reporte pendiente: "que ya quede predefinido y que al seleccionar Clario ya esté vinculado
   el link".
2. El **desplegable no se ve** al pulsarlo (captura adjunta al pedido). Que se vea, y que las
   variantes de adentro traigan **ya seteados los permisos de cada rol**.
3. Poder **elegir qué protocolos ve cada usuario**, además del rol.
4. **Sacar Lab y Contable**: que no se vea el "Todavía no está construido".

---

## Lo que YA existe (no se reconstruye)

| Pieza | Dónde | Qué falta de verdad |
|---|---|---|
| Autocompletado del link por plataforma | `views/track/procedimientos/reportes.ts:53-84` — `platformDefaultUrl`, `isDefaultLink`, `linkOnPlatformChange`, todo testeado | **el dato**: las 5 URLs están en `null` a propósito, y el lugar donde cargarlas |
| Scoping por protocolo | `protocol_coordinators` (`0002_tables.sql:47`), `is_assigned_coordinator`, toda la RLS de Coordinación cuelga de ahí | la **pantalla**: el front sólo lee (`useMyCoordinations`), se asigna por SQL a mano |
| Desplegable de varias opciones | `SearchableSelect.tsx:65-76`, `multiple: true` + `pluralLabel` — su comentario dice literalmente `("3 protocolos")` | nada: se usa tal cual para E4 |
| Consola de accesos con guards, CAS y auditoría | `0096_consola_de_accesos.sql` — `set_module_access`, `v_team_access`, `v_access_audit` | el espejo para protocolos, con el mismo patrón |
| Bloque "Con esto ve…" | `AccesoEditor.tsx:209-246` | sumarle el renglón del protocolo que queda huérfano |
| Vocabulario de niveles | `roles.ts:102` — `ROLE_PUEDE`, genérico y cierto | precisión por módulo donde la RLS la tenga escrita |

---

## Diagnóstico del desplegable invisible

No es el `SearchableSelect`: se abre, se posiciona bien, y se **pinta detrás** de la tarjeta
blanca opaca del modal.

```
document.body  (contexto de apilado raíz)
│
├─ scrim de SettingsModal ........ position:fixed   z-index: 220   ◄── tapa
│   └─ card  (var(--spira-white), OPACA, overflow:hidden)
│       ├─ [ Coordinación  ▾ ]  ◄── el disparador que se pulsó
│       └─ dialogScrim interno ... position:absolute z-index: 240
│
└─ popover portaleado a body ..... position:fixed   z-index:  60   ◄── tapado
        (SearchableSelect:432, y ocho componentes más)
```

Nueve componentes clavan `zIndex: 60` a mano; `MedicamentosView.tsx:1176` clava `61` (un parche
local del mismo eje). Contra `Modal.tsx` (50) funcionan; contra Ajustes (220) y `CommandPalette`
(100), no se ven.

**Alcance real:** no es sólo la grilla de Módulos. El desplegable de **Rol** en "Mi cuenta"
(`AccountSection.tsx:195`) está roto igual y nunca se reportó — la falla es silenciosa: no hay
error, no hay warning, el menú simplemente no está.

---

# TANDA 1 — el bug y la limpieza

**Sin migración. Sale sola, no depende de nada.**

## E1 · Escala de capas en `tokens.css`

```css
/* src/styles/tokens.css — el orden de apilado de la app, en un solo lugar.
   Se lee de abajo hacia arriba: lo de más abajo lo tapa lo de más arriba.
   Un popover SIEMPRE está por encima de lo que lo abrió; si no, no se ve. */
--spira-z-drawer:   50
--spira-z-modal:   220
--spira-z-dialog:  240
--spira-z-popover: 300
```

Consumen la escala: `SearchableSelect`, `DateField`, `DateRangeField`, `DateNavButton`,
`ActionMenu`, `FilterDropdown`, `MultiFilterMenu`, `AutocompleteInput`, el popover de
`MedicamentosView` (adiós al `61`), más `SettingsModal`, `Modal`, `Drawer`, `CommandPalette`.

**Riesgo asumido:** un popover abierto en el momento en que se abre un diálogo quedaría por
encima de él. En la práctica el `mousedown` afuera ya lo cierra antes de que el diálogo monte.

**Test — `src/styles/capas.test.ts`** (decisión 7A). Vitest corre en node, así que lee el CSS
y clava el invariante sin duplicar los números en TypeScript:

```
popover > dialog > modal > drawer
```

## E2 · Lab y Contable fuera de la consola de accesos

Regla nueva en `describeAccess` (`roles.ts:151`), que es donde vive el vocabulario del acceso:

```
módulo con proximamente = true
├── SIN nivel asignado ──► no se nombra en ningún lado (tampoco en `noVe`)
└── CON nivel asignado ──► SIGUE apareciendo en `inertes`
                           "le diste acceso, pero el módulo todavía no está
                            construido, así que no lo va a ver"
```

Y `MODULOS_ASIGNABLES` (`AccesoEditor.tsx:45`) filtra `proximamente`, así que **desde la UI ya
no se puede crear un acceso inerte**.

Por qué la segunda rama se queda: si en producción quedó un `lab` viejo, esta pantalla es el
único lugar donde alguien puede enterarse y revocarlo. Esconderlo sería mostrar menos de lo que
hay, que es justo lo contrario de la regla de honestidad de la app.

`MODULES`, el flag `proximamente` y toda su maquinaria (`AppShell:284`, `NotFoundView`,
`home.ts:48`, `searchIndex:152`) **no se tocan**: son el roadmap, y reponer Lab el día que
exista es sacar un flag.

**Tests:** dos casos nuevos en `roles.test.ts` (sin nivel → no se nombra; con nivel → sigue en
`inertes`). Este último ya está en `roles.test.ts:121`.

**Verificación en navegador:** abrir Ajustes › Equipo y accesos, pulsar el desplegable de
Coordinación (se ve), confirmar que Lab y Contable no aparecen ni en la grilla ni en el renglón
"No ve:", y repetir en Mi cuenta › Rol.

---

# TANDA 2 — permisos y protocolos

**Migración `0110` (la siguiente libre). ADITIVA ⇒ migración PRIMERO, después el front.**

## E3 · Las variantes dicen qué da cada nivel

Módulo nuevo `src/lib/permisos.ts`, con test. Ocho celdas (Coordinación×4, Farmacia×4).
**Cada frase concreta cita su policy en el comentario**; donde la RLS no separa por nivel, se
usa el texto genérico de `ROLE_PUEDE` y se dice que es genérico.

```
Farmacia · Operador
  "puede recibir medicación y dispensar"              ◄── 0050:134
  "no puede dar de alta ni eliminar del catálogo"

Coordinación · Líder
  "puede además asignar coordinadoras a protocolos"   ◄── 0009:101

Coordinación · Lectura
  "sólo puede mirar"                                  ◄── genérico: la RLS no lo separa
```

**Lo que NO se hace:** inventar verbos donde la RLS no los tiene escritos. `roles.ts:98` ya lo
advierte — "un texto que suena preciso y no lo es sería peor que uno modesto y cierto" — y en
una app auditable prometer un permiso que la RLS no da es el mismo error que mostrar un dato
inventado.

**Riesgo asumido:** la matriz puede desincronizarse si cambia la RLS y nadie la toca. El test
fija el texto, no puede consultar Postgres. La cita por celda es la mitigación: re-verificar una
frase es abrir una migración.

En `SearchableSelect`, `SelectOption` gana un `desc?: string` **opcional**. Dos cuidados que ya
costaron caro en este repo:

- La fila de opción hoy es un flex de una línea con `whiteSpace:'nowrap'` + ellipsis
  (`SearchableSelect.tsx:374`). Pasarla a dos líneas **sólo cuando hay `desc`**; sin `desc` el
  render no cambia en ninguno de los ~24 consumidores.
- El disparador de la grilla mide `width: 190` (`AccesoEditor.tsx:171`). Con descripciones hace
  falta `menuWidth="auto"`, o las frases se cortan.

## E4 · Elegir protocolos por usuario

### El modelo ya está; falta la llave

```
        gerencia (Ajustes › Equipo y accesos)
             │
             │  ✗ policy "lideres asignan" (0006:106 → 0009:101)
             │    using has_min_role('track','leader')     ◄── CARVE-OUT de seguridad
             ▼
   protocol_coordinators  ──►  is_assigned_coordinator()  ──►  RLS de Coordinación
   "Define qué pacientes                                        (patients, enrollments,
    ve cada una" (0002:54)                                       patient_visits, visitas…)
```

Sin migración, el selector guardaría **cero filas en silencio** — la RLS filtra callada y
0 filas afectadas es "sin permiso", no éxito.

### Migración 0110

**1. `set_protocol_access(p_user_id, p_protocol_id, p_asignado, p_expected)`**, `SECURITY
DEFINER`, espejo exacto de `set_module_access` (0096 §3):

- sesión (`auth.uid()` no nulo) → `28000`
- **authz adentro de la función**, no en una policy: es `SECURITY DEFINER`, la RLS no la mira.
  Exige `has_module('gerencia')` → `42501` si no
- **compare-and-swap total**: `p_expected` es lo que el navegador creía. Sin él, dos gerencias
  editando a la vez se pisan y la última gana en silencio — y en permisos "en silencio"
  significa que alguien conserva un acceso que se creyó revocado
- sale sin escribir si no hay nada que cambiar, para no ensuciar el historial

El carve-out de la 0009 **no se toca**: nadie gana escritura directa sobre la tabla.

**2. `trg_audit_protocol_coordinators`** — `after insert or update or delete ... execute
function audit_row()`. Hoy `protocol_coordinators` es la **única pieza del control de acceso sin
auditoría** (`0003:223` audita `user_module_roles` y nada más). Darle pantalla multiplica las
escrituras; el trigger va en la misma migración.

**3. `v_protocol_access_audit`** — vista NUEVA, no se extiende `v_access_audit`.

> **Por qué aparte.** Extender `v_access_audit` sería BREAKING para el front desplegado: las
> filas nuevas llegarían con `module = null` y `auditLine` (`roles.ts:205`) redactaría
> *"Fulana le dio acceso a un módulo a Mengana"* — una frase impecable que dice algo que no
> pasó, exactamente la falla contra la que existe su test. Con vista aparte la migración es
> **puramente aditiva**: va primero, el front viejo no ve ninguna fila nueva, y no hay que
> retener el `.sql` esperando un deploy (ya pasó con la 0068 y con la 0092).

### Front

- `src/data/protocolAccess.ts`: `useProtocolAssignments(userId)` + `setProtocolAccess()`, con
  traducción de errores al castellano (`42501`, `PGRST202`, `23505`) siguiendo el patrón de
  `data/team.ts:96`.
- El bloque va **entre Módulos y Administración**, y **sólo se dibuja si la persona tiene
  Coordinación** en el borrador: Farmacia es central (ve todos los protocolos) y ofrecerle un
  selector sería prometer un filtro que no existe.
- El selector es `SearchableSelect multiple` con `pluralLabel="protocolos"`. Componente nuevo: cero.
- `useProtocols` (`protocols.ts:31`) va en `EquipoYAccesosSection`, **no** en `AccesoEditor`, y
  baja por prop igual que `administradores`. `useSupabaseQuery` no cachea: adentro de la ficha se
  re-consultaría la misma lista cada vez que se entra y se sale de una persona.
- El historial de la ficha junta las dos vistas: 20 de cada una, merge por fecha, tope de 20
  **después** del merge. Es correcto — las 20 más nuevas del union están contenidas en la unión
  de las 20 más nuevas de cada lado.
- `auditLine` gana su rama de protocolo.

### El protocolo que queda huérfano

```
Con esto, Ana ve…
  ✓ Coordinación — puede cargar y editar
  ⚠ PROT-01 se queda SIN coordinadora: sus pacientes dejan de verse en
    Coordinación (gerencia y Farmacia los siguen viendo)
```

**Avisa, no bloquea** (decisión 8B). Bloquear el último parece un guard de integridad y es un
agujero de seguridad: si Ana se va y es la única de PROT-01, no se le podría revocar el acceso
hasta conseguirle reemplazo. Además `protocols.status` existe (`0002:39`): un estudio cerrado
puede quedar sin coordinadora, y eso es correcto.

**Tests de T2:** las 8 celdas de `permisos.ts` + los dos fallbacks (módulo y nivel
desconocidos → genérico, nunca vacío); la rama de protocolo de `auditLine`; el merge de los dos
historiales; la traducción de errores de `protocolAccess`.

---

# TANDA 3 — plataformas

**Migración `0111`. ADITIVA ⇒ migración PRIMERO.**

## E5 · `report_platforms` como única fuente

Hoy el catálogo está escrito **dos veces**: el check de `0089:84` y el `Record` de
`reportes.ts:30`. La tabla se queda con la verdad y las dos copias se van.

```sql
create table public.report_platforms (
  key        text primary key,     -- 'clario', 'iqvia', …
  label      text not null,
  url        text,                 -- null = todavía sin cargar
  color      text not null,        -- color de marca del proveedor
  sort_order integer not null,
  is_active  boolean not null default true
);
```

**Orden dentro del archivo, y no es negociable:** primero el `insert` de las cinco actuales
(`on conflict do nothing`), después `drop constraint report_definitions_platform_chk`, y recién
entonces la FK. Al revés, las filas viejas violan la constraint nueva.

> **Recordatorio del editor SQL de Supabase:** las sentencias de un bloque **no comparten
> sesión ni transacción**. Nada de tablas temporales entre sentencias, y todo idempotente para
> que reintentar sea volver a correr el bloque entero.

**La FK es segura:** `report_definitions` **no se embebe en ningún `select`** — se lee directo
con `.from('report_definitions')` (`protocolProcedures.ts:106`). No hay ambigüedad de PostgREST,
así que no se repite lo de la 0076 con Farmacia. *(Antes de agregar cualquier FK: buscar la
tabla en los `select(...)` del front. Esta se buscó.)*

## Front

`src/lib/platforms.tsx` — `PlatformsProvider` siguiendo el patrón de `lib/prefs.tsx`, para que
**`platformMeta()` siga siendo sincrónica** en los cinco lugares que ya la llaman
(`ProceduresCatalog`, `ReportForm`, `ProcedureEditModal`, `ReportCard`, `reportes.ts`). Carga
perezosa: se pide al entrar a Procedimientos o a Ajustes › Plataformas, así Farmacia no paga un
pedido que nunca usa. `PLATFORMS` queda como fallback mientras el fetch viaja.

Sección nueva `Ajustes › Plataformas`, cuarta entrada del riel (`SETTINGS_NAV`,
`SettingsModal.tsx:52` + `section.ts` y su test).

## Flujo completo del link, punta a punta

```
Ajustes › Plataformas                    Coordinación › Procedimientos
┌──────────────────────────┐             ┌────────────────────────────────┐
│ Clario                   │             │ Reporte: "ECG central"         │
│ https://portal.clario…   │────┐        │ Plataforma:  [ Clario     ▾ ]  │
│                          │    │        │ Link: https://portal.clario…   │
│ IQVIA                    │    │        │       ↑ autocompletado          │
│ (sin cargar)             │    │        └────────────────────────────────┘
└──────────────────────────┘    │                      │
                                │                      ▼
      report_platforms ◄────────┘        report_definitions.link
              │                                        │
              ▼                                        ▼
      PlatformsProvider                    Coordinación › Pendientes
      platformMeta('clario')      ────►    "ECG central · Clario  ↗"
                                            el link que hoy es sólo un rótulo
```

`linkOnPlatformChange` ya resuelve el caso difícil y está testeado: si el link se editó a mano,
cambiar de plataforma **no lo pisa**; si estaba vacío o era el default de la anterior, sí.

**Tests de T3:** fila de base → `PlatformMeta` (nulls, color faltante, orden por `sort_order`);
`is_active = false` **no se ofrece en el desplegable pero SÍ resuelve** las filas viejas que la
usan (ese es el caso silencioso: si no resolviera, un reporte histórico perdería su nombre);
fallback cuando el fetch falla; validación de la URL que acepta Ajustes.

---

## NO está en alcance

| Qué | Por qué |
|---|---|
| Borrar Lab y Contable de `MODULES` | Un acceso `lab` heredado quedaría invisible: nadie podría enterarse ni revocarlo. Y el enum de Postgres los conserva igual. |
| Matriz de permisos completa módulo×nivel | Sólo se escribe lo que se puede citar por `migración:línea`. El resto queda genérico y dicho como genérico. |
| Bloquear el último coordinador de un protocolo | Impediría revocarle el acceso a alguien que se va hoy. Se avisa, no se bloquea. |
| Extender `v_access_audit` con las filas de protocolo | Sería breaking para el front desplegado. Vista aparte + merge en el cliente. |
| Alerta permanente de protocolo activo sin coordinadora | Es una feature de Pendientes, no un ajuste de Ajustes. Anotada en `TODOS.md`. |
| Limpiar `protocol_coordinators` en `dar_de_baja` | Hoy es inerte por RLS. Anotada en `TODOS.md`, bloqueada por que E4 esté en prod. |
| Colores de plataforma editables desde Ajustes | Es identidad de marca del proveedor, no configuración operativa. Una plataforma nueva nace con el gris de "otra". |
| Suplantar a una persona para ver su pantalla | Rompe el rastro de auditoría. `describeAccess` es y sigue siendo una simulación de solo lectura. |

---

## Modos de falla

| Camino nuevo | Cómo falla en producción | ¿Test? | ¿Manejo? | ¿Se ve? |
|---|---|---|---|---|
| Escala de capas | un modal futuro con z-index alto vuelve a tapar los popovers | sí (`capas.test.ts`) | n/a | el test lo frena antes del merge |
| `describeAccess` con `proximamente` | un acceso `lab` heredado deja de nombrarse | sí | n/a | sí, sigue en `inertes` |
| `set_protocol_access` | dos gerencias editan a la vez y una pisa a la otra | no (server) | CAS + error en castellano | sí, error explícito |
| `set_protocol_access` | falta aplicar la migración | no | `PGRST202` traducido | sí, "Falta aplicar una actualización" |
| Protocolo sin coordinadora | los pacientes desaparecen de Coordinación | no | aviso antes de guardar | sí al guardar; **no después** → TODO |
| `permisos.ts` | la RLS cambia y la frase queda vieja | parcial (fija el texto) | cita por celda | **no** ⚠ |
| `PlatformsProvider` | el fetch falla y los chips pierden color | sí (fallback) | fallback a `PLATFORMS` | degradado, no roto |
| FK de plataformas | una fila vieja viola la constraint | no | seed **antes** de la FK | sí, la migración falla al aplicarse |

**Un hueco crítico y asumido:** `permisos.ts` puede desincronizarse de la RLS sin que nada
avise. Mitigación: cada celda cita su policy en el comentario, y el test falla si alguien cambia
el texto sin querer. No hay forma de verificarlo contra Postgres desde vitest.

---

## Paralelización

| Tanda | Módulos que toca | Depende de |
|---|---|---|
| T1 | `styles/`, `components/`, `shell/settings/`, `lib/roles.ts` | — |
| T2 | `supabase/`, `lib/`, `data/`, `shell/settings/` | T1 (toca los mismos archivos de `shell/settings/`) |
| T3 | `supabase/`, `lib/`, `data/`, `shell/settings/`, `views/track/procedimientos/` | T1 |

```
Carril A:  T1 ──► T2        (secuencial: los dos tocan shell/settings/AccesoEditor)
Carril B:       └──► T3     (independiente de T2; sólo comparte SettingsModal)
```

Después de T1, **T2 y T3 pueden ir en paralelo**. El único roce es `SettingsModal.tsx`: T3 le
agrega una entrada al riel y T2 no lo toca, así que el conflicto es improbable pero no imposible.
Si se hacen en paralelo, T3 mergea primero (su diff en ese archivo son dos líneas).

---

## Orden de despliegue, por migración

| Migración | Tipo | Orden |
|---|---|---|
| `0110` (RPC + trigger + vista nueva) | **aditiva** | **migración PRIMERO**, después el front. Nada de lo que ya existe cambia de forma; el que no funciona sin ella es el front nuevo. |
| `0111` (`report_platforms` + FK) | **aditiva** | **migración PRIMERO**. El front viejo sigue escribiendo los mismos cinco valores, todos sembrados. Y un valor desconocido ya cae a "otro" sin romper (`reportes.test.ts:48`). |

Al confirmarse cada una en prod, registrarla en el índice de `supabase/README.md` como
**Aplicada en prod (fecha)** — CI lo vigila con `scripts/check-migraciones.mjs`.

---

## Decisiones de esta revisión

| # | Decisión | Elegida |
|---|---|---|
| 0 | Alcance | Tres tandas: T1 sin migración, T2 y T3 con una cada una |
| 1 | Capas | Escala en `tokens.css`, no números sueltos |
| 2 | RLS de protocolos | RPC `SECURITY DEFINER`, no ampliar la policy |
| 3 | Auditoría | Trigger + vista **nueva** (aditiva, sin trampa de orden) |
| 4 | Permisos por rol | Concreto donde la RLS lo dice, genérico donde no |
| 5 | Catálogo de plataformas | Tabla `report_platforms` como única fuente |
| 6 | Lab y Contable | Fuera de toda la consola, `MODULES` intacto |
| 7 | Orden de capas | Test que lee `tokens.css` |
| 8 | Protocolo huérfano | Avisar antes de guardar, no bloquear |
