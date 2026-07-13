# Para ver médico — rediseño completo (idéntico a las fotos, con dato honesto)

> Nace del `/plan-design-review` del 2026-07-11 sobre dos capturas de referencia que el Director
> pidió replicar **idénticas**. La referencia visual = esas capturas + `handoff_para_ver_medico/`
> (spec con tokens/medidas). Es el rediseño que se había DIFERIDO en la tanda de comentarios.

**Goal:** que "Para ver médico" se vea idéntico a las fotos — filtros + selector de fecha en la
cabecera, 3 StatCards, y la lista con WaitBadge (tiempo de espera con color por umbral), MotivoChip
y secciones "Faltan atender / Atendidos" — **sin mostrar ni un dato inventado** (regla dura del
proyecto). Para eso se agregan 3 datos reales (migración 0049).

## Decisión (review 2026-07-11)

**Idéntico + honesto.** Se agregan los campos que faltan para que los elementos protagónicos sean
reales, en vez de omitirlos o inventarlos:
- **`wants_doctor_at`** (timestamptz): se estampa al marcar "para ver médico" → el WaitBadge muestra
  el tiempo REAL esperando al médico (no `arrived_at`, que sería "tiempo en el sitio").
- **`doctor_marked_by`** (text): snapshot del **puesto** de quien marca → la línea "vía Enfermería".
- **`sex` + `birth_date`** expuestos en `v_track_visits` → "Fem. 31a" (ya viven en `patients`).

## Calibraciones Sereno (aplicadas)

- **Desplegables = componentes de la casa.** Filtro "Todos" → `SearchableSelect`; fecha "Hoy" →
  `DateField` (calendario). No se construye `FilterMenu`/`DatePicker` a medida (regla Sereno: son los
  únicos desplegable/selector de fecha). Se ven ≈ iguales a la foto.
- **Sin pulso.** La urgencia del WaitBadge se señala con **ícono + color estáticos** (forma, no
  animación) — preferencia "estética calma sin pulsos". (Veto del Director → se agrega el pulso.)
- **Color con intención.** El color del WaitBadge y del MotivoChip = ESTADO (urgencia/tipo), no
  decoración. Tonos apagados de Sereno (good/warn/danger), no semáforo saturado.
- **Reloj vivo:** recálculo cada 15s (`setInterval`), como el handoff.

## Mapa foto → implementación

```
CABECERA
  [▼ Todos]  ──────────────► SearchableSelect (estado: todos/faltan/atendidos)   [reemplaza los chips]
  [📅 Hoy 23/06/2026 ▼] ────► DateField (calendario)                              [reemplaza flechas prev/next]

STATS (3 cards, solo hoy)  ─► StatCard × 3  (NUEVO)
  • En la cola (users, accent)         = nº esperando            [real: count]
  • Espera más larga (hourglass)       = max(now - wants_doctor_at) [real: 0049]
  • Atendidos hoy (checkCircle, good)  = nº con doctor_seen_at hoy [real]

LISTA
  "FALTAN ATENDER · N"  (encabezado de sección)
  QueueRow (reescrita):
    [WaitBadge]  now - wants_doctor_at, color por umbral (NUEVO, real: 0049)
    avatar · CÓDIGO + pill protocolo + chip visita
    Nombre · Sexo Edad · Médico tratante            (sex/edad real: 0049)
    [MotivoChip motivo]  + "vía {doctor_marked_by}"  (motivo 0047; vía real: 0049)
    [💬 count] [Abrir] [Marcar visto]                (💬 0048; Abrir ya cableado)
  "ATENDIDOS · N"
  AttendedRow (sobria, NUEVO): ✓ Atendido hace Xm · Atendido por {médico} · Esperó {seen - wants_doctor_at}
```

## Migración 0049 (spec — SQL final va con la MISMA verificación adversarial que la 0048)

**Files:** `supabase/migrations/0049_pvm_wait_and_demographics.sql` (nuevo). A mano en el dashboard.

1. **Columnas nuevas en `patient_visits`:**
   - `wants_doctor_at timestamptz` (null = no marcado / marcado antes de la 0049).
   - `doctor_marked_by text` (null = sin registrar).
2. **Estampar en los RPC de marcado** (dos rutas): `mark_wants_doctor` (0047) y `toggle_wants_doctor`
   (0023). Al pasar a `wants_doctor=true`: `wants_doctor_at = now()` y `doctor_marked_by = <puesto del
   actor>` (snapshot: `select coalesce(nullif(btrim(puesto),''),'Equipo') from users where id=auth.uid()`,
   igual patrón que `add_visit_comment`). Al pasar a false: se dejan (para "Esperó" del AttendedRow).
3. **Recrear vistas (mirror 0047):** columnas nuevas en `patient_visits` → el `pv.*` de
   `v_patient_visits` está congelado → **hay que recrear `v_patient_visits` Y `v_track_visits`** (drop
   en orden). En `v_track_visits` sumar además `pa.sex`, `pa.birth_date` (del join a `patients`) +
   `v.wants_doctor_at`, `v.doctor_marked_by`. Reproducir las 36 columnas vigentes (35 de 0047 +
   `comments_count` de 0048) en orden + las nuevas.
4. Grants/revokes idénticos + `notify pgrst, 'reload schema';`.

> ⚠️ Igual que la 0048: **verificación adversarial del SQL antes de aplicar** (RLS, recreación de
> ambas vistas sin perder columnas, grants, idempotencia). Aplicar a mano en el dashboard ANTES de
> pushear front.
> **Transición honesta:** las filas ya en cola (marcadas antes de la 0049) tienen `wants_doctor_at`
> null → el WaitBadge muestra **"—"** (no un número inventado) hasta que se re-marquen.

## Data layer — `src/data/dayVisits.ts`

- Sumar a `DayVisitRow`: `wants_doctor_at: string | null`, `doctor_marked_by: string | null`,
  `sex: string | null`, `birth_date: string | null` (citando la 0049).
- `useDoctorQueue` ya trae la fila; no cambia la query (la vista ahora expone los campos).
- `markWantsDoctor`/`toggleWantsDoctor`: sin cambio de firma (el estampado es server-side en el RPC).

## Componentes

**Reusar:** `SearchableSelect` (filtro), `DateField` (fecha), `PrivacyAvatar`, `Icon`, `EmptyState`,
`VisitDetail` + Drawer de comentarios (ya cableados en la tanda 0048), tokens.

**Nuevos** (`src/views/track/` salvo StatCard en `components/`):
- `StatCard` — tarjeta de stat (ícono en cuadro tintado + valor display + label).
- `WaitBadge` — tiempo grande (display 800) + "esperando", tinte por umbral (good/warn/danger),
  ícono de urgencia estático si crítico. Recibe `wants_doctor_at`; null → "—".
- `MotivoChip` — pill con tono por motivo + ícono `alert` si urgente.
- `AttendedRow` — fila sobria de atendidos.
- Reescribir `QueueRow` (hoy inline en `DoctorQueueView`) con el layout de la foto.
- Helper `elapsedShort(fromISO, now)` → "1h 36m" / "7h 7m" (en `lib/dates`, sobre timestamptz).

## Estados de interacción

| Feature | Loading | Vacío | Error | Vivo |
|---|---|---|---|---|
| Lista | "Cargando cola…" (ya existe) | "Nadie en la cola" (EmptyState) | recuadro + Reintentar (ya existe) | reloj recalcula cada 15s |
| WaitBadge | — | `wants_doctor_at` null → "—" (honesto) | — | color/tiempo se actualizan con el tick |
| StatCards | ocultas hasta cargar | "Espera más larga" → "—" si cola vacía | — | se recalculan con el tick |
| Sección Atendidos | — | se oculta si 0 atendidos | — | "hace Xm" se actualiza |

## NO en alcance

- Otros días con cola (solo hoy tiene stats/filtro/WaitBadge; fuera de hoy = estado vacío, como hoy).
- Notificaciones / campana.
- Cambiar el flujo de "Marcar visto" (queda igual; solo cambia la fila).
- El pulso animado del prototipo (reemplazado por señal estática; ver calibraciones).

## Verificación

- `npm run typecheck` + `npm run build` verdes.
- QA en navegador (pablo): cabecera (filtro + fecha), 3 StatCards con números reales, WaitBadge con
  color por umbral, MotivoChip + "vía X", secciones Faltan/Atendidos, reloj vivo (esperar 15s), y que
  una fila marcada ANTES de la 0049 muestre "—" (no un número inventado).
- Cross-user + borrado de datos de prueba `TEST-*` de tu lado.

## Orden

1. Migración 0049 (verificar adversarial → aplicar a mano) — **bloquea el resto**.
2. Data layer (campos en `DayVisitRow`).
3. Componentes nuevos (StatCard, WaitBadge, MotivoChip, AttendedRow) en paralelo.
4. Reescribir `DoctorQueueView` (cabecera + stats + secciones + filas) + reloj vivo.

## ENG review (2026-07-11) — decisiones y hallazgos aplicados

- **D1 — "vía X" = snapshot del `puesto`** de quien marca (mismo patrón que `add_visit_comment`).
  Catálogo real (0045): Coordinadora / Investigador principal / Data manager / Farmacéutico /
  Enfermería / Administración. Muestra "vía {puesto}" REAL (los strings Recepción/Laboratorio/Sistema
  de la foto eran de demo; no existen como puesto). `doctor_marked_by` guarda ese snapshot.
- **D2 — Se SACA el filtro por médico tratante** (el `SearchableSelect` de médico que hoy tiene la
  vista) para que la cabecera quede idéntica a la foto (solo "Todos" + "Hoy"). Es una remoción
  deliberada de una capacidad existente. Quita código (menos superficie).
- **Estampar en las DOS rutas de marcado** (`mark_wants_doctor` 0047 + `toggle_wants_doctor` 0023):
  `wants_doctor_at = now()` y `doctor_marked_by`. Si solo una estampa, el reloj queda mal por la otra.
- **Solo en la transición false→true.** No estampar en cada `p_value=true`: un re-marcado idempotente o
  un cambio de motivo NO debe reiniciar el reloj. En SQL: `set wants_doctor_at = case when
  wants_doctor is distinct from true then now() else wants_doctor_at end` (ídem doctor_marked_by).
- **Reloj vivo = cómputo CLIENTE cada 15s** desde el `wants_doctor_at` fijo (sin refetch por tick);
  `useEffect` con `clearInterval` en el cleanup.
- **DRY:** extraer `elapsedMinutes(iso)` en `lib/dates` y que `fromNow` (0048) y el nuevo `elapsedShort`
  ("7h 7m") lo compartan.
- **Recrear las DOS vistas** en orden (drop v_track_visits → drop v_patient_visits → recrear ambas),
  como la 0047; la verificación adversarial confirma que nada más depende de `v_patient_visits`.
- **Backfill = null → "—"** (honesto; no derivar de `arrived_at`).

## Estado de implementación (2026-07-12)

**Migración `0049_pvm_wait_and_demographics.sql` escrita y verificada adversarialmente** (3 lentes:
RLS/authz, recreación de vistas, correctitud/idempotencia — misma disciplina que la 0048). Un
blocker real confirmado por dos lentes independientes: `v_patient_visits` (desde su origen en la
0023) nunca tuvo el `revoke insert/update/delete/truncate/references/trigger ... from authenticated`
que sí tiene `v_track_visits` — al ser una vista simple de una sola relación, Postgres la trata
como *automatically updatable*, y la policy RLS de `patient_visits` ("track modifica visitas
propias") es amplia. Sin el revoke, un coordinador podría hacer PATCH directo vía PostgREST y
falsificar `wants_doctor_at`/`doctor_marked_by` — exactamente el dato que esta migración nace para
hacer honesto. Se cerró en la 0049 (documentado in-line en el SQL). Es deuda heredada, no
introducida por esta migración — el hallazgo aplica igual a producción HOY, independiente de si se
aplica la 0049. **Falta: aplicar a mano en el dashboard** (mismo orden que la 0048 → push del front).

**Front implementado end-to-end**, typecheck + build verdes:
- `src/components/StatCard.tsx`, `src/views/track/WaitBadge.tsx` (+ `waitTone` exportado),
  `src/views/track/MotivoChip.tsx`, `src/views/track/AttendedRow.tsx` — nuevos.
- `src/lib/dates.ts`: `elapsedMinutes`/`elapsedShort`/`minutesBetween`/`durationShort`, todos sobre
  un `formatDurationMin` compartido (DRY con `fromNow`, de la tanda 0048).
- `src/lib/visits.ts`: `SEX_SHORT` (forma corta del sexo, "Fem."/"Masc.", junto a `SEX_LABELS`).
- `src/data/dayVisits.ts`: `wants_doctor_at`/`doctor_marked_by`/`sex`/`birth_date` en `DayVisitRow`.
- `src/views/DoctorQueueView.tsx` reescrita completa.

**Decisiones tomadas durante la implementación (no estaban en el plan original):**
- **Nombre del paciente visible, desvío deliberado de `PrivacyAvatar`.** Las fotos muestran
  `patient_name` como texto plano; `PrivacyAvatar` (usado en TODA la demás Track) lo oculta
  siempre (solo tooltip). Se lo señalé al Director como tensión real (no cosmética — privacidad de
  paciente es transversal en `CLAUDE.md`) y decidió explícitamente mostrarlo, **acotado a esta
  pantalla**. Documentado in-line en `AttendedRow.tsx`/`DoctorQueueView.tsx` para que no lea como
  descuido en el futuro.
- **Orden de "Faltan atender" = `wants_doctor_at` ascendente** (quien más espera, arriba), derivado
  de evidencia directa de las fotos (los tiempos de WaitBadge bajan monótonamente top-a-bottom:
  7h7m→6h42m→6h19m→6h4m→5h43m) y coincide con el criterio documentado del handoff original
  ("espera: el que hace más que espera, arriba"). Nulos (sin `wants_doctor_at`) van al final.
  "Atendidos" = `doctor_seen_at` descendente (más reciente arriba), también confirmado por los
  números de la foto.
- **Umbrales del WaitBadge recalibrados** (<1h good, 1–3h warn, ≥3h danger) en vez de los 30/60min
  del handoff original: esta cola espera HORAS, no minutos — con 30/60min TODA fila real quedaría
  en "danger" y el color dejaría de comunicar nada. Documentado como constantes ajustables en
  `WaitBadge.tsx` si no calzan con el ritmo real del centro.
- **Se sacó el "resaltado del que le toca"** (borde de color de la versión anterior) — no está en
  la referencia, y el mecanismo (franja de color) es un Don't documentado de `DESIGN.md`; el orden
  por espera ya comunica lo mismo. Aprovechado gratis por ser reescritura completa.
- **StatCards y WaitBadge se muestran en CUALQUIER día** (no solo hoy) — el bullet original de "NOT
  en alcance" los limitaba a hoy, pero `useDoctorQueue(date)` ya soporta navegar cualquier día con
  datos reales; gatearlos a "solo hoy" habría sido una regresión artificial sin base de honestidad
  de datos. Juicio de ingeniería, no decisión de privacidad — reversible en un ratito si no calza.
- Se conservó "Deshacer" (existía antes, no está en la foto) como botón discreto en `AttendedRow`
  para no perder esa capacidad.

## QA en navegador (2026-07-12) — COMPLETO, con un bug real encontrado y arreglado

El Director aplicó la 0049 y logueó él mismo la sesión del preview en el Browser pane (regla dura:
nunca tipeo contraseñas, ni siquiera desde `.claude/qa-creds.local.md` — se lo pedí a él en vez de
leer el archivo). Desde esa sesión ya autenticada verifiqué en vivo.

**Bug real encontrado por inspección de estilos computados (no visible en el texto de la página):**
`WaitBadge`/`MotivoChip`/2 de los 3 `StatCard` construían el tinte de fondo con
`` `${color}12` `` donde `color` podía ser el STRING `'var(--spira-danger)'` — `var(--spira-x)12`
**no es CSS válido** (el sufijo de alfa de 2 dígitos solo se puede pegar a un hex literal, no a una
referencia `var()`); el navegador descarta la declaración entera en silencio. Efecto real: el
`WaitBadge` en estado "sin dato" (`—`) tenía fondo transparente y borde heredado (ink), no el tinte
faint que debía tener. **Fix:** `TONE_HEX`/`FAINT_HEX` (hex literales) exportados desde
`WaitBadge.tsx`, usados para fondo/borde con alfa; `var(--spira-x)` se sigue usando (sin sufijo)
para texto/ícono sólidos, así queda reactivo al tema. `StatCard.tsx` documentó el contrato ("color
debe ser HEX, no var()"). Verificado con `getComputedStyle` tras el fix: `rgba(166,176,172,0.07)` /
`rgba(166,176,172,0.2)` para el WaitBadge en "—" (= `${FAINT_HEX}12`/`${FAINT_HEX}33` exactos), y
`rgba(92,138,90,...)` para el StatCard "Atendidos" (= `TONE_HEX.good` exacto). `npm run build`
verde después del fix.

**Verificado en vivo** (fila `PAC-B1`, marcada ANTES de que existiera la 0049 — el caso real del
fallback honesto): `wants_doctor_at` null → WaitBadge muestra **"—"** con tinte faint correcto (no
inventa un tiempo); `doctor_marked_by` null → **sin línea "vía X"** (no se renderiza, correcto);
`doctor_motivo` null → **sin MotivoChip** (correcto); `patient_name` = "Paciente B1" visible como
texto plano (confirma la desviación deliberada de `PrivacyAvatar`); StatCards reales ("En la cola"
1, "Espera más larga" —, "Atendidos" 0); sin errores de consola en ningún momento.

**Gotcha operativo de la sesión (documentado en [[browse-bloqueado-wdac]]):** con el documento del
preview en `document.hidden=true`, ni los clicks del Browser pane ni `.click()` nativo llegaban al
`onClick` de React (la app no tenía ningún bug — confirmado invocando el handler directo vía
`el[reactPropsKey].onClick(...)`, que sí navegó). Toda la navegación de esta verificación (rail →
submódulo → calendario → día) se hizo con ese bypass.

**No verificado en vivo** (mismo patrón de código que WaitBadge, ya confirmado funcionando, pero sin
un dato de prueba real para esta fila puntual): color del `MotivoChip` con un motivo real, y la
línea demográfica "Sexo Edad" con un paciente que tenga `sex`/`birth_date` cargados.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Alcance y estrategia | 0 | — | — |
| Codex Review | `/codex review` | 2da opinión independiente | 0 | — | — |
| Eng Review | `/plan-eng-review` | Arquitectura y tests (requerido) | 1 | clean | 2 decisiones (vía X=puesto; sacar filtro médico) + 8 recomendaciones (estampar 2 rutas / solo false→true / recrear 2 vistas / reloj cliente / DRY / backfill=null), 0 gaps críticos |
| Design Review | `/plan-design-review` | Huecos de UI/UX | 1 | clean | 4/10 → 9/10; decisión: idéntico+honesto (0049) + 4 calibraciones Sereno |
| DX Review | `/plan-devex-review` | Experiencia de desarrollo | 0 | — | — |

- **VERDICT:** ENG + DESIGN CLEARED — listo para implementar (con verificación adversarial de la 0049 antes de aplicar).

NO UNRESOLVED DECISIONS
