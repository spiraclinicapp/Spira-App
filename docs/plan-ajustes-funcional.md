# Plan — Ajustes funcional (Mi cuenta · Preferencias · Equipo y accesos)

> Producto de `/plan-ceo-review` del **2026-08-25**. Modo: **SELECTIVE EXPANSION**.
> Enfoque elegido: **consola de gerencia** (opción B de tres alternativas).
> No hay handoff de diseño para esta pantalla: la maqueta original se limpió del repo
> (commit `c0be404`) y su modelo de datos era ficción. Este documento la reemplaza.

---

## Qué se decidió, y por qué

El pedido del Director fue "hagamos funcional el modal de ajustes: Mi cuenta,
Preferencias y Roles y permisos; saquemos Notificaciones y Ayuda". La auditoría mostró
que el punto de partida no era el que parecía: **Mi cuenta ya está viva** (RPCs de la
migración 0045), **Preferencias tiene un control de seis funcionando** (el tema), y
**Roles y permisos es cien por ciento maqueta con datos inventados**.

Lo importante: la RLS ya soporta lo real. `public.users` es
`id = auth.uid() or has_module('gerencia')` y `user_module_roles` suma
`for all using (has_module('gerencia'))`. La consola de administración es implementable
hoy, sin infraestructura nueva.

### Decisiones tomadas en la revisión

| # | Decisión | Elegido |
|---|---|---|
| D1 | Alcance | **B · Consola de gerencia**: se muestra Y se edita el acceso, con guardas y auditoría |
| D2 | Postura de revisión | SELECTIVE EXPANSION |
| D4 | De dónde sale el correo | **Desnormalizar `email` a `public.users`** — la policy que ya existe protege el dato sola |
| D5 | Dos gerencias editando a la vez | **Comparar y guardar** (bloqueo optimista): el RPC recibe el nivel esperado |
| D6 | Cómo se presenta `gerencia` | **Bloque aparte + diálogo de confirmación** — no es un módulo, es el bit de administración |
| D7 | Guardado de la consola | **Botón Guardar + guard de cierre** en los cuatro caminos de salida |
| D8 | Dónde viven las preferencias | **En la cuenta**, tabla `user_preferences` con columnas tipadas |
| D9 | Sincronía del correo | **Sin tocar `auth.users`** — copia inicial + el RPC de 0045 que ya existe |
| D10 | Rótulo de la sección | **"Equipo y accesos"** (era "Roles y permisos") |

### Expansiones evaluadas (ceremonia de cherry-pick)

| # | Propuesta | Esfuerzo | Decisión |
|---|---|---|---|
| E1 | Ajustes viaja en la URL (`?ajustes=…`) | S | **ACEPTADA** |
| E2 | Huella de auditoría visible en la ficha de cada persona | M | **ACEPTADA** |
| E3 | Exportar la matriz de accesos (CSV / imprimible) | S | **DIFERIDA** → TODOS.md |
| E4 | Foto de perfil propia | M | **DESCARTADA** — único frente de infra, beneficio cosmético |
| E5 | "Con este acceso, X ve…" (simulación de consecuencias) | S | **ACEPTADA** |

---

## Qué ya existe (y este plan reusa)

| Pieza | Estado | Uso en este plan |
|---|---|---|
| `SettingsModal.tsx` | Completo: focus-trap, Esc, scroll-lock, nav | Se reusa entero; solo cambia la lista de secciones |
| `primitives.tsx` | `StCard` `StRow` `StSeg` `StToggle` `StPill` `btnGhost` `btnSolid` | Base de toda la UI nueva. No se agrega ninguna primitiva |
| `AccountSection.tsx` | Cableada contra 0045 (nombre, correo, puesto, contraseña, sesiones) | Se corrigen tres huecos; no se reescribe |
| RPC `update_my_name` / `update_my_puesto` / `stamp_email_change` | Aplicados (0045) | Se reusan; `stamp_email_change` además sincroniza el correo (D9) |
| RLS de `users` y `user_module_roles` | Aplicada (0006) | Es la que autoriza toda la consola. No se toca |
| `trg_audit_module_roles` | **Ya existe** desde 0003 | Escribe la auditoría de accesos sola. E2 solo la lee |
| Policy `gerencia ve auditoria` + índices de `audit_log` | Aplicados (0006 / 0005) | Autorizan y sostienen la consulta de E2 |
| `useSupabaseQuery` con `traducirError` | Existe | Obligatorio en las lecturas nuevas (ver GAP 2.1) |
| `AboutMenu.tsx` | Muestra versión y changelog | Por eso sacar Ayuda no pierde nada real |
| `NotificationsMenu.tsx` (campana) | Fuentes reales | Sacar la sección Notificaciones **no** toca la campana |

**Nada de esto se rebuilding.** El trabajo neto es capa de datos + cuatro migraciones aditivas.

---

## Qué NO entra (y por qué)

| Fuera de alcance | Motivo |
|---|---|
| Notificaciones (sección de Ajustes) | Pedido del Director. La campana sigue intacta |
| Ayuda (sección de Ajustes) | Pedido del Director. Versión y changelog ya están en `AboutMenu` |
| Alta de usuarios / invitación por mail | Requiere Edge Function + SMTP. Se sigue creando desde el dashboard |
| Foto de perfil (E4) | Único frente de infraestructura de la lista, beneficio cosmético |
| Exportar matriz de accesos (E3) | Diferido: construir un entregable regulatorio sin conocer el requisito real termina en rehacerlo |
| Idioma / English | No es una preferencia, es i18n de toda la app. Prometerlo y no cumplirlo viola la regla de honestidad |
| Densidad de listas | Los espaciados están en estilos inline por toda la app. Es un proyecto de sistema de diseño |
| Zona horaria | Cambiar la zona cambia qué día es "hoy" en la Agenda. Delicado en un sistema clínico auditable |
| Columna "último visto" | Único dato que obliga a leer `auth.users` en vivo y no aporta a decidir un permiso |
| Registro de intentos rechazados | Un `raise exception` revierte la transacción. Requiere tabla aparte → TODOS.md |
| Desactivar cuentas (`is_active`) | Se puede sumar, pero no es lo que "accesos" promete. Se evalúa después del PR-2 |

---

## Arquitectura

```
                  ┌──────────────── AppShell ─────────────────┐
                  │  useUrlLocation ──▶ ?ajustes=<sección>     │ ← E1
                  │  guard de cierre EN LA CAPA DE RUTEO       │ ← ver riesgo R1
                  └──────────────┬────────────────────────────┘
                                 ▼
                      ┌──── SettingsModal ────┐
                      │  nav: 3 secciones     │  (eran 5)
                      └───┬───────┬───────┬───┘
                          │       │       │
        ┌─────────────────┘       │       └──────────────────┐
        ▼                         ▼                          ▼
 AccountSection            PrefsSection            EquipoYAccesosSection
 (existe · 3 arreglos)     (poda + persistencia)   (reemplaza RolesSection)
        │                         │                          │
        ▼                         ▼                          ▼
   lib/auth.tsx             lib/prefs.ts (nuevo)      data/team.ts (nuevo)
   RPC 0045 ✓               user_preferences          ├─ useTeamAccess()
                            (0093) + caché local      ├─ useAccessAudit()   ← E2
                                                      └─ setModuleAccess()
                                                               │
                                       ┌───────────────────────▼──────────────┐
                                       │ user_module_roles                     │
                                       │   └ trg_audit_module_roles (0003) ✓   │
                                       │        └──▶ audit_log ✓ RLS ✓ índice ✓│
                                       └───────────────────────────────────────┘

  lib/roles.ts (nuevo) ── ROLE_RANK · ROLE_LABEL · canRevoke() · describeAccess()
        ▲          ▲               ▲
        │          │               └── consumido por EquipoYAccesos (E5)
        │          └── reemplaza la copia de AccountSection.tsx:29
        └── reemplaza la copia de lib/auth.tsx
```

### Flujo de datos de un cambio de acceso (con caminos de sombra)

```
  [gerencia toca un nivel]  ──▶  estado pendiente en el editor  ──▶  [Guardar]
        │                                                               │
        ▼                                                               ▼
  ¿roles.gerencia?                                    set_module_access(user, mod,
        ├─ no ──▶ el control ni se renderiza                nivel, nivel_esperado)
        │         (vista "Tu acceso")                             │
        │                                                          │
        └─ sí                          ┌───────────────────────────┤
                                       │                           │
   auth.uid() null ────────▶ 28000  "Tu sesión venció."            │
   sin gerencia ───────────▶ 42501  "No tenés permiso."            │
   sos vos + gerencia ─────▶ P0001  "No podés quitarte la admin."  │
   último gerencia ────────▶ P0001  "Tiene que quedar alguien."    │
   nivel_esperado ≠ actual ▶ P0001  "Alguien más lo cambió."  ← D5 │
   usuario borrado ────────▶ 23503  "Esa cuenta ya no existe."     │
                                                                   │
                                       ok ──▶ upsert / delete ──────┘
                                                │
                                                ▼
                                    trg_audit_module_roles ──▶ audit_log
                                                │
                                                ▼
                                     refetch equipo + historial
```

### Caminos de sombra de las lecturas

```
  useTeamAccess()
    ├─ nil    · data === null durante la carga ──▶ skeleton (NUNCA "sin equipo")
    ├─ vacío  · 0 filas ──▶ DOS causas distintas con el MISMO síntoma:
    │            (a) el usuario no tiene gerencia  → se detecta ANTES, en roles.gerencia
    │                del useAuth() del cliente, y se renderiza la vista "Tu acceso"
    │            (b) la migración no se aplicó     → es un error real, se avisa
    └─ error  · PGRST202 ──▶ traducirError OBLIGATORIO. Sin él llega en inglés
                 nombrando objetos del schema (es el caso que documenta el hook)
```

---

## Registro de errores y rescates

| Codepath | Falla | Código | ¿Rescatado? | Acción | Usuario ve |
|---|---|---|---|---|---|
| `useTeamAccess()` | sin gerencia | 0 filas | **Sí (nuevo)** | rama previa por `roles.gerencia` | vista "Tu acceso" |
| | migración sin aplicar | PGRST202 | **Sí (nuevo)** | `traducirError` | "Falta aplicar una actualización del sistema." |
| `useAccessAudit()` | sin permiso / vacío | 0 filas | Sí | estado vacío | "Sin cambios registrados" |
| `setModuleAccess()` | sesión vencida | 28000 | Sí | mensaje + no cierra | "Tu sesión venció." |
| | sin gerencia | 42501 | Sí | mensaje | "No tenés permiso para cambiar accesos." |
| | auto-despojo de gerencia | P0001 | Sí | guard server + control deshabilitado | mensaje del guard |
| | último gerencia | P0001 | Sí | guard server + `canRevoke()` en cliente | mensaje del guard |
| | conflicto de concurrencia | P0001 | Sí | mensaje + refetch | "Alguien más cambió este acceso. Refrescá." |
| | usuario inexistente | 23503 | Sí | mensaje + refetch | "Esa cuenta ya no existe." |
| `savePreference()` | escritura falla | red / PGRST | Sí | **el control vuelve atrás** | "No pudimos guardar la preferencia." |
| `save()` de Mi cuenta | falla parcial de 3 RPC | varios | **Sí (arreglado)** | resultado POR CAMPO | qué se guardó y qué no, por campo |
| `stamp_email_change` | guard de 30 días | P0001 | **Sí (arreglado)** | se deja de descartar el error | mensaje del guard |

### Registro de modos de falla

| Codepath | Modo de falla | ¿Rescatado? | ¿Test? | Usuario ve | ¿Auditado? |
|---|---|---|---|---|---|
| `set_module_access` | escalada de privilegios | Sí (guard SQL) | Parcial¹ | mensaje | Sí (trigger) |
| `set_module_access` | pérdida por concurrencia | Sí (D5) | Sí (regla pura) | mensaje | Sí |
| `set_module_access` | centro sin administrador | Sí (guard SQL) | Parcial¹ | mensaje | Sí |
| `useTeamAccess` | filtrado silencioso de RLS | Sí | Sí (regla pura) | vista "Tu acceso" | n/a |
| Cierre del modal | descarte de cambios | Sí (D7) | Manual | diálogo | n/a |
| Cierre por botón atrás | descarte de cambios | **Ver R1** | Manual | diálogo | n/a |
| `describeAccess()` | consecuencia falsa | n/a | **Sí — el test más importante** | texto | n/a |
| `auditLine()` | actor y objetivo invertidos | n/a | **Sí** | texto | n/a |

¹ **Hueco conocido y aceptado:** los guards que de verdad protegen esto están en plpgsql
y `vitest` no corre SQL. La regla se replica en TypeScript (eso sí se testea), el SQL va a
revisión adversarial, y la verificación queda como pasos manuales documentados abajo.

---

## Riesgos

**R1 · El botón atrás es un cuarto camino de cierre, y el guard no puede vivir en el modal.**
*(Resuelto al implementar: `useNavigationGuard` ya existía en `lib/useUrlState.ts` — su listener vive a nivel de módulo y repone la URL antes de avisar a los suscriptores, así que el componente no se desmonta y llega a preguntar. No hubo que construir nada.)*
D7 (guard de cierre) más E1 (Ajustes en la URL) suman el back del navegador a los tres
caminos de salida ya existentes (Esc, X, scrim). El listener de `popstate` del router vive
**a nivel de módulo**: corre primero, desmonta el componente y se lleva su listener antes de
que llegue a ejecutar. Un guard escrito adentro de `SettingsModal` **nunca** va a correr en
el back — no es una carrera que a veces se gana. El bloqueo va en la capa de ruteo, junto al
listener. Ya pasó en este repo y está documentado.

**R2 · Foco anidado.** El diálogo de confirmación de D6 abre dentro de un modal que ya tiene
focus-trap. Un trap anidado mal hecho deja el foco atrapado en la capa equivocada o suelto en
el body. Verificación de teclado explícita, no opcional.

**R3 · Bloqueo de QA — hace falta una cuenta sin `gerencia`.** El camino más importante de la
feature (que un usuario común vea "Tu acceso" y no la lista del centro) **no se puede verificar
con la cuenta de QA**, que tiene los cinco módulos. Si no existe una segunda cuenta sin
gerencia, ese camino se despliega sin verificar. **Pendiente del Director.**

**R4 · Correo desincronizado.** Consecuencia aceptada de D9: si se cambia un correo desde el
dashboard de Supabase, la pantalla muestra el viejo. Mitigación: la migración deja una
sentencia de resincronización lista para volver a correr, documentada en `supabase/README.md`.

---

## Despliegue

Las cuatro migraciones son **aditivas puras** (tabla nueva, funciones nuevas, columna nueva, vistas nuevas). PR-1 lleva la **0093** (preferencias) y la **0094** (consultar la ventana de cambio de correo); PR-2 lleva la **0095** (email en users) y la **0096** (la consola).
Ningún front desplegado consulta nada de eso, así que por la regla de aditivas:

```
   1. Aplicar las migraciones del PR en el dashboard, en orden
   2. Verificar: el front VIEJO en producción sigue funcionando igual
   3. Recién entonces, mergear y desplegar el front
```

**No aplica** el gotcha de PostgREST (FK nueva sobre tabla ya embebida): la única FK nueva es
`user_preferences → users`, un par de tablas que no existía antes, así que no hay embed
ambiguo posible. Verificado contra los `select(...)` del front.

**Rollback:** `git revert` del front. Las migraciones quedan huérfanas sin daño (nadie las
consulta). Reversibilidad **4/5** — lo único con inercia es la columna `email`.

**Verificación post-deploy (primeros 5 minutos):**

1. Entrar con una cuenta **con** gerencia → Ajustes → Equipo y accesos → ¿se ve el equipo real?
2. Entrar con una cuenta **sin** gerencia → ¿ve "Tu acceso" y solo su fila? *(bloqueado por R3)*
3. Cambiar un nivel a una cuenta `TEST-*` → ¿aparece en el historial de esa persona?
4. Intentar quitarse gerencia a uno mismo → ¿el control está deshabilitado y el RPC rechaza?
5. Abrir dos pestañas, cambiar el mismo acceso en las dos → ¿la segunda avisa del conflicto?
6. `?ajustes=roles` en la barra → ¿abre en la sección correcta? ¿el back cierra el modal?
7. Cambiar el tema, entrar desde otra máquina → ¿el tema viaja con la cuenta?

---

## Tareas de implementación

Sintetizadas de los hallazgos de arriba. Cada una deriva de un hallazgo concreto.

### PR-1 · La poda y lo propio (sin SQL de permisos)

- [ ] **T1 (P1, humano ~30min / CC ~5min)** — shell — Sacar Notificaciones y Ayuda
  - Surge de: el pedido del Director
  - Archivos: `SettingsModal.tsx`, `UserMenu.tsx`; borrar `NotifSection.tsx`, `HelpSection.tsx`, `settingsData.ts`
  - Verificar: el menú de usuario tiene 3 ítems + Cerrar sesión; la campana y `AboutMenu` intactos

- [ ] **T2 (P1, humano ~1h / CC ~10min)** — auth — Dejar de descartar el error de `stamp_email_change`
  - Surge de: GAP 2.3 — la regla de 30 días del correo hoy no frena nada
  - Archivos: `src/lib/auth.tsx` (`requestEmailChange`) + `supabase/migrations/0094_guard_cambio_correo.sql`
  - Se separa PREGUNTAR de SELLAR: `email_change_locked_until()` consulta sin consumir la ventana, y `stamp_email_change` (0045) sigue siendo la guarda dura
  - Verificar: cambiar el correo dos veces seguidas debe fallar la segunda con el mensaje del guard

- [ ] **T3 (P1, humano ~2h / CC ~15min)** — Mi cuenta — Resultado por campo en `save()`
  - Surge de: GAP 2.4 — hoy concatena los errores de tres RPC y deja estado a medias
  - Archivos: `AccountSection.tsx` (`save`, ~línea 97)
  - Verificar: si el puesto guarda y el nombre falla, el usuario ve exactamente eso

- [ ] **T4 (P1, humano ~1h / CC ~10min)** — Mi cuenta — Aviso persistente de correo pendiente
  - Surge de: el `notice` se pierde al cerrar el modal; el correo queda cambiado sin confirmar
  - Archivos: `AccountSection.tsx`
  - Verificar: pedir el cambio, cerrar y reabrir Ajustes → el aviso sigue ahí

- [ ] **T5 (P1, humano ~30min / CC ~5min)** — data — `lib/roles.ts`
  - Surge de: Sección 5 — `ROLE_RANK`/`ROLE_LABEL` ya están duplicados en dos archivos
  - Archivos: nuevo `src/lib/roles.ts`; `AccountSection.tsx:29`, `lib/auth.tsx`
  - Verificar: `npm run typecheck` y cero copias restantes

- [ ] **T6 (P1, humano ~1h / CC ~10min)** — base — Migración 0093 `user_preferences`
  - Surge de: D8 — las preferencias son de la persona, no de la máquina
  - Archivos: `supabase/migrations/0093_user_preferences.sql`
  - Verificar: aditiva; el front viejo no la consulta

- [ ] **T7 (P1, humano ~3h / CC ~25min)** — Preferencias — Podar y persistir
  - Surge de: Sección 0D — cinco de seis controles no guardaban nada
  - Archivos: `PrefsSection.tsx`, nuevo `src/lib/prefs.ts`, `src/lib/theme.ts`
  - Deja: Tema, Formato de fecha, Página de inicio. Se van: Idioma, Densidad, Zona horaria
  - Verificar: cambiar el tema, entrar desde otra máquina, el tema viaja

- [ ] **T8 (P2, humano ~3h / CC ~15min)** — shell — E1: Ajustes en la URL
  - Surge de: E1 aceptada + R1
  - Archivos: `src/lib/router.ts`, `src/lib/useUrlState.ts`, `AppShell.tsx`
  - **El guard de cierre va en la capa de ruteo, no en el modal** (R1)
  - Sección desconocida (`?ajustes=notif` viejo) cae a `cuenta`
  - Verificar: F5 mantiene la sección; el back cierra el modal y pregunta si hay cambios

### PR-2 · La consola

- [ ] **T9 (P1, humano ~2h / CC ~20min)** — base — Migración 0095: `email` en `users`
  - Surge de: D4 + D9
  - Archivos: `supabase/migrations/0095_email_en_users.sql`
  - Copia inicial desde `auth.users` + sentencia de resincronización documentada. **No toca `auth.users`**
  - Verificar: la policy existente ya lo protege; probar con una cuenta sin gerencia

- [ ] **T10 (P1, humano ~4h / CC ~40min)** — base — Migración 0096: RPC y vistas de acceso
  - Surge de: D1, D5, secciones 1-3
  - Archivos: `supabase/migrations/0096_consola_de_accesos.sql`
  - `set_module_access(p_user, p_module, p_role, p_expected_role)` con, en este orden:
    `auth.uid()` no nulo → `has_module('gerencia')` → no auto-despojo de gerencia →
    no último gerencia → compare-and-swap. Vista de equipo + vista de historial de accesos
    (filtrada por `entity_type` para usar el índice, con `limit`)
  - **Antes de aplicar:** contar los marcadores de dollar-quote en el texto crudo (tiene que ser par)
  - Verificar: revisión adversarial del SQL + los 7 pasos post-deploy

- [ ] **T11 (P1, humano ~2h / CC ~20min)** — data — `src/data/team.ts`
  - Surge de: Sección 1; patrón de `data/patients.ts`
  - Archivos: nuevo `src/data/team.ts`
  - `useTeamAccess()`, `useAccessAudit()`, `setModuleAccess()` + `teamErrorMessage()`
  - **`traducirError` obligatorio en las dos lecturas** (GAP 2.1)
  - Verificar: sin la migración aplicada, el mensaje llega en castellano

- [ ] **T12 (P1, humano ~6h / CC ~50min)** — Equipo y accesos — La sección
  - Surge de: D1, D6, D7, D10
  - Archivos: nuevo `EquipoYAccesosSection.tsx`; borrar `RolesSection.tsx`; `SettingsModal.tsx`, `UserMenu.tsx`
  - Lista real, editor por persona, `gerencia` en bloque aparte con confirmación (D6),
    botón Guardar con guard de cierre en los cuatro caminos (D7), rótulo "Equipo y accesos" (D10)
  - Sin gerencia → vista "Tu acceso" con la fila propia
  - Verificar: R2 (foco anidado) con teclado, no con el mouse

- [ ] **T13 (P1, humano ~2h / CC ~20min)** — Equipo y accesos — E5: simulación de consecuencias
  - Surge de: E5 aceptada
  - Archivos: `lib/roles.ts` (`describeAccess`), `EquipoYAccesosSection.tsx`
  - **Es simulación de solo lectura, NUNCA suplantación.** Va dicho en el código y en el copy
  - Verificar: el test de `describeAccess()` es el más importante de la feature

- [ ] **T14 (P2, humano ~4h / CC ~30min)** — Equipo y accesos — E2: historial visible
  - Surge de: E2 aceptada
  - Archivos: `data/team.ts` (`useAccessAudit`), `lib/roles.ts` (`auditLine`), sección
  - Verificar: `auditLine()` no invierte actor y objetivo (test)

- [ ] **T15 (P1, humano ~3h / CC ~20min)** — tests — Las cinco reglas puras
  - Surge de: Sección 6
  - Archivos: `src/lib/roles.test.ts`, `src/shell/settings/account.test.ts`
  - `lockedUntil()`, `accessLabel()`, `canRevoke()`, `describeAccess()`, `auditLine()`
  - Verificar: `npm run build` verde

---

## Delta contra el estado ideal a 12 meses

```
  HOY                        ESTE PLAN                    IDEAL 12 MESES
  Ajustes = maqueta      →   Ajustes = tu cuenta real  →  Ajustes = consola del centro
  con 2 controles vivos      + el acceso del equipo,      (alta e invitación, baja,
  y 5 personas inventadas    editable y auditado          exportables de auditoría,
                                                          y el módulo Gerencia entero)
```

Este plan **acerca**: `lib/roles.ts` y `describeAccess()` quedan de base para cualquier
"¿por qué no veo esto?" futuro, y la consola es el primer pedazo real del módulo Gerencia
del roadmap. Lo que falta después: invitación por mail (Edge Function + SMTP), baja de
cuentas, y los exportables.

---

## Auditoría de diagramas obsoletos

Los comentarios de cabecera que este plan invalida y hay que reescribir:

| Archivo | Qué dice hoy | Estado |
|---|---|---|
| `settingsData.ts` | "Datos DE EJEMPLO … cuando se conecten, este archivo se borra" | Se cumple: **se borra** |
| `RolesSection.tsx` | "Vista previa … el botón Invitar es inerte" | El archivo se reemplaza |
| `UserMenu.tsx` | "el resto de los ítems … abren un aviso Próximamente" | **Desactualizado ya hoy** (abren Ajustes). Reescribir |
| `SettingsModal.tsx` | Enumera cinco secciones | Reescribir a tres |
| `PrefsSection.tsx` | "El ÚNICO control vivo es el Tema" | Reescribir |
| `theme.ts` | "persiste la PREFERENCIA" en localStorage | Reescribir: ahora la verdad es la cuenta |

---

## GSTACK REVIEW REPORT

| Runs | Status | Findings |
|---|---|---|
| Auditoría de sistema | completa | 3 hallazgos que cambiaron el diseño |
| Paso 0 (premisa, leverage, alternativas, modo) | completo | 3 alternativas, B elegida; SELECTIVE EXPANSION |
| Ceremonia de cherry-pick | completa | 5 propuestas: 3 aceptadas, 1 diferida, 1 descartada |
| Sección 1 · Arquitectura | completa | 3 hallazgos (1 resuelto en D4) |
| Sección 2 · Errores y rescates | completa | 12 caminos mapeados, **4 GAPS**, los 4 cerrados |
| Sección 3 · Seguridad | completa | 2 hallazgos, 1 Alto (resuelto en D4/D6) |
| Sección 4 · Datos y casos borde | completa | 8 casos mapeados, 3 huecos, los 3 cerrados |
| Sección 5 · Calidad | completa | 2 hallazgos (DRY triple + complejidad de `save()`) |
| Sección 6 · Tests | completa | 5 reglas puras identificadas, **1 hueco aceptado** (guards SQL no testeables) |
| Sección 7 · Performance | completa | 1 hallazgo (índice de `audit_log`), cerrado |
| Sección 8 · Observabilidad | completa | 1 hueco → TODOS.md |
| Sección 9 · Despliegue | completa | Aditivas → migración primero. **1 bloqueo de QA (R3)** |
| Sección 10 · Trayectoria | completa | Reversibilidad 4/5, 2 deudas deliberadas |
| Sección 11 · Diseño y UX | completa | 2 riesgos de implementación (R1, R2) |
| Voz externa | **omitida** | Codex no instalado; el fallback es un subagente y el entorno lo restringe |

**VERDICT:** el plan es implementable y el alcance está cerrado. El riesgo se concentra en
un solo archivo (la migración 0096) y en un solo comportamiento (R1, el guard de cierre en
el botón atrás). Los dos tienen mitigación escrita. Se implementa en dos PRs apilados,
partiendo de una **rama nueva desde `main`** — la rama actual ya está mergeada.

**UNRESOLVED DECISIONS:**
- ¿Existe una cuenta sin el módulo `gerencia` para verificar el camino de R3? Si no existe, el
  camino más importante de la feature se despliega sin verificar. Pendiente del Director.
