# Diseño — Carga de visitas históricas (estimada + real) a Spira

**Fecha:** 2026-07-21
**Estado:** spec para revisión (pre-implementación)
**Fuente:** `Visitas estimada real (1).xlsx` (provisto por el Director)

---

## 1. Objetivo

Introducir en Spira el histórico de visitas de 4 protocolos ya creados, con sus **dos
fechas por visita**:

- **Estimada** — la fecha teórica *según el cronograma que vive dentro de Spira*
  (`visit_definitions`, offsets sobre un ancla). La **genera Spira sola**, no se carga a mano.
- **Real** — cuándo vino de verdad el paciente (`patient_visits.real_date`).

Y hacer que **ambas se vean** en la app (hoy la real queda tapada en las pantallas del
cronograma; ver §7).

Es carga de **datos reales en producción**, sistema auditable (ANMAT/ICH-GCP). Las reglas
duras de `CLAUDE.md` aplican: sin dato inventado, sin borrados en lote, script idempotente que
corre **el Director** a mano en Supabase (no hay acceso SQL directo desde la sesión).

---

## 2. La fuente (el Excel)

Tres hojas:

| Hoja | Contenido | Filas |
|---|---|---|
| **Visitas** | por paciente y visita (V1…V29): etiqueta + Fecha Estimada, etiqueta + Fecha Real | 414 |
| **Resumen pacientes** | padrón por protocolo + conteo de visitas | 29 |
| **Cronograma** | plantilla por protocolo: visita → semana/día (offset) → procedimiento | 3 protocolos |

**Números reales (verificados con parser propio, corregido):**

| Protocolo | Personas | Enrollments | Cronograma en Excel |
|---|---|---|---|
| CEREN-2 | 5 | 5 | sí |
| ACT18301 | 8 | 8 | sí |
| THESEUS | 8 | 8 | sí |
| LTS 17231 | 8 | 8 | **sí** (provisto 2026-07-21, a confirmar) |
| **Únicos** | **21 personas** | **29 enrollments** | |

- Visitas con **fecha real** (ya ocurrieron): **262**. Futuras (sin real): 150.
- Las fechas están guardadas como **texto**, no como fechas de Excel → en la columna Real
  conviven fechas ISO, celdas vacías (futuras) y 2 notas de texto.
- **IVRS**: todos de 12 dígitos, formato uniforme (`032000320001`).

### 2.1 Rollover ACT18301 → LTS 17231

Los 8 pacientes de ACT18301 son **las mismas 8 personas** que en LTS 17231 (su estudio de
extensión), con **dos IVRS distintos** (uno por estudio: `0320015000XX` vs `0320015200XX`).
Por eso 21 personas ≠ 29 enrollments.

### 2.2 Calidad de datos a resolver (informe de discrepancias)

Ninguna de estas se carga con dato inventado; van a un informe para que el Director decida:

- **6 filas con año descuadrado** (typos: real un año adelantado, físicamente imposible).
  Ej.: `CEREN-2 IVRS …0001 V6 — est 2025-11-19, real 2026-11-25`. (Distinguir del cruce de fin
  de año legítimo: `CEREN-2 IVRS …0002 V9 — est 2026-01-01, real 2025-12-30` NO es typo.)
- **2 notas de texto** en Fecha Real: `"Saltea por vacaciones"` (CEREN-2 V4) y
  `"ACTUALMENTE EN LTS17231 18 JUN2026"` (marca de traspaso, ACT18301 V18).
- **5 fechas estimadas mal escritas** en las V1 de LTS 17231 (formato `DD /MM/AAAA` con typos:
  `"22 /127026"`, etc.).

---

## 3. Modelo destino (ya existe en Spira)

El encaje es casi 1:1 con el schema vigente (migraciones 0002…0060):

| Excel | Tabla Spira | Campo clave |
|---|---|---|
| Protocolo (`CEREN-2`…) | `protocols` | `code` (único) — **ya creados** |
| Cronograma (visita→día) | `visit_definitions` | `offset_days`, `window_minus/plus`, `code`, `role`, `date_mode` |
| Persona (IVRS + nombre) | `patients` | `code` (IVRS), `full_name` |
| Persona × protocolo | `enrollments` | `randomization_date` (ancla), **`ivrs_code` (nuevo)** |
| Visita (estimada+real) | `patient_visits` | `estimated_date`, `real_date`, `window_start/end` |

**Generación automática** (`generate_patient_visits`, trigger `AFTER INSERT OR UPDATE OF
randomization_date ON enrollments`, `0029`): al fijar `randomization_date`, inserta una
`patient_visits` (`kind='programada'`) por cada `visit_definition` con `date_mode='automatica'`,
con `estimated_date = randomization_date + offset_days` y ventana `± window_minus/plus`. Salta
las que ya existen (idempotente).

---

## 4. Decisiones tomadas (con el Director)

1. **Estado en prod:** solo existen los protocolos → cargamos cronograma + personas +
   enrollments + visitas.
2. **Fecha estimada — enfoque híbrido:** la calcula Spira desde el cronograma; donde el Excel
   difiera de lo calculado, se marca como señal de dato a revisar (informe de discrepancias).
   Verificado: las estimadas del Excel siguen la misma lógica (cadencia +14/+28 d), con un
   desfasaje sistemático de ~1 día que el híbrido reporta sin drama.
3. **Doble IVRS — modelo correcto:** una persona = una fila `patients` (21); **columna nueva
   `enrollments.ivrs_code`** para el N° de sujeto de cada estudio (migración 0062).
4. **LTS 17231:** el Director pasa el cronograma → se carga completo como los otros 3.
5. **Ventanas:** **±3 días** para todas las visitas (revisable por protocolo).
6. **Visibilidad:** cambio de front para ver estimada + real + desvío (§7).
7. **Entrega:** script SQL de carga única e idempotente que corre el Director; no UI de import.

---

## 5. Mapeo de visitas por protocolo (la parte fina)

La numeración del Excel (`V1…Vn`) **no calza 1:1** con las etiquetas del cronograma
(`Selección, V2…`): el Excel numera secuencial e incluye sub-visitas de screening. El rol
verdadero está en la **etiqueta de la columna real** (`SELECCIÓN`, `RANDOMIZACIÓN`,
`PREINCLUSIÓN`, `INICIO`, `V… REAL`). El **ancla** (`randomization_date`) es la visita que en el
cronograma cae en **día 1**:

| Protocolo | Ancla (día 1) = etiqueta Excel | Semana/cadencia post-ancla | Nota |
|---|---|---|---|
| CEREN-2 | `V2 - RANDOMIZACIÓN` | V3 (W2), V4 (W4), … +14 d | labels "W4/W6…" = semanas desde randomización |
| ACT18301 | `V3 - INICIO` | V4 (+14), V5 (+28), luego +28 mensual | V2 = Preinclusión (Parte A) |
| THESEUS | `V3 - INICIO` | V4 (+28 desde V3), … +28 | 2 visitas de screening (SEL + PREINC), ambas se cargan `role='screening'` |
| LTS 17231 | `V1` (Semana 0, rollover) | 26 visitas cada 4 sem (Sem 0–100), +28 d | anclado en la 1ª visita; sin re-randomización |

### 5.1 Cronograma LTS 17231 (confirmado 2026-07-21)

Rollover de ACT18301, **sin screening ni re-randomización**: arranca directo en Semana 0.
26 visitas, cadencia de 4 semanas: `offset_days = semana × 7` → V1=0, V2=28, V3=56, … V26=700
(Semana 0, 4, 8, … 100). Ventana **±3 d** en todas **salvo V1 = `+3` / `−0`** (basal, no puede
adelantarse). Ancla (`randomization_date`) = fecha de V1. **V25 (Sem 96) = EOT/ETD** (fin de
tratamiento) y **V26 (Sem 100) = EOS/ESD** (fin de estudio) — no hay visita extra de
discontinuación.

**Modalidad (nota `b`):** son visitas *al centro* la V1 y las de Sem 4, 8, 12, 16, 20, 24, 36,
48, 60, 72, 84, 96 y 100 (= V1–V7, V10, V13, V16, V19, V22, V25, V26); entre ellas *puede*
haber visitas a domicilio si lo permiten los requisitos locales. **Gap:** el enum `visit_type`
es solo `('presencial','telefonica')` ([0001](../../supabase/migrations/0001_extensions_enums.sql)) —
**no existe `domicilio`**. Para esta carga todas las defs van `presencial`; representar la
visita a domicilio requeriría `ALTER TYPE visit_type ADD VALUE 'domicilio'` (migración propia
por el gotcha de 0053) + UI. Queda como **mejora opcional fuera de alcance**.

**Regla de mapeo (confirmada con el Director, 2026-07-21):** por protocolo, una tabla explícita
`etiqueta Excel → visit_definition (code, offset_days, role)`. El bloque post-ancla mapea limpio
y por posición. Las **pre-ancla son fase de screening**: `Selección` y `Preinclusión` (esta
última confirmada como *parte del screening*, no un hito aparte) se cargan **ambas** como
visitas con `role='screening'` y `offset_days` negativo, cada una con su fecha real. Anclas
confirmadas: CEREN-2 → `V2 RANDOMIZACIÓN`; ACT18301 y THESEUS → `V3 INICIO`.

`randomization_date` de cada enrollment = fecha **real** de su visita ancla (si falta la real,
la estimada). Todos los enrollments tienen ancla con fecha en el Excel.

---

## 6. Pieza A — Carga de datos (SQL)

### 6.1 Migración `0062_enrollments_ivrs_code.sql`

> **Coordinación de numeración:** hay **otra migración `0061` en curso** (feature "Procedimientos
> por visita / Cronograma", del trabajo paralelo — revisada, sin aplicar). Como ambas parten de
> la 0060 y esa está más avanzada, esta toma `0062`. **A confirmar con el Director** el orden de
> aplicación; si esta se aplica primero, se renombra a `0061` (rename trivial). Además, **ambas
> tocan `visit_definitions` de estos protocolos** (aquella les cuelga procedimientos; esta las
> crea desde el cronograma) → el cronograma que cargo acá es el que aquella feature va a usar de
> base. Coordinar para no pisarse.

```sql
-- N° de sujeto IVRS por inscripción (una persona en 2 estudios tiene 2 IVRS).
alter table public.enrollments
  add column if not exists ivrs_code text;
comment on column public.enrollments.ivrs_code is
  'Número de sujeto IVRS de ESTE enrollment (por estudio). Distinto de patients.code, que es el IVRS del estudio madre.';
-- Unicidad opcional por protocolo (prever legacy: filas viejas con NULL conviven):
create unique index if not exists enrollments_protocol_ivrs_uq
  on public.enrollments (protocol_id, ivrs_code) where ivrs_code is not null;
```

Legacy-safe (columna nullable, índice parcial). El Director la aplica en el dashboard y la
registra en `supabase/README.md` (**Aplicada en prod (fecha)**).

### 6.2 Script `supabase/scripts/carga-visitas-historicas.sql`

Idempotente, **sin borrados**, transaccional. Pasos:

1. **Cronograma → `visit_definitions`**: upsert por `(protocol_id, code)`. Todas las defs con
   `date_mode='automatica'` (incluidas las pre-ancla, con `offset_days` negativo) para que el
   trigger las genere. `window_minus = window_plus = 3`. `role` según etiqueta
   (`screening`/`randomizacion`/`comun`). `sort_order` según secuencia.
2. **Personas → `patients`**: upsert de 21 por `code` (IVRS del estudio madre) + `full_name`.
   `birth_date/sex/fertility` quedan **NULL** (no están en el Excel).
3. **Enrollments → `enrollments`**: 29, upsert por `(patient_id, protocol_id)`, con
   `randomization_date` (ancla, §5) e `ivrs_code`. **El insert dispara el trigger** → se
   generan las `patient_visits` programadas con su `estimated_date` y ventana.
4. **Backfill de reales**: por cada fila del Excel con fecha real ISO, `UPDATE
   patient_visits SET real_date = <fecha>` sobre la fila que corresponde (mismo efecto que
   `registerVisit`, dispara `materialize_checklist`). El match usa la tabla de mapeo de §5.
5. **LTS 17231**: igual que 1–4 una vez recibido su cronograma.

**Idempotencia:** upserts + el trigger que salta duplicados. Correr dos veces = mismo estado.
**Seguridad:** el Director lo corre como superusuario en el SQL editor (bypassa RLS); revisa el
diff antes. Nada se borra. Los registros de prueba, si hicieran falta, van con prefijo `TEST-*`.

> El script se **genera** transformando el Excel con un script Node (no hay Python en la
> máquina): produce los `INSERT/UPDATE` literales + la tabla de mapeo, para revisión humana
> antes de correr en prod.

### 6.3 Informe de discrepancias

`docs/carga-visitas-historicas/discrepancias.md`: las 6 filas de año descuadrado, las 2 notas
de texto, las 5 fechas mal escritas — cada una con protocolo/paciente/visita y la corrección
propuesta, para que el Director decida. Las filas sin resolver **no se cargan** (o se cargan sin
`real_date`, según decida).

---

## 7. Pieza B — Ver estimada vs real en la app (front)

**Hallazgo del mapeo de UI:** los dos campos ya llegan al front (`TrackVisitRow.estimated_date`
/ `real_date`, [src/data/visits.ts:24](../../src/data/visits.ts)), pero las pantallas del
cronograma hacen `estimated_date ?? real_date` (coalesce): en una visita programada con real
cargada, **la real queda invisible**. Hoy solo el CSV "Exportar reporte" muestra las dos
separadas. Sin este cambio, cargar 262 reales **no se ve** paciente por paciente.

Alcance mínimo (front puro, sin migración, sobre datos que ya llegan):

1. **Cronograma de la ficha** ([src/views/track/PdFullSchedule.tsx:39,53](../../src/views/track/PdFullSchedule.tsx)):
   dejar de coalescer; cuando la visita es programada y tiene `real_date`, mostrar **ambas**
   (estimada atenuada + real) y el **desvío en días**; marcar si la real cayó fuera de
   `window_start..window_end`.
2. **Detalle de visita** ([src/views/track/VisitDetail.tsx:121-133](../../src/views/track/VisitDetail.tsx)):
   hoy no muestra ninguna fecha → agregar fila `Estimada / Real (+ desvío)`.
3. **Opcional** — columna `Desvío (días)` al CSV ([src/views/ProtocolDetailView.tsx:73](../../src/views/ProtocolDetailView.tsx)).

Estilo: on-brand "Sereno" (tokens, sin color-solo para el estado de ventana → ícono de forma +
color, WCAG). Desvío como texto sobrio (`−1 d`, `+2 d`).

**Fuera de alcance (anotado, no ahora):** el flag `computed_status='ventana_vencida'` deja de
mirar la ventana en cuanto hay `real_date`
([0049:93-109](../../supabase/migrations/0049_pvm_wait_and_demographics.sql)); y la "Adherencia"
de la ficha es conteo realizadas/programadas, **no** % en ventana
([src/lib/visits.ts:164-170](../../src/lib/visits.ts)). Hacer la adherencia "window-aware" es una
mejora aparte que este cambio habilita pero no incluye.

---

## 8. Entregables

1. `supabase/migrations/0062_enrollments_ivrs_code.sql` — migración.
2. `supabase/scripts/carga-visitas-historicas.sql` — script de carga (generado desde el Excel).
3. Cambio de front (§7) — PR aparte del cambio de base.
4. `docs/carga-visitas-historicas/discrepancias.md` — informe.
5. La tabla de mapeo por protocolo (§5) — para confirmar con el Director.

---

## 9. Orden de aplicación

1. Director aplica la migración `0062` en Supabase → registra en `README.md`.
2. Revisamos juntos la tabla de mapeo (§5) y el informe de discrepancias (§6.3).
3. Director corre `carga-visitas-historicas.sql` (3 protocolos).
4. LTS 17231: cuando llegue su cronograma, se agrega al mismo script y se corre.
5. El cambio de front va por PR (typecheck verde + verificación en preview) e integra el
   Director.

**Verificación de la carga:** el CSV "Exportar reporte" por protocolo (Estimada/Real) sirve para
auditar que las 262 reales quedaron donde debían y calcular el desvío, antes y después del
cambio de front.

---

## 10. Riesgos / precauciones

- **Datos reales en prod:** script idempotente, sin borrados, revisado antes de correr. Ante la
  duda, no se corre.
- **Duplicados de visitas:** el trigger salta defs ya generadas; el backfill hace UPDATE, no
  INSERT. Correr dos veces es seguro.
- **RLS silenciosa:** el Director corre como superusuario → no aplica el "0 filas = sin permiso";
  igual el script valida conteos (personas/enrollments/visitas esperadas vs insertadas).
- **Mapeo pre-ancla:** la parte irregular (screening/preinclusión) se confirma con el Director;
  es donde un error mandaría una real a la visita equivocada.
- **Migración sobre legacy:** `ivrs_code` nullable + índice parcial → no rompe filas viejas.
- **PII fuera de git:** el Excel, el SQL generado (trae `full_name`) y el informe de
  discrepancias contienen nombres de pacientes → son artefactos **locales/gitignored**, se le
  entregan al Director para correr, no se commitean. Al repo va solo la **lógica** del generador
  (mapeo, offsets, dedup — sin datos) y este diseño (sin nombres). Coherente con la privacidad
  de paciente transversal de Spira.

---

## 11. Dependencias abiertas

- ~~Cronograma de LTS 17231~~ — **confirmado** (2026-07-21): 26 visitas cada 4 sem (Sem 0–100),
  ±3 d (V1 +3), ancla en V1, rollover sin screening; V25=EOT, V26=EOS. Modalidad domicilio =
  gap fuera de alcance (§5.1).
- ~~Confirmación de la tabla de mapeo por protocolo (§5)~~ — **confirmada** (2026-07-21:
  anclas OK, Preinclusión = screening). Falta: confirmar las correcciones de discrepancias
  (§6.3) cuando arme el informe con el detalle.
