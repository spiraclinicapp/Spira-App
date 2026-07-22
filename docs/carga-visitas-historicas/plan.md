# Carga de visitas históricas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Cargar en Spira el histórico de visitas (estimada del cronograma + real de asistencia) de 4 protocolos ya creados, y hacer que ambas fechas se vean en la app.

**Architecture:** Tres piezas independientes que se integran en PRs separadas. (1) Migración `0062` que agrega `enrollments.ivrs_code`. (2) Un **generador Node** (sin dependencias) que transforma el Excel en un script SQL de carga idempotente + un informe de discrepancias — la lógica se commitea, los artefactos con PII quedan locales; el Director corre el SQL en Supabase. (3) Un cambio de **front** que deja de coalescer `estimated_date ?? real_date` y muestra estimada + real + desvío + fuera-de-ventana.

**Tech Stack:** Node 24 (generador, sin libs — lector xlsx propio con `zlib`), Postgres/Supabase (migración + carga), React + TypeScript strict (front), CSS tokens "Sereno".

## Global Constraints

- **Sin suite de tests** — la verificación es `npm run typecheck` (verde) + build + preview. No afirmar "anda" sin eso.
- **Datos reales en prod** — sin borrados, sin `DELETE`/`TRUNCATE`; registros de prueba solo con prefijo `TEST-*`. Ante la duda, no correr.
- **No hay SQL directo a prod** — el Director aplica migración y script a mano en el dashboard; el SQL corre **tal cual**, sin placeholders `<...>`, y prevé legacy.
- **Migraciones inmutables y numeradas** — la nueva es `0062` (hay **otra `0061` en curso** en el trabajo paralelo de "Procedimientos por visita"; esta defiere a la 0062 — confirmar orden con el Director, rename trivial si va al revés). Ambas tocan `visit_definitions` de estos protocolos → coordinar. Registrar en `supabase/README.md` (**Aplicada en prod (fecha)**) al confirmar.
- **PII fuera de git** — el Excel, el SQL generado (trae `full_name`) y el informe de discrepancias son **locales/gitignored**. Al repo va solo lógica (mapeo/offsets/dedup, sin datos) y docs sin nombres.
- **Idioma** — comentarios/copy en castellano rioplatense; igualar densidad de comentarios del código existente.
- **Git** — verificar rama antes de commit (hay hook que bloquea `main`); stagear **por ruta** (nunca `git add -A`); `git fetch` antes de razonar sobre remoto. El working copy es compartido.
- **Anclas confirmadas (2026-07-21):** CEREN-2 → `V2 RANDOMIZACIÓN`; ACT18301 y THESEUS → `V3 INICIO`; LTS 17231 → `V1` (Sem 0). Preinclusión = screening.
- **Ventanas:** ±3 días; la visita ancla/basal solo `+3` / `−0`.

---

## File Structure

**Committable (sin PII):**
- `supabase/migrations/0062_enrollments_ivrs_code.sql` — migración.
- `supabase/scripts/carga-visitas-historicas/parse-xlsx.mjs` — lector .xlsx (ZIP→XML→celdas), lógica pura.
- `supabase/scripts/carga-visitas-historicas/mapeo.mjs` — config de mapeo por protocolo (etiqueta→def, ancla, offsets, ventanas, roles). Sin datos de paciente.
- `supabase/scripts/carga-visitas-historicas/generar.mjs` — orquestador: Excel → SQL + discrepancias a un dir local.
- `supabase/scripts/carga-visitas-historicas/README.md` — uso + nota de privacidad.
- `src/views/track/PdFullSchedule.tsx`, `src/views/track/VisitDetail.tsx`, `src/views/ProtocolDetailView.tsx` — front (modificar).
- `.gitignore` — patrones de salida.

**Local/gitignored (PII):**
- `*.xlsx` de entrada; `out/carga-visitas-historicas.sql`; `out/discrepancias.md`.

---

# Fase A — Migración 0062

### Task A1: Migración `enrollments.ivrs_code`

**Files:**
- Create: `supabase/migrations/0062_enrollments_ivrs_code.sql`
- Modify: `supabase/README.md` (índice de migraciones — anotar la nueva, sin marcar aplicada aún)

**Interfaces:**
- Produces: columna `public.enrollments.ivrs_code text` (nullable) + índice único parcial `enrollments_protocol_ivrs_uq (protocol_id, ivrs_code) where ivrs_code is not null`.

- [ ] **Step 1: Escribir la migración**

```sql
-- 0062_enrollments_ivrs_code.sql
-- N° de sujeto IVRS por inscripción. Una persona en dos estudios (p. ej. un
-- pivotal + su extensión LTS) tiene DOS IVRS: uno por enrollment. patients.code
-- guarda el del estudio madre; este campo, el de cada enrollment.
alter table public.enrollments
  add column if not exists ivrs_code text;

comment on column public.enrollments.ivrs_code is
  'Número de sujeto IVRS de ESTE enrollment (por estudio). Distinto de patients.code (IVRS del estudio madre). Nullable: puede faltar antes de randomización.';

-- Unicidad por protocolo, tolerante a legacy (filas viejas con NULL conviven:
-- el índice parcial no las indexa).
create unique index if not exists enrollments_protocol_ivrs_uq
  on public.enrollments (protocol_id, ivrs_code)
  where ivrs_code is not null;
```

- [ ] **Step 2: Revisar sintaxis y trampas de migración**

Verificar a ojo (no hay prod de prueba en la sesión):
- `add column if not exists` → idempotente.
- No usa un valor de enum nuevo en la misma transacción (no aplica acá).
- El índice es parcial `where ... is not null` → no rompe si hay enrollments legacy sin IVRS.
- No toca datos existentes.

- [ ] **Step 3: Anotar en el índice de migraciones**

En `supabase/README.md`, en la lista de migraciones, agregar la línea de `0062` describiéndola. **No** marcar "Aplicada en prod" todavía (lo hace el Director al aplicarla; CI lo vigila con `scripts/check-migraciones.mjs`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0062_enrollments_ivrs_code.sql supabase/README.md
git commit -m "feat(db): 0062 agrega enrollments.ivrs_code (IVRS por enrollment)"
```

---

# Fase B — Generador de la carga

> El generador vive en el repo (lógica auditable, sin PII). Lee el Excel desde una ruta local y emite a un dir `out/` gitignored. El Director revisa el SQL y lo corre en Supabase.

### Task B1: Lector de .xlsx (parser puro)

**Files:**
- Create: `supabase/scripts/carga-visitas-historicas/parse-xlsx.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `export function readSheets(path)` → `{ [sheetName]: { rows: string[][] } }` (celdas resueltas a string; fechas y números como texto tal cual el Excel). Maneja celdas auto-cerradas y sharedStrings.

- [ ] **Step 1: Escribir el parser** (adaptado del validado en sesión; corrige el bug de celdas auto-cerradas con `[^>]*?` no-greedy)

```js
// parse-xlsx.mjs — lector mínimo de .xlsx en Node puro (ZIP + XML). Sin PII embebida.
import fs from 'node:fs'
import zlib from 'node:zlib'

function entriesOf(buf) {
  const findEOCD = (b) => { for (let i = b.length - 22; i >= 0; i--) if (b.readUInt32LE(i) === 0x06054b50) return i; throw new Error('EOCD') }
  const eocd = findEOCD(buf), cdCount = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16)
  const e = {}; let p = cdOff
  for (let n = 0; n < cdCount; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break
    const method = buf.readUInt16LE(p + 10), compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32)
    const localOff = buf.readUInt32LE(p + 42), name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    e[name] = { method, compSize, localOff }; p += 46 + nameLen + extraLen + commentLen
  }
  return e
}
function read(buf, entries, name) {
  const e = entries[name]; if (!e) return null
  const lh = e.localOff, lN = buf.readUInt16LE(lh + 26), lE = buf.readUInt16LE(lh + 28)
  const ds = lh + 30 + lN + lE, data = buf.slice(ds, ds + e.compSize)
  return e.method === 0 ? data : zlib.inflateRawSync(data)
}
const dec = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&')
const colNum = (c) => { let n = 0; for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64); return n }

export function readSheets(path) {
  const buf = fs.readFileSync(path), entries = entriesOf(buf)
  const shared = []
  const ssBuf = read(buf, entries, 'xl/sharedStrings.xml')
  if (ssBuf) { const ss = ssBuf.toString('utf8'); const re = /<si>([\s\S]*?)<\/si>/g; let m
    while ((m = re.exec(ss))) { const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g; let t, parts = []; while ((t = tRe.exec(m[1]))) parts.push(dec(t[1])); shared.push(parts.join('')) } }
  // workbook: nombre de hoja -> archivo
  const rels = {}; const relBuf = read(buf, entries, 'xl/_rels/workbook.xml.rels')
  if (relBuf) { const re = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g; let m; while ((m = re.exec(relBuf.toString('utf8')))) { let t = m[2]; if (!t.startsWith('xl/')) t = 'xl/' + t.replace(/^\/?/, ''); rels[m[1]] = t } }
  const sheets = {}; const wbBuf = read(buf, entries, 'xl/workbook.xml')
  const re = /<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g; let m
  while ((m = re.exec(wbBuf.toString('utf8')))) {
    const name = dec(m[1]), target = rels[m[2]]
    const xml = read(buf, entries, target).toString('utf8')
    sheets[name] = { rows: parseRows(xml, shared) }
  }
  return sheets
}
function parseRows(xml, shared) {
  const rowsMap = {}; let maxRow = 0, maxCol = 0
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let m   // [^>]*? NO-greedy: no traga celdas auto-cerradas
  while ((m = cellRe.exec(xml))) {
    const attrs = m[1], body = m[2]; const rM = attrs.match(/r="([A-Z]+)(\d+)"/); if (!rM) continue
    const col = colNum(rM[1]), row = +rM[2]; const tM = attrs.match(/t="([^"]+)"/); const type = tM ? tM[1] : 'n'
    let value = ''
    if (body !== undefined) {
      if (type === 'inlineStr') { const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g; let t, parts = []; while ((t = tRe.exec(body))) parts.push(dec(t[1])); value = parts.join('') }
      else { const vM = body.match(/<v[^>]*>([\s\S]*?)<\/v>/); const raw = vM ? vM[1] : ''; value = type === 's' ? (shared[+raw] ?? '') : dec(raw) }
    }
    ;(rowsMap[row] ||= {})[col] = value; if (row > maxRow) maxRow = row; if (col > maxCol) maxCol = col
  }
  const rows = []
  for (let r = 1; r <= maxRow; r++) { const out = []; for (let c = 1; c <= maxCol; c++) out.push(rowsMap[r]?.[c] ?? ''); rows.push(out) }
  return rows
}
```

- [ ] **Step 2: Agregar salida al `.gitignore`**

Agregar al final de `.gitignore`:
```
# Carga de visitas históricas: artefactos con PII (no van a git)
supabase/scripts/carga-visitas-historicas/out/
supabase/scripts/carga-visitas-historicas/*.xlsx
```

- [ ] **Step 3: Verificar el parser contra el Excel** (check de conteo, no test formal)

Copiar el Excel a la carpeta local y correr:
```bash
node -e "import('./supabase/scripts/carga-visitas-historicas/parse-xlsx.mjs').then(m=>{const s=m.readSheets(process.argv[1]);console.log(Object.keys(s));console.log('Visitas filas:',s['Visitas'].rows.length);console.log('cabecera:',s['Visitas'].rows[0].join(' | '))})" "./supabase/scripts/carga-visitas-historicas/Visitas estimada real (1).xlsx"
```
Expected: hojas `[ 'Visitas', 'Resumen pacientes', 'Cronograma' ]`; `Visitas filas: 415`; cabecera `Protocolo | N° Paciente (IVRS) | Paciente | Visita | Etiqueta Estimada | Fecha Estimada | Etiqueta Real | Fecha Real`.

- [ ] **Step 4: Commit** (solo la lógica; el .xlsx queda gitignored)

```bash
git add supabase/scripts/carga-visitas-historicas/parse-xlsx.mjs .gitignore
git commit -m "feat(carga): lector xlsx puro para la carga de visitas históricas"
```

---

### Task B2: Config de mapeo por protocolo

**Files:**
- Create: `supabase/scripts/carga-visitas-historicas/mapeo.mjs`

**Interfaces:**
- Consumes: nada (config declarativa + helpers).
- Produces:
  - `export const PROTOCOLOS` — por `code` de protocolo: `{ code, anchorLabelRegex, visitas: [{ code, role, offsetDays, winMinus, winPlus }] }` en orden.
  - `export function clasificarVisitaExcel(protoCode, etiquetaReal, etiquetaEst, visitaCol)` → `{ defCode, role, esAncla }` — mapea una fila del Excel a su `visit_definition`.
  - `export const VENTANA = { minus: 3, plus: 3 }`.

- [ ] **Step 1: Escribir la config** (offsets del cronograma, ancla=offset 0; ventanas ±3, basal +3/−0)

```js
// mapeo.mjs — mapeo declarativo Excel -> visit_definitions, por protocolo.
// offsetDays = día del cronograma relativo a la visita ancla (ancla = 0).
// Los offsets de screening (pre-ancla) son nominales: la estimada de screening
// es secundaria (se backfillea la real). Post-ancla salen del cronograma.
export const VENTANA = { minus: 3, plus: 3 }
const basal = { winMinus: 0, winPlus: 3 }   // la visita ancla no puede adelantarse
const w = { winMinus: 3, winPlus: 3 }

// Helper: genera una serie Vn con offset lineal (para cadencias regulares).
function serie(startN, count, code0, off0, step, role = 'comun') {
  const out = []
  for (let i = 0; i < count; i++) out.push({ code: `V${startN + i}`, role, offsetDays: off0 + i * step, ...w })
  return out
}

export const PROTOCOLOS = {
  // CEREN-2: ancla V2 (RANDOMIZACIÓN, día 1). V1=Selección. V3..V29 cada 14 d,
  // con salto V28(EOT d365)->V29(Seguimiento d505). Offsets = díaCronograma - 1.
  'CEREN-2': {
    anchorLabelRegex: /randomiz/i,
    visitas: [
      { code: 'V1', role: 'screening', offsetDays: -29, ...w },       // Selección (día -28)
      { code: 'V2', role: 'randomizacion', offsetDays: 0, ...basal },  // ancla
      ...Array.from({ length: 25 }, (_, k) => ({ code: `V${k + 3}`, role: 'comun', offsetDays: 14 + k * 14, ...w })), // V3=14 ... V27=350
      { code: 'V28', role: 'comun', offsetDays: 364, ...w },           // EOT (día 365)
      { code: 'V29', role: 'comun', offsetDays: 504, ...w },           // Seguimiento/EOS (día 505)
    ],
  },
  // ACT18301: ancla V3 (INICIO, día 1). V1=Selección, V2=Preinclusión (screening).
  // V4=+14, luego +28 mensual. EOT=V17, EOS=V18.
  'ACT18301': {
    anchorLabelRegex: /inicio/i,
    visitas: [
      { code: 'V1', role: 'screening', offsetDays: -59, ...w },
      { code: 'V2', role: 'screening', offsetDays: -29, ...w },
      { code: 'V3', role: 'randomizacion', offsetDays: 0, ...basal },   // ancla
      { code: 'V4', role: 'comun', offsetDays: 14, ...w },
      ...serie(5, 14, 'V5', 28, 28),                                    // V5=28 ... V18=392
    ],
  },
  // THESEUS: ancla V3 (INICIO). V1=Selección, V2=Preinclusión (screening).
  // Cadencia +28. EOI=V15, EOS=V16. (Offsets a validar contra la estimada del Excel en B5.)
  'THESEUS': {
    anchorLabelRegex: /inicio/i,
    visitas: [
      { code: 'V1', role: 'screening', offsetDays: -28, ...w },
      { code: 'V2', role: 'screening', offsetDays: -14, ...w },
      { code: 'V3', role: 'randomizacion', offsetDays: 0, ...basal },   // ancla
      { code: 'V4', role: 'comun', offsetDays: 14, ...w },
      ...serie(5, 12, 'V5', 42, 28),                                    // V5=42 ... V16=350 (a validar)
    ],
  },
  // LTS 17231: rollover, ancla V1 (Sem 0). 26 visitas cada 4 sem (offset = sem*7).
  // V25=EOT (Sem 96), V26=EOS (Sem 100). Sin screening.
  'LTS 17231': {
    anchorLabelRegex: /^v1\b|inicio|sem.*0/i,
    visitas: [
      { code: 'V1', role: 'randomizacion', offsetDays: 0, ...basal },
      ...Array.from({ length: 25 }, (_, k) => ({ code: `V${k + 2}`, role: 'comun', offsetDays: (k + 1) * 28, ...w })), // V2=28 ... V26=700
    ],
  },
}

// La fila del Excel trae "Visita" (V1..Vn secuencial del sitio) y etiquetas de rol.
// El code del Excel coincide con el code de la def (misma numeración V1..Vn por protocolo).
export function clasificarVisitaExcel(protoCode, etiquetaReal, etiquetaEst, visitaCol) {
  const proto = PROTOCOLOS[protoCode]
  if (!proto) return null
  const code = String(visitaCol).trim().toUpperCase()          // "V1".. "V29"
  const def = proto.visitas.find((v) => v.code === code)
  if (!def) return null
  const etiqueta = `${etiquetaReal || ''} ${etiquetaEst || ''}`
  const esAncla = proto.anchorLabelRegex.test(etiqueta) && def.offsetDays === 0
  return { defCode: def.code, role: def.role, esAncla, offsetDays: def.offsetDays }
}
```

- [ ] **Step 2: Verificar cobertura de la config** (que toda def tenga offset y roles válidos)

```bash
node -e "import('./supabase/scripts/carga-visitas-historicas/mapeo.mjs').then(({PROTOCOLOS})=>{for(const[k,p]of Object.entries(PROTOCOLOS)){const anclas=p.visitas.filter(v=>v.offsetDays===0);console.log(k,'defs:',p.visitas.length,'ancla@0:',anclas.map(a=>a.code).join(','));for(const v of p.visitas)if(!['screening','randomizacion','comun'].includes(v.role))throw new Error('rol inválido '+k+' '+v.code)}})"
```
Expected: cada protocolo con exactamente una def `offsetDays===0` (CEREN-2 V2, ACT18301 V3, THESEUS V3, LTS V1); conteos 29 / 18 / 16 / 26.

- [ ] **Step 3: Commit**

```bash
git add supabase/scripts/carga-visitas-historicas/mapeo.mjs
git commit -m "feat(carga): config de mapeo Excel->visit_definitions por protocolo"
```

---

### Task B3: Modelo normalizado desde el Excel (extractor)

**Files:**
- Modify: `supabase/scripts/carga-visitas-historicas/generar.mjs` (crear con el extractor; se completa en B4-B6)

**Interfaces:**
- Consumes: `readSheets` (B1), `clasificarVisitaExcel`/`PROTOCOLOS` (B2).
- Produces: `export function extraer(path)` → `{ personas: Map<ivrs, {ivrs, nombre, proto}>, enrollments: [{ivrs, proto, nombre, anclaFecha, visitas: [{defCode, role, offsetDays, estExcel, realExcel, crudoReal}]}], stats }`. Deduplica personas por nombre normalizado (rollover: 2 IVRS = 1 persona).

- [ ] **Step 1: Escribir el extractor**

```js
// generar.mjs (parte 1: extracción). Node puro.
import { readSheets } from './parse-xlsx.mjs'
import { clasificarVisitaExcel } from './mapeo.mjs'

const isISO = (v) => /^\d{4}-\d{2}-\d{2}/.test(v)
const normNombre = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export function extraer(path) {
  const sheets = readSheets(path)
  const R = sheets['Visitas'].rows
  // arrastrar protocolo (viene solo en la 1a fila de cada bloque)
  let lastProto = ''
  const filas = []
  for (let i = 1; i < R.length; i++) {
    const [proto, ivrs, nombre, visita, etEst, fEst, etReal, fReal] = R[i]
    if (!ivrs && !nombre) continue
    const p = proto || lastProto; if (proto) lastProto = proto
    filas.push({ proto: p.trim(), ivrs: String(ivrs).trim(), nombre: nombre.trim(), visita, etEst, fEst, etReal, fReal })
  }
  // enrollments por (ivrs, proto)
  const enrollments = new Map()
  for (const f of filas) {
    const key = `${f.ivrs}|${f.proto}`
    if (!enrollments.has(key)) enrollments.set(key, { ivrs: f.ivrs, proto: f.proto, nombre: f.nombre, visitas: [] })
    const cls = clasificarVisitaExcel(f.proto, f.etReal, f.etEst, f.visita)
    enrollments.get(key).visitas.push({
      visitaCol: f.visita,
      defCode: cls?.defCode ?? null,
      role: cls?.role ?? null,
      offsetDays: cls?.offsetDays ?? null,
      esAncla: cls?.esAncla ?? false,
      estExcel: isISO(f.fEst) ? f.fEst.slice(0, 10) : null,
      realExcel: isISO(f.fReal) ? f.fReal.slice(0, 10) : null,
      crudoReal: f.fReal,     // se conserva el crudo para el informe (notas, typos)
    })
  }
  // ancla: fecha real de la visita ancla (si falta, la estimada)
  for (const e of enrollments.values()) {
    const a = e.visitas.find((v) => v.esAncla)
    e.anclaFecha = a ? (a.realExcel || a.estExcel) : null
  }
  // personas: dedup por nombre normalizado (rollover)
  const personas = new Map()
  for (const e of enrollments.values()) {
    const nk = normNombre(e.nombre)
    if (!personas.has(nk)) personas.set(nk, { nombre: e.nombre, ivrsMadre: e.ivrs, nombreKey: nk })
  }
  const stats = {
    filas: filas.length, enrollments: enrollments.size, personas: personas.size,
    reales: filas.filter((f) => isISO(f.fReal)).length,
  }
  return { personas, enrollments: [...enrollments.values()], stats }
}

// invocación directa para checks
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const { stats } = extraer(process.argv[2])
  console.log(stats)
}
```

- [ ] **Step 2: Verificar conteos contra lo esperado**

```bash
node supabase/scripts/carga-visitas-historicas/generar.mjs "./supabase/scripts/carga-visitas-historicas/Visitas estimada real (1).xlsx"
```
Expected: `{ filas: 414, enrollments: 29, personas: 21, reales: 262 }`.
Si `personas` ≠ 21, revisar `normNombre` (un nombre con tipeo distinto entre estudios rompería el dedup — listarlo y decidir).

- [ ] **Step 3: Commit**

```bash
git add supabase/scripts/carga-visitas-historicas/generar.mjs
git commit -m "feat(carga): extractor normalizado (personas/enrollments/visitas) del Excel"
```

---

### Task B4: Emitir SQL de `visit_definitions` + `patients` + `enrollments`

**Files:**
- Modify: `supabase/scripts/carga-visitas-historicas/generar.mjs` (agregar emisión SQL)

**Interfaces:**
- Consumes: `extraer` (B3), `PROTOCOLOS` (B2).
- Produces: `export function sqlDefiniciones(model)`, `export function sqlPersonasYEnrollments(model)` → strings SQL con `INSERT ... ON CONFLICT`. Usan sub-selects por `code` para no hardcodear UUIDs.

- [ ] **Step 1: Escribir los emisores SQL** (idempotentes, sin UUIDs literales)

```js
// generar.mjs (parte 2: emisión SQL). El script corre como superusuario en Supabase.
import { PROTOCOLOS } from './mapeo.mjs'
const q = (s) => s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`

export function sqlDefiniciones() {
  const out = ['-- visit_definitions (cronograma) por protocolo --']
  for (const [proto, cfg] of Object.entries(PROTOCOLOS)) {
    cfg.visitas.forEach((v, i) => {
      out.push(
        `insert into public.visit_definitions (protocol_id, code, name, visit_type, date_mode, offset_days, window_minus, window_plus, sort_order, role)\n` +
        `select p.id, ${q(v.code)}, ${q(v.code)}, 'presencial', 'automatica', ${v.offsetDays}, ${v.winMinus}, ${v.winPlus}, ${i}, ${q(v.role)}\n` +
        `from public.protocols p where p.code = ${q(proto)}\n` +
        `on conflict do nothing;`)
    })
  }
  return out.join('\n')
}

export function sqlPersonasYEnrollments(model) {
  const out = ['-- patients (21 personas, dedup por nombre) --']
  for (const per of model.personas.values()) {
    out.push(
      `insert into public.patients (code, full_name, status)\n` +
      `values (${q(per.ivrsMadre)}, ${q(per.nombre)}, 'activo')\n` +
      `on conflict (code) do nothing;`)
  }
  out.push('\n-- enrollments (29) con randomization_date + ivrs_code. Dispara generate_patient_visits --')
  for (const e of model.enrollments) {
    if (!e.anclaFecha) { out.push(`-- OMITIDO enrollment sin ancla: proto ${e.proto} ivrs ${e.ivrs}`); continue }
    // patient por nombre madre (una persona puede tener 2 IVRS); usamos el nombre para ligar
    out.push(
      `insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date, randomization_date, ivrs_code, status)\n` +
      `select pa.id, pr.id, (select id from public.users order by created_at limit 1), ${q(e.anclaFecha)}, ${q(e.anclaFecha)}, ${q(e.ivrs)}, 'activo'\n` +
      `from public.patients pa, public.protocols pr\n` +
      `where pa.full_name = ${q(e.nombre)} and pr.code = ${q(e.proto)}\n` +
      `on conflict (patient_id, protocol_id) do update set randomization_date = excluded.randomization_date, ivrs_code = excluded.ivrs_code;`)
  }
  return out.join('\n')
}
```

> Nota: `enrolled_by` exige un `users.id` real (FK). Se toma el usuario más antiguo como "sistema"; el Director puede cambiarlo por su propio id antes de correr. El `on conflict do update` de enrollments re-dispara el trigger si cambia `randomization_date`, y el trigger salta las visitas ya generadas.

- [ ] **Step 2: Verificar que el SQL emitido tenga las cantidades correctas**

```bash
node -e "import('./supabase/scripts/carga-visitas-historicas/generar.mjs').then(async m=>{const model=m.extraer(process.argv[1]);const d=m.sqlDefiniciones();const pe=m.sqlPersonasYEnrollments(model);console.log('defs inserts:',(d.match(/insert into public.visit_definitions/g)||[]).length);console.log('patients inserts:',(pe.match(/insert into public.patients/g)||[]).length);console.log('enrollments inserts:',(pe.match(/insert into public.enrollments/g)||[]).length)})" "./supabase/scripts/carga-visitas-historicas/Visitas estimada real (1).xlsx"
```
Expected: `defs inserts: 89` (29+18+16+26), `patients inserts: 21`, `enrollments inserts: 29`.

- [ ] **Step 3: Commit**

```bash
git add supabase/scripts/carga-visitas-historicas/generar.mjs
git commit -m "feat(carga): emisión SQL de definiciones, personas y enrollments"
```

---

### Task B5: Backfill de `real_date` + verificación híbrida + discrepancias

**Files:**
- Modify: `supabase/scripts/carga-visitas-historicas/generar.mjs`

**Interfaces:**
- Consumes: `extraer` (B3).
- Produces: `export function sqlBackfill(model)` (UPDATE de `real_date` por enrollment+def), `export function informeDiscrepancias(model)` (markdown). La verificación híbrida compara `estExcel` vs `anclaFecha + offsetDays` y marca desvíos > tolerancia.

- [ ] **Step 1: Escribir backfill + discrepancias + chequeo híbrido**

```js
// generar.mjs (parte 3: backfill + discrepancias).
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const diffDays = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)

export function sqlBackfill(model) {
  const out = ['-- backfill de real_date sobre las visitas generadas (match por enrollment+def) --']
  for (const e of model.enrollments) {
    for (const v of e.visitas) {
      if (!v.realExcel || !v.defCode) continue
      out.push(
        `update public.patient_visits pv set real_date = ${q(v.realExcel)}\n` +
        `from public.enrollments en join public.protocols pr on pr.id = en.protocol_id\n` +
        `  join public.patients pa on pa.id = en.patient_id\n` +
        `  join public.visit_definitions vd on vd.id = pv.visit_def_id\n` +
        `where pv.enrollment_id = en.id and pr.code = ${q(e.proto)}\n` +
        `  and en.ivrs_code = ${q(e.ivrs)} and vd.code = ${q(v.defCode)};`)
    }
  }
  return out.join('\n')
}

export function informeDiscrepancias(model) {
  const L = ['# Informe de discrepancias — carga de visitas históricas', '', 'Revisar antes de correr. Nada de esto se carga con dato inventado.', '']
  const anioMal = [], notas = [], estMal = [], hibrido = []
  for (const e of model.enrollments) {
    for (const v of e.visitas) {
      // año descuadrado est vs real
      if (v.estExcel && v.realExcel && v.estExcel.slice(0, 4) !== v.realExcel.slice(0, 4))
        anioMal.push(`- ${e.proto} / IVRS ${e.ivrs} / ${v.visitaCol}: est ${v.estExcel} vs real ${v.realExcel}`)
      // real no-fecha (notas de texto)
      if (v.crudoReal && !v.realExcel && v.crudoReal.trim() && !/^\d+$/.test(v.crudoReal.trim()))
        notas.push(`- ${e.proto} / IVRS ${e.ivrs} / ${v.visitaCol}: real = "${v.crudoReal.trim()}"`)
      // estimada mal escrita (no ISO pero con contenido)
      // (se detecta en extractor: estExcel null pero fEst tenía texto -> se vería en crudo; simplificado acá)
      // verificación híbrida: estimada del Excel vs (ancla + offset)
      if (v.estExcel && e.anclaFecha && v.offsetDays !== null) {
        const calc = addDays(e.anclaFecha, v.offsetDays)
        const d = diffDays(v.estExcel, calc)
        if (Math.abs(d) > 3) hibrido.push(`- ${e.proto} / IVRS ${e.ivrs} / ${v.visitaCol}: estExcel ${v.estExcel} vs calc ${calc} (${d > 0 ? '+' : ''}${d} d)`)
      }
    }
  }
  const sec = (t, arr) => { L.push(`## ${t} (${arr.length})`, ''); L.push(arr.length ? arr.join('\n') : '_ninguna_', '') }
  sec('Año descuadrado (posible typo)', anioMal)
  sec('Notas de texto en Fecha Real', notas)
  sec('Desvío estimada-vs-calculada > 3 días (revisar mapeo/offsets)', hibrido)
  return L.join('\n')
}
```

- [ ] **Step 2: Verificar el híbrido — es el auto-chequeo del mapeo**

```bash
node -e "import('./supabase/scripts/carga-visitas-historicas/generar.mjs').then(m=>{const model=m.extraer(process.argv[1]);const inf=m.informeDiscrepancias(model);const hib=(inf.match(/vs calc/g)||[]).length;console.log('desvíos híbrido >3d:',hib);console.log(inf.split('\\n').slice(0,40).join('\\n'))})" "./supabase/scripts/carga-visitas-historicas/Visitas estimada real (1).xlsx"
```
Expected: los desvíos híbrido > 3 días deben ser **pocos** y corresponder a los typos de año conocidos (6) más algún outlier real. **Si THESEUS aparece con desvíos sistemáticos en TODAS sus visitas post-ancla, el offset de la serie THESEUS en `mapeo.mjs` está mal → ajustar los `offsetDays` de THESEUS hasta que el híbrido quede limpio** (esta es la validación del mapeo fino de §5 del spec). Iterar B2 ↔ B5 hasta que solo queden los typos reales.

- [ ] **Step 3: Commit**

```bash
git add supabase/scripts/carga-visitas-historicas/generar.mjs
git commit -m "feat(carga): backfill de real_date + informe de discrepancias con chequeo híbrido"
```

---

### Task B6: Ensamblar el script de carga (transacción + dry-run + asserts)

**Files:**
- Modify: `supabase/scripts/carga-visitas-historicas/generar.mjs` (función `main` que escribe `out/`)
- Create: `supabase/scripts/carga-visitas-historicas/README.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `out/carga-visitas-historicas.sql` (gitignored) envuelto en `begin; ... ` + verificación de conteos + `-- commit;` (el Director cambia a `commit;`), y `out/discrepancias.md`.

- [ ] **Step 1: Escribir `main` (ensamblado + asserts + dry-run)**

```js
// generar.mjs (parte 4: main).
import fs from 'node:fs'
export function main(path, outDir) {
  const model = extraer(path)
  const asserts =
    `-- Verificación de conteos (aborta si no cuadran) --\n` +
    `do $$ declare n int; begin\n` +
    `  select count(*) into n from public.patients where full_name in (${[...model.personas.values()].map(p => q(p.nombre)).join(',')});\n` +
    `  if n < ${model.personas.size} then raise exception 'personas esperadas ${model.personas.size}, hay %', n; end if;\n` +
    `  raise notice 'OK personas: %', n;\n` +
    `end $$;`
  const sql = [
    '-- CARGA DE VISITAS HISTÓRICAS — generado, NO editar a mano. Contiene PII: NO commitear.',
    '-- Dry-run: dejar el rollback del final. Para aplicar: cambiar "rollback;" por "commit;".',
    'begin;',
    '', sqlDefiniciones(),
    '', sqlPersonasYEnrollments(model),
    '', sqlBackfill(model),
    '', asserts,
    '', '-- SELECTs de control (mirar la salida antes de decidir):',
    `select 'defs' k, count(*) from public.visit_definitions vd join public.protocols p on p.id=vd.protocol_id where p.code in ('CEREN-2','ACT18301','THESEUS','LTS 17231')`,
    `union all select 'visitas con real', count(*) from public.patient_visits where real_date is not null;`,
    '', 'rollback; -- <<< cambiar a commit; cuando los conteos cierren',
  ].join('\n')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(`${outDir}/carga-visitas-historicas.sql`, sql)
  fs.writeFileSync(`${outDir}/discrepancias.md`, informeDiscrepancias(model))
  console.log('Escrito en', outDir, '—', model.stats)
}
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  if (process.argv[3] === '--build') main(process.argv[2], process.argv[4] || './supabase/scripts/carga-visitas-historicas/out')
}
```

- [ ] **Step 2: Generar y revisar el SQL**

```bash
node supabase/scripts/carga-visitas-historicas/generar.mjs "./supabase/scripts/carga-visitas-historicas/Visitas estimada real (1).xlsx" --build
```
Expected: escribe `out/carga-visitas-historicas.sql` y `out/discrepancias.md`; imprime `{ filas: 414, enrollments: 29, personas: 21, reales: 262 }`. Abrir el `.sql` y confirmar: empieza con `begin;`, termina con `rollback;`, y los `on conflict` están en todos los inserts.

- [ ] **Step 3: Escribir el README** (uso + privacidad)

```markdown
# Carga de visitas históricas — generador

Uso (local, NO commitear la salida):
1. Copiar el Excel a esta carpeta.
2. `node generar.mjs "<Excel>.xlsx" --build`
3. Revisar `out/discrepancias.md` y resolver con el Director.
4. Aplicar la migración 0062 primero.
5. Correr `out/carga-visitas-historicas.sql` en Supabase en **dry-run** (rollback), mirar los
   conteos de control, y recién ahí cambiar `rollback;` por `commit;`.

Privacidad: `out/` y el `.xlsx` están gitignored (traen nombres de paciente). Al repo va solo
la lógica (parse/mapeo/generar).
```

- [ ] **Step 4: Commit** (solo lógica y README; `out/` gitignored)

```bash
git add supabase/scripts/carga-visitas-historicas/generar.mjs supabase/scripts/carga-visitas-historicas/README.md
git commit -m "feat(carga): ensamblado del script (dry-run + asserts de conteo) y README"
```

---

# Fase C — Front: ver estimada + real + desvío (PR aparte)

> Sobre datos que ya llegan al componente (`TrackVisitRow.estimated_date` / `real_date`). Sin migración.

### Task C1: Cronograma de la ficha — dejar de coalescer

**Files:**
- Modify: `src/views/track/PdFullSchedule.tsx` (líneas ~39, ~53 — el `estimated_date ?? real_date`)

**Interfaces:**
- Consumes: `TrackVisitRow` (`src/data/visits.ts:17-56`): `estimated_date`, `real_date`, `window_start`, `window_end`, `computed_status`.

- [ ] **Step 1: Leer el componente actual** para ver el render exacto de la fecha.

Run: abrir `src/views/track/PdFullSchedule.tsx` y ubicar el `?? ` y el JSX de la celda de fecha.

- [ ] **Step 2: Reemplazar el coalesce por estimada + real + desvío**

Para una visita programada con `real_date`, mostrar ambas y el desvío. Helper de desvío (agregar arriba del componente):

```tsx
// Desvío en días entre lo real y lo estimado. Positivo = vino después.
function desvioDias(estimated: string | null, real: string | null): number | null {
  if (!estimated || !real) return null
  return Math.round((Date.parse(real) - Date.parse(estimated)) / 86400000)
}
// ¿la real cayó fuera de la ventana [window_start, window_end]?
function fueraDeVentana(real: string | null, ws: string | null, we: string | null): boolean {
  if (!real || !ws || !we) return false
  return real < ws || real > we
}
```

Render (reemplazar la celda que hoy hace `estimated_date ?? real_date`):

```tsx
{v.real_date ? (
  <span className="fechas-visita">
    <time className="fecha-estimada" dateTime={v.estimated_date ?? undefined}>{fmtFecha(v.estimated_date)}</time>
    <span className="sep">·</span>
    <time className="fecha-real" dateTime={v.real_date}>{fmtFecha(v.real_date)}</time>
    {desvioDias(v.estimated_date, v.real_date) !== null && (
      <span className="desvio">{desvioDias(v.estimated_date, v.real_date)! > 0 ? '+' : ''}{desvioDias(v.estimated_date, v.real_date)} d</span>
    )}
    {fueraDeVentana(v.real_date, v.window_start, v.window_end) && (
      <Icon name="alert-triangle" aria-label="Fuera de ventana" className="fuera-ventana" />
    )}
  </span>
) : (
  <time dateTime={v.estimated_date ?? undefined}>{fmtFecha(v.estimated_date)}</time>
)}
```

(Usar el helper de formato de fecha que ya use el componente; si no hay, importar de `src/lib/dates.ts`. `Icon` de `src/components/Icon.tsx`.)

- [ ] **Step 3: Estilos** (tokens Sereno; estado por forma+color, no color solo — WCAG)

Agregar al CSS del componente (o `tokens`-based): `.fecha-estimada` atenuada (`color: var(--text-muted)`), `.fecha-real` normal, `.desvio` chip sobrio, `.fuera-ventana` color de alerta **con** el ícono de forma (no solo color).

- [ ] **Step 4: Typecheck + preview**

Run: `npm run typecheck`
Expected: sin errores.
Luego preview (`.claude/launch.json`, puerto 5250): abrir la ficha de un paciente con visitas programadas que tengan `real_date`, confirmar por snapshot/DOM que se ven las **dos** fechas + desvío (no usar `preview_screenshot`, se cuelga; verificar por read_page/eval).

- [ ] **Step 5: Commit**

```bash
git add src/views/track/PdFullSchedule.tsx
git commit -m "feat(track): cronograma muestra estimada + real + desvío (deja de coalescer)"
```

---

### Task C2: Detalle de visita — fila de fechas

**Files:**
- Modify: `src/views/track/VisitDetail.tsx` (~121-133, el panel que hoy no muestra ninguna fecha)

**Interfaces:**
- Consumes: la visita con `estimated_date`, `real_date`, `window_start/end` (mismo shape que C1).
- Reutiliza: `desvioDias` / `fueraDeVentana` — extraer a `src/lib/dates.ts` (o `src/lib/visits.ts`) para no duplicar entre C1 y C2.

- [ ] **Step 1: Extraer los helpers a un módulo compartido**

Mover `desvioDias` y `fueraDeVentana` (de C1) a `src/lib/visits.ts`, exportarlos, e importarlos en `PdFullSchedule.tsx` y `VisitDetail.tsx`. (DRY: no duplicar la lógica de desvío.)

- [ ] **Step 2: Agregar la fila "Estimada / Real (+desvío)" al panel**

En el panel de `VisitDetail`, agregar (con el estilo de las otras filas del panel):

```tsx
<div className="detalle-fila">
  <span className="detalle-label">Fecha</span>
  <span className="detalle-valor">
    Estimada {fmtFecha(visita.estimated_date)}
    {visita.real_date && <> · Real {fmtFecha(visita.real_date)}
      {desvioDias(visita.estimated_date, visita.real_date) !== null &&
        <> ({desvioDias(visita.estimated_date, visita.real_date)! > 0 ? '+' : ''}{desvioDias(visita.estimated_date, visita.real_date)} d)</>}
      {fueraDeVentana(visita.real_date, visita.window_start, visita.window_end) &&
        <Icon name="alert-triangle" aria-label="Fuera de ventana" />}</>}
  </span>
</div>
```

- [ ] **Step 3: Typecheck + preview**

Run: `npm run typecheck` → sin errores.
Preview: abrir el detalle de una visita atendida, confirmar por DOM que aparece la fila con ambas fechas + desvío.

- [ ] **Step 4: Commit**

```bash
git add src/views/track/VisitDetail.tsx src/lib/visits.ts src/views/track/PdFullSchedule.tsx
git commit -m "feat(track): detalle de visita muestra estimada/real/desvío; helpers a lib"
```

---

### Task C3: Columna "Desvío (días)" en el CSV

**Files:**
- Modify: `src/views/ProtocolDetailView.tsx` (~68-78, armado del CSV)

**Interfaces:**
- Consumes: `desvioDias` (C2, en `src/lib/visits.ts`); las filas que ya arman `Estimada`/`Real`.

- [ ] **Step 1: Agregar la columna al CSV**

Donde se arman las columnas del reporte (hoy `Estimada`, `Real`, `Ventana inicio`, `Ventana fin`), agregar `Desvío (días)` con `desvioDias(row.estimated_date, row.real_date) ?? ''`.

- [ ] **Step 2: Typecheck + verificación**

Run: `npm run typecheck` → sin errores.
Verificar: exportar el CSV de un protocolo desde el preview y confirmar la nueva columna con valores (ej. `-1`, `+2`) y vacío donde no hay real.

- [ ] **Step 3: Commit**

```bash
git add src/views/ProtocolDetailView.tsx
git commit -m "feat(reporte): columna Desvío (días) en el CSV de protocolo"
```

---

## Self-Review (hecho)

**Cobertura del spec:**
- §4/§5 decisiones y mapeo → Task B2 (config) + B5 (validación híbrida del mapeo). ✓
- §6.1 migración 0062 → Task A1. ✓
- §6.2 script de carga (defs, personas, enrollments, backfill, idempotencia, dry-run) → B3–B6. ✓
- §6.3 informe de discrepancias → B5. ✓
- §7 front (PdFullSchedule, VisitDetail, CSV, fuera-de-ventana) → C1–C3. ✓
- §5.1 LTS (26 visitas, offsets sem×7, V1 basal) → `PROTOCOLOS['LTS 17231']` en B2. ✓
- §10 PII fuera de git → B1 `.gitignore` + B6 README. ✓

**Placeholders:** el offset de la serie THESEUS está marcado "a validar" pero con un mecanismo concreto de validación (B5 step 2, iterar hasta que el híbrido quede limpio) — no es un TODO abierto, es un paso ejecutable.

**Consistencia de tipos:** `desvioDias`/`fueraDeVentana` se definen en C1 y se extraen a `src/lib/visits.ts` en C2 step 1 (mismo nombre/firma en C1, C2, C3). `extraer`/`sqlDefiniciones`/`sqlPersonasYEnrollments`/`sqlBackfill`/`informeDiscrepancias`/`main` — nombres consistentes B3→B6.

**Dependencias abiertas (del spec, no del plan):** cronograma LTS confirmado; falta que el Director resuelva las discrepancias de §6.3 sobre el informe que produce B5.
