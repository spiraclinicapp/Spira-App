# Spec · URLs de navegación (deep-linking completo)

**Fecha:** 2026-08-23
**Autor:** Lautaro Molina (con Claude)
**Módulo:** Transversal (shell / navegación / todas las vistas)
**Estado:** Diseño aprobado por el Director. Pendiente: review del spec → plan.
**Reemplaza a:** [`2026-06-17-ruteo-design.md`](2026-06-17-ruteo-design.md) — aprobado en junio,
nunca implementado (ver §2).

---

## 1. Objetivo

Que **la URL sea la fuente de verdad de dónde estás parado en Spira**, hasta el último detalle de
pantalla: el módulo, el submódulo, la entidad abierta, el día que mirás, los filtros aplicados y la
búsqueda escrita.

Hoy nada de eso existe. La navegación es estado de React: el [`AppShell`](../../../src/shell/AppShell.tsx)
guarda `moduleKey`/`subKey` en `useState`, y cada vista guarda su navegación profunda por su cuenta
— [`ProtocolsView`](../../../src/views/ProtocolsView.tsx) con su `useState<Nav>`
(`list`/`all`/`protocol`/`patient`), y las ocho vistas operativas con sus filtros, su día y su entidad
abierta. Consecuencias:

- **F5 te devuelve a Inicio › Resumen.** Perdés el protocolo, la ficha, el día y los filtros.
- **El back/forward del navegador no hace nada** dentro de la app.
- **Nada se puede compartir ni guardar en favoritos.** "Mirá esta dispensación" es hoy una lista de
  instrucciones habladas, no un link.

El pedido del Director (2026-08-23) fue explícito y con ejemplo:
`https://spira-app.vercel.app/pacientes/EFC18244/32000740001`, y con el alcance máximo — **todo el
estado de pantalla**, no solo la pantalla.

---

## 2. Qué cambia respecto del spec de junio

El [spec del 2026-06-17](2026-06-17-ruteo-design.md) cubría este mismo terreno y quedó en
"diseño aprobado, pendiente de review". **Nunca se implementó**: no hay `react-router` en
`package.json`, ni `src/router/`, ni `src/lib/routes.ts`. Lo único que sobrevivió es el
[`vercel.json`](../../../vercel.json) con el rewrite SPA, que sigue vigente y no hay que tocar.

Dos de sus decisiones se revierten acá, a propósito y con motivo:

| Tema | Junio 2026 | Agosto 2026 | Por qué cambió |
|---|---|---|---|
| **Librería** | react-router v7, rutas anidadas, el `AppShell` reescrito como layout con `<Outlet/>` | Capa propia sobre la History API | El trabajo real del alcance completo es decidir qué estado es direccionable y cómo se serializa — eso ningún router lo resuelve. La capa propia respeta la arquitectura ya documentada en `CLAUDE.md` ("sin react-router: la navegación es estado propio del shell") y, sobre todo, **permite mergear vista por vista**: cada PR deja la app entera funcionando. El plan de junio era un único PR que tocaba el shell, el registry, los tipos, el login y `ProtocolsView` partido en cinco archivos. |
| **Identificadores** | UUID siempre. Textual: *"La URL nunca debe filtrar el nombre ni el número de IVRS"* | Código de protocolo + IVRS legibles | La premisa caducó a medias. Aquel spec se apoyaba en el `PrivacyAvatar`, que **el Director eliminó el 2026-08-04** al decidir que el nombre completo se muestra en toda la app. El IVRS es un pseudónimo por diseño — la [`0002_tables.sql:58`](../../../supabase/migrations/0002_tables.sql) lo define como "identificación sin nombre, apto código de barras". Ratificado por el Director el 2026-08-23. |

**Lo que NO cambia de aquel spec, porque sigue teniendo razón:** el nombre del paciente no va a la URL
jamás, y el `document.title` queda genérico (`Spira — Paciente`, nunca el nombre). El título se filtra al
historial y a la barra de tareas igual que la URL, y ahí sí estaríamos hablando de PII directa.

**Riesgo residual asumido:** el código de protocolo y el IVRS quedan en el historial del navegador (en
una máquina compartida de clínica) y en los logs de acceso de Vercel. Es una decisión consciente del
Director, no un descuido. Si alguna vez hay que revertirla, el §6 (`buildUrl`/`parseUrl` como único
lugar que arma URLs) hace que sea un cambio de una función y no una cacería por todo el repo.

---

## 3. Decisiones

| Decisión | Elección | Motivo |
|---|---|---|
| **Forma de URL** | Paths limpios con el módulo adelante: `/coordinacion/pacientes/...` | "Pacientes" existe en Coordinación **y** en Farmacia (es la misma `ProtocolsView` montada dos veces). Sin el módulo adelante, al abrir el link hay que adivinar cuál, y el acento y el panel lateral pueden salir distintos de los que esperaba quien lo mandó. El módulo ya es una realidad del sistema (roles, RLS, acento), así que la URL no inventa una categoría nueva. |
| **Vocabulario** | Los slugs son el **nombre visible en castellano**, sin tildes | Coherente con la regla de `CLAUDE.md`: el copy de UI dice Coordinación / Farmacia / Stock / Estadísticas; las `key` internas (`track`, `pharma`, `medicamentos`, `reportes`) no se tocan porque cuelgan de un enum de Postgres, la RLS y el `audit_log`. El slug es una capa de presentación más, como el rótulo. |
| **Identificadores** | Código legible cuando existe; UUID corto si no | Se **escribe** siempre el legible, se **leen** los dos. Así una URL vieja con UUID sigue andando cuando ese paciente recibe su IVRS más adelante — que es exactamente lo que le va a pasar a todo paciente en screening. |
| **Paciente sin IVRS** | `p-` + los primeros 8 del UUID | El IVRS es único pero **nullable** desde la [`0021`](../../../supabase/migrations/0021_randomizacion.sql): se asigna en randomización. Sin fallback, una parte de los pacientes no sería enlazable. Se descartó numerarlos por orden de enrolamiento: un link guardado terminaría apuntando a otra persona si el orden cambia. |
| **Botón atrás** | Apila la navegación, no los filtros | Apilan historial: módulo, submódulo, entidad del path y entidad abierta. Reemplazan: día, filtros, búsqueda, agrupación, período. Si cada filtro apilara, salir de Visitas del día después de un rato trabajando serían quince "atrás" — el botón dejaría de servir para volver. |
| **Defaults** | No se escriben | Sin filtros y en el día de hoy, la URL es `/coordinacion/visitas` pelada. Los parámetros aparecen solo cuando decís algo distinto del default; si no, cada pantalla arrancaría con una tira de ruido que nadie puede leer ni dictar. |
| **Arquitectura** | `src/lib/router.ts` (puro) + `useUrlState` (hook) | Ver §6. |
| **Deploy** | Sin cambios | El [`vercel.json`](../../../vercel.json) ya tiene el rewrite `/(.*) → /index.html`. |

---

## 4. El mapa de URLs

### 4.1 Módulos y submódulos

| Slug de módulo | `key` interna | Slug de submódulo → `key` interna |
|---|---|---|
| *(raíz)* / `inicio` | `inicio` | `resumen`, `tareas`, `alertas` |
| `coordinacion` | `track` | `resumen`, **`pacientes` → `protocolos`**, `visitas`, `para-ver-medico`, `alertas` |
| `farmacia` | `pharma` | **`pacientes` → `protocolos`**, `recepcion`, **`stock` → `medicamentos`**, `dispensaciones`, **`estadisticas` → `reportes`** |
| `lab`, `contable` | idem | Bloqueados (`proximamente`): resuelven a la pantalla de §8 |

`/` es Inicio › Resumen (la home). `/coordinacion` sin submódulo cae al primero del módulo, igual que
hace hoy `selectModule`.

**Agenda NO tiene ruta**, aunque `views/registry.tsx` siga mapeando `track/agenda` a su vista. Su
entrada está comentada en `MODULES` desde que el Director la sacó del menú, y hoy tampoco es
alcanzable por `navigate()` — que valida contra `mod.submodules`. Darle URL sería reponer por la
puerta de atrás una pantalla que se decidió retirar. `parseUrl` valida contra el mismo `MODULES`, así
que el día que se descomente esa línea la ruta se habilita sola, sin tocar el router.

### 4.2 Ejemplos

```
/                                                    Inicio › Resumen
/coordinacion/pacientes                              grilla de protocolos
/coordinacion/pacientes/todos                        "Todos los pacientes"
/coordinacion/pacientes/EFC18244                     un protocolo
/coordinacion/pacientes/EFC18244/32000740001         una ficha  ← el ejemplo del Director
/coordinacion/pacientes/EFC18244/p-8f3a2c1d          una ficha, paciente sin IVRS
/coordinacion/visitas                                Visitas del día (hoy, sin filtros)
/coordinacion/visitas?dia=2026-08-22&estado=pendiente
/coordinacion/visitas?dia=2026-08-22&visita=a3f9c1d2-77b4-4e11-9d0a-6c2f5b8e1a3d
/farmacia/stock?apartado=protocolo&estado=pronto
/farmacia/dispensaciones                             tablero
/farmacia/dispensaciones/D-0417                      con el cajón abierto
/farmacia/estadisticas?periodo=anio
```

### 4.3 Parámetros por vista

Relevado uno por uno contra el `useState` de cada archivo. Todo lo que no figura acá es efímero (§7).

| Vista | Parámetro | Estado que refleja | Default (no se escribe) |
|---|---|---|---|
| **Pacientes** (`ProtocolsView`) | *path* | `nav`: `list` / `all` / `protocol` / `patient` | `list` |
| | `buscar` | `search` | vacío |
| | `estado` | `fEstado[]` (`activo`/`pausado`/`cerrado`) | vacío |
| **Ficha** (`PatientFichaView`) | `visita` | `openVisitId` | `null` |
| **Visitas del día** | `dia` | `date` | hoy |
| | `buscar` | `q` | vacío |
| | `estado` | `fEstado[]` | vacío |
| | `protocolo` | `fProto[]` | vacío |
| | `medico` | `fMed[]` (filtra por `treating_physician`, texto libre) | vacío |
| | `coordinadora` | `fCoord[]` | vacío |
| | `agrupar` | `group` (`operativo`/`estado`/`protocolo`/`medico`/`coordinador`/`ninguno`) | `operativo` |
| | `visita` | `openVisit` | `null` |
| **Para ver médico** | `dia` | `date` | hoy |
| | `estado` | `status` (`todos`/`faltan`/`atendidos`) | `todos` |
| | `visita` | `openVisitId` | `null` |
| **Alertas** | `protocolo` | `protocolFilter` | `all` |
| | `antiguedad` | `ageDays` | `0` |
| | `descartadas` | `showDismissed` | `false` |
| | `visita` | `openVisitId` | `null` |
| **Dispensaciones** | *path* | `openId` → `dispensation_code` | tablero |
| | `dia` | `day` | hoy |
| | `vista` | `vista` (`tablero`/`historial`) | `tablero` |
| | `protocolo` | `protoSel[]` | vacío |
| | `buscar` | `query` | vacío |
| **Stock** | `apartado` | `apartado` (`menu`/`protocolo`/`ambulatoria`/`catalogo`) | `menu` |
| | `estado` | `filtro` (`todos`/`vigentes`/`pronto`/`vencido`) | `todos` |
| | `buscar` | `busqueda` | vacío |
| | `protocolo` | `protoSel[]` | vacío |
| **Recepción** | `estado` | `fEstados[]` | vacío |
| | `tipo` | `fTipos[]` | vacío |
| | `medicamento` | `fMeds[]` | vacío |
| | `protocolo` | `fProtoSel[]` | vacío |
| | `buscar` | `q` | vacío |
| | `desde` / `hasta` | `desde` / `hasta` | vacío |
| **Estadísticas** | `periodo` | `preset` (`30dias`/`mesEnCurso`/`anio`/`custom`) | `30dias` |
| | `desde` / `hasta` | `rango` (solo si `periodo=custom`) | derivado del preset |
| | `protocolo` | `protoSel[]` | vacío |

Los multi-valor van separados por coma: `?estado=pendiente,en-curso`.

---

## 5. Reglas de serialización

1. **Lo que está en su default no se escribe.** Es lo que hace que `/coordinacion/visitas` sea una URL
   dictable y no una tira de veinte parámetros redundantes.
2. **Se escribe el legible, se leen los dos.** `buildUrl` emite siempre el código; `parseUrl` acepta
   código o UUID y resuelve contra los datos ya cargados.
3. **Los códigos NO distinguen mayúsculas** (decisión del Director, 2026-08-24): estas URLs se dictan
   por teléfono. El match exacto gana; si no hay, se prueba ignorando la caja y sólo vale si es ÚNICO
   — el `unique` de la base sí distingue, así que podrían convivir un `abc123` y un `ABC123`, y ante
   ese empate no se abre ninguno. Lo resuelve `resolveCode` en `router.ts`.
4. **El identificador corto son los primeros 8 caracteres del UUID, y lo usa solo el paciente sin
   IVRS** (con prefijo `p-`, para que nunca se confunda con un IVRS, que es numérico). 8 caracteres
   hex son 4.300 millones de combinaciones sobre un universo de miles de filas: la colisión es
   improbable, pero **no se asume**. El prefijo se resuelve contra los datos ya cargados y, si dos
   filas empatan, no se abre ninguna: se cae a la pantalla de "no se encontró" (§8). Nunca se elige
   una al azar — en una ficha clínica eso sería mostrarte el paciente equivocado.
5. **La visita abierta (`?visita=`) va con el UUID completo**, no con el corto. Un identificador corto
   hay que resolverlo contra las filas cargadas, y la visita puede perfectamente no estar entre ellas:
   el comentario de `useUrlEntity` en [`TrackAlertsView.tsx`](../../../src/views/TrackAlertsView.tsx)
   lo dice explícitamente — `VisitDetail` trae sus propios datos por id, y por eso **una alerta se
   puede abrir aunque los filtros de la vista la dejen fuera**. Acortar el id rompería esa propiedad
   para ganar veinte caracteres de barra en un modal. No vale el cambio.
6. **Push vs replace**, según la tabla del §3. La distinción vive en el hook, no en cada vista: el tercer
   argumento de `useUrlState` la declara una vez por campo.
7. **Los valores viajan en minúscula y sin tildes.** Los enums de la base ya vienen así
   (`activo`, `pendiente`, `mesEnCurso`); donde el valor interno tenga mayúsculas se normaliza en el mapa
   de `router.ts`, nunca a mano en la vista.
8. **Un parámetro desconocido o con un valor inválido se ignora en silencio** y se cae al default. Una
   URL vieja, mal tipeada o recortada por WhatsApp abre la pantalla, no un error.

---

## 6. Arquitectura

### 6.1 `src/lib/router.ts` — funciones puras, sin React

```ts
export interface UrlState {
  moduleKey: string          // 'track' | 'pharma' | 'inicio'  (key interna, no slug)
  subKey: string             // 'protocolos' | 'visitas' | ...
  path: string[]             // segmentos después del submódulo: ['EFC18244', '32000740001']
  query: Record<string, string>
}

export function parseUrl(pathname: string, search: string): UrlState | NotFound
export function buildUrl(state: UrlState): string
```

Más los dos mapas `slug ↔ key` (módulo y submódulo), que son la única traducción entre el vocabulario
visible y el interno. **Nadie más arma URLs a mano en todo el repo**: si mañana hay que sacar el IVRS de
la barra, se cambia acá y listo.

Son funciones puras y sin dependencias → son exactamente lo que este repo testea (§10).

### 6.2 `src/lib/useUrlState.ts` — el hook

```ts
const [dia, setDia]       = useUrlState('dia', todayISO())            // replace
const [visita, setVisita] = useUrlState('visita', null, 'push')       // apila historial
```

Misma firma que `useState`, así **adoptar una vista es sustitución línea por línea** y el diff se lee.
El hook escucha `popstate`, con lo cual el botón atrás funciona sin que la vista haga absolutamente nada.

### 6.3 El shell

`moduleKey`/`subKey` dejan de ser `useState` y pasan a derivarse de la URL. `selectModule` y `navigate`
se mantienen con su firma actual — por dentro escriben la URL en vez del estado. Es deliberado: las ocho
vistas, el `CommandPalette`, el `NotificationsMenu` y el pasaje de vuelta (`ReturnTo`) reciben
`onNavigate` y **no hay que tocar ninguno**.

`navTarget` y `ReturnTo` sobreviven tal cual. Son cosas distintas de la URL: `navTarget` es "abrí esta
entidad al llegar" (se consume una vez) y `ReturnTo` es un pasaje de vuelta explícito que alguien dejó.
El historial del navegador no los reemplaza — al contrario, ahora conviven bien: atrás vuelve un paso,
el chip vuelve al lugar concreto de donde venías.

### 6.4 Las vistas

Cada una cambia sus `useState` direccionables por `useUrlState`, según la tabla del §4.3. Nada más.
La navegación interna de `ProtocolsView` (`useState<Nav>`) se deriva del `path` de la URL.

---

## 7. Lo que NO va a la URL

Los formularios a medio llenar: el wizard de Recepción (`creating`), "Nueva dispensación" (`creando`),
alta y edición de protocolo y paciente (`creating`, `editingProtocol`, `editing`, `deleting`), asignación
de código (`codigo`), ajuste de lote (`ajuste`), y los modales de acción de la ficha
(`reschedule`/`register`/`edit`).

También quedan afuera: `busyId`, toasts, mensajes de error, dropdowns abiertos, `highlightId`, el
`angosto` de Estadísticas (es responsive, no navegación) y la paginación acumulativa del historial de
Dispensaciones (`pagina`/`acumuladas` — restaurarla implicaría refetchear N páginas para que la URL no
mienta sobre lo que estás viendo).

El criterio es uno solo, y es el que rige en una app auditable: **lo que la URL promete restaurar, lo
restaura**. Una URL que te devuelve un wizard vacío después de haberte prometido tus datos es peor que
una URL que no promete nada.

Caso limítrofe resuelto: el modal de comentarios de una visita (`commentsVisit`, en Para ver médico) queda
afuera. `?visita=` abre el detalle, que es el nivel de lectura que importa; el sub-modal no gana un
parámetro propio.

---

## 8. Casos borde

| Situación | Qué pasa |
|---|---|
| Refresh en URL profunda | El `vercel.json` sirve `index.html`, el router resuelve. Ya funciona. |
| `/` | Inicio › Resumen |
| `/coordinacion` (módulo sin submódulo) | primer submódulo del módulo (`resumen`) |
| Ruta desconocida (`/farmacéutica`) | Pantalla serena: "Esa dirección no existe" + volver al inicio. **No un redirect mudo**: si te mandaron un link roto, tenés que enterarte. |
| Módulo sin rol, o `proximamente` (Lab, Contable) | La misma pantalla, sin revelar qué hay adentro — coherente con el candado del riel, que tampoco muestra el módulo |
| Protocolo o paciente que la RLS no deja ver | "No se encontró, o no tenés acceso." **Un solo mensaje, a propósito**: distinguir "no existe" de "no podés ver" convierte la URL en un oráculo para averiguar qué pacientes hay en protocolos ajenos. |
| Parámetro inválido (`?dia=ayer`) | Se ignora, se usa el default. La pantalla abre. |
| Deep link sin sesión | Login, y después vas exactamente ahí. La URL ya sobrevive sola: [`App.tsx`](../../../src/App.tsx) monta `Login` sin tocarla. |
| Logout | Vuelve a la raíz, no al último lugar. Es una máquina compartida de clínica. |
| Un dato desaparece por realtime estando en su ficha | Misma pantalla de "no se encontró", en vez del *fallback* silencioso a la lista que hace hoy `ProtocolsView` |

---

## 9. Interacción con auth — el punto delicado

[`auth.tsx:99-125`](../../../src/lib/auth.tsx) lee los errores que Supabase devuelve en el hash o el query
y después limpia la URL así:

```ts
window.history.replaceState(null, '', window.location.pathname)
```

Eso **borra el query string entero** — es decir, todos los parámetros del router. Hoy no molesta porque
no hay nada ahí; con este spec, sí.

**Corrección:** ese limpiado pasa a borrar únicamente los parámetros de Supabase
(`error`, `error_code`, `error_description`) y a conservar el resto del query.

Además, el orden de arranque queda explícito: **el router vive dentro del `AppShell`**, que el `Gate` monta
después de resolver la sesión. Nunca compite con el `detectSessionInUrl` del SDK de Supabase, que limpia
el hash por su cuenta al inicializar.

Esto va en el primer PR, antes que cualquier otra cosa, y es la razón por la que ese PR existe separado.

---

## 10. Verificación

**Automática** (`vitest`, corre dentro de `npm run build`):

`parseUrl` y `buildUrl` son funciones puras y caen justo en el criterio del repo — **son de las que fallan
en silencio**. Si un mapa `slug ↔ key` queda al revés, la pantalla no se ve mal: te lleva a otro lado. Eso
no lo agarra mirando nadie.

- Ida y vuelta (`buildUrl(parseUrl(x)) === x`) sobre las ~20 rutas del §4.2
- Los defaults no se escriben, y se restauran al leer una URL sin ellos
- Código y UUID resuelven al mismo destino; un paciente sin IVRS emite `p-xxxxxxxx`
- Parámetros desconocidos e inválidos caen al default sin romper
- Slugs: `pacientes → protocolos`, `stock → medicamentos`, `estadisticas → reportes`,
  `coordinacion → track`, `farmacia → pharma`

**En vivo** (preview en el 5250):

- F5 en una URL profunda cae donde tiene que caer
- Atrás/adelante caminan por pantallas, no por filtros
- Filtrar y cambiar de día no ensucia el historial
- Deep link deslogueado → login → vuelve al link
- Un link a un módulo sin rol muestra la pantalla serena
- El título de la pestaña nunca dice el nombre de un paciente

`npm run build` en verde es el gate, como siempre.

---

## 11. Entrega

Cinco PRs. Cada uno mergea solo, deja la app entera funcionando y se puede verificar por separado.

| # | Alcance | Se ve algo |
|---|---|---|
| 1 | `router.ts` + `useUrlState` + tests + la corrección de `auth.tsx` (§9) | No. Andamiaje. |
| 2 | El shell: módulo y submódulo en la URL, atrás entre pantallas, pantalla de "no existe / sin acceso" | Sí: `/coordinacion/visitas` y F5 ya funcionan |
| 3 | Pacientes: protocolo, ficha, `todos`, búsqueda y filtro de estado | Sí: el ejemplo del Director queda vivo |
| 4 | Coordinación: Visitas del día, Para ver médico, Alertas | Sí |
| 5 | Farmacia: Dispensaciones, Stock, Recepción, Estadísticas | Sí |

El orden importa: el 1 y el 2 son el piso de los otros tres, pero el 3, el 4 y el 5 son independientes
entre sí y se pueden repartir o reordenar según lo que urja.

**Ninguno toca la base.** No hay migración en todo el spec.

---

## 12. Fuera de alcance

- **Modales como rutas** (`/pacientes/nuevo`, `/EFC18244/editar`): siguen siendo estado local, por §7.
- **"Recordar dónde estabas" al reabrir la app** (localStorage): explícitamente no. En una máquina
  compartida de clínica, reabrir directo en una ficha es justo lo que no querés. Ahora que hay URLs, el
  que quiera volver a un lugar se lo guarda en favoritos.
- **Deep links en notificaciones, WhatsApp o IA**: no se construyen acá. Este spec les deja la puerta
  abierta (URLs estables + `buildUrl` como único constructor), que es todo lo que necesitan.
- **Lab y Contable**: cuando existan, entran solos por el registry — no hay que tocar el router.
