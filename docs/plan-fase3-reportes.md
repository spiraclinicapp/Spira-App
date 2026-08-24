# Fase 3 · Retirar `has_report` — plan de ejecución

Continúa `docs/plan-cronograma-reportes.md`. **Autocontenido**: se puede tomar sin haber estado en
la sesión que lo escribió (2026-08-24).

---

## Dónde está todo hoy

| | Estado |
|---|---|
| **Fase 1** (catálogo del estudio + definiciones de reporte) | **Mergeada** — PR #65, en `main` |
| **Fase 2** (tablero + desglose en la visita) | **PR [#66](https://github.com/spiraclinicapp/Spira-App/pull/66) abierta**, rama `feat/reportes-pendientes`, sin mergear |
| **Fase 3** | Sin empezar. Es lo que describe este archivo |
| Migraciones en prod | **0089, 0090 y 0091** aplicadas (2026-08-23) |
| Tests | 297 verdes |

⚠️ **La migración de la fase 3 es la `0092`, no la `0091`.** La 0091 se la quedó un arreglo
aditivo (`set_visit_procedures` no sumaba el procedimiento al estudio). Ver `supabase/README.md`.

---

## ORDEN DE DESPLIEGUE — lo único que no se negocia

```
   deploy del FRONT  ────────►  recién después, aplicar la 0092
```

Al revés rompe producción. El front desplegado **hoy** lee `procedures.has_report` y
`report_eta_hours` en `data/procedures.ts`; la 0092 se las saca. Si la migración va primero, todas
las consultas que nombran esas columnas fallan y las listas de visitas quedan en blanco — es
exactamente lo que pasó con la 0068 el 2026-08-05.

Esta es la única fase de las tres que va en este orden. Las otras dos eran aditivas.

---

## Hallazgos de datos (medidos en prod el 2026-08-24)

Se midieron antes de escribir la migración porque **cambian el diseño**. Si pasó mucho tiempo,
conviene volver a correrlos.

### 1. `visit_procedure_reports_ready` — 19 filas, y NINGUNA hay que migrar

Es la tabla del "reporte listo" del modelo viejo (0064). Las 19 filas son de
**Consentimiento informado** y **Espirometría**, y los dos tienen **cero definiciones de reporte**
en el modelo nuevo.

**Conclusión: no hay nada que migrar a `report_status`.** Son marcas de una época en que ese tilde
existía para cualquier procedimiento; hoy esos procedimientos no generan reportes.

**La tabla NO se dropea.** Es registro de lo que pasó, en un sistema auditado. Se deja con un
`comment on table` que diga que quedó retirada, igual que hizo la 0069 con el canal del checklist.

> Si al reejecutar la medición aparecieran filas de procedimientos **con** definiciones, hay que
> decidir ahí: migrar sólo las que tengan UNA definición (mapeo inequívoco) y **listar por
> `raise notice` las ambiguas** en vez de inventarles un estado. Marcar como descargado un reporte
> que no existía cuando alguien apretó el botón es fabricar un registro.

### 2. `alert_dismissals` de reporte — CERO filas

No hay ni un descarte de `kind = 'reporte_procedimiento'`. **La expansión de descartes que pide la
decisión 3A es un no-op hoy**, pero se escribe igual: es idempotente y tiene que ser correcta si
aparece alguno entre hoy y el día que se aplique.

### 3. Lo demás

- Procedimientos con `has_report = true`: **Análisis de orina**, **Cuestionario de calidad de
  vida**, **Electrocardiograma (ECG)**.
- Alertas de reporte vigentes (`v_procedure_report_alerts`): **0**.

Consulta para reejecutar todo esto: ver el apéndice al final.

---

## El trabajo, en orden

### Paso 1 · Front (se despliega primero)

| Archivo | Qué |
|---|---|
| `src/data/procedures.ts` | Sacar `has_report` y `report_eta_hours` de **todas** las interfaces (`Procedure`, `VisitProcedure`, `VisitProcedureStatus`), de **todos** los `.select(...)`, y borrar `ProcedureCatalogEdit` + `updateProcedure` (quedó sin uso al morir el editor viejo) |
| `src/views/track/VisitProcedures.tsx` | Sacar el circuito legacy: la rama `p.has_report && misReportes.length === 0`, `reportOverdue`, `reportPill`, y el uso de `toggleVisitProcedureReport` |
| `src/data/procedures.ts` | Sacar `toggleVisitProcedureReport` (queda sin consumidores) |
| `src/lib/checklist.ts` | Sacar `REPORT_ETA_OPTIONS`. **Ojo:** `reportEtaLabel` puede seguir teniendo consumidores — grepear antes de borrarlo |
| `src/data/reports.ts` | `ProcedureReportAlertRow` pasa a identificar el **reporte** (`report_status_id` o el par visita+definición), no el `completion_id` |
| `src/data/alertDismissals.ts` | `isReportAlertDismissed` con la identidad nueva **y comparando el ancla** — hoy matchea sólo por `completion_id` e ignora el ancla, así que un descarte silencia para siempre. **Test de regresión obligatorio** |
| `src/shell/NotificationsMenu.tsx`, `TrackAlertsView` | Adaptar a la forma nueva de la fila de alerta |

Al terminar: `npm run build` verde y verificación en el navegador de que **las listas de visitas
siguen mostrando el estado correcto** (ahí es donde pega `computed_status`).

### Paso 2 · Migración `0092` (recién después del deploy)

1. **`v_patient_visits.computed_status`** deja de mirar `has_report`. La regla nueva tiene que
   derivarse de los mismos casos que ya están testeados en
   `src/views/track/reportes/estados.ts` (decisión D8) — leer esos tests antes de escribir el SQL.

   Equivalencias:

   | Rama vieja (0064) | Rama nueva |
   |---|---|
   | `item_vencido`: hay un procedimiento con `has_report`, realizado, sin `reports_ready`, y pasó la ETA | hay un reporte de esa visita con `completed`, `stage = 'pendiente'` y `now() > due_at` |
   | `realizada`: hay un procedimiento con `has_report` sin `reports_ready` | hay un reporte de esa visita que **no** está en `'evolucionado'` |

   La base del cruce es la MISMA que `v_protocol_report_status` (0090): arranca de
   `protocol_activities` (lo asignado) con las completions por LEFT JOIN. **No arrancar de las
   completions** — ver el porqué en el comentario de esa vista: una visita con un procedimiento sin
   realizar se cerraría sola.

2. **`v_track_visits`** hay que recrearla: el `drop` de `v_patient_visits` la tira en cascada.

3. **`v_procedure_report_alerts`** pasa a emitir **una fila por reporte vencido**, no por
   procedimiento (decisión 3A).

4. **`alert_dismissals`**: columna de identidad nueva para la clase `reporte_procedimiento`, y
   expansión de los descartes viejos a los reportes que les correspondan (hoy: cero).

5. **`descartar_alerta`** (0070): hoy resuelve por `completion_id` contra
   `v_procedure_report_alerts`. Adaptar a la identidad nueva. `create or replace` con la **misma
   firma** o queda una sobrecarga viva resolviendo las llamadas viejas, en silencio.

6. **Drop** de `procedures.has_report` y `procedures.report_eta_hours`.

7. `comment on table public.visit_procedure_reports_ready` marcándola retirada. **No dropear.**

### Paso 3 · Después de aplicar

- Registrar la 0092 como aplicada en `supabase/README.md` (CI lo vigila con
  `scripts/check-migraciones.mjs`).
- Verificar en el navegador: una visita con reportes pendientes tiene que seguir figurando
  **"realizada"** y no "completa", en Visitas del día, la Agenda y la ficha del paciente.
- Confirmar que la campana no cambió de número (no reaparecieron alertas archivadas).

---

## Trampas a tener presentes

- **Dollar-quoting:** nunca dos signos peso pegados dentro de un comentario SQL, y la cantidad de
  marcadores en el texto crudo tiene que ser **par**. Script de chequeo en el apéndice.
- **`create or replace` con firma distinta** deja una sobrecarga viva. Misma firma siempre.
- **Ambigüedad en plpgsql:** los nombres de un `returns table (...)` compiten con los de columna
  sin calificar. Calificar todo.
- **El editor de Supabase no comparte sesión entre sentencias** de un mismo bloque, ni las envuelve
  en una transacción. Sentencias idempotentes y en orden de dependencias.
- **Antes de agregar una FK**, grepear la tabla en los `select(...)` del front: una FK nueva sobre
  una tabla ya embebida deja el embed ambiguo y PostgREST voltea la consulta entera.

---

## Pendiente del Director (no bloquea la fase 3)

Las URLs por defecto de los cuatro portales están **vacías a propósito** en `PLATFORMS`
(`src/views/track/procedimientos/reportes.ts`). El mecanismo de redirección está entero y
verificado; falta el dato. Con las URLs reales son cuatro líneas y el botón de la tarjeta empieza
a redirigir solo. Mientras tanto el botón lo dice: "{plataforma} · sin link".

---

## Apéndice · reejecutar la medición

Pegar en la consola del navegador con sesión iniciada (el preview corre en `:5250`):

```js
const { supabase } = await import('/src/lib/supabase.ts')
const c = async (t) => (await supabase.from(t).select('*', { count: 'exact', head: true })).count
console.log({
  reportsReady: await c('visit_procedure_reports_ready'),
  descartesDeReporte: (await supabase.from('alert_dismissals').select('id').eq('kind','reporte_procedimiento')).data?.length,
  alertasVigentes: await c('v_procedure_report_alerts'),
  conHasReport: (await supabase.from('procedures').select('name').eq('has_report', true)).data?.map(p => p.name),
})
```

Chequeo de dollar-quoting de una migración:

```bash
node -e "const t=require('fs').readFileSync('supabase/migrations/0092_XXX.sql','utf8');const n=(t.match(/[$]/g)||[]).length;console.log('pesos:',n,n%2?'IMPAR ✗':'PAR ✓');console.log('comentarios con peso:',t.split('\n').filter(l=>l.trim().startsWith('--')&&l.includes('$')).length)"
```
