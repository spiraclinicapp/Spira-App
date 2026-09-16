import type { CSSProperties } from 'react'
import type { EnrollmentStatus } from '../lib/inscripcion'
import { estaAbierta, ETIQUETA_ESTADO } from '../lib/inscripcion'

/* ============================================================================
   Estado de la INSCRIPCIÓN AL ESTUDIO EN CONTEXTO, con UN solo lenguaje en toda la app: un punto de
   color. Verde = la participación sigue en curso, rojo = está cerrada (decisión del Director,
   2026-09-14 para el punto; 2026-09-16 para que lo que pinte sea la inscripción). Al apuntarlo, un
   `title` dice en palabras cuál de los CUATRO estados es.

   POR QUÉ LA INSCRIPCIÓN Y NO LA PERSONA: hasta la 0127 esto leía `patients.status`, que es una sola
   columna para todos los estudios. El 2026-09-16, dar de baja a tres pacientes en ACT18301 los
   mostró dados de baja también en LTS17231 — que es la extensión de ACT y tiene a las mismas
   personas inscriptas. El estado de una persona en un estudio no dice nada de su estado en otro.

   BINARIO A PROPÓSITO. Se evaluó un tercer color para distinguir «completó» de «se discontinuó» y el
   Director prefirió no sumar un color a una lista donde el color ya significa otras cosas. La
   diferencia igual se dice, en palabras, en el `title` y en el `aria-label`: pintar de rojo a alguien
   que completó el estudio sería raro, pero decirlo mal sería peor, y el texto no lo dice mal.

   HISTORIA, porque ya hubo dos intentos:
     · Hasta la PR #183 había tres representaciones —la ficha con un badge armado a mano con
       `var(--spira-good)` + `'14'` (CSS inválido: fondo y borde no se dibujaban), la tabla de
       Farmacia con una píldora en 3,58:1, y el listado del protocolo sin nada—.
     · La #183 las unificó con un punto delante del nombre en el listado y una píldora debajo del
       nombre en la ficha. El punto adentro del renglón del nombre ROMPIÓ el listado: el nombre es un
       `<button>` (`PatientLink`, `inline-block`), o sea un elemento en línea ATÓMICO, y
       `text-overflow` no puede cortarlo por la mitad — si no entra entero, lo esconde completo y
       deja sólo "…". Reproducido: con visitas, la columna de identidad topa en 133px; "Susana
       Rodriguez" mide 122 y entraba sola, pero punto (16) + nombre (122) = 138 y desaparecía. En el
       banco de pruebas de la #183 no se vio porque las filas no tenían visitas, y sin tracker la
       columna tenía lugar de sobra (ver el gotcha "un button atómico rompe el ellipsis"). Y la
       píldora abajo del nombre no le gustó al Director.
   Por eso ahora el punto va ARRIBA A LA DERECHA, fuera del flujo del texto, en las dos pantallas.

   EL COLOR NO ES EL ÚNICO CANAL, pero casi: la palabra vive en el `title` (mouse) y en el
   `aria-label` (lector de pantalla). En la tabla de Farmacia, que tiene columna "Estado", va además
   la palabra visible (`forma="etiqueta"`).

   LOS TOKENS: verde `--spira-good` (4,02:1 sobre la card oscura, arriba del 3:1 que pide WCAG 1.4.11
   para lo no textual). Rojo `--spira-acc-deep-danger` y NO `--spira-danger`: en claro valen lo mismo,
   pero en oscuro `--spira-danger` se pierde y el acento profundo se aclara a salmón. Es el mismo rojo
   del punto de "rechazado" en el historial de dispensación, que fue el que estrenó ese token.

   Sin bordes laterales de color, a pedido del Director: el estado es un dato del paciente, no una
   franja que tiña la tarjeta entera.
   ============================================================================ */

const VERDE = 'var(--spira-good)'
const ROJO = 'var(--spira-acc-deep-danger)'

function Punto({ color }: { color: string }) {
  return <span aria-hidden="true" style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', background: color, flex: '0 0 auto' }} />
}

/** `punto`: sólo el punto, en la esquina de la ficha y de la tarjeta del listado.
 *  `etiqueta`: punto + palabra, para una columna "Estado" de tabla. */
type Forma = 'punto' | 'etiqueta'

/** El punto, ya resuelto. Las dos variantes de abajo sólo deciden el color y la palabra. */
function Semaforo({ abierto, palabra, forma, style }: {
  abierto: boolean
  palabra: string
  forma: Forma
  style?: CSSProperties
}) {
  const color = abierto ? VERDE : ROJO
  if (forma === 'etiqueta') {
    return (
      <span title={palabra} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--spira-ink)', whiteSpace: 'nowrap', cursor: 'help', ...style }}>
        <Punto color={color} />{palabra}
      </span>
    )
  }
  return (
    /* La caja de 16px es la zona que responde al mouse: un punto de 8 es un blanco demasiado chico
       para que el `title` aparezca sin buscarlo. El punto se centra adentro. */
    <span
      role="img"
      aria-label={palabra}
      title={palabra}
      style={{ display: 'grid', placeItems: 'center', width: 16, height: 16, flex: '0 0 auto', cursor: 'help', ...style }}
    >
      <Punto color={color} />
    </span>
  )
}

/**
 * Estado del paciente DENTRO DE UN ESTUDIO. Es el que va en la ficha y en el listado de un
 * protocolo, donde siempre hay un estudio en contexto.
 */
export function EstadoPaciente({ estado, forma = 'punto', style }: {
  /** Estado de la inscripción AL ESTUDIO EN CONTEXTO, no de la persona. `null` = sin dato. */
  estado: EnrollmentStatus | null
  forma?: Forma
  /** Para posicionarlo (p. ej. `position: absolute` en la esquina de la tarjeta). */
  style?: CSSProperties
}) {
  return (
    <Semaforo
      abierto={estaAbierta(estado)}
      // Sin dato se asume abierta, igual que `estaAbierta`.
      palabra={estado ? ETIQUETA_ESTADO[estado] : ETIQUETA_ESTADO.activo}
      forma={forma}
      style={style}
    />
  )
}

/**
 * Estado de la PERSONA, para las listas CRUZA-ESTUDIOS (Todos los pacientes), donde no hay un
 * estudio en contexto y preguntar «¿está activo?» sólo tiene una respuesta honesta: si le queda
 * alguna participación abierta en algún lado. Se calcula con `personaActiva`.
 *
 * Es un componente aparte y no un prop más de `EstadoPaciente` para que sea imposible mezclarlos:
 * son la misma pinta y dos preguntas distintas, y confundirlas es exactamente el bug que la 0127
 * vino a cerrar.
 */
export function EstadoPersona({ activa, forma = 'punto', style }: {
  activa: boolean
  forma?: Forma
  style?: CSSProperties
}) {
  return (
    <Semaforo
      abierto={activa}
      palabra={activa ? 'En seguimiento' : 'Sin estudios activos'}
      forma={forma}
      style={style}
    />
  )
}
