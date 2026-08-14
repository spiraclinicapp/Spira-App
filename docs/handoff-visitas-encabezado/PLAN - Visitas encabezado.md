# PLAN — Visitas · encabezado y cuerpo

Plan de implementación del handoff `HANDOFF - Visitas encabezado.md` (esta misma carpeta),
salido de una `/plan-eng-review` del 2026-08-13. Los dos HTML son la **fuente de verdad visual**:
ante cualquier duda de medida, color o estado, se abre el HTML, no se improvisa.

> **El handoff está escrito como si la pantalla fuera nueva, y no lo es.** El modal de visita
> existe desde el rediseño "Visitas del día v2" y hoy vive en `src/views/track/VisitDetail.tsx`
> (494 líneas), abierto desde **tres** lugares. El handoff describe solo uno de los tres y omite
> dos funciones que están en producción. Este plan es el handoff **reconciliado** con lo que hay.

---

## 1 · Decisiones cerradas (Director, 2026-08-13)

| # | Decisión | Resuelto |
|---|---|---|
| D1 | Comentarios y Atención médica **se conservan** | Cuerpo = Procedimientos \| Dispensación (como el mock), con **Comentarios dentro de la columna izquierda**, debajo de Procedimientos. A ancho completo dejaba una banda muerta entre los paneles cortos y el hilo; y de ese lado empareja las alturas, que es la misma medición que ya le eligió lugar en el diseño anterior (con dispensación cargada la derecha se estira casi al doble). "Solicitar médico" de la barra abre el `DoctorRequestModal` que ya existe. |
| D2 | "Médico a cargo" = **médico por visita** | Columna nueva `patient_visits.treating_physician` + la vista devuelve `coalesce(visita, paciente)`. Es lo único que hace verdadero el candado del handoff. |
| D3 | Anexo del botón primario (retroceder + historial) | **Fuera de alcance.** Anotado en `TODOS.md`. |
| D4 | Fecha real siempre editable | **"Corregir sí, crear no":** editable solo si `real_date` ya existe. Si está vacía, se dibuja el campo con "—" **inerte**. Única desviación deliberada del mock. |
| 1 | "Fértil" llegaba tarde y recomponía el encabezado | `fertility` se suma a `v_track_visits` en la misma migración. |
| 2 | Barra de acción en solo lectura (ficha / cola) | Listón + fracción **siempre**; a la derecha, el bloque punteado del mock con "Se opera desde Visitas del día". |
| 3 | Señales clínicas que el handoff no contempla | "Fuera de ventana" = pastilla roja junto a la etiqueta *Fecha real* (mismo patrón que el desvío). "No vino" = chip ámbar junto al listón (mismo patrón que "Médico solicitado"). |
| 4 | Editar la fecha estimada borraba el "No vino" | Se parte en dos funciones: `setEstimatedDate` (solo fecha, para el campo inline) y `rescheduleVisit` (fecha + limpia ausencia, para el modal de reagendar). |
| 5 | El campo de fecha del mock ≠ el `DateField` del repo | Control nuevo compacto `VisitDateInline` que **reusa los helpers puros** (`formatAR` / `parseARInput`). No se toca `DateField` (9 usos en producción). |
| 6 | Tests | Módulo puro `src/views/track/visitHeaderRules.ts` + su `.test.ts`, con el criterio del repo: **se testea lo que falla en silencio**. (El nombre lleva `Rules` porque Windows no distingue mayúsculas y `visitHeader.ts` chocaba con `VisitHeader.tsx`.) |
| 7 | **El foco NO lleva borde verde** — el handoff §6 lo pide y el estándar del proyecto lo prohíbe | Gana el estándar: foco = **elevación** (sombra tenue + levante de 1px), sin outline ni borde de color (`tokens.css`, "Foco de controles de formulario"; regla del Director, también en `CLAUDE.md`). El color se reserva para significado — estado clínico, alerta, error—, no para señalar dónde está el cursor. **No lo "corrijas" leyendo el handoff.** |
| 9 | **El nombre y el Nº de sujeto abren la ficha del paciente** (pedido del Director, fuera del handoff) | Reusa el mecanismo del buscador global: `onNavigate(module.key, 'protocolos', { patientId })` → `ProtocolsView` deriva el protocolo y abre la ficha. Se va al **mismo módulo en el que ya estás**, así no hay que evaluar permisos. Estilo `.spira-textlink` + `.spira-no-press`: hereda tipografía y color y subraya solo al apuntar o enfocar — el dato tiene que seguir leyéndose como el dato, y sin el opt-out el texto heredaría el levante de 1px de la micro-interacción global. Los dos van al MISMO lado, así que apuntar uno subraya los dos (`.spira-link-group` con `:has()`): si cada uno se resaltara solo, se leerían como dos destinos distintos. Desde la ficha del paciente NO se pasa el callback (llevaría a donde ya estás) y el texto queda pelado, sin botón. |
| 8 | Los controles de confirmar/descartar van **dentro** del campo, no al costado | Al costado —como los dibuja el mock— el bloque crece al entrar en edición y empuja el encabezado para el costado en cada clic, contra la promesa del propio handoff. Adentro, la caja mide siempre lo mismo. El bloque de fechas además tiene ancho fijo (`.spira-visit-dates`, en `tokens.css` para que el quiebre de <1100px pueda cambiarlo). |

---

## 2 · Lo que YA existe (y se reusa, no se reconstruye)

| Pieza del handoff | Ya existe en |
|---|---|
| Coordinador de la visita (pill, asignar/desasignar) | RPC `set_visit_coordinator` (0065) + `CoordinatorChip` con `SearchableSelect variant="chip"` |
| Sexo · Edad · F. nacimiento | `v_track_visits` (0049) + `ageFromBirth`, `SEX_LABELS`, `FERTILITY_LABELS` en `lib/visits.ts` |
| Desvío `+3 d` / fuera de ventana | `desvioDias()` y `fueraDeVentana()` en `lib/visits.ts:151-160` |
| Etapas, orden, colores, fracción "2 de 4" | `OPERATIONAL_STAGES` / `STAGE_ORDER` en `views/visitStates.tsx` |
| Qué botón mostrar y de quién es la marca | `NEXT_STEP` / `advanceRole()` en `views/track/advanceStep.ts` |
| Cierre clínico de screening / randomización | `ReadyOutcomeModal` + `markReadyWithOutcome` (0030) — **el botón primario tiene que seguir pasando por ahí** |
| Chip ámbar "Médico solicitado · 10:42" | `wants_doctor_at` (0049) + `WaitBadge` |
| Popup de motivo del médico | `DoctorRequestModal` (reusa `DoctorRequest bare` + `CommentThread`) |
| Navegación "1 de 4" + ↑↓ + seed sin parpadeo | `pos` / `onPrev` / `onNext` / `seed` de `VisitDetail` |
| Todos los íconos del §11 | `components/Icon.tsx` (falta solo el de "deshacer", que es de D3 → fuera de alcance) |
| Tokens del §1 | Son **exactamente** los `--spira-*` de `tokens.css` en tema claro. El ámbar `rgba(176,130,63,…)` es `--spira-warn` (#B0823F). |
| Breakpoints | `tokens.css` ya tiene media queries de layout (líneas 347, 367): el responsive va ahí, en clases, no en JS |

**Token nuevo:** `--ink-2 #2A4744` no existe. Se agrega como `--spira-ink-2` **con su valor de tema
oscuro** (si se escribe el hex literal, el modo oscuro se rompe: ahí la tinta es `#EDEDED`).

---

## 3 · NO está en alcance

| Ítem | Por qué |
|---|---|
| Anexo del botón primario: retroceder etapa | No existe RPC para deshacer una marca. → `TODOS.md` |
| Anexo del botón primario: ver historial | El historial vive en `audit_log`, que por RLS **solo lee gerencia**. Abrirlo es gobernanza ANMAT, no UI. → `TODOS.md` |
| Hora en "Inicio de atención" | Esa etapa sale de `real_date`, que es un `date` sin hora. Las otras dos sí la muestran. → `TODOS.md` (desacople del modelo) |
| Autor en la pastilla "Finalizada" | No hay `ready_by` en `patient_visits`; solo `ready_at`. Se muestra fecha y hora, **sin inventar el nombre**. |
| Fecha real editable con la visita sin atender | D4: crear la fecha desde el campo movería la ruta. La crea "Iniciar atención". |
| Retocar `DateField` | 9 formularios en producción; el caso de esta pantalla es uno solo. |

---

## 4 · Arquitectura

### 4.1 · Estructura del modal (después)

```
VisitDetail  (1120px · --spira-paper · radio 20)
├─ VisitHeader.tsx                                        ~259px
│  ├─ .util    51px  protocolo · código · tag de visita · [coordinador] · nav · cerrar
│  ├─ .idw    ~140px ┌─ identidad ────┬─ datos ────────┬─ fechas ──────────┐
│  │                 │ nombre 23/700  │ Sexo    Edad   │ FECHA EST.  [ 32px ]│
│  │                 │ nº paciente    │ F.nac   Fértil │ FECHA REAL  [ 32px ]│
│  │                 │ MÉDICO A CARGO │                │  └ pastillas: +3d / fuera de ventana
│  │                 └────────────────┴────────────────┴───────────────────┘
│  └─ VisitActionBar.tsx  68px
│        [ Concurrió al centro · 10:31 · sigue inicio de atención   2 DE 4 ]  [chips] [sec] [PRIMARIA]
│        [ ▬▬▬▬▬▬▬▬▬▬░░░░░░░░░░ riel 50% ]
└─ .body   grid 1fr 1fr, gap 14
   ├─ col izq: VisitProcedures   │  col der: VisitDispensationPanel
   │           + CommentThread   │  (la que se estira cuando hay dispensación)
```

### 4.2 · Flujo de datos (una consulta menos)

```
ANTES                                  DESPUÉS
useVisit(id)   ─┐                      useVisit(id) ──→ todo el encabezado
                ├→ encabezado            · sexo, birth_date        (0049)
usePatient(pid)─┘                        · fertility               (0079 ← nueva)
                                         · treating_physician      (0079: coalesce visita→paciente)
usePatient: BORRADO de VisitDetail. Con la 0079, los cinco datos salen de v_track_visits.
Efecto: −1 consulta por apertura y por cada salto con ↑↓; y el `seed` ya trae todo → sin reflow.
```

### 4.3 · Máquina de estados del campo de fecha (D4 + issue 5)

```
                    real_date == null
                          │
                    ┌─────▼─────┐   (no editable: "—" en --spira-faint, sin borde ni ícono)
                    │  INERTE   │    tooltip: «Se completa al iniciar la atención»
                    └───────────┘
   ── "Iniciar atención" escribe real_date ──▶

  real_date != null
        │
   ┌────▼─────┐  click / focus   ┌──────────┐  Enter  ó  ✓   ┌──────────┐
   │  LECTURA │ ───────────────▶ │ EDICIÓN  │ ─────────────▶ │ GUARDANDO│──▶ LECTURA
   │ 14px/600 │                  │ borde    │                └────┬─────┘
   └──────────┘ ◀─────────────── │ --track  │                     │ error RLS (0 filas)
                Escape  ó  ✗     │ + halo   │                     ▼
                (NO cierra el    │ [✓] [✗]  │              banner sereno arriba
                 modal — hoy sí) └──────────┘              y el valor vuelve al anterior
```

> **Bug a evitar (P1).** `VisitDetail.tsx:80` hace `if (e.key === 'Escape') { onClose(); return }`
> **antes** del filtro de `INPUT/TEXTAREA` de la línea 87. Con el campo enfocado, Escape cierra el
> modal entero en vez de descartar la edición. El guard de Escape tiene que mirar el target igual
> que ya lo hacen las flechas.

### 4.4 · Permisos y candados

```
                 día (operativo)            ficha / cola (context="patient")
médico           editable si NO concretada  candado siempre
coordinador      editable si NO concretada  chip inerte
fecha est.       editable                   texto sin borde
fecha real       editable si existe (D4)    texto sin borde
barra            listón + botón del rol     listón + bloque punteado "Se opera desde Visitas del día"
```

"Concretada" = `operational_stage === 'fin_atencion'`. La RLS sigue siendo el gate real; esto es
presentación (mismo criterio que el resto del repo).

---

## 5 · Migración 0079 (aditiva → **se aplica ANTES del deploy del front**)

Es aditiva pura: el front viejo hace `select('*')` e ignora columnas nuevas, y el `coalesce`
devuelve exactamente lo de hoy mientras la columna esté vacía. Por eso va **migración primero**
(el que no funciona sin ella es el front nuevo). No agrega ninguna FK, así que **no** puede
disparar el `PGRST201` que tiró el tablero de Farmacia con la 0076.

```
0079_visita_medico_y_fertilidad.sql
 1. alter table patient_visits add column if not exists treating_physician text;
 2. recrear v_patient_visits / v_track_visits:
      + pa.fertility
      + coalesce(v.treating_physician, pa.treating_physician) as treating_physician
 3. RPC set_visit_physician(p_visit_id, p_physician) SECURITY DEFINER
      authz: gerencia / track-admin / operator asignado (espeja set_visit_coordinator, 0065)
      rechaza si la visita está en fin_atencion (el candado, también server-side)
```

**Trampas respetadas al escribirla** (todas ya mordieron en este repo):
- **Patrón del asterisco congelado**: `v_patient_visits` hace `pv.*`, así que una columna nueva de
  `patient_visits` NO aparece hasta recrearla; y `v_track_visits` depende de ella → se dropean las
  dos, en orden. Por eso es `drop + create` y no `create or replace` (que además solo podría agregar
  columnas al final). Los dos cuerpos se copian **verbatim** de la versión vigente de cada una:
  `v_patient_visits` de la **0069**, `v_track_visits` de la **0071** — no de la 0068, que ya no es la última.
- Marcadores de dollar-quote del archivo: **par** (0071). Verificado: 2.
- En `plpgsql`, todos los nombres de columna calificados (0056/0058).
- Ninguna FK nueva → no puede repetir el `PGRST201` de la 0076.

**Estado: APLICADA en prod el 2026-08-13** y registrada en el índice de `supabase/README.md`. `node scripts/check-migraciones.mjs` → *79 migraciones, índice al día*.

---

## 6 · Tareas de implementación

Rama `feat/visitas-encabezado` (hay un hook que bloquea commits en `main`).

**Estado al 2026-08-13: T1-T8 implementadas y la 0079 APLICADA EN PROD.** Gate verde: `npm run build` = typecheck + 59 tests + build. La migración se verificó contra la API (la columna `fertility` y la función `set_visit_physician` responden 42501 —existen, sin permiso para anon— y no 42703/PGRST202). Falta: commitear, T9 (docs de cierre), desplegar y el QA logueado.

- [x] **T1 (P1, humano: ~1 día / CC: ~30 min)** — supabase — Migración 0079 + pasársela al Director
  - Sale de: D2, issue 1. Aditiva → se aplica **antes** del deploy.
  - Archivos: `supabase/migrations/0079_visita_medico_y_fertilidad.sql`, `supabase/README.md`
  - Verifica: la corre el Director; al confirmar, registrar "Aplicada en prod (fecha)" en el índice (lo vigila `scripts/check-migraciones.mjs`).

- [x] **T2 (P1, humano: ~2h / CC: ~15 min)** — tokens — `--spira-ink-2` en claro y oscuro + clases responsive
  - Sale de: §1 del handoff (token nuevo) y §10 (breakpoints 1100 / 900).
  - Archivos: `src/styles/tokens.css`
  - Verifica: `npm run build`; y mirar el modal en tema oscuro, que es donde un hex literal se rompe.

- [x] **T3 (P1, humano: ~1 día / CC: ~25 min)** — lógica — Módulo puro `visitHeader.ts` + tests
  - Sale de: issue 6. `puedeEditarFechaReal`, `medicoDeVisita`, `estaConcretada`, `etapaProgreso`, `contextoDeEtapa`, `datosDelPaciente`.
  - Archivos: `src/views/track/visitHeader.ts`, `src/views/track/visitHeader.test.ts`
  - Verifica: `npm run test` — y que cubra `desvioDias` / `fueraDeVentana`, que hoy están en producción sin un solo test.

- [x] **T4 (P1, humano: ~1 día / CC: ~30 min)** — capa de datos — `setEstimatedDate` + `setVisitPhysician`
  - Sale de: issue 4 (separar del reagendado) y D2.
  - Archivos: `src/data/visits.ts`, `src/data/dayVisits.ts`
  - Verifica: `rescheduleVisit` sigue con su único llamador (`RescheduleModal`) y sigue limpiando la ausencia.

- [x] **T5 (P1, humano: ~1 día / CC: ~30 min)** — componente — `VisitDateInline` (32px, ✓/✗, Enter/Escape)
  - Sale de: issue 5 + el bug de Escape de `VisitDetail.tsx:80`.
  - Archivos: `src/views/track/VisitDateInline.tsx`, `src/views/track/VisitDetail.tsx` (guard de Escape)
  - Verifica: con el campo enfocado, Escape descarta y **no** cierra el modal; ↑↓ no navegan (ya cubierto por el guard de INPUT).

- [x] **T6 (P1, humano: ~3 días / CC: ~1h)** — vista — `VisitHeader.tsx` (utilidades + identidad + datos + fechas)
  - Sale de: §3-§6 del handoff + issues 1, 3.
  - Archivos: `src/views/track/VisitHeader.tsx`, `VisitDetail.tsx` (borrar `usePatient`, `HeaderIdentity`, `VisitLine`, `VisitDates`, `row`)
  - Verifica: contra `Visitas - Encabezado definitivo.html`, los tres estados; `padding:0` en los botones de caja fija.

- [x] **T7 (P1, humano: ~2 días / CC: ~45 min)** — vista — `VisitActionBar.tsx` (listón + riel + acciones)
  - Sale de: §7 del handoff + issues 2, 3. **El botón primario tiene que seguir pasando por `onAdvance`**, que en screening/randomización abre `ReadyOutcomeModal`.
  - Archivos: `src/views/track/VisitActionBar.tsx`, `VisitDetail.tsx` (borrar `VerticalRoute` y `StepDot`)
  - Verifica: una sola acción sólida por pantalla; en `context="patient"`, bloque punteado y ningún botón.

- [x] **T8 (P2, humano: ~1 día / CC: ~20 min)** — cuerpo — dos columnas + Comentarios a ancho completo
  - Sale de: D1 y §8 del handoff.
  - Archivos: `src/views/track/VisitDetail.tsx`
  - Verifica: los controles del cuerpo a 42px; "Solicitar médico" abre `DoctorRequestModal`.

- [ ] **T9 (P2, humano: ~2h / CC: ~15 min)** — docs — bitácora + `supabase/README.md` + checklist de QA
  - Sale de: el ritual de cierre del repo.
  - Verifica: `npm run build` verde antes de abrir la PR.

---

## 7 · Modos de falla

| Camino nuevo | Cómo falla en producción | ¿Test? | ¿Manejo de error? | ¿Lo ve el usuario? |
|---|---|---|---|---|
| Guardar fecha real | RLS filtra en silencio → **0 filas afectadas ≠ éxito** | T3 (regla) | sí: 0 filas ⇒ mensaje sereno + revertir el valor | sí, banner |
| Guardar fecha estimada | ídem + borrar la ausencia por accidente | T3 | issue 4: función separada | sí |
| Guardar médico | RPC 42501 (sin permiso) o visita concretada | T3 (candado) | traducir a castellano, como `set_visit_coordinator` | sí |
| `fertility` sin la 0079 aplicada | la celda no aparece nunca (no rompe) | — | degradación silenciosa **aceptable** | no |
| Escape con el campo enfocado | cierra el modal y se pierde lo tipeado | T5 | guard por target | sí (hoy es un bug) |
| Riel / fracción mal calculados | falla **visible** | T3 | — | sí |

**Cero huecos críticos**: no queda ningún camino sin test, sin manejo de error y silencioso a la vez.

---

## 8 · Paralelización

| Lane | Tareas | Módulos |
|---|---|---|
| A | T1 → T4 | `supabase/`, `src/data/` (T4 depende del RPC de T1) |
| B | T2 → T5 | `src/styles/`, `src/components`-nivel (independiente de A) |
| C | T3 | `src/views/track/` lógica pura (independiente) |
| D | T6 → T7 → T8 | `src/views/track/` vistas — **depende de A, B y C** |

Arrancan A, B y C en paralelo. D espera a las tres. **Conflicto a vigilar:** C y D tocan
`src/views/track/`; C solo crea archivos nuevos, así que no se pisan si D no reescribe `visitHeader.ts`.

---

## 9 · Checklist de QA (el del handoff + lo que agregó la revisión)

Del handoff (§13):
- [ ] El estado se dice **una sola vez**, en el listón. La identidad no lleva chip de etapa.
- [ ] Una sola acción sólida por pantalla, y es la que avanza la etapa.
- [ ] Botones con caja fija llevan `padding:0`.
- [ ] Todos los números con `tabular-nums`.
- [ ] Alternar editable ↔ bloqueado **no cambia el alto**.
- [ ] "Fértil" ausente no deja hueco.
- [ ] Fecha real vacía muestra "—" y el bloque conserva su tamaño al completarse.
- [ ] Sin permiso, los campos pierden borde e ícono pero no tamaño de texto.

Agregados por la revisión:
- [ ] Escape con el campo de fecha enfocado **descarta la edición y no cierra el modal**.
- [ ] Abrir con ↑↓ diez visitas seguidas: el encabezado **nunca** se recompone.
- [ ] Desde la ficha del paciente y desde la cola del médico: barra con bloque punteado, cero botones.
- [ ] Una visita concretada: médico y coordinador con candado, las dos fechas todavía editables.
- [ ] Una visita fuera de ventana: pastilla roja junto a la etiqueta *Fecha real*.
- [ ] Una visita marcada "No vino": chip ámbar junto al listón; corregir la fecha estimada **no** lo borra.
- [ ] Tema **oscuro**: ningún hex literal del handoff sobrevive.
- [ ] Una visita de screening/randomización: el botón primario sigue abriendo el cierre clínico.
