# Plan — Avisos de pedidos de dispensación

**Fecha:** 2026-09-20 · **Origen:** pedido del Director en sesión (20/09/2026)
**Toca:** `src/shell/` (campana, card y host de avisos) y `src/data/pharma/`
**Migraciones:** **ninguna** · **Estado:** spec, a la espera de revisión.

El pedido, textual: *"que en el panel de notificaciones se vaya actualizando sobre el estado de las
dispensaciones solicitadas… un card más del menú de notificaciones que se vaya actualizando y que en
cada actualización emita una ventana emergente a modo de popup notificando el movimiento del
estado"*. Y después: *"a farmacia no estaría mal que le notifique lo mismo, es decir pedidos
nuevos"*.

O sea dos cosas sobre la misma fuente: **una card que dice dónde está cada pedido** y **un popup en
el instante en que se mueve**. Coordinación sigue lo que pidió; Farmacia se entera de lo que le
entra.

---

## 1. Lo que ya existe y NO se reconstruye

Este plan es casi todo pegamento. Las piezas están:

| Pieza | Dónde | Qué aporta |
|---|---|---|
| `badgeDeEstado(solicitud, dispensacion)` | `views/pharma/dispensaciones/estados.ts:131` | **La** regla de "en qué estado está el pedido", con etiqueta y color. Ya distingue `lista` de `entregada`, que en `RequestStatus` son las dos `atendida`. |
| `columnOf(r)` | `data/pharma/dispensationModel.ts:219` | La columna del tablero, sobre la misma pregunta. |
| `COLUMN_META` / `STATUS_META` | `views/pharma/dispensaciones/estados.ts` | Los colores que Farmacia ya lee todo el día. |
| `Toast` | `components/Toast.tsx` | El patrón del aviso que se va solo y se pausa al hover. **No se toca**: el aviso de pedidos terminó siendo una card, no un toast (D12). |
| `NotificationsMenu` + `notificaciones.ts` | `src/shell/` | El panel, su geometría, `usePopover`, y el reparto "reglas en un archivo con test, JSX en el otro". |
| `requested_by` | `dispensation_requests` (0002:280) | Quién pidió. Ya está en la tabla; nunca se había pedido al front. |
| RLS | 0006:252 y 0006:279 | Coordinación ve las solicitudes de sus visitas (`coordina_visita`) y las dispensaciones que cuelgan de ellas. Farmacia ve todo. **No hace falta ninguna política nueva.** |

**No se inventa un cuarto vocabulario de estados.** La card y el popup dicen lo que dice
`badgeDeEstado`, que es lo que ya dicen el badge de Track, el tablero y el historial. Una etiqueta
propia acá sería el mismo error que el ternario que la campana tenía escrito inline y que anunciaba
"no vino" como un reporte de procedimiento: nada falla, y la pantalla miente.

---

## 2. Alcance: quién ve qué

| | Qué lista la card | Qué dispara el popup |
|---|---|---|
| **Coordinación** | Los pedidos **que esa persona pidió** (`requested_by = auth.uid()`), abiertos —Solicitada, Preparando, Lista— **más los que se cerraron hoy** (Entregada, Rechazada, Cancelada). | Cada movimiento de esos pedidos. |
| **Farmacia** | Los pedidos en **Solicitada**, sin filtro de fecha: los que nadie tomó. | Que entró uno nuevo. |

**Quien tiene los dos módulos ve los dos bloques.** No es un caso de laboratorio: el Director los
tiene todos, y el usuario de QA también — por eso este alcance hay que probarlo con una cuenta de un
solo módulo, o los agujeros de RLS quedan tapados (es la lección que ya está anotada sobre ese
usuario). Un pedido que caiga en los dos bloques —lo pidió Farmacia desde su propia pantalla y
todavía está en Solicitada— **se muestra una sola vez, en "Tus pedidos"**: es tuyo antes que nuevo, y
la regla de D10 dice que de lo propio no se avisa.

**Por qué los cerrados de hoy siguen en la lista (D3).** Si la card se borrara en el instante del
desenlace, un rechazo desaparecería antes de que alguien lo viera y no quedaría rastro en ninguna
pantalla de aviso. La ventana de "hoy" es la misma que ya usa el tablero para la columna de
Entregadas, y no necesita estado nuevo: se deriva de `updated_at`.

**Por qué Farmacia no filtra por fecha (D4).** Una solicitud de ayer sin tomar tiene que seguir a la
vista — es literalmente el mismo motivo por el que `useDispensationBoard` deja las columnas
Solicitadas y Preparando sin filtro de día.

---

## 3. Decisiones

(D3 y D4 están arriba, en §2, junto a lo que deciden.)

**D1 — Se consulta cada tanto; no hay realtime.** Cada 30 s, mientras la pestaña está a la vista, el
shell repregunta por los pedidos del alcance y compara con lo que tenía. El realtime de Supabase
—`postgres_changes` sobre `dispensation_requests` y `dispensations`— da el aviso instantáneo, pero
exige habilitar esas tablas en la publicación **a mano en el dashboard de prod**, manejar la
reconexión cuando la notebook se suspende, y de todos modos repreguntar (el payload trae la fila
cruda, sin paciente ni protocolo). Medio minuto de demora no cambia ninguna decisión: ni ir a buscar
un pedido que está listo, ni ver que entró uno nuevo. **La pieza que decide "algo se movió" queda
aislada**, así que migrar a realtime más adelante es cambiar esa sola pieza.

**D2 — La card es estado vivo, no bandeja.** No se persiste ningún aviso: la card se deriva de la
consulta, igual que las alertas de hoy. Consecuencia asumida: **los popups que ocurrieron con la app
cerrada no se recuperan** — al volver ves la card con el estado actual, no la película de lo que
pasó. La alternativa (tabla de avisos con leído/no leído) se descartó por ahora; está anotada en
"Fuera de alcance".

**D5 — Los avisos NO suman al punto de la campana.** El punto y el contador de Pendientes son hoy el
mismo número y tienen que seguir coincidiendo: es una regla que el propio `NotificationsMenu`
documenta ("un badge que diga 22 sobre una lista de 21 es exactamente la clase de incoherencia que
hace desconfiar de un sistema auditable"). Los pedidos son información, no pendientes clínicos, y de
ellos te entera el popup.

**D6 — Y por eso van en su propio bloque, con encabezado.** Derivado de D5, y es la única adición a
lo conversado: si las cards se mezclaran con las alertas, el panel mostraría cinco filas con el punto
en cero y la incoherencia volvería por la ventana. Van **arriba**, separadas por un encabezado
sobrio (`spira-eyebrow`, el estilo que ya usa la barra de submódulos): **"Tus pedidos"** para
Coordinación, **"Pedidos nuevos"** para Farmacia. El pie —"Ver todos los pendientes"— no cambia:
lleva a los pendientes clínicos, que es lo que promete.

**Y los pendientes clínicos llevan el suyo.** (Agregado el 2026-09-20, mirando el panel con datos
reales: con "Tus pedidos" como único encabezado, las alertas de abajo quedaban leídas bajo ese
título — una alerta de «IP sin pedir» parecía un pedido propio. Un rótulo que abarca lo que no le
corresponde miente igual que un texto equivocado.) Aparece **sólo cuando hay un bloque de pedidos
arriba**: sin pedidos, el panel no gana un encabezado que nunca necesitó.

**D7 — Cupo propio: hasta 5.** Las cards de pedidos no compiten por los 10 lugares de las alertas
clínicas; si hay más de 5, el bloque cierra con "y N más". Sin esto, una tarde movida de Farmacia
empujaría fuera del panel a una ventana vencida. Ese "y N más" **lleva al tablero de Dispensaciones
sólo si quien mira tiene el módulo Farmacia**; para Coordinación es texto pelado, porque no existe
hoy una pantalla que liste "mis pedidos" y un link que prometa una lista que no hay es peor que no
tener link. (Si algún día molesta, la pantalla que falta es esa, no el link.)

**D8 — La card del panel no lleva ✕.** Un pedido no se archiva: se apaga solo cuando se cierra.
Mismo criterio que el "IP sin entregar" (0119) — sin tacho, antes que un tacho que no hace lo que
hacen los otros.

**El aviso flotante sí lleva una ✕, y significa otra cosa**: cierra EL AVISO y no toca el pedido.
Existe porque el aviso dura 30 segundos sobre la pantalla y tiene que poder sacarse de encima; la
card del panel no tapa nada. Son la misma card con la cuarta columna usada distinto, que es
justamente por qué esa columna se reserva siempre.

**D9 — El popup avisa TODOS los movimientos.** Solicitada → Preparando → Lista → Entregada, y
también Rechazada y Cancelada. Es lo pedido, con los ojos abiertos: un pedido normal da tres popups.
La tabla de qué avisa y qué no es **una sola constante**, así que apagar "Preparando" el día que
canse es cambiar una línea.

**D10 — Nunca te avisa de lo que hiciste vos**, y **nunca dispara en la primera carga**. Lo segundo
no es un detalle: sin la siembra en silencio, cada vez que abrís la app te caen diez popups de
movimientos viejos.

**D11 — Ni cuando estás mirando la pantalla que ya lo muestra.** Parado en Farmacia →
Dispensaciones, el popup no salta: el tablero ya lo está diciendo. La card igual se actualiza.

**D12 — El aviso ES la card de la campana, flotando abajo a la derecha, 30 s.** (Corregido el
2026-09-20, mirando la primera versión en pantalla: era una línea de texto al estilo toast y el
Director la quería «más estilo notificación».) Misma card que muestra el panel —ícono teñido por
estado, nombre, IVRS, protocolo y hora—, con una ✕ que cierra EL AVISO y no toca el pedido. Por eso
la card vive en `CajaDePedido.tsx` y la dibujan los dos lugares: dos copias se separarían en el
primer retoque y el aviso terminaría contando lo mismo de otra forma.

Va abajo a la derecha y no al pie centrado, donde vive el `Toast` de confirmación («comprobante N°
1044 generado»): son dos cosas distintas —uno confirma lo que hiciste, el otro te cuenta lo que hizo
otro— y en el mismo lugar se pisan. Hasta tres a la vez; si hay más, un «y N más» arriba de la pila.

**Dura 30 segundos**, no los 2,4 s del toast de confirmación: aquél confirma algo que acabás de
hacer y ya estás mirando; éste llega de algo que hizo otra persona mientras estabas en otra
pantalla. Se pausa con el mouse encima.

---

## 4. Lo que se ve

### 4.1 La card

Mismo esqueleto que las otras cajas del panel (ícono a la izquierda, nombre + IVRS + protocolo en el
primer renglón, estado + fecha en el segundo). Que sea el mismo esqueleto es lo que mantiene las
columnas alineadas: es la razón por la que `Caja` existe.

```
📦  Juan Pérez  LTS-004 · LTS17231
    Lista para retirar · V3 · hace 5 min
```

- **Ícono `box`**, el del submódulo Dispensaciones. Un glifo por clase, como ya rige para las otras.
- **Color de `badgeDeEstado`**: ámbar Solicitada, azul Preparando, verde agua Lista, verde Entregada,
  terracota Rechazada, gris Cancelada.
- **El gesto grande** abre la visita (Coordinación) o el tablero de Dispensaciones (Farmacia). El
  nombre del paciente sigue llevando a su ficha, como en las demás.

### 4.2 El copy

| Estado | Card (2° renglón) | Popup |
|---|---|---|
| Solicitada (lo ve Farmacia) | `Pedido nuevo · V3` | **Pedido nuevo** — Juan Pérez · V3 |
| Preparando | `Preparando · V3` | **Lo están preparando** — Juan Pérez · V3 |
| Lista para retirar | `Lista para retirar · V3` | **Lista para retirar** — Juan Pérez · V3 |
| Entregada | `Entregada · V3` | **Entregada** — Juan Pérez · V3 |
| Rechazada | `Rechazada · V3` | **Pedido rechazado** — Juan Pérez · V3 |
| Cancelada | `Cancelada · V3` | **Pedido cancelado** — Juan Pérez · V3 |

Una frase, sin tecnicismos, sin el id del pedido. Quien lo lee sabe de qué habla por el paciente y la
visita.

---

## 5. Arquitectura

```
AppShell
  ├─ usePedidosParaAvisar(...)      ← UNA sola consulta, con su reloj
  ├─ NotificationsMenu(pedidos)     ← el bloque de cards
  └─ AvisosDePedidos(pedidos)       ← la pila de popups (portal a document.body)
```

**Una sola consulta para los dos.** El hook vive en `AppShell` y baja por props: si la campana y el
host de popups consultaran cada uno por su lado, serían dos relojes desfasados contando lo mismo —el
bug que este panel ya tuvo con los descartes y que `alertSignal.ts` existe para evitar.

### 5.1 Datos — `src/data/pharma/avisosDePedidos.ts` (nuevo)

`usePedidosParaAvisar({ uid, verCoordinacion, verFarmacia })`, sobre `useSupabaseQuery`.

Columnas **mínimas**, y no `REQUEST_COLS`:

```
id, status, updated_at, visit_id, visit_code, requested_by,
dispensations:dispensations(status),
enrollment:enrollments!enrollment_id(ivrs_code, patient:patients(id, full_name)),
protocol:protocols!protocol_id(id, code)
```

No pide renglones, ni constancias, ni habilitaciones. **Eso es deliberado**: esas columnas y embeds
son de migraciones recientes (0121, 0123, 0124) y cualquiera de ellas sin aplicar voltea la consulta
entera. Esta consulta sólo toca columnas viejas, así que no tiene ventana de despliegue. Tampoco
embebe `patient_visits`: Farmacia no puede leerla (0006:162) y el join le devolvería cero filas en
silencio — el `visit_code` viaja desnormalizado en la solicitud justamente por eso.

El reloj va **encima** del hook genérico, no adentro: un `useEffect` con `setInterval(refetch, 30s)`
que se apaga con `document.visibilityState === 'hidden'` y refresca al volver. `useSupabaseQuery` ya
hace *stale-while-revalidate* (no parpadea a "Cargando…" cuando hay datos), que es exactamente lo que
un refresco de fondo necesita.

### 5.2 Reglas puras — `src/shell/avisosPedidos.ts` (nuevo, con test)

- `estadoVisible(row) → 'solicitada' | 'preparando' | 'lista' | 'entregada' | 'rechazada' | 'cancelada'`
  Sobre `columnOf` + los dos terminales. **El `null` de `columnOf` no se mapea en silencio**: es
  `atendida` sin dispensación, un estado que no debería existir, y decir "Solicitada" sobre él sería
  afirmar algo que no sabemos (mismo criterio que `badgeDeHistorial`).
- `detectarMovimientos(previo, actual, uid) → Movimiento[]`
  La pieza central. Siembra sin avisar cuando `previo` está vacío; avisa una sola vez por transición;
  ignora los pedidos propios; no confunde "salió de la lista" con "se movió"; y no avisa cuando el
  estado no cambió aunque `updated_at` sí (una edición de renglones no es un movimiento).
- `rotuloDeCard(pedido, comoFarmacia) → string` y `fechaDeCard(pedido, hoy) → string` — lo que dice
  la card, para el panel y para el aviso. (El plan traía acá un `textoDeAviso` con título y detalle
  propios; el rediseño de D12 lo dejó sin sentido y se borró: el aviso dice lo que dice la card.)
- `AVISA: Record<EstadoVisible, boolean>` — la constante de D9.

### 5.3 Pantalla

- **`src/shell/AvisosDePedidos.tsx`** (nuevo) — la pila. Portaleada a `document.body`: dentro de un
  ancestro con `backdrop-filter`, un `position: fixed` aterriza en cualquier lado (ya nos pasó con
  los popovers). Guarda el estado anterior en un `useRef` y llama a `detectarMovimientos` cuando
  llegan filas nuevas.
- **`src/shell/CajaDePedido.tsx`** (nuevo) — la card, una sola vez, para el panel y para el aviso.
  (El plan original extendía `components/Toast.tsx` con tres props; D12 cambió el diseño y el
  `Toast` quedó **sin tocar**: el aviso ya no es un toast.)
- **`src/shell/NotificationsMenu.tsx` + `notificaciones.ts`** — la cuarta clase (`pedido`), su bloque
  con encabezado, y **el comentario que explica por qué no entra en `count`**. Ese archivo afirma hoy
  que el punto y Pendientes cuentan lo mismo; a partir de acá la afirmación necesita su excepción
  escrita al lado, o el próximo que lea va a "arreglar" el contador.
- **`src/shell/AppShell.tsx`** — la llamada al hook y el host, para que los popups anden en cualquier
  pantalla.

---

## 6. Tests (vitest)

El criterio del repo: se testea lo que falla **en silencio**.

`avisosPedidos.test.ts`

1. Primera carga con tres pedidos → **cero** movimientos (la siembra).
2. Un pedido que pasa de `preparando` a `lista` → un movimiento, una sola vez; en la vuelta siguiente,
   ninguno.
3. Un pedido con `updated_at` nuevo pero el mismo estado → ningún movimiento.
4. Un pedido que desaparece de la lista → ningún movimiento (no es un desenlace).
5. Un pedido propio (`requested_by === uid`) que entra como `solicitada` → ningún movimiento para
   Farmacia si lo cargó ella misma.
6. `estadoVisible`: los seis casos, con `atendida` + dispensación `lista` y `atendida` + `entregada`,
   que son el par que toda esta feature tiene que distinguir.

Lo demás —la geometría de la pila, la cascada, el color— se verifica mirando.

---

## 7. Riesgos y modos de falla

| Riesgo | Mitigación |
|---|---|
| **Ruido.** Tres popups por pedido; diez pedidos en una tarde son treinta. | La tabla `AVISA` de D9: apagar "Preparando" es una línea. Se decide después de la prueba real, no antes. |
| **Una consulta por minuto y por usuario, siempre que la app esté abierta.** | Es chica (sin embeds pesados) y se apaga con la pestaña oculta. Con el tamaño del centro, es despreciable. |
| **La comparación se pierde entre recargas.** Un F5 resiembra y no avisa de lo que pasó recién. | Asumido (D2). La card muestra el estado actual, que es lo que importa para actuar. |
| **Un popup sobre una pantalla que ya lo muestra.** | D11. |
| **RLS que filtra en silencio.** Si la consulta volviera vacía por permisos, la card diría "no hay pedidos" en vez de "no pude ver". | El hook expone su `error` y el bloque lo dice, como hace `AvisosDeEntrega`: *nunca se calla*. Un silencio acá se lee como "no hay nada", que es el falso negativo que el aviso existe para evitar. |

---

## 8. Fuera de alcance (anotado, no olvidado)

- **Bandeja persistida** de movimientos con leído/no leído (tabla nueva + migración). Es lo que haría
  falta para recuperar lo que pasó con la app cerrada.
- **Realtime** (D1). La arquitectura lo deja a un cambio de pieza.
- **Notificaciones del navegador / push** fuera de la pestaña.
- **Pedidos de reposición** (el otro "pedido" de Farmacia). Este plan es sólo dispensaciones.
- **Preferencia por usuario** para apagar los avisos.

---

## 9. Verificación

1. `npm run build` verde (typecheck + vitest + build).
2. En el preview, logueado: pedir una dispensación desde una visita, moverla en el tablero y
   comprobar la card y el popup en cada paso. Ojo con el preview oculto: renderiza lento (4-5 s
   después de un `navigate`) y los relojes van a 1/min, así que el poll de 30 s hay que verificarlo
   con la pestaña visible o bajando el intervalo a mano.
3. Sin datos de prueba en prod: se usa una visita `TEST-*` propia y se borra exactamente esa.
