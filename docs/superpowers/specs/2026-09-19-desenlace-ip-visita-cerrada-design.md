# El desenlace del IP en una visita cerrada

**Fecha:** 2026-09-19 · **Estado:** diseño aprobado por el Director · **Origen:** pendiente del
2026-09-16 (bitácora, §10.2; handoff del 16, punto 1): una visita cerrada con IP previsto y nunca
entregado dice «Sin constancia cargada.», que describe un papel que falta y no qué pasó con el IP.

## Lo que se vio en prod (2026-09-19)

Con la sesión de gerencia del Director, sólo lectura: **452 visitas realizadas, 405 con IP en el
cronograma**. En pantalla aparecen sólo tres situaciones:

| Caso real | Procedimientos | «Producto en investigación» |
|---|---|---|
| **403 visitas de antes de la 0119**, cuando Spira no registraba el IP (`lleva_ip` vacío). Ej.: Calderon V4, LTS17231, 02/09 | No hay fila del IP | «Sin constancia cargada.» |
| **1 con el IP sin pedir**: Fontana Toledo V1, LTS17231, realizada el 17/09 | «Sin pedir. Se pide desde Dispensación.» + «No se entrega acá» | «Sin constancia cargada.» |
| **1 entregada**: Azcurra V3, 222714, 16/09 | «Entregado por Spira Clinic el 16 Sep 2026 10:53 · 1 kit.» | La constancia y el pedido, con un aviso ámbar arriba: «Ya se entregó producto en investigación hace 3 días · … en esta visita. Revisá que no sea una entrega repetida.» |

«No corresponde» y «Entregado en otra visita» tienen cero casos en prod.

Los tres problemas:

1. **«Sin constancia cargada.» nombra dos cosas distintas.** En las 403 visitas históricas nadie sabe
   qué pasó: el dato vivía en papel. En la de Fontana el IP no se entregó, y es un pendiente real.
   Hoy las dos se leen igual, y ninguna dice qué pasó.
2. **La misma visita lo dice de dos maneras.** La fila de Procedimientos dice «Sin pedir» y la sección
   dice «Sin constancia cargada.». Además, «Se pide desde Dispensación» manda a una sección sin nada que
   tocar: en una visita cerrada, la única puerta es «Registrar entrega», en la subsección de medicación
   **concomitante**.
3. **La entrega de Azcurra se avisa a sí misma.** El aviso de «entrega repetida» existe para frenar
   un segundo pedido. En una visita ya entregada, advierte sobre su propia entrega.

## Decisiones del Director (2026-09-19, no re-discutir)

- **E1 · Una sola voz.** La sección del IP y la fila de Procedimientos empiezan con **la misma frase**,
  que sale del estado de `v_visit_ip_status` (0119). La fila le agrega su indicación.
- **E2 · Las históricas lo dicen con honestidad, y sin acción.** Una línea gris: «Visita anterior al
  registro del IP en Spira.». No genera alertas ni pendientes. Se descartaron ocultar la sección, que
  rompe la D18 (la sección existe siempre), y dejar «Sin constancia cargada.» para ellas.
- **E3 · La sección tiene su propia puerta.** Con el IP sin entregar, la sección trae «Registrar la
  entrega», que abre **el mismo** modo corrección que el botón de concomitante. No suma lógica nueva.
- **E4 · El aviso de entrega repetida no se muestra** cuando la sección ya muestra la entrega o un cierre.
- **E5 · Todo en el front, sin SQL.** Sumar `lleva_ip` a `v_track_visits` sería la `0135`, y no se
  puede pushear hasta que existan la `0133` y la `0134` de Reposición (`check-migraciones` exige
  números contiguos). La marca se lee aparte, con un hook chico.

## Diseño

### 1 · La frase del desenlace (`src/views/track/ipEstado.ts`)

Función nueva y pura, **`desenlaceIp(row, terminada)`**. `terminada` quiere decir que la visita tiene
fin de atención (`ready_at`), la misma señal con la que la tarjeta de Dispensación decide si está
cerrada (`vistaVisitaCerrada`).

| Estado | Visita terminada | Visita sin terminar |
|---|---|---|
| `sin_pedir` | «Sin entregar: no se pidió a Farmacia.» | «Todavía no se pidió a Farmacia.» |
| `rechazado` | «Sin entregar: Farmacia rechazó el pedido.» | «Farmacia rechazó el pedido.» |
| `pedido` | «Pedido a Farmacia el 17 Sep 2026 17:27, sin entregar todavía.» (sin fecha: «Pedido a Farmacia, sin entregar todavía.») | igual |
| `entregado` | «Entregado por X el 16 Sep 2026 10:53 · 1 kit.» (como hoy) | igual |
| `entregado_en_otra_visita` | como hoy | igual |
| `no_corresponde` | como hoy | igual |

Las visitas sin terminar tienen su propia frase para los dos primeros estados. Decir «sin entregar»
de una visita que todavía no ocurrió suena a problema, y la base tiene 479 así (las próximas visitas
del cronograma).

**`detalleIp(row, terminada)`**, la segunda línea de la fila de Procedimientos, pasa a ser
`desenlaceIp` más una indicación:

| Estado | Indicación |
|---|---|
| `sin_pedir`, `rechazado` | terminada: «Se carga desde Dispensación.» · sin terminar: «Se pide desde Dispensación.» |
| `pedido` | «Se marca cuando Farmacia confirma la entrega.» |
| los demás | ninguna |

`motivoAlertaIp` (la alerta «IP sin entregar») no cambia.

### 2 · Qué muestra la sección (`src/views/pharma/seccionIpModel.ts`)

`SituacionIp` suma dos entradas:

- `estadoIp: EstadoIp | null`: el `estado` de `v_visit_ip_status`, o `null` si la visita no tiene
  fila en la vista;
- `historica: boolean`: la visita se fechó antes de la 0119 (ver §3).

El contenido `sin_constancia` desaparece y se parte en tres. Cambia sólo la rama de la visita prevista
en lectura; el resto del orden sigue igual:

```
pendiente → en_curso → entregado → cargando → cierre →
  prevista y se puede cargar (ni readOnly ni pedido abierto)  → adjuntar
  prevista, en lectura, con estado en la vista                → desenlace     (NUEVO)
  prevista, en lectura, sin estado y histórica                → historica     (NUEVO)
  prevista, en lectura, sin estado y no histórica             → sin_registro  (NUEVO)
→ no_prevista
```

Qué dibuja `SeccionIp` en cada caso nuevo:

- **`desenlace`:** `desenlaceIp(row, terminada)` en una línea. Si corresponde, al lado va el botón
  «Registrar la entrega» (§4), con el mismo armado de renglón que `no_prevista`: texto con base de
  200px y el botón que baja en una tarjeta angosta.
- **`historica`:** «Visita anterior al registro del IP en Spira.», gris y sin acción.
- **`sin_registro`:** «Sin entrega registrada.». Es el caso raro de una visita fechada después de la
  0119 con `lleva_ip` en falso, cuyo cronograma se tildó más tarde. Además es el resguardo si la
  lectura del §3 no trae la fila.

La prop `cierre` de `SeccionIp` se renombra a `desenlace` y pasa a alimentar también la rama
`desenlace`, no sólo los dos cierres. Para éstos sigue siendo `desenlaceIp`, en vez de `detalleIp`, y la
frase es la misma que hoy, así que en pantalla no cambia nada. `SeccionIp` suma además
`onRegistrarEntrega`, la puerta del §4.

**Queda como está** el «Sin constancia cargada.» de la rama `en_curso` en lectura: un pedido abierto
que acepta la constancia y todavía no la tiene. Ahí sí falta un papel.

### 3 · La marca histórica (`src/data/visitIp.ts`)

Un hook nuevo, **`useMarcaIp(visitId)`**, lee de `patient_visits` sólo `lleva_ip`, `real_date` y
`attended_at` de esa visita, y devuelve esos tres campos (`MarcaIpRow`), o `null` si no hay fila:

- `historica` = la fila existe, la visita está fechada (`real_date` o `attended_at`) y `lleva_ip` es
  `null`. Es el mismo corte que usa la 0119: «sellada» quiere decir «fechada después de la 0119», sin
  fecha literal.
- **Si la lectura vuelve con cero filas** (la RLS filtra en silencio), no es histórica y la sección
  cae en `sin_registro`. Nunca se afirma «anterior al registro» sin haber visto la marca.
- **Mientras carga, o si falla, cuenta como `cargando`**, igual que las otras dos lecturas de la
  sección (el comentario de `contenidoIp` en el panel explica por qué): así no parpadea «Sin entrega
  registrada.» antes de saber.

Coordinación puede leer `patient_visits`: la policy «ver visitas de mis protocolos» (0006) lo
permite, y el front ya lo hace en `visitEvents.ts`. Farmacia no puede, pero el panel sólo vive en el
detalle de visita de Coordinación (`VisitDetail`).

### 4 · La puerta

Una función pura, **`ofrecerRegistrarIp(contenido, estadoIp)`**, en `seccionIpModel.ts`: da verdadero
sólo con `desenlace` y un estado `sin_pedir` o `rechazado`. Para `pedido` no hay puerta: hay un pedido
vivo y lo resuelve Farmacia, el mismo criterio que `accionesIp`.

En el panel, el botón aparece si además se cumple **la misma condición** que el de concomitante:
permiso para cargar, visita cerrada, sin estar corrigiendo y con la lectura de pedidos ya de vuelta.
Al tocarlo hace **lo mismo**: `setCorrigiendo(true)`, `setSoliciting(true)` y limpia el error. Con el
modo corrección prendido, la sección deja de estar en lectura y pasa a `adjuntar`, así que la puerta
desaparece sola. Rótulo: «Registrar la entrega»; `aria-label`: «Registrar la entrega del producto en
investigación».

### 5 · El aviso (`seccionIpModel.ts`)

**`mostrarAvisoIp(contenido, estadoIp)`** da falso con `entregado`, con `cierre` y con `desenlace` cuando
el estado es `entregado`. En los demás casos da verdadero. `SeccionIp` dibuja `excepcion.aviso` sólo si
da verdadero.

No mira sólo el estado: con una entrega hecha y el modo corrección abierto, si se elige una constancia
nueva el contenido pasa a `pendiente`, y ahí el aviso vuelve a hacer falta. Es justo una segunda
entrega.

### 6 · La fila de Procedimientos

`VisitProcedures` recibe una prop nueva, `terminada`, que `VisitDetail` le pasa como
`visit.ready_at !== null`, y se la da a `IpDeliveryRow`, que usa `detalleIp(row, terminada)`. El resto
de la fila (tilde, contador, «No se entrega acá», «Deshacer») no cambia.

## Cómo queda en pantalla

| Caso | Sección del IP | Fila de Procedimientos |
|---|---|---|
| Fontana V1 (terminada, sin pedir) | «Sin entregar: no se pidió a Farmacia.» **[Registrar la entrega]** | «Sin entregar: no se pidió a Farmacia. Se carga desde Dispensación.» + «No se entrega acá» |
| Calderon V4 (histórica) | «Visita anterior al registro del IP en Spira.» | sin fila, como hoy |
| Azcurra V3 (entregada) | la constancia y el pedido, **sin el aviso** | como hoy |
| Una próxima visita, en la ficha de alguien sin permiso de carga | «Todavía no se pidió a Farmacia.» | «Todavía no se pidió a Farmacia. Se pide desde Dispensación.» |

## Qué se testea

Lo que falla en silencio (criterio de `src/views/pharma/dispensaciones/estados.test.ts`):

- `desenlaceIp`: un caso por estado, con la visita terminada y sin terminar, y `pedido` con fecha y sin
  fecha.
- `detalleIp` **empieza con** `desenlaceIp` para cada estado. Es el candado de «una sola voz»: si
  alguien reescribe una de las dos, se nota.
- `contenidoSeccionIp`: las tres ramas nuevas; que `cierre` y `entregado` les ganan a las tres; que con
  permiso de carga una prevista sigue en `adjuntar`; y que `historica` sin `prevista` sigue en
  `no_prevista`.
- `ofrecerRegistrarIp`: sí con `sin_pedir` y `rechazado`; no con `pedido` ni fuera de `desenlace`.
- `mostrarAvisoIp`: no con `entregado`, `cierre` ni `desenlace`+`entregado`; sí con `pendiente` en una
  visita ya entregada.
- Actualizar los tests que hoy esperan `sin_constancia` y el texto viejo de `detalleIp`.

Lo visible (el botón, el renglón, el gris) se verifica en el preview con las tres visitas reales de
arriba, **sin cargar nada**: el botón se toca para ver que abre el modo corrección, y se cancela.

## Orden de despliegue

Sin SQL: una sola PR, que despliega Vercel. No depende de ninguna migración pendiente.

## Fuera de alcance

- Registrar a posteriori el IP de las 403 visitas históricas.
- La constancia de Azcurra V3 se llama «#25 - UMBRIEL - V18.pdf», y puede ser el papel de otro estudio.
  Es un dato para que el Director lo mire, no un cambio de código.
- Sumar `lleva_ip` a `v_track_visits`. Si algún día hace falta en más lugares, va en una migración
  propia.
- La alerta «IP sin entregar» y el panel de Pendientes.
