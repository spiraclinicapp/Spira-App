# Feedback con lugar: dónde estaba parada la persona que reporta

**Fecha:** 2026-09-17 · **Estado:** diseño aprobado por el Director · **Origen:** pedido del Director
sobre el modal «Dar feedback» (`src/shell/FeedbackModal.tsx`, migración `0044_feedback.sql`).

## El pedido, textual

> Sabes que me pasa, quiero que el boton de feedback ancle la dirección en donde se encuentra la
> persona que va a realizar el feedback por que si no, yo como supervisor no tengo forma de saber en
> que punto fue que detecto el bug o lo que sea se entiende?

## Punto de partida

El feedback **ya** viaja con contexto: el RPC `submit_feedback` (0044) guarda `module`, `route`
(`"<mod>/<sub>"`, p. ej. `track/protocolos`), `app_version` y el `user_id` que fija el server con
`auth.uid()`. La tabla la ve **sólo gerencia** por RLS y no hay ninguna pantalla que la muestre: hoy se
lee entrando a Supabase.

Faltan las dos mitades que hacen que el dato sirva: el **detalle fino** (qué paciente, qué visita, qué
paso del wizard) y un **lugar donde leerlo** dentro de la app.

## Qué cambia

| | Hasta hoy | Con este diseño |
|---|---|---|
| Qué se guarda del lugar | Módulo + `"<mod>/<sub>"` | + migaja legible + la entidad abierta, con su id |
| Desde dónde se reporta | El pie del riel («Acerca de»), con todo cerrado | También **con un modal abierto**, por atajo de teclado |
| Qué ve quien reporta | «Coordinación · v0.79.0 · Ana» | El lugar completo, tal como se va a guardar |
| Dónde se lee | Supabase | **Ajustes › Feedback recibido** (sólo gerencia) |
| Qué se puede hacer | Nada | Filtrar, **marcar como visto** y **saltar al lugar** |

## Decisiones del Director (2026-09-17, no re-discutir)

- **F1 · Las dos mitades.** Capturar el lugar fino **y** poder leerlo desde la app. Una sin la otra no
  resuelve el pedido.
- **F2 · El ancla es la migaja + la entidad abierta.** «Coordinación › Estudios y pacientes › Juan
  Pérez (4022001)», con el id guardado aparte para poder abrirlo. Se descartó guardar sólo texto (no
  deja saltar) y guardar además el estado completo de la pantalla —pestaña, filtros— (mucho cableado
  por vista, mucho ruido para leer).
- **F3 · Se puede reportar sin cerrar lo que se está mirando.** Es donde más bugs se ven. El ancla
  captura entonces la visita, el lote o el paso del wizard.
- **F4 · La bandeja vive en Ajustes**, al lado de «Equipo y accesos», que ya es supervisión. No se
  abre un submódulo en Inicio (hoy Inicio tiene una sola vista y no dibuja panel de submódulos).
- **F5 · Leer y marcar como visto.** Sin responderle al que reportó: eso es otra feature, con
  notificación incluida, y queda para otra vuelta.

## Arquitectura

### 1 · El registro de lugar (`src/lib/lugar.ts`)

Una **pila a nivel de módulo**, con el mismo patrón que ya usa `Modal.tsx` para decidir quién atiende
la tecla Escape (`const abiertos: object[] = []`). Quien manda en la pantalla publica su lugar al
montarse y lo saca al desmontarse; el feedback lee el **tope** en el momento de abrirse.

```ts
/** Dónde está parada la persona, para que el feedback lo pueda anclar. */
export interface Lugar {
  /** Texto legible, sin el módulo ni el submódulo (los pone el shell): "Juan Pérez · 4022001". */
  label: string
  /** Cómo volver acá. Mismo tipo que ya usa la navegación del shell. */
  target?: NavTarget
}

/** Publica un lugar mientras el componente esté montado. `null` = este componente no aporta lugar. */
export function useLugar(lugar: Lugar | null): void

/** El tope de la pila, o `null`. Lo lee el shell al abrir el feedback; no es reactivo, a propósito. */
export function lugarActual(): Lugar | null
```

- **Por qué una pila y no un Context:** un modal se monta *encima* de la vista que lo abrió, y las dos
  cosas son ciertas a la vez — el tope es el que manda. Un Context obligaría a que cada nivel supiera
  del de abajo, y además re-renderiza a todos sus consumidores cada vez que cambia el lugar, cosa que
  acá no le sirve a nadie: el único lector lee una vez, al abrir el modal.
- **No es reactivo:** `lugarActual()` se llama en el handler que abre el feedback. Si fuera estado del
  shell, cada navegación re-renderizaría el árbol entero por un dato que se usa una vez por día.
- **StrictMode:** el efecto monta y desmonta dos veces en desarrollo. La entrada se identifica por
  objeto propio (`const yo = {}`), igual que en `Modal.tsx`, así que un pop fuera de orden saca la
  entrada correcta y no la del vecino.

### 2 · Quién publica (alcance inicial)

Las pantallas donde «estaba mirando X» es una respuesta distinta de «estaba en la pantalla Y»:

| Dónde | label | target |
|---|---|---|
| `PatientFichaView` | «Juan Pérez · 4022001» | `{ patientId, protocolId }` |
| `ProtocolDetailView` | «LTS17231» | `{ protocolId, protocolTab }` |
| `VisitDetail` (modal) | «V8 · Juan Pérez» | `{ visitId, visitDate }` |
| `ReceptionWizard` (modal) | «Recepción · paso 2 de 4» | sin target (todavía no hay entidad) |
| `RegisterVisitFlow` (modal) | «Registrar visita · Juan Pérez» | `{ patientId, protocolId }` |

El resto de las vistas **no se toca**: caen al fallback y siguen informando lo que informan hoy.

### 3 · El fallback, sin cablear nada

Si la pila está vacía, el shell arma el lugar con lo que ya tiene: el módulo, el submódulo y las migas
que la vista activa registró en `ViewHeader.crumbs` (el encabezado contextual que casi todas usan).
Da el texto pero no el `target`, así que ese renglón se lee y no se salta — que es exactamente el
estado de hoy, y por eso es un fallback aceptable.

### 4 · Cómo se arma lo que se guarda

En `AppShell`, al abrir el modal:

```
place_label  = "Coordinación › Estudios y pacientes › Juan Pérez · 4022001"
place_target = { moduleKey: 'track', subKey: 'protocolos', patientId: '…', protocolId: '…' }
```

`armarLugar(module, sub, crumbs, lugarActual())` es una **función pura** en `src/lib/lugar.ts`: es la
pieza que puede quedar mal sin que se note en pantalla, así que es la que lleva tests.

## Datos

Migración **aditiva**. La última del repo es la `0128` y la `0129` ya está reservada para la guarda de
Recepción, así que el número lo fija el plan de implementación al crear el archivo, mirando
`supabase/README.md` en ese momento:

```sql
alter table public.feedback
  add column if not exists place_label  text,      -- migaja legible al enviar
  add column if not exists place_target jsonb,     -- NavTarget + módulo/submódulo, para el salto
  add column if not exists seen_at      timestamptz,
  add column if not exists seen_by      uuid references public.users(id);
```

- **`place_target` es `jsonb` y no columnas sueltas** porque es el mismo objeto que ya viaja por
  `onNavigate` (`NavTarget`: siete campos opcionales que crecen con la app). Lo consume la app para
  navegar, no el SQL para filtrar.
- **El RPC `submit_feedback` suma dos parámetros con `default null`.** Agregar parámetros **cambia la
  firma**, así que un `create or replace` dejaría viva la versión de cinco y la llamada con argumentos
  nombrados se volvería ambigua: la migración hace `drop function public.submit_feedback(text, text,
  text, text, text)` **antes** de crear la nueva. Con los defaults, el front desplegado —que manda
  cinco— sigue funcionando. Es exactamente lo que hizo la `0128` con `create_reception` al sumarle
  `p_pedido_id`: mismo patrón, mismo motivo.
- **Marcar como visto va por RPC** (`mark_feedback_seen(p_id uuid)`, `security definer`, chequea
  `has_module('gerencia')` y fija `seen_by = auth.uid()`), no por una policy de UPDATE: la RLS no
  limita *qué columnas* se pueden tocar, y una policy de update sobre `feedback` dejaría a gerencia
  reescribir el mensaje que reportó otro. En una app auditable eso no se hace.
- El `select` sigue siendo el de la 0044: sólo gerencia.

## Pantallas

### Al reportar

1. **La línea de contexto dice el lugar completo.** Hoy dice «módulo · versión · usuario»; pasa a
   mostrar la migaja tal como se va a guardar. Es el mismo criterio de honestidad que el resto de la
   app: lo que se adjunta, se muestra.
2. **Atajo de teclado `Ctrl/Cmd + Shift + F`** para abrir el feedback con un modal abierto. El shell ya
   tiene el patrón (el `Ctrl+K` del buscador), que justamente se bloquea cuando hay un
   `[aria-modal="true"]`; acá la condición se invierte a propósito, y es seguro porque `Modal.tsx`
   apila: el de abajo no se desmonta y su formulario a medio llenar sigue ahí al cerrar el feedback.
3. **Descubribilidad:** el atajo se muestra como tecla en el popover «Acerca de», junto a «Dar
   feedback», con la misma pinta que el `Ctrl+K` del buscador (`.spira-search-kbd`). **No** se agrega
   un botón flotante ni un ícono en el encabezado de cada modal: un FAB va contra la sobriedad de la
   app y un ícono en `Modal.tsx` se multiplica por las ~30 ventanas que existen.

### Al leer: Ajustes › Feedback recibido

- Sección nueva en `SettingsSection` (`'feedback'`), **última** y sólo visible con
  `modules.includes('gerencia')`; el resto del equipo no la ve ni por URL (`?ajustes=feedback` cae a
  «Mi cuenta», que es lo que ya hace `parseSettingsSection` con una sección desconocida).
- **Lista por fecha, la más nueva arriba.** Cada renglón: tipo (sugerencia, problema o idea), quién,
  cuándo, el mensaje y **el lugar**. La versión del cliente va en chico, que es para lo que sirve.
- **Filtros:** por tipo y por pendiente/visto. Nada más.
- **«Ir al lugar»**: cierra Ajustes y navega con `onNavigate(moduleKey, subKey, target)` — el mismo
  mecanismo del buscador global. Si el feedback no trae `target` (fallback), el botón no está: no se
  ofrece un salto que no se puede dar.
- **«Marcar como visto»** por renglón. Un feedback visto se atenúa, pero no se esconde.

## Bordes y errores

- **Un paciente borrado.** El `place_target` apunta a un id que ya no existe: el salto aterriza en la
  pantalla y la vista no encuentra nada que abrir. Es el comportamiento que ya tiene el buscador
  global con un `navTarget` que no resuelve; no se agrega nada.
- **Rate limit.** El RPC ya limita a un envío cada 10 segundos por usuario (P0001), con su mensaje
  sereno. Sin cambios.
- **Feedback viejo (anterior a esta migración).** `place_label` en `null`: el renglón muestra el
  `route` de siempre. Ningún renglón queda vacío.
- **Sesión vencida al enviar** (28000) y **datos inválidos** (23514/22023/23502): los mensajes ya
  existen en `feedbackErrorMessage`.

## Qué se testea

Lo que puede fallar **en silencio**, con el criterio de
`src/views/pharma/dispensaciones/estados.test.ts`:

- `lugar.ts` — la pila: el tope es el último publicado; desmontar en desorden saca la entrada correcta;
  con la pila vacía devuelve `null`.
- `armarLugar()` — el texto que se guarda: con lugar publicado, con sólo migas, y sin nada (módulo y
  submódulo pelados). Es el dato que ve el supervisor, y un armado al revés se ve perfecto en pantalla.
- `parseSettingsSection` — que la sección nueva entre en `SECCIONES` sin romper el test que ya existe
  (`section.test.ts`).

El modal, la lista y el botón fallan de manera visible: se verifican mirando.

## Orden de despliegue

La migración es **aditiva y compatible hacia atrás** (columnas nuevas + parámetros con default), así
que va **primero**: el que no funciona sin ella es el front nuevo. El `drop function` de la firma vieja
es parte de la misma migración y no rompe al front desplegado, porque la función nueva acepta la misma
llamada de cinco argumentos nombrados.

## Fuera de alcance

- Responderle al que reportó (F5).
- Adjuntar capturas de pantalla: son datos clínicos en una tabla que no está pensada para eso.
- Guardar filtros, pestañas y scroll de la pantalla (F2).
- Notificar a gerencia cuando entra un feedback: la bandeja se mira, no avisa.
