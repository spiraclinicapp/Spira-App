# Plan · Ajustes → Equipo y accesos: reskin y mejoras prácticas

**Estado:** IMPLEMENTADO (T1-T8) en `feat/ajustes-equipo-reskin` · falta el QA logueado · **Fecha:** 2026-09-09 · **Rama base:** `main` (v0.66.0)
**Handoff:** [`docs/design_handoff_ajustes_equipo/`](design_handoff_ajustes_equipo/README.md) (8 sep 2026)
**Revisión:** `/plan-eng-review` — 11 decisiones tomadas, 0 migraciones, 0 SQL para producción.

---

## 1 · Qué se hace

Las **siete piezas** del handoff `Ajustes → Equipo y accesos`, completas. Nada más.

| # | Pieza | Estado hoy |
|---|---|---|
| 1 | La fila del equipo: prosa con puntos medios + escudito junto al nombre | Hoy son chips |
| 2 | Botón de ojo + popup de solo lectura | **No existe** |
| 3 | ⓘ al lado del selector de nivel, en Módulos | **No existe** (la descripción vive en el menú) |
| 4 | Tarjeta «Estudios que ve»: botón verde + chips con × | Hoy es un desplegable múltiple |
| 5 | Menú «Añadir estudio»: sólo lo que falta, cada fila con `+` | Hoy tilda y destilda |
| 6 | Retítulo del bloque de consecuencia | Una línea |
| 7 | Reglas de color (ámbar y escudo) | Aplicadas con **tokens**, no con los hex del §06 |

---

## 2 · Lo que ya existe (y se reusa, no se reconstruye)

| Pieza | Dónde vive | Qué aporta |
|---|---|---|
| `usePopover` | `src/components/usePopover.ts` | Portal `fixed`, flip, reubicación en scroll/resize (`ResizeObserver`), cierre por Esc y click afuera — y el **registro de popovers anidados** (`abiertos`, línea 24) |
| `SearchableSelect` | `src/components/SearchableSelect.tsx` | Buscador, navegación por teclado, `aria-activedescendant`, modo múltiple |
| `mezclarHistorial` | `src/lib/roles.ts:330` | El «Último cambio» del popup sale de acá. **Ya testeado** |
| `describeAccess` | `src/lib/roles.ts:168` | La regla de `proximamente` y el bloque de consecuencia. **Ya testeado** |
| `StCard`, `StRow`, `StPill`, `btnSolid`, `dialogScrim` | `src/shell/settings/primitives.tsx` | Las tarjetas y botones de Ajustes |
| `formatDateAR` | `src/lib/dates.ts` | Fechas según la preferencia de la cuenta |
| Tokens `--spira-acc-deep-*` | `src/styles/tokens.css:93-122` | La familia de acentos que **se aclara** en tema oscuro |
| `--spira-z-popover: 300` | `src/styles/tokens.css:208` | Ya tapa a `--spira-z-modal: 220`. No hay que inventar z-index |

**Se construye de cero solamente:** `InfoTip` (no hay ningún tooltip propio en la app) y
`ResumenDeAcceso` (el popup del ojo).

---

## 3 · NO está en alcance

| Deferido | Por qué |
|---|---|
| Reskin de «Mi cuenta», «Preferencias» y «Plataformas» | No tienen mock; es el pendiente que el propio handoff escribe en su §07. Anotado en `TODOS.md` |
| Arreglar los hooks de auditoría que consultan con `null` | La tanda lo esquiva montando el popup a nivel de sección. Anotado en `TODOS.md` |
| Barrido del `#B0823F` fuera de los archivos que esta tanda abre | Cuatro archivos que el pedido no nombra. Anotado en `TODOS.md` |
| Migración para traer el conteo de estudios en `v_team_access` | El navegador ya tiene los datos; una migración por un número cosmético no se paga |
| Hacer clickeable la fila entera | El handoff define dos gestos explícitos (ojo y «Editar acceso»). No se agrega un tercero sin pedido |
| Registrar los intentos de acceso rechazados / exportar la matriz | Ya diferidos de antes en `TODOS.md`. Nada acá los desbloquea |

---

## 4 · Decisiones de la revisión

| # | Decisión | Por qué |
|---|---|---|
| **D1** | Sólo Equipo y accesos, completo | Lo demás no tiene mock |
| **D2** | Se implementa con las 5 capturas; el mock sigue buscándose | Ver «riesgo abierto» abajo |
| **A1** | `InfoTip` se construye **sobre `usePopover`** | Es lo único que tiene el registro de anidados: el ⓘ va DENTRO del menú de niveles |
| **A2** | `SearchableSelect` gana dos props aditivas y opt-in | Reusa buscador, teclado y ARIA en vez de duplicarlos |
| **A3** | El popup del ojo es un **popover anclado y portaleado**, con techo de altura | El handoff lo pide sin scrim; y el `backdrop-filter` del scrim del modal rompe cualquier `fixed` inline |
| **A4** | `useAllProtocolAssignments` sube a la sección y baja por prop | Cero SQL, y de paso saca una consulta repetida |
| **C1** | Ámbar → `--spira-acc-deep-warn`; escudo → `--spira-acc-deep-track` | Los hex del §06 fallan contraste: 3,44:1 y 2,14:1 |
| **C2** | La fila conserva el aviso de «Dada de baja»; el email se muda al popup | Sin él, una cuenta cerrada se lee igual que una recién creada |
| **C3** | El botón dice «Añadir estudio», como el handoff | No da de alta un estudio: le suma uno existente a una persona |
| **T1** | La regla de la línea devuelve una **unión discriminada**, no un string | Así el test afirma la prioridad y no la redacción |
| **P1** | Un solo popup a nivel de sección, montado bajo demanda | 2 consultas en vez de 46 |

---

## 5 · Diagramas

### 5.1 · Flujo de datos

```
  EquipoYAccesosSection
  ├── useAuth()                      → ¿es gerencia?  (decide la rama ANTES de contar filas)
  ├── useTeamAccess()                → v_team_access   (RLS: gerencia, o sólo tu propia fila)
  ├── useProtocols()                 ─┐  ya subían por prop
  └── useAllProtocolAssignments()    ─┘  ← A4: HOY vive adentro de AccesoEditor
       │
       │  estado local:  editando: string | null      (ya existe)
       │                 viendo:   string | null      ← P1: NUEVO, misma forma
       │
       ├─► FilaDePersona  (una por persona, presentacional)
       │      ├─ UserAvatar + nombre + escudito ⓘ         ← A1, C1
       │      ├─ resumenDeAccesoEnLinea(...)              ← T1 (función pura, testeada)
       │      └─ [ojo] setViendo(id)   ·   [Editar acceso] setEditando(id)
       │
       ├─► ResumenDeAcceso   (UNO solo, sólo si viendo != null)   ← A3, P1
       │      ├─ usePopover(ancla = el botón del ojo de esa fila)
       │      ├─ useAccessAudit(viendo) + useProtocolAccessAudit(viendo)
       │      └─ mezclarHistorial(...)[0]  →  «Último cambio»
       │
       └─► AccesoEditor      (sólo si editando != null)
              ├─ Módulos      → SearchableSelect + InfoTip          ← A1
              ├─ Estudios     → SearchableSelect variant='boton' modo='sumar' + chips ×  ← A2
              ├─ Administración (sin cambios)
              ├─ Qué va a ver al entrar (retítulo)
              ├─ La cuenta (sin cambios)
              └─ Historial (sin cambios)
```

### 5.2 · La regla de la línea (T1) — prioridad, que es lo que puede fallar callado

```
                    resumenDeAccesoEnLinea(persona, modulos, nEstudios)
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              ▼                         ▼                         ▼
     ¿is_active === false?      ¿0 módulos asignados?      tiene módulos
              │ sí                      │ sí                      │
              ▼                         ▼                         ▼
      {tipo:'baja'}          {tipo:'sin-modulos'}      {tipo:'acceso',
      chip rojo,             «sin acceso a              modulos:[{nombre,nivel}],
      la prosa NO se          ningún módulo»            estudios: n | null,
      dibuja                                            aviso?: 'sin-estudios'}
                                                                  │
                                    ┌─────────────────────────────┼─────────────────────┐
                                    ▼                             ▼                     ▼
                            SIN track                    track && n === 0          el resto
                            estudios = null              aviso='sin-estudios'      estudios = n
                            (no scopea por estudio)      (ámbar acc-deep-warn)      sin aviso
                                    ↑                             ↑
        LA TRAMPA: «baja» GANA sobre «sin-módulos», y una cuenta dada de baja
        queda sin módulos — o sea, las dos ramas son verdaderas a la vez.
        Si el orden queda al revés, la pantalla se ve PERFECTA diciendo lo que no es.

        LA SEGUNDA, encontrada al wirear la fila (2026-09-09): `estudios: null`
        NO ES CERO. Sin Coordinación no hay recorte por estudio —Farmacia es
        central—, así que «Farmacia · Administrador · 0 estudios» afirmaría que
        no ve pacientes, que es lo contrario de la verdad.

        Y `gerencia` NO entra nunca en la prosa: lo dice el escudito (§01 del handoff).
```

### 5.3 · El popup y el `backdrop-filter` (A3)

```
  <div style={scrim}>            ← backdropFilter: blur(3px)
      ↑                             ⚠ CREA BLOQUE CONTENEDOR para todo `position:fixed`
      │                               descendiente. Un popup dibujado ACÁ ADENTRO
      │                               se posiciona contra el scrim, no contra el viewport.
      └── <div style={card}>     ← overflow: hidden (por el borderRadius: 20)
              └── … la lista …      ⚠ y esto RECORTA en silencio lo que se desborde

  LA SALIDA:  createPortal(popup, document.body)  +  z-index: var(--spira-z-popover)
              → el ancestro pasa a ser <body>, sin filtro y sin overflow.
              → 300 > 220 del modal: queda encima sin inventar ningún z-index.
              → usePopover ya hace las dos cosas.
```

---

## 6 · Los cambios, uno por uno

### 6.1 · `src/lib/roles.ts` — la regla de la línea (NUEVO)

Al lado de `describeAccess`, no en un archivo nuevo: es la misma familia de reglas y comparte
el bloque de comentario que explica por qué el cliente duplica lo que la base aplica.

```ts
export type ResumenDeAccesoEnLinea =
  | { tipo: 'baja' }
  | { tipo: 'sin-modulos' }
  | { tipo: 'acceso'
      modulos: { nombre: string; nivel: ModuleRole }[]
      estudios: number
      aviso?: 'sin-estudios' }
```

Reglas, en orden: `is_active === false` gana sobre todo · `gerencia` nunca se nombra (lo dice el
escudito) · los `proximamente` **con nivel** siguen la misma regla que `describeAccess` · el aviso
`sin-estudios` sólo aplica si tiene Coordinación.

**Nota:** no es `accessLabel`, que devuelve el nivel más alto para el badge de «Mi cuenta».

### 6.2 · `src/components/InfoTip.tsx` — el ⓘ (NUEVO)

Sobre `usePopover`. Requisitos, además de los del handoff:

- **Abre por hover, por foco de teclado y por click.** El click no es un capricho: sin él, en
  una tablet el ⓘ no se puede leer nunca.
- **WCAG 2.1 AA · 1.4.13 (Content on Hover or Focus)** — los tres requisitos: *descartable*
  (Esc, ya lo da `usePopover`), *apuntable* (se puede llevar el mouse al panel sin que se cierre
  → demora de gracia al salir, ~120 ms) y *persistente* (no se cierra sola).
- `role="tooltip"` + `aria-describedby` en el disparador. El disparador es un `<button>` con
  `aria-label`, nunca un `<span>`.
- El caret se dibuja con un cuadrado rotado 45°, posicionado contra el disparador.

**Actualizar el comentario de `src/components/Termino.tsx:21`**, que hoy afirma que `title` es la
convención de la casa «y no necesita máquina nueva». Sigue siendo cierto para las pistas de una
línea; deja de serlo para las de título + cuerpo. Un comentario que contradice el código es peor
que ninguno.

### 6.3 · `src/components/SearchableSelect.tsx` — dos props aditivas

```ts
/** Apariencia del disparador. 'boton': sólido de acento con ícono y texto propio. */
variant?: 'field' | 'chip' | 'boton'

/** Sólo con `multiple`. 'sumar': el menú ofrece ÚNICAMENTE lo que falta, cada fila
 *  termina en `+`, elegir suma y limpia la búsqueda. Quitar NO se hace desde acá. */
modo?: 'alternar' | 'sumar'
```

Ambas opt-in: quien no las pasa queda con la firma de siempre. Es el mismo camino por el que el
componente ya incorporó `multiple` y `variant`. En `modo: 'sumar'`, `pick()` no togglea —sólo
suma— y el tilde se reemplaza por `+`. Con cero restantes el disparador va `disabled` y su texto
pasa a «Todos asignados», opacidad 0.5.

### 6.4 · `src/shell/settings/EquipoYAccesosSection.tsx` — la lista

- Fila: avatar · nombre + escudito ⓘ · línea de prosa (o el chip rojo si está dada de baja).
- A la derecha: botón de ojo (ícono, con borde) y «Editar acceso».
- El email **sale** de la fila y aparece en el popup.
- `useAllProtocolAssignments()` sube acá y baja por prop al editor y al popup (A4).
- Estado nuevo `viendo`, con la misma forma que `editando` (P1).

### 6.5 · `src/shell/settings/ResumenDeAcceso.tsx` — el popup del ojo (NUEVO)

Anclado al botón del ojo, portaleado, `--spira-z-popover`, con `max-height` contra el viewport y
scroll interno. Contenido, en el orden de la captura: identidad (avatar + nombre + email) ·
**A QUÉ ENTRA** (un renglón por módulo: nombre a la izquierda, nivel en negrita + ⓘ a la derecha;
estudios como chips sin ×; Administración como pill de acento) · **LA CUENTA** (Estado ·
Último cambio) · pie con «Cerrar» y «Editar acceso».

El «Último cambio» es `mezclarHistorial(...)[0]` — la misma función del historial de la ficha, no
una consulta nueva ni una redacción paralela.

### 6.6 · `src/shell/settings/AccesoEditor.tsx` — la ficha

- **Módulos:** un `InfoTip` a la derecha de cada selector. El diccionario es el que ya existe
  (`puedeEnModulo(modulo, nivel)` en `lib/permisos.ts`, que cita la policy que lo hace verdad),
  con la primera letra en mayúscula. El menú de niveles suma un ⓘ por opción.
- **Estudios:** encabezado «Estudios asignados» + sub, botón verde a la derecha, separador, y
  los chips debajo (`gap: 9px`, `padding: 6px 0 18px`). El chip lleva código en mono + nombre en
  gris + `×`. Sin estudios y con Coordinación: el aviso ámbar en lugar de los chips.
- **Consecuencia:** título → «Qué va a ver al entrar», subtítulo → «Con el acceso que estás
  dejándole». El contenido no cambia.
- **Ámbar:** los ocho `#B0823F` de este archivo pasan a `var(--spira-acc-deep-warn)` — sólo los
  que son color de texto; los fondos `#B0823F16` quedan.

### 6.7 · `src/shell/settings/primitives.tsx`

`SectionLabel` (versalitas, `letter-spacing`, muted) y `EstudioChip` (código mono + nombre +
`×` opcional), que usan el popup y la ficha. Nada más: si sólo lo usa un lugar, va inline.

---

## 7 · Modos de falla

| Camino nuevo | Cómo falla en producción | ¿Test? | ¿Manejo de error? | ¿Lo ve el usuario? |
|---|---|---|---|---|
| `resumenDeAccesoEnLinea` | La prioridad queda al revés: una cuenta dada de baja se lee «sin acceso a ningún módulo» | **Sí, obligatorio** | No aplica (función pura) | **NO — silencioso.** La línea se ve perfecta |
| `resumenDeAccesoEnLinea` | El conteo de estudios miente por lo bajo si la RLS filtrara asignaciones | Sí (caso de 0 estudios) | No | Silencioso, pero acotado: hoy gerencia ve todas |
| `InfoTip` dentro del menú de niveles | Se portalea sin registrarse y el click le cierra el menú al padre antes de elegir | No (es visible) | No | Sí, y grita: «no me deja elegir el nivel» |
| `InfoTip` en tablet | Sólo abre por hover → nunca se puede leer | No | No | Sí: el ⓘ no hace nada |
| `ResumenDeAcceso` | Se monta por fila → 46 consultas al abrir Ajustes | No | Los hooks ya devuelven error manejado | **NO — silencioso.** Sólo se nota como lentitud |
| `ResumenDeAcceso` | Persona con 12 estudios: el popup se desborda y el `overflow:hidden` le corta la cabecera | No | No | Sí, mal: se reporta como «no me deja cerrar» |
| `ResumenDeAcceso` | Las dos consultas de historial fallan (migración sin aplicar) | No | Sí, `teamReadErrorMessage` | Sí, con mensaje sereno |
| `modo: 'sumar'` | Suma el estudio equivocado tras achicarse la lista | **Sí** | No | Silencioso hasta que alguien mire los accesos |
| Guardado | Sin cambios respecto de hoy: `setProtocolAccess` con `expected` (compare-and-swap) | Ya cubierto | Sí, un renglón por falla | Sí |

**Huecos críticos** (sin test, sin manejo y silenciosos): los dos de la primera columna marcados
**NO — silencioso**. Los dos se cierran: el primero con los tests de §8, el segundo con la
decisión P1 (el popup se monta a nivel de sección, así no puede montarse por fila).

---

## 8 · Tests

`src/lib/roles.test.ts` — se suman al archivo que ya cubre `describeAccess` y `mezclarHistorial`.

| # | Qué afirma | Por qué es un test y no una mirada |
|---|---|---|
| 1 | `is_active: false` → `{tipo:'baja'}` **aunque además tenga 0 módulos** | Las dos ramas son verdaderas a la vez. Es LA trampa |
| 2 | `is_active: false` con módulos y estudios → sigue siendo `'baja'` | La baja gana siempre |
| 3 | Sin módulos, activa → `{tipo:'sin-modulos'}` | El otro lado del caso 1 |
| 4 | `{track:'operator'}` con 0 estudios → `aviso: 'sin-estudios'` | El ámbar |
| 5 | `{pharma:'admin'}` con 0 estudios → **sin** aviso | Farmacia es central: no scopea por protocolo |
| 6 | `{track:'admin', gerencia:'admin'}` → `modulos` **no** incluye gerencia | Lo dice el escudito, no la prosa |
| 7 | 1 estudio → singular; 3 → plural | Copy que se rompe callado |
| 8 | Módulo `proximamente` **con** nivel → se nombra | Misma regla que `describeAccess` |
| 9 | Módulo `proximamente` **sin** nivel → no se nombra | Ídem |
| 10 | El orden de `modulos` sigue el del registro, no el del objeto | `Object.entries` no garantiza orden semántico |
| 11 | `modo:'sumar'`: la lista ofrecida excluye lo ya elegido (regla extraída como función pura) | Si falla, se ve; pero el índice tras achicarse la lista **no** |

Lo presentacional (`InfoTip`, el popup, los chips) **no** lleva test: falla de manera visible y se
verifica mirando, que es el criterio del `CLAUDE.md`. El repo no tiene ningún `.test.tsx` y esta
tanda no lo estrena.

**Gate:** `npm run build` (typecheck + 890 tests actuales + los ~11 nuevos + build) en verde,
y QA logueado en el navegador.

---

## 9 · Paralelización

| Paso | Módulos que toca | Depende de |
|---|---|---|
| P-1 · regla de la línea + tests | `src/lib/` | — |
| P-2 · `InfoTip` | `src/components/` | — |
| P-3 · `modo:'sumar'` + `variant:'boton'` | `src/components/` | — |
| P-4 · lista + popup del ojo | `src/shell/settings/` | P-1, P-2 |
| P-5 · ficha de edición | `src/shell/settings/` | P-2, P-3 |

```
Lane A:  P-1 (src/lib/)                       ─ independiente
Lane B:  P-2 → P-3 (src/components/)          ─ secuencial, comparten carpeta
Lane C:  P-4 → P-5 (src/shell/settings/)      ─ secuencial, comparten carpeta y esperan a A y B
```

**Orden:** A y B en paralelo; cuando las dos cierran, C. **Conflicto a vigilar:** P-4 y P-5 tocan
`primitives.tsx` los dos — por eso van en la misma lane, en orden.

En la práctica esto son dos o tres horas de trabajo asistido: la paralelización sirve más como
orden de ataque que como reparto entre worktrees.

---

## Implementation Tasks

Sintetizado de los hallazgos de la revisión. Cada tarea sale de un hallazgo concreto.

- [x] **T1 (P1, humano: ~3h / CC: ~20min)** — `src/lib/roles.ts` — Escribir `resumenDeAccesoEnLinea` como unión discriminada, con sus 10 tests
  - Surgió en: Tests — la prioridad «baja gana sobre sin-módulos» es un hueco crítico silencioso
  - Archivos: `src/lib/roles.ts`, `src/lib/roles.test.ts`
  - Verifica: `npx vitest run src/lib/roles.test.ts`
- [x] **T2 (P1, humano: ~1d / CC: ~40min)** — `src/components/InfoTip.tsx` — Construir el ⓘ sobre `usePopover`, con hover + foco + click y las tres condiciones de WCAG 1.4.13
  - Surgió en: Arquitectura A1 — no hay ningún tooltip en la app y el ⓘ va dentro de un menú portaleado
  - Archivos: `src/components/InfoTip.tsx` (nuevo), `src/components/Termino.tsx` (actualizar el comentario de la convención)
  - Verifica: en el navegador, abrir el menú de niveles y tocar un ⓘ: el menú **no** se cierra
- [x] **T3 (P1, humano: ~1d / CC: ~30min)** — `src/components/SearchableSelect.tsx` — Sumar `variant:'boton'` y `modo:'sumar'`, opt-in
  - Surgió en: Arquitectura A2 — el handoff pide un menú que suma, no que alterna
  - Archivos: `src/components/SearchableSelect.tsx`
  - Verifica: `npm run build` (43 usos existentes tienen que seguir compilando y andando)
- [x] **T4 (P1, humano: ~1d / CC: ~40min)** — `src/shell/settings/` — La fila del equipo: prosa, escudito, ojo y «Editar acceso»
  - Surgió en: el §01 del handoff + Calidad C2 (conservar el aviso de «Dada de baja»)
  - Archivos: `EquipoYAccesosSection.tsx`, `primitives.tsx`
  - Verifica: en el navegador, con una cuenta dada de baja a la vista
- [x] **T5 (P1, humano: ~1d / CC: ~40min)** — `src/shell/settings/ResumenDeAcceso.tsx` — El popup del ojo, portaleado y con techo de altura
  - Surgió en: Arquitectura A3 + Performance P1 — el `backdrop-filter` del scrim y las 46 consultas
  - Archivos: `ResumenDeAcceso.tsx` (nuevo), `EquipoYAccesosSection.tsx`
  - Verifica: en el navegador con una persona de muchos estudios; y contar las consultas en la pestaña de red al abrir Ajustes
- [x] **T6 (P1, humano: ~1d / CC: ~40min)** — `src/shell/settings/AccesoEditor.tsx` — La tarjeta de Estudios con botón verde y chips ×, el ⓘ en Módulos y el retítulo
  - Surgió en: los §03, §04 y §05 del handoff
  - Archivos: `AccesoEditor.tsx`
  - Verifica: sumar y quitar estudios sin cerrar el menú; «Todos asignados» al completarlos
- [x] **T7 (P2, humano: ~2h / CC: ~10min)** — `src/shell/settings/` — Subir `useAllProtocolAssignments` a la sección y bajarla por prop
  - Surgió en: Arquitectura A4 — hoy se reconsulta en cada entrada a una ficha
  - Archivos: `EquipoYAccesosSection.tsx`, `AccesoEditor.tsx`
  - Verifica: entrar y salir de tres fichas y ver una sola consulta de asignaciones
- [x] **T8 (P2, humano: ~1h / CC: ~10min)** — `src/shell/settings/` — Ámbar y escudo por token (`--spira-acc-deep-warn` / `--spira-acc-deep-track`)
  - Surgió en: Calidad C1 — 3,44:1 y 2,14:1 medidos, ambos por debajo de AA
  - Archivos: `AccesoEditor.tsx`, `EquipoYAccesosSection.tsx`
  - Verifica: mirar la pantalla en tema oscuro, que es donde hoy desaparece el escudito

---

## Cómo se verifica antes de decir que anda

1. `npm run build` en verde (typecheck + tests + build).
2. QA logueado en el navegador, **en los dos temas**: el escudito tiene que verse en oscuro.
3. Una cuenta dada de baja a la vista en la lista: tiene que distinguirse de una sin accesos.
4. El ⓘ dentro del menú de niveles: tocarlo **no** cierra el menú.
5. Contar consultas al abrir Ajustes: dos de equipo/protocolos/asignaciones, ninguna de auditoría.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | NOT RUN | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | UNAVAILABLE | `codex` no está instalado en esta máquina |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 11 issues, 2 critical gaps (los dos cerrados por T1 y por la decisión P1) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | NOT RUN | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | NOT RUN | — |

- **VERDICT:** ENG CLEARED — listo para implementar. La voz externa (Codex) no pudo correr:
  el binario no está en esta máquina, así que este plan tiene una sola lectura, no dos.

**UNRESOLVED DECISIONS:**
- El mock `Ajustes - Variantes.html` que cita el handoff **no apareció**. Se implementa contra las cinco capturas; si aparece antes de escribir código, la geometría se clava contra él y este plan se revisa.
