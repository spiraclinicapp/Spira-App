# Plan — El verde del cronograma pasa a decir «la ventana está abierta»

Pedido del Director, **2026-09-20**, mirando el cronograma de un paciente:

> *"Me parece que el funcionamiento adecuado es que se ponga en verde cuando está dentro de la
> ventana de esa visita. (…) Y lo podríamos hacer un poco más llamativo."*

**Sin migración.** Todo el dato que hace falta —`window_start`, `window_end`, `real_date`— ya viaja
en `v_track_visits` desde la 0013. Es un cambio de front solo.

---

## Qué dice el verde hoy, y por qué no sirve

En el cronograma, el código de la visita (`V18`) se pinta con el acento del módulo cuando esa visita
es **la "actual" del paciente**: `color: cur ? accent : 'var(--spira-ink)'`, con
`cur = v.id === currentId` (`PdFullSchedule.tsx:104` y `:109`). Y `currentId` es, en la ficha,
`statVisit` → `currentVisit(rows)` → **la primera del cronograma sin `real_date`**.

O sea: el verde señala **la próxima pendiente, sin mirar una sola fecha**. En la captura del
Director, la **V18 (W56)** sale verde el 20/09 aunque esté programada para el **15/10**: falta casi
un mes y el color ya dice algo. Un color que está prendido siempre no es una señal — es decoración.

El dato que sí importa operativamente —**¿esta visita se puede hacer hoy?**— está en la base desde
el día uno y hoy se usa **sólo** para el triangulito rojo de "Fuera de ventana" sobre la fecha real,
o sea **después**, cuando ya no se puede hacer nada. Este plan lo pone a trabajar antes.

---

## La regla

Una función pura nueva en `src/lib/visits.ts`, al lado de `fueraDeVentana` (que es su espejo
temporal: una mira el pasado de una visita hecha, la otra el presente de una pendiente):

```ts
/** ¿La ventana de esta visita está ABIERTA hoy? Sólo para pendientes: una visita ya atendida
 *  no "se puede hacer", aunque hoy siga cayendo adentro. */
export function ventanaAbierta(v: TrackVisitRow, today: string): boolean {
  if (v.real_date !== null) return false
  if (!v.window_start || !v.window_end) return false
  return today >= v.window_start && today <= v.window_end
}
```

Comparación de ISO como texto, igual que `fueraDeVentana`: con `YYYY-MM-DD` el orden lexicográfico
**es** el cronológico, y así no entra ningún `Date` —ni su huso— en una regla de calendario.

Tres consecuencias que conviene tener escritas, porque son decisiones y no accidentes:

- **Las visitas sueltas nunca se pintan.** No tienen ventana, y no por omisión: el check
  `patient_visits_kind_shape` (0022) obliga a que `kind <> 'programada'` venga con
  `window_start`/`window_end` en `null`, y a que las programadas los tengan siempre. La guarda por
  `null` no es defensiva, es el caso real de VNP, retest y F+S.
- **Una visita ya atendida nunca se pinta**, aunque hoy caiga en su ventana (pasa seguido: se
  atendió el lunes y la ventana cierra el viernes). El verde dice *"esto se puede hacer"*, y eso ya
  no aplica.
- **Puede haber más de una verde a la vez**, si dos ventanas se solapan. Es fiel al dato: las dos se
  pueden hacer. No se desempata a mano.

---

## El rótulo: `VisitStateLabel` suma «En ventana»

El color solo no alcanza como señal —es lo que pide WCAG 1.4.1, y la razón por la que la pelotita
lleva check y punto adentro en vez de distinguirse sólo por relleno—. La pastilla de la derecha ya
es el lugar donde vive el estado de la fila, así que **no se agrega un elemento: cambia el que está**.

`visitStateLabel` suma `'En ventana'` al union y lo devuelve en el hueco que hoy ocupa `'Agendada'`:

```ts
const d = v.estimated_date ?? v.real_date ?? ''
if (d && d <= today) return 'Por llegar'
if (ventanaAbierta(v, today)) return 'En ventana'
return 'Agendada'
```

**El orden importa y es a propósito.** Con ventana 10/10–20/10 y estimada 15/10:

| Hoy | Pastilla | Fila teñida |
|---|---|---|
| 08/10 | Agendada | no |
| 11/10 | **En ventana** | **sí** |
| 15/10 | Por llegar | **sí** |
| 18/10 | Por llegar | **sí** |
| 22/10 | Por llegar | no |

`'Por llegar'` gana cuando la fecha citada ya llegó porque es **más urgente y más preciso**: el
paciente tiene que venir hoy (o tenía que haber venido). `'En ventana'` cubre el tramo de la ventana
**anterior** a la estimada, que es el que hoy no tiene nombre.

Lo que se gana con ese orden: **`'Agendada'` nunca convive con el teñido**. Siempre que la fila esté
pintada, la pastilla dice una palabra distinta de la que dice sin pintar — o sea, el color siempre
tiene una palabra que lo respalda, sin depender de que el usuario compare dos filas.

El 22/10 diciendo `'Por llegar'` con la ventana vencida es **comportamiento de hoy**, no una
regresión: esa rama ya se comportaba así. Sale del alcance de este plan a propósito (el estado
`ventana_vencida` ya tiene su propio tratamiento en Pendientes).

**De yapa, gratis:** el pie del cronograma pasa a decir «Hoy · antes de V18 · En ventana».
`ubicacionDeHoy` ya llama a `visitStateLabel` para nombrar el estado de la visita que viene.

---

## El tratamiento visual

El Director eligió la variante más fuerte de tres (mock comparativo del 2026-09-20).

### Cronograma — `PdFullSchedule.tsx`

Con `ventanaAbierta(v, today)` verdadero, la fila entera cambia:

| Qué | Valor |
|---|---|
| Fondo de la fila | `accent + '14'` (8 %) |
| Código de la visita | `var(--spira-acc-deep-track)` |
| Pastilla | fondo `accent + '1F'`, texto `var(--spira-acc-deep-track)` |

Ese par —tinte al 8 % + acento **profundo** para el texto— es el que ya usa la app en todos lados
(`shell/settings/primitives.tsx:152`, `ResumenDeAcceso.tsx:231`) y el único medido para AA: el
acento a secas sobre su propio tinte da 4,14:1 y el código va a 14,5px en negrita, donde AA pide
4,5. El profundo llega a 6,37:1. **No se usa `accent` para el texto sobre el tinte.**

Y `--spira-acc-deep-track` es un **token**, no un hex: en tema oscuro se aclara a menta (#9DE6D6),
que es justo lo que un acento oscurecido para fondo claro necesita y lo que un hex crudo no hace.

La concatenación de alfa (`accent + '14'`) es válida acá porque `accent` llega como **hex crudo**
desde `modules/registry.ts` — es lo mismo que ya hace la pastilla de estado dos líneas más abajo
(`estColor + '16'`). Sobre un `var(--…)` sería CSS inválido y el fondo no se dibujaría.

El teñido va en el `style` de la fila, que ya se arma en `rowStyle` — **no en un `onMouseEnter`**, y
no hay borde de color: el realce por estado en esta app es superficie teñida (es la forma que usan
las alertas), y el borde queda reservado para lo que ya lo tiene.

Esto vale **igual en la ficha del paciente y en el desplegable del listado**: es el mismo componente
en los dos lados.

### Línea de tiempo horizontal — `PdVisitFlow.tsx`

Misma regla, tratamiento adaptado: la columna mide 72px, no hay fila que teñir ni pastilla donde
poner la palabra. Ahí es **sólo el código en `var(--spira-acc-deep-track)`**, en lugar del
`cur ? accent` de hoy.

Ojo con un detalle que no se ve leyendo el diff: en esa pantalla `cur` **no** es la próxima
pendiente sino `todayVisit` —hoy cae **justo** en esa visita— (`PdVisitFlow.tsx:28`). Así que acá el
cambio es **ensanchar** el criterio de "hoy exactamente" a "hoy dentro de la ventana", no darlo
vuelta. Sigue siendo cierto todos los días que antes lo era.

Cambia porque si no, el mismo verde diría dos cosas distintas en la misma pantalla: la ficha muestra
la línea de tiempo arriba y el cronograma abajo.

---

## Lo que NO se toca

- **La pelotita y su halo.** `VisitDot isToday={cur}` sigue atado a `currentId`: el halo dice *dónde
  está parado el paciente*, el verde dice *cuál se puede hacer ahora*. Son dos hechos distintos y
  cada uno se queda con su señal; cuando llega el momento, coinciden solas. (Decisión del Director
  sobre la alternativa de sacarlo: sin el halo, con el cronograma desplegado y ninguna ventana
  abierta, se pierde de un vistazo por dónde va el paciente.)
- **El triangulito rojo de "Fuera de ventana"** sobre la fecha real. Otro eje, otro momento.
- **El recorte de ±3 visitas** (`flowWindow`): se sigue centrando en `currentId`. Centrarlo en la
  ventana abierta dejaría el cronograma sin centro los días que no hay ninguna.
- **`dotVisual`, `dotColor` y `VISIT_STATES`.** La ventana no es un estado clínico ni una etapa
  operativa: no entra en ninguno de los dos ejes.

---

## Tests

`ventanaAbierta` es exactamente el tipo de regla que **falla en silencio**: si los bordes quedan al
revés, o si `>=` termina siendo `>`, la pantalla no se ve rota — se pinta la visita equivocada, o
ninguna, y eso sólo se nota comparando contra un calendario. Va con test. El teñido, en cambio, se
verifica mirando.

En `src/lib/ventanaAbierta.test.ts`, con `today` **explícito** (nunca `todayISO()`: el CI corre en
UTC y la máquina en AR):

- primer día de la ventana → `true`
- último día de la ventana → `true`
- un día antes → `false`
- un día después → `false`
- ya atendida (`real_date`), con hoy adentro de la ventana → `false`
- suelta (`window_start`/`window_end` en `null`) → `false`

Y en `src/lib/visitStateLabel.test.ts`, los dos casos que fijan el orden de precedencia:

- ventana abierta y estimada **todavía no llegó** → `'En ventana'`
- ventana abierta y estimada **ya pasó** → `'Por llegar'` (no `'En ventana'`)

El fixture `v()` de ese archivo arma visitas **sin** `window_start`/`window_end`, así que
`ventanaAbierta` da `false` y **los tests existentes siguen pasando sin tocarlos**. Los casos nuevos
pasan la ventana explícita.

---

## Archivos

| Archivo | Qué |
|---|---|
| `src/lib/visits.ts` | `ventanaAbierta()`; `'En ventana'` en el union `VisitStateLabel`; la rama nueva en `visitStateLabel` |
| `src/views/track/PdFullSchedule.tsx` | Fila teñida + código profundo + pastilla verde, por `ventanaAbierta` en vez de `cur` |
| `src/views/track/PdVisitFlow.tsx` | Código por `ventanaAbierta` en vez de `cur` |
| `src/lib/ventanaAbierta.test.ts` | Nuevo |
| `src/lib/visitStateLabel.test.ts` | Dos casos de precedencia |

`VisitStateLabel` **no es clave de ningún `Record`** en toda la app (se usa sólo como tipo de
retorno), así que sumarle un valor no deja ningún mapa incompleto ni ningún acceso sin guarda.

Efecto colateral aceptado y buscado: el `title`/`aria-label` de la pelotita también sale de
`visitStateLabel`, así que una visita con la ventana abierta va a decir "En ventana" al apuntarla.
Es cierto y es útil.

---

## Verificación

`npm run build` verde (typecheck + vitest + build) **y** mirarlo en el navegador: un paciente con
una ventana abierta hoy y otro sin ninguna. Lo que hay que ver es que **la pantalla del Director,
tal como está en la captura, NO tenga ninguna fila verde** — hoy es 20/09 y la V18 está programada
para el 15/10. Que el verde desaparezca es la prueba de que ahora significa algo.
