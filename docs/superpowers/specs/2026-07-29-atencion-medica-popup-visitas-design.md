# Diseño — Popup "Atención médica" desde Visitas del día

Fecha: 2026-07-29 · Módulo: Track · Estado: aprobado (diseño), pendiente de plan de implementación.

## Contexto

En **Visitas del día** (`DayVisitsView` → `DayVisitRowItem`), cada fila tiene un botón
**"Quiere médico" / "En cola"** que hoy hace un *toggle directo* (`toggleWantsDoctor`): marca o
desmarca la visita para la cola del médico **sin pedir motivo ni permitir un comentario**.

El **modal de visita** (`VisitDetail.tsx`, la ficha canónica compartida) ya resuelve esto "bien":
tiene un panel **`DoctorRequest`** ("Marcar para ver médico") con un catálogo fijo de 5 motivos y
un panel **Comentarios** con el hilo `CommentThread`. Toda la infraestructura de datos ya existe y
está en producción:

- Motivo: RPC atómico `markWantsDoctor(visitId, motivo)` (migración **0047**), que setea
  `wants_doctor=true` + `doctor_motivo`. Quitar = `toggleWantsDoctor(id, false)`.
- Catálogo `MOTIVOS` (hoy suelto en `VisitDetail.tsx`): *Evento adverso · Síntomas reportados ·
  Laboratorio fuera de rango · Consulta clínica · Otro*. `MotivoChip.tsx` mapea el tono por motivo.
- Comentarios: tabla `visit_comments` + vista `v_visit_comments` + RPC `add_visit_comment`
  (SECURITY DEFINER, snapshot de autor+puesto; migración **0048**); componente `CommentThread`.

## Objetivo

Que al pulsar el botón de la fila se abra un **popup sobrio** que reutilice el sistema de diseño y
los componentes del modal, pida el **motivo** y muestre el **hilo completo de comentarios**, todo
atado al mismo `visit_id` (el comentario que se cargue ahí es el mismo que aparece en el modal).

**Sin migración**: toda la data y los RPCs ya existen (0047 + 0048).

## Alcance

**Incluye**
- Un popup nuevo (`DoctorRequestModal`) que se abre desde el botón de la fila en Visitas del día,
  en **ambos** estados del botón ("Quiere médico" y "En cola").
- Reutilización del panel de motivo del modal (extraído a componente propio) + el `CommentThread`.
- Motivo **editable** también cuando la visita ya está en cola (mejora que, por compartir el panel,
  queda igual en el modal).

**No incluye (YAGNI)**
- La cola "Para ver médico" (`DoctorQueueView`) queda igual.
- El modal de visita no cambia de layout ni de flujo; solo hereda el panel extraído (con el motivo
  ahora editable) y los mismos imports.
- Nada de esquema de base nuevo. No se toca el concepto de "resolución" ni comentarios inline en la
  lista.

## Decisiones (del brainstorming)

1. **Comentarios en el popup = hilo completo** (`CommentThread`), no una nota única. Ver previos +
   escribir, igual que el panel del modal.
2. **Ambos estados abren el popup.** Ya no hay des-toggle directo desde la fila.
3. **Arquitectura = compartir el panel.** Se extrae `DoctorRequest` + `MOTIVOS` (y el contenedor
   `Panel`, del que depende) a archivos propios; el popup y el modal usan el **mismo** panel.
4. **Motivo editable** cuando ya está en cola (progressive disclosure: ver motivo actual → "Editar"
   despliega los chips → "Guardar" llama a `markWantsDoctor` con el nuevo motivo).
5. **Título del popup = "Atención médica"** (ícono `users`).
6. **Al "Quitar de la cola" el popup se cierra solo** (tras el `toggleWantsDoctor(false)` exitoso).

## Arquitectura y componentes

### Refactor (extracción, sin cambiar apariencia)
- **`src/views/track/doctorMotivos.ts`** — exporta la constante `MOTIVOS` (única fuente de verdad;
  hoy vive suelta en `VisitDetail.tsx`, y `MotivoChip.tsx` ya la referencia "de palabra").
- **`src/views/track/Panel.tsx`** — el contenedor titulado con ícono (hoy función local en
  `VisitDetail.tsx`); lo usan varios paneles del modal y lo necesita `DoctorRequest`.
- **`src/views/track/DoctorRequest.tsx`** — el panel extraído de `VisitDetail.tsx`. Misma API
  (`visit, accent, readOnly, busy, onMark, onUnmark`) + la capacidad nueva de **editar el motivo**
  en estado "en cola". `VisitDetail` pasa a importarlo (deja de declararlo inline).

### Componente nuevo
- **`src/views/track/DoctorRequestModal.tsx`**
  - Props: `visitId: string`, `accent: string`, `canClinical: boolean`, `onClose: () => void`,
    `onChanged: () => void`.
  - Usa **`useVisit(visitId)`** (igual que `VisitDetail`) para reflejar el estado en vivo tras
    marcar / editar / quitar (nada de snapshot que quede viejo).
  - Estructura: `<Modal title="Atención médica" icon="users" accent maxWidth≈520>` con, en columna:
    1. `<DoctorRequest visit accent readOnly={!canClinical} busy onMark onUnmark />`
    2. `<CommentThread visitId accent onAdded={onChanged} />`
  - `onMark(motivo)` → `markWantsDoctor(visitId, motivo)`; `onUnmark()` → `toggleWantsDoctor(id,
    false)`. Maneja su propio `busy`/`err` (finas envolturas sobre los RPCs, como en `VisitDetail`).
    Tras cada mutación exitosa: `q.refetch()` (estado en vivo del popup) + `onChanged()` (refresca la
    lista y el badge de la fila). **Tras un `onUnmark` exitoso: además `onClose()`** (decisión 6).

### Cableado
- **`DayVisitRowItem.tsx`**: el botón (en los dos estados) pasa a llamar `onOpenDoctor(visit)` en vez
  de `onToggleDoctor`. El gating de aparición del botón NO cambia
  (`canClinical && stage !== 'por_llegar' && stage !== 'fuera' && !doctor_seen_at`).
- **`DayVisitsView.tsx`**: nuevo estado `doctorFor: DayVisitRow | null`; se renderiza
  `<DoctorRequestModal>` cuando está seteado; se retira el handler `toggleDoctor` (marcar/quitar
  ahora viven en el popup). El badge/contador se refresca vía `onChanged → day.refetch()`.

## Estados y flujo

`DoctorRequest` conserva sus 3 estados, ahora unificados con la edición:
- **Sin marcar** (`!wants_doctor`): chips de motivo (ninguno activo) + "Marcar para el médico"
  (deshabilitado hasta elegir un motivo — obligatorio, espeja el modal).
- **En cola** (`wants_doctor && !doctor_seen_at`): motivo actual mostrado + "Editar" (despliega los
  chips con el actual preseleccionado → "Guardar" si cambió, llama a `onMark`) + "Quitar de la cola"
  (llama a `onUnmark` → cierra el popup).
- **Visto por el médico** (`doctor_seen_at`): tarjeta de solo lectura. No alcanzable desde la fila
  (el botón no aparece con `doctor_seen_at`), pero el panel lo sigue soportando (lo usa el modal).

## Permisos, privacidad y accesibilidad

- **Authz**: el botón de la fila solo aparece con `canClinical`; el popup entra escribible por eso
  (`readOnly = !canClinical`). Los comentarios se pueden escribir siempre (criterio de
  `CommentThread`). La authz real la reimponen los RPCs server-side (`42501` → mensaje sereno).
- **RLS**: sin joins nuevos a `public.users`; el autor de cada comentario ya viene desnormalizado en
  la fila (patrón 0048). No se introduce el landmine de RLS de nombres de staff.
- **A11y**: `Modal` ya trae `role="dialog"`, `aria-modal`, cierre con Escape / click afuera / ✕ y
  foco. Se hereda tal cual.

## Errores y edge cases

- El popup abre con `visitId` y trae la visita con `useVisit` (una consulta liviana de 1 fila); el
  `CommentThread` maneja sus propios estados (cargando / error+Reintentar / vacío con calidez).
- Errores de `markWantsDoctor` / `toggleWantsDoctor`: mensaje sereno en castellano (helpers ya
  existentes).
- Concurrencia: si otra sesión cambió el estado, `useVisit` lo refleja al reabrir/refetch.

## Archivos

**Nuevos**: `DoctorRequestModal.tsx`, `Panel.tsx`, `doctorMotivos.ts`, `DoctorRequest.tsx`.
**Modificados**: `VisitDetail.tsx` (imports del panel/Panel/MOTIVOS extraídos + motivo editable),
`DayVisitsView.tsx` (estado `doctorFor` + render del popup, retiro de `toggleDoctor`),
`DayVisitRowItem.tsx` (`onToggleDoctor` → `onOpenDoctor`).

> Nota operativa: `DayVisitRowItem.tsx` y `VisitStepper.tsx` tienen cambios sin commitear del
> Director en el working copy compartido. Al implementar, coordinar / rebasar sobre `origin/main`
> fresco y stagear por ruta (nunca `git add -A`).

## Verificación

- `npm run typecheck` + `npm run build` verdes (gate del proyecto; no hay tests).
- Prueba en el navegador (logueado): abrir el popup desde una fila → marcar con motivo → comentar →
  verificar que (a) el badge/contador de la fila sube, (b) el mismo comentario aparece en el modal de
  esa visita, (c) editar el motivo lo actualiza, (d) "Quitar de la cola" cierra el popup y saca la
  visita del filtro "Para ver médico".
- Sin migración que aplicar.
