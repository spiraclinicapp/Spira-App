# Dispensación libre · la VNP entra al mostrador de Farmacia

**Fecha:** 2026-09-08 · **Origen:** `/plan-eng-review` sobre el pedido del Director
*"quiero poder dispensar libremente, no que esté anidado a una visita y a un paciente
necesariamente; y que en las visitas del paciente sumes la posibilidad de una VNP siempre"*.

**Alcance acordado (D1):** hacer la VNP dispensable desde Farmacia. `visit_id` sigue
`not null`. Lo de "paciente opcional" NO se descarta: ya vive en `TODOS.md` como
**dispensación ambulatoria**, con la decisión de diseño tomada desde el 2026-08-15.

---

## El diagnóstico en una frase

El pedido parecía "aflojar el modelo de datos" y era otra cosa: **el desplegable del
mostrador es más estricto que la base que alimenta**. La base ya deja dispensar contra
cualquier visita con un motivo fuera de cronograma; el selector de Farmacia no la deja
ni ver.

```
                LO QUE PERMITE LA BASE            LO QUE MUESTRA CADA PANTALLA
                (create_dispensation_request,     
                 0071:479-490)                    
                                                  Coordinación · VisitDetail
   cualquier visita  ─┬─ sin motivo si dispensa   ✅ cualquier visita
                      └─ CON motivo si no          ✅ pide motivo si hace falta
                                                     (VisitDispensationPanel:502)

                                                  Farmacia · Nueva dispensación
                                                  ❌ solo vd.dispenses = true
                                                  ❌ INNER JOIN visit_definitions
                                                     → las VNP (visit_def_id NULL)
                                                       ni siquiera aparecen
                                                  ❌ nunca manda motivo
                                                     (PanelNuevaDispensacion:118)
```

Y el ancla ya se mudó sin que la función lo acompañara:

```
        ANTES (0050)                         HOY (0082 / 0084)
  dispensation_requests                 dispensation_requests
    └─ visit_id ─┐                        ├─ visit_id      ← RLS de Track + validación
                 ├→ patient_visits        ├─ enrollment_id ← paciente   (sellado x trigger)
                 ├→ enrollments           ├─ protocol_id   ← protocolo  (sellado x trigger)
                 └→ protocolo/paciente    └─ visit_code    ← etiqueta
     todo el contexto colgaba de           el front YA lee de acá: Farmacia no
     la visita                             puede leer patient_visits (RLS 0006:162)
```

---

## Decisiones de este review

| # | Decisión | Elegido |
|---|---|---|
| D1 | Alcance | VNP dispensable. `visit_id` sigue NOT NULL |
| 1 | Authz de la VNP desde Farmacia | RPC nueva `registrar_vnp`, acotada a `kind='vnp'` |
| 2 | Qué ofrece el desplegable | TODAS las visitas del enrolamiento, con flag `dispensa` |
| 3 | `enrollments[0]` | Un renglón por enrolamiento (`flatMap`) |
| 4 | `MOTIVOS_FUERA_CRONOGRAMA` | Módulo compartido |
| 5 | Etiqueta de las sueltas | RPC devuelve `kind`; el front usa `visitTitle` |
| 6 | Tests | Extraer la regla del motivo + 3 tests puros |
| 7 | TODO | Sumar disparador "cuenta solo pharma" a `TODOS.md:864` |
| 8 | TODO | Anotar re-pedido y bloqueo real en `TODOS.md:157` |

### Refinamiento sobre D6 (no la revierte)

Al escribir el plan apareció un matiz que la pregunta no tenía: la regla del motivo **no
es una sola con dos copias, es una con dos parametrizaciones**. La base distingue por
si el pedido lleva renglones ([0071:481-487](../../../supabase/migrations/0071_dispensacion_ip.sql)):

```
  con renglones (items > 0)  →  hace falta motivo si NO vd.dispenses
  sin renglones (solo IP)    →  hace falta motivo si NO vd.dispenses_ip
```

El panel de Coordinación tiene los dos caminos, así que su `necesitaMotivo` es la
conjunción (`!dispenses && !dispenses_ip`). El panel de Farmacia **siempre manda
renglones**, así que el suyo es solo `!dispensa`. Por eso la función extraída lleva el
camino como parámetro explícito, en vez de una constante que sirva para una pantalla y
mienta en la otra.

> Verificado que esto NO es un bug vivo en Coordinación: con `dispenses = false` el panel
> oculta la sección de concomitante (`mostrarConcomitante = visit.dispenses || excepcionViva`,
> [VisitDispensationPanel.tsx:480](../../../src/views/pharma/VisitDispensationPanel.tsx)),
> así que nunca se llega a mandar renglones sin motivo.

---

## Qué ya existe (y se reusa, no se rehace)

| Ya existe | Se usa para | Se toca |
|---|---|---|
| `create_dispensation_request` con `p_off_schedule_reason` (0071) | crear el pedido fuera de cronograma | **no** — ya hace lo que hace falta |
| `dispensation_requests.enrollment_id` / `.protocol_id` / `.visit_code` (0082/0084) | contexto de paciente y protocolo en el tablero | **no** — el trigger los sella solo |
| `MOTIVOS_FUERA_CRONOGRAMA` (`VisitDispensationPanel.tsx:104`) | el desplegable de motivo | se **muda** a módulo propio |
| `visitTitle` (`lib/visits.ts:14`) | etiqueta "V7 - Semana 12" / "VNP" | se **afloja** el parámetro |
| `KIND_LABELS` (`lib/visitLabels.ts`) | vocabulario de tipos de visita | **no** |
| `availableEventKinds` (`visitEvents.ts:24`) | ya devuelve `vnp` en las TRES ramas | **no** |
| `idx_patient_visits_enrollment` / `idx_request_visit` (0005) | el `where` ensanchado | **no** |
| `audit_row()` sobre `patient_visits` | rastro de quién creó la VNP | **no** |

**La mitad del pedido ya estaba shipeada.** "Que en las visitas del paciente se pueda
una VNP siempre" ya funciona: `availableEventKinds` devuelve `vnp` pre-rando, pre-rando
con cuadro y post-rando, y "Agendar visita" aparece siempre con permiso de escritura
([PatientFichaView.tsx:106](../../../src/views/PatientFichaView.tsx)). Lo que faltaba era
que Farmacia pudiera **dispensar contra** esa VNP.

---

## Cambios

### Base

**`0114_registrar_vnp.sql` — ADITIVA · se aplica ANTES del deploy del front**

Ningún front desplegado la llama, así que el que no funciona sin ella es el front nuevo.

```sql
create or replace function public.registrar_vnp(
  p_enrollment_id uuid, p_date date, p_notes text default null
) returns uuid language plpgsql security definer
  set search_path = pg_catalog, public as $$
declare v_protocol uuid; v_visit uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if p_date is null then raise exception 'La fecha es obligatoria' using errcode='23502'; end if;

  select e.protocol_id into v_protocol
    from public.enrollments e where e.id = p_enrollment_id;
  if v_protocol is null then
    raise exception 'Enrolamiento inexistente' using errcode='23503';
  end if;

  -- El agregado respecto de register_visit_event: Farmacia. Registra el hecho que
  -- presenció (el paciente vino a buscar medicación sin cita), y NADA más: kind va
  -- fijo en el cuerpo, no hay parámetro que falsear para colarse a randomizar.
  if not (public.has_min_role('pharma','operator')
          or public.has_module('gerencia')
          or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator')
              and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso para registrar una visita de este paciente'
      using errcode='42501';
  end if;

  -- Nace AGENDADA (estimated_date), igual que register_visit_event (0025). Marcarla
  -- atendida dispara la materialización del checklist, y eso es del coordinador.
  insert into public.patient_visits (enrollment_id, kind, estimated_date, notes)
  values (p_enrollment_id, 'vnp', p_date, nullif(btrim(coalesce(p_notes,'')),''))
  returning id into v_visit;

  return v_visit;
end; $$;
revoke all on function public.registrar_vnp(uuid, date, text) from public;
grant execute on function public.registrar_vnp(uuid, date, text) to authenticated;
notify pgrst, 'reload schema';
```

**`0115_visitas_dispensables_completas.sql` — BREAKING · se aplica DESPUÉS del deploy**

Con el front viejo, esta migración le muestra a la farmacéutica visitas que no dispensan
y que él no sabe pedir con motivo: elige una y recibe *"Esta visita no entrega medicación"*.
No corrompe nada, pero es el patrón que ya mordió con la 0068 y la 0092.

- `drop function public.visitas_dispensables(uuid);` **primero**. `create or replace` sobre
  un `returns table` con columnas nuevas falla con `42P13: cannot change return type`.
- `left join public.visit_definitions vd on vd.id = pv.visit_def_id` (era INNER — ese join
  es el que borra las VNP, porque una suelta nace con `visit_def_id` NULL, 0025:76).
- se cae `and coalesce(vd.dispenses, false) = true`.
- devuelve además: `visit_code`, `kind` (enum `visit_kind`), `dispensa`, `dispensa_ip`.
- authz y `order by` idénticos a la 0059 (más reciente primero: en el mostrador, la visita
  que acaba de pasar es la candidata).

### Front

| Archivo | Cambio |
|---|---|
| `src/views/pharma/motivosFueraCronograma.ts` | **nuevo.** `MOTIVOS_FUERA_CRONOGRAMA`, `FALTA_MOTIVO_MSG`, `necesitaMotivoFueraCronograma(visita, { llevaRenglones })` |
| `src/views/pharma/motivosFueraCronograma.test.ts` | **nuevo.** T3 |
| `src/views/pharma/VisitDispensationPanel.tsx` | importa las tres cosas en vez de declararlas |
| `src/lib/visits.ts` | `visitTitle` acepta `{ visit_code, visit_name, kind }` (subtipo estructural) |
| `src/lib/visits.test.ts` | T2: suelta con `kind='vnp'` → `"VNP"` |
| `src/data/pharma/dispensations.ts` | `VisitaDispensableRow` gana 4 campos; `registrarVnp()` nueva |
| `src/views/pharma/dispensaciones/opcionesEnrolamiento.ts` (+`.test.ts`) | **nuevos.** T1 |
| `src/views/pharma/dispensaciones/PanelNuevaDispensacion.tsx` | `flatMap`; `visitTitle`; desplegable de motivo; botón "Registrar VNP" |
| `supabase/README.md` | índice de migraciones |
| `TODOS.md` | dos ediciones (decisiones 7 y 8) |

> **11 archivos, por encima del umbral de 8.** Cuatro son tests y documentación, y el
> alcance se acordó explícitamente en D1. Lo anoto por honestidad, no como alarma.

---

## Flujo nuevo

```
FARMACIA · Nueva dispensación
  │
  ├─ 1 · elegir ENROLAMIENTO ─────────────────────────────────────────┐
  │      "Ana Pérez · 0320040001 · PROT-A"                            │ un renglón por
  │      "Ana Pérez · 0320040001 · PROT-B"   ← antes desaparecía      │ enrolamiento
  │                                                                    ┘
  ├─ 2 · elegir VISITA ── rpc visitas_dispensables ──────────────────┐
  │      "V7 - Semana 12 · 12/08"        dispensa=true               │ TODAS, con
  │      "VNP · 03/09"                   dispensa=false  ⚠           │ etiqueta real
  │      "V9 - Semana 24 · 08/09"        ya_solicitada=true (inerte) │
  │                                                                   ┘
  │      └─ [Registrar VNP de hoy] ── rpc registrar_vnp ── refetch ───┘
  │
  ├─ 3 · ¿motivo? ── necesitaMotivoFueraCronograma(v, {llevaRenglones:true})
  │      dispensa=false → desplegable OBLIGATORIO (preselecciona "VNP" si vino del botón)
  │      dispensa=true  → no se muestra
  │
  ├─ 4 · agregar medicación (patient_medications activas del enrolamiento)
  │
  └─ 5 · crear ── create_dispensation_request(visitId, items, null, 'pharma', motivo)
                    │
                    └─ trigger sella enrollment_id / protocol_id / visit_code
                       check: off_schedule ⇒ off_schedule_reason no vacío (0071:95)
```

---

## Modos de falla

| # | Codepath | Cómo falla en producción | ¿Test? | ¿Manejo de error? | ¿Silenciosa? |
|---|---|---|---|---|---|
| 1 | `opcionesDeEnrolamiento` | imputa al protocolo equivocado si vuelve a colapsar por paciente | **T1** | no aplica | **SÍ** |
| 2 | `registrar_vnp` | `42501` con una cuenta solo-pharma mal escrita | no (SQL) | `eventError` → mensaje sereno | no |
| 3 | `visitas_dispensables` | `42P13` al aplicar, o lista vacía si el `drop` no corrió | no (SQL) | la lista vacía se ve | no |
| 4 | `visitTitle` sobre sueltas | varios renglones "Visita" indistinguibles | **T2** | no aplica | **SÍ** |
| 5 | `necesitaMotivoFueraCronograma` | `off_schedule=true` en una entrega NORMAL | **T3** | no aplica | **SÍ ⚠ CRÍTICA** |
| 6 | `create_dispensation_request` | rechazo por medicación no habilitada | no | `pharmaErrorMessage` | no |

**Sin brechas críticas:** los tres caminos silenciosos (1, 4, 5) quedan cubiertos por test
puro. Los tres visibles se verifican mirando, que es el criterio de `CLAUDE.md`.

El peor sigue siendo el 5, y conviene decirlo con todas las letras: `off_schedule` es una
marca de auditoría con su propio check en la base. Una dispensación normal marcada como
excepción no se ve mal en ninguna pantalla — aparece recién cuando un monitor filtra las
excepciones y encuentra cincuenta que no lo eran.

---

## Fuera de alcance (considerado y diferido a propósito)

| Qué | Por qué |
|---|---|
| `dispensation_requests.visit_id` nullable | D1: rompe la RLS de Track (`coordina_visita(dr.visit_id)`, 0006:282) y deja el pedido invisible para la coordinadora. Se puede hacer, pero no hace falta para "dispensar libremente" |
| Dispensación **sin paciente** | No es una dispensación, es un egreso de stock. Ya está diseñado en `TODOS.md:157` como tabla propia `ambulatory_dispensations`; el FEFO filtra `ml.protocol_id = v_protocol_id` (0050:316), que con NULL nunca matchea |
| Reescribir `v_billing_dispensations` | Vista muerta hoy (nadie la consulta desde el front). Ya tiene su entrada en `TODOS.md:242` |
| Probar con una cuenta solo-`pharma` | Se anota como disparador en `TODOS.md:864` (decisión 7). Crear usuarios en prod es acción del Director, no de este PR |
| Retest / firma / screening desde el mostrador | Entran gratis con la decisión 2 (el desplegable ya no filtra), pero no se diseña UI específica para ellos |
| Marcar la VNP como atendida desde Farmacia | Dispararía la materialización del checklist, que es del coordinador. La VNP nace agendada, igual que en `register_visit_event` |

---

## Orden de despliegue (LEER ANTES DE APLICAR NADA)

```
  1 · aplicar 0114_registrar_vnp.sql          ← ADITIVA: ningún front viejo la llama
  2 · desplegar el front                       ← ya puede llamar registrar_vnp
  3 · aplicar 0115_visitas_dispensables_*.sql  ← BREAKING para el front viejo
```

**El paso 3 no se pushea al repo hasta que el paso 2 esté desplegado.** El aviso adentro
del `.sql` llega tarde: para cuando se lee, el archivo ya se abrió para correrlo (0092,
2026-08-23). Entre el paso 2 y el 3 el front nuevo tolera la forma vieja de la RPC:
sin `dispensa`, cae al comportamiento actual (no pide motivo).

---

## Tareas

- [ ] **T-1** `0114_registrar_vnp.sql` + registrar en `supabase/README.md`. Verificar
      paridad de marcadores `$$` en el texto crudo antes de pasárselo al Director (0071).
- [ ] **T-2** `motivosFueraCronograma.ts`: mudar las dos constantes, escribir
      `necesitaMotivoFueraCronograma(v, { llevaRenglones })`, + test (T3).
- [ ] **T-3** `VisitDispensationPanel.tsx`: consumir el módulo. Verificar en el navegador
      que la sección de excepción sigue igual.
- [ ] **T-4** `lib/visits.ts`: aflojar el parámetro de `visitTitle` + test (T2).
- [ ] **T-5** `data/pharma/dispensations.ts`: ampliar `VisitaDispensableRow`, agregar
      `registrarVnp()` con su `pharmaErrorMessage`.
- [ ] **T-6** `opcionesEnrolamiento.ts` + test (T1); consumirlo desde el panel.
- [ ] **T-7** `PanelNuevaDispensacion.tsx`: `flatMap`, `visitTitle`, motivo, botón VNP.
      **Actualizar el comentario de cabecera**: los "TRES CANDADOS" que describe ya no
      son los que hay. Un diagrama en comentario que miente es peor que ninguno.
- [ ] **T-8** `TODOS.md`: decisiones 7 y 8.
- [ ] **T-9** `npm run build` verde.
- [ ] **T-10** QA logueado contra prod: crear una VNP `TEST-*` desde el mostrador,
      dispensar con motivo, y **borrar exactamente esa**. Nunca en lote.
- [ ] **T-11** `0115_visitas_dispensables_completas.sql`, recién después del deploy.

**Paralelización:** T-2/T-3/T-4 (front puro, módulos distintos) y T-1 (SQL) pueden ir en
paralelo. T-5 → T-6 → T-7 son secuenciales sobre el mismo panel. No compensa un worktree:
el trabajo pesado vive en un solo archivo.

---

## GSTACK REVIEW REPORT

| Runs | Status | Findings |
|---|---|---|
| Step 0 · Scope challenge | ✅ completo | Complexity check DISPARÓ (>8 archivos, RLS + 3 triggers + 2 vistas) → D1 acordado con el Director |
| 1 · Architecture | ✅ completo | 3 hallazgos, los 3 resueltos |
| 2 · Code quality | ✅ completo | 2 hallazgos, los 2 resueltos |
| 3 · Tests | ✅ completo | 1 hallazgo (regla duplicada + 3 caminos silenciosos sin cobertura), resuelto |
| 4 · Performance | ✅ completo | Sin hallazgos — `idx_patient_visits_enrollment` e `idx_request_visit` ya cubren el `where` ensanchado |
| TODOS cross-ref | ✅ completo | 2 entradas actualizadas; 1 (`v_billing_dispensations`) leída y descartada por no aplicar |
| Outside voice | ⛔ no disponible | `codex` no está instalado en esta máquina. Review con una sola voz |

**Hallazgos verificados (todos con código citado):**

| # | Sev | Conf | Ubicación | Hallazgo |
|---|---|---|---|---|
| 1 | P0 | 9/10 | `0030_flujo_randomizacion.sql:158` | `register_visit_event` excluye a `pharma` de su authz → "Registrar VNP" desde el mostrador daría 42501, y el usuario de QA (cinco módulos) no lo reproduce |
| 2 | P1 | 10/10 | `0059_dispensacion_alta_manual_pharma.sql:151` | INNER JOIN contra `visit_definitions` + `dispenses = true` borra toda VNP del desplegable — la causa raíz del pedido |
| 3 | P1 | 8/10 | `PanelNuevaDispensacion.tsx:44` | `enrollments?.[0]` descarta el resto: con el desplegable abierto, vía activa para imputar al protocolo equivocado |
| 4 | P2 | 10/10 | `VisitDispensationPanel.tsx:104` | `MOTIVOS_FUERA_CRONOGRAMA` es `const` privado; su propio comentario promete fuente única, y el texto sale impreso |
| 5 | P2 | 9/10 | `0059:151` + `PanelNuevaDispensacion.tsx:69` | `coalesce(vd.name,'Visita')` deja todas las sueltas con la misma etiqueta al abrir el desplegable |
| 6 | P1 | 9/10 | `0071_dispensacion_ip.sql:481` | La regla del motivo depende de si el pedido lleva renglones; escrita inline y a punto de duplicarse mal |

**Correcciones hechas durante el review:**
- `v_billing_dispensations` se citó como mina; `TODOS.md:242` registra que hoy **no la
  consulta nadie**. Sigue siendo válido para la opción B de D1, no para lo elegido.
- D6 asumía una regla duplicada; son dos parametrizaciones de la misma regla. Refinado
  arriba, sin revertir la decisión.

**VERDICT: APROBADO.** Alcance acordado, 6 hallazgos resueltos, 3 caminos de falla
silenciosa cubiertos por test puro, orden de despliegue explícito en dos migraciones.
Sin voz externa (`codex` ausente): el veredicto se apoya en una sola revisión.

NO UNRESOLVED DECISIONS
