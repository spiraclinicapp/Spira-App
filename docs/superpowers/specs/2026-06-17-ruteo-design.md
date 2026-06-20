# Spec · Ruteo profundo de Spira (URLs + react-router v7)

**Fecha:** 2026-06-17
**Autor:** Lautaro Molina (con Claude)
**Módulo:** Transversal (shell / navegación)
**Estado:** Diseño aprobado. Pendiente: review del usuario → plan.

---

## 1. Objetivo

Meter la navegación de Spira **en la URL**. Hoy todo el estado de navegación vive en React (`useState`):
el [`AppShell`](../../../src/shell/AppShell.tsx) guarda `moduleKey`/`subKey`, y cada vista guarda su
navegación profunda (protocolo → detalle → ficha) en estado local — p. ej.
[`ProtocolsView`](../../../src/views/ProtocolsView.tsx) con su `useState<Nav>` (`list`/`all`/`protocol`/`patient`).

**Consecuencias del modelo actual:**
- Al refrescar (F5) o reabrir, siempre caés en **Inicio / Resumen** y perdés dónde estabas.
- No anda el **back/forward** del navegador.
- No se pueden **compartir ni bookmarkear** links a un protocolo o paciente.

**Con ruteo:** la URL es la fuente de verdad de "dónde estás". Refrescar mantiene el lugar, anda
back/forward, y un link lleva a cualquier punto de la app (incluida una ficha puntual) — lo que habilita
**deep links** para notificaciones de mejora, anuncios de gerencia y, a futuro, WhatsApp/IA (ver
[roadmap de producto](#11-fuera-de-alcance--futuro)).

---

## 2. Decisiones (con motivo)

| Decisión | Elección | Motivo |
|---|---|---|
| **Librería** | **react-router-dom v7** | El roadmap es un ecosistema de 6 módulos con submódulos, vistas profundas, permisos por rol y navegación cruzada, con varios devs a futuro. Rutas anidadas, guards y una API estándar lo piden. Track es la referencia técnica del repo → se hace idiomático para que el resto lo copie. |
| **Forma de URL** | **Paths limpios** (`BrowserRouter`) | Deploy en Vercel (rewrite trivial). Los links externos (WhatsApp/anuncios) se ven legítimos; el `#` a veces lo mastican los previews. |
| **Identificadores** | **UUID** de protocolo y paciente | La URL nunca debe filtrar el nombre ni el número de IVRS (ni en historial, logs o un link compartido). |
| **Sin acceso** | **Aviso explícito + redirige al hub** | *"No contás con acceso a este módulo"* (o recurso). El equipo es interno: claridad > ocultar existencia. |
| **Logout** | **Reset al hub** | Refresh/back/links mantienen el lugar; cerrar sesión arranca limpio en el hub. |
| **Deploy** | Vercel + `vercel.json` rewrite | Que el refresh de una URL profunda sirva `index.html` (sin 404). |

---

## 3. Árbol de rutas

`Track` es la referencia arquitectónica del repo, así que el ruteo se hace **idiomático con rutas
anidadas** — el molde que después copian Lab/Admin/Médicos/Gerencia.

```
<BrowserRouter>
  /login                          → Login                (público; con sesión → redirige al hub)
  /  ………………………………… ProtectedLayout    (exige sesión; renderiza el chrome del AppShell + <Outlet/>)
    index                         → <Navigate /inicio/resumen replace>
    :module  ………………… ModuleLayout     (valida rol del módulo; sin rol → hub + aviso)
       index                      → <Navigate al primer submódulo del módulo, replace>
       :submodule                 → vista plana   (resumen · agenda · plantillas · dispensaciones · …)
       protocolos ……… ProtocolosLayout (carga protocolos+pacientes 1 vez; los baja por Outlet context)
          index                   → ProtocolsList     (grilla + búsqueda unificada)
          todos                   → AllPatients
          :protocolId             → ProtocolDetail    (tablero)
          :protocolId/:patientId  → PatientFicha
  *                               → <Navigate /inicio/resumen replace>
</BrowserRouter>
```

- `protocolos` (segmento fijo) gana sobre `:submodule` (dinámico) por especificidad de react-router →
  conviven sin choque.
- El árbol `protocolos` es **compartido por `track` y `pharma`** (los pacientes viven adentro), por eso
  `module` es un param y no se hardcodea.
- Las **vistas planas** las sigue resolviendo el registry actual
  ([`views/registry.tsx`](../../../src/views/registry.tsx)), ahora como elemento del `:submodule`
  (fallback a `Placeholder` para lo no portado).

---

## 4. URL e identificadores (privacidad)

- `module` / `submodule`: **legibles** (`track`, `protocolos`, `agenda`).
- `:protocolId` y `:patientId`: **UUID de la base**. Nunca nombre ni IVRS.
  - Ejemplo: `spira.app/track/protocolos/3f9a8c…/a71c4e…`
- `document.title` por ruta pero **genérico** (`Spira — Paciente`, `Spira — Protocolos`), nunca PII (el
  título también se filtra al historial y a la barra de tareas).
- El nombre y el IVRS sólo se renderizan **adentro** de la vista, tras auth + permiso (igual que ya hace
  hoy el `PrivacyAvatar`).

---

## 5. Guards y sesión

Tres niveles de control, de afuera hacia adentro:

1. **Auth** (`ProtectedLayout`): sin sesión → `<Navigate to="/login" replace state={{ from }}/>`. Al
   loguearte, vuelve a `from` (el link que querías abrir).
2. **Módulo** (`ModuleLayout`): valida `useAuth().modules` (más `inicio`, siempre permitido). Sin rol →
   `<Navigate to=hub replace state={{ aviso: 'No contás con acceso al módulo X.' }}/>`.
3. **Recurso** (protocolo/paciente puntual): el dato no está visible por RLS (no aparece en
   `useProtocols()`/`usePatients()`) → redirige al hub con aviso
   *"No contás con acceso a este protocolo."* / *"…a esta ficha de paciente."* Reemplaza el actual
   *"se cae a la lista en silencio"* de `ProtocolsView`.

**Mecanismo del aviso (mínimo, sin estado global):** el guard redirige con `state={{ aviso }}`; el hub
lee `useLocation().state?.aviso` en un efecto, muestra un banner/toast transitorio y limpia el state
(`navigate(pathname, { replace: true })`) para que no reaparezca al refrescar.

**Logout:** el botón hace `signOut()` y navega a `/login` **sin** `from` → al volver a entrar, arranca
limpio en el **hub**. (Refresh, back/forward y links sí mantienen el lugar.)

**Login:** email/password ([`auth.tsx`](../../../src/lib/auth.tsx) ya usa `signInWithPassword`, sin
redirect externo) → al éxito, `navigate(from ?? hub, { replace: true })`.

---

## 6. Constructor de rutas central — `src/lib/routes.ts` (nuevo)

Un solo lugar arma las URLs, tipado, sin concatenar strings sueltos por toda la app (clave con varios
devs y para notificaciones/WhatsApp):

```ts
export const routes = {
  home:     () => '/inicio/resumen',
  login:    () => '/login',
  sub:      (m: string, s: string) => `/${m}/${s}`,
  protocols:(m: string) => `/${m}/protocolos`,
  allPatients:(m: string) => `/${m}/protocolos/todos`,
  protocol: (m: string, id: string) => `/${m}/protocolos/${id}`,
  patient:  (m: string, id: string, pid: string) => `/${m}/protocolos/${id}/${pid}`,
}
```

Las cards, las migas del breadcrumb, los redirects y (a futuro) las notificaciones usan todos esto.

---

## 7. Cambios de arquitectura (componentes)

### 7.1 AppShell → layout/chrome
- Pasa de "decide y renderiza la vista" a **chrome con `<Outlet/>`**: top bar, riel de módulos, panel de
  submódulos y el encabezado contextual quedan; el contenido lo pone la ruta.
- `moduleKey`/`subKey` (useState) → derivados de `useParams()` (`module`, `submodule`).
- Botones del **riel** y del **panel** → `<Link>` (a `routes.sub(...)`), con el activo resaltado por la
  ruta actual.
- `selectModule`/`navigate`/`onNavigate` internos → se eliminan; lo reemplaza `useNavigate` + `routes`.

### 7.2 Encabezado contextual (`ViewHeader`) → contexto
- Hoy el AppShell tiene `viewHeader` en estado y le pasa `setHeader` a la vista que renderiza
  directamente. Como ahora la vista entra por `<Outlet/>` (es descendiente, no hijo directo), se mueve a
  un **contexto chico**: el layout provee `{ viewHeader, setHeader }`; el chrome lo lee para las
  migas/acciones; las vistas llaman `useSetViewHeader()` en un efecto.
- El reset *"al cambiar de módulo/submódulo limpiar el header"* se re-keya al **cambio de ruta**
  (`useLocation().pathname`).
- Las migas (`rootOnClick`, `crumbs[].onClick`) pasan a `navigate(routes.*)` / `<Link>`.

### 7.3 ProtocolsView → se parte en rutas
- **`ProtocolosLayout`** (nuevo): carga `useProtocols()` + `usePatients()`, maneja loading/error, y baja
  los datos por `<Outlet context={{ protocols, patients, ... }}/>` (sin refetch entre subvistas).
- **`ProtocolsList`** (index): grilla de protocolos + búsqueda unificada (protocolos+pacientes) + toolbar
  ("Ver pacientes", "Nuevo protocolo"). Cards y resultados → `<Link>` a `routes.protocol`/`routes.patient`.
- **`AllPatients`** (`todos`): la lista de "Todos los pacientes" (`PdPatientRow`/`PatientsTable` según
  módulo).
- **`ProtocolDetail`** (`:protocolId`) y **`PatientFicha`** (`:protocolId/:patientId`): leen `useParams`,
  buscan el registro en el context; si no está visible → redirect al hub + aviso (guard de recurso).
- Los componentes pesados [`ProtocolDetailView`](../../../src/views/ProtocolDetailView.tsx) y
  [`PatientFichaView`](../../../src/views/PatientFichaView.tsx) **se tocan poco**: siguen recibiendo sus
  callbacks (`onBack`, `onOpenPatient`, `onGoList`, `onGoAgenda`); los wrappers de ruta los cablean a
  `navigate(routes.*)`.
- **Modales** (`NewProtocolForm`/`NewPatientForm`/`EditProtocolForm`): quedan como **estado local** del
  componente de ruta (no se rutean por ahora; ver §11).

### 7.4 Login → ruta
- Deja de salir por el `Gate` y pasa a ser la ruta `/login`; maneja el redirect post-login (`from`).

---

## 8. Mapa de archivos

| Archivo | Cambio |
|---|---|
| `package.json` | + `react-router-dom` v7 |
| `src/main.tsx` / `src/App.tsx` | `<BrowserRouter>` + `<Routes>`; el `Gate` se vuelve guards |
| `src/router/` *(nuevo)* | árbol de rutas, `ProtectedLayout`, `ModuleLayout`, `ProtocolosLayout`, guards de recurso |
| `src/lib/routes.ts` *(nuevo)* | constructor de rutas |
| `src/shell/AppShell.tsx` | → layout/chrome con `<Outlet/>`; activos por `useParams`; riel/panel → `<Link>`; header por contexto |
| `src/shell/Login.tsx` | → ruta; redirect post-login |
| `src/views/ProtocolsView.tsx` | se parte (§7.3) |
| `src/views/registry.tsx` | sigue resolviendo las vistas planas como elemento de `:submodule` |
| `src/views/types.ts` | `ViewHeader` por contexto; se va el prop `onNavigate` (lo reemplaza `useNavigate`) |
| `src/views/ProtocolDetailView.tsx`, `PatientFichaView.tsx` | edición mínima (callbacks cableados a `navigate`) |
| `vercel.json` *(nuevo)* | rewrite SPA |
| `index.html` | título base genérico; títulos por ruta vía efecto |

---

## 9. Edge cases

- **Refresh en URL profunda** → `vercel.json` sirve `index.html` → el router resuelve. ✅
- `/` → redirige al hub. `/track` (módulo sin submódulo) → primer submódulo del módulo.
- **Ruta inexistente** (`*`) → redirige al hub.
- **Módulo bloqueado** (sin rol) → hub + aviso explícito.
- **Protocolo/paciente no visible** (RLS, o desaparece tras un refetch/realtime estando en la ficha) →
  hub + aviso de recurso.
- **Deep link estando deslogueado** → login → al entrar, vuelve al link. **Logout** → hub.
- `inicio` siempre permitido (no es módulo, es el home).

---

## 10. Verificación

- `npm run build` (tsc `--noEmit` + vite build) en **verde**.
- **En vivo** (`npm run preview` o preview de Vercel):
  - Refresh en una URL profunda → cae bien (no 404).
  - Back/forward del navegador → camina la historia real.
  - Sin acceso (módulo y recurso) → redirige al hub + aviso explícito.
  - Round-trip de login: deep link deslogueado → login → vuelve al deep link.
  - Logout → arranca en el hub.
  - UUIDs en la barra; sin nombre/IVRS en URL ni en el título de la pestaña.
- Sin tests automáticos nuevos (el repo verifica en vivo, como en las bitácoras).

---

## 11. Fuera de alcance / futuro

- **Feature de notificaciones / anuncios:** no se construye acá. El ruteo sólo **deja la puerta abierta**
  (deep links estables + `routes.ts`); la campanita del AppShell ya está puesta para cablear después.
- **Deep links de WhatsApp / IA:** misma idea — habilitados por URLs estables, fuera de este alcance.
- **Modales como rutas** (`/protocolos/nuevo`, `/:protocolId/editar`): quedan como estado local por ahora;
  se pueden rutear más adelante si hace falta.
- **Migrar el resto de módulos** (Lab/Admin/Médicos/Gerencia): copian el molde de Track cuando existan.
- **"Recordar última ubicación"** en `localStorage` para reabrir donde estabas tras cerrar todo: opcional
  y **apagado por defecto** (en máquina compartida de clínica, reabrir directo en una ficha es justo lo
  que no querés).
