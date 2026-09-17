import type { CSSProperties } from 'react'
import type { EnrollmentStatus } from '../lib/inscripcion'
import { estaAbierta, ETIQUETA_ESTADO, PALABRA_ESTADO } from '../lib/inscripcion'

/* ============================================================================
   Estado de la INSCRIPCIÓN AL ESTUDIO EN CONTEXTO, con UN solo lenguaje en toda la app: verde = la
   participación sigue en curso, rojo = está cerrada (decisión del Director, 2026-09-14 para el
   color; 2026-09-16 para que lo que pinte sea la inscripción y no la persona).

   POR QUÉ LA INSCRIPCIÓN Y NO LA PERSONA: hasta la 0127 esto leía `patients.status`, que es una sola
   columna para todos los estudios. El 2026-09-16, dar de baja a tres pacientes en ACT18301 los
   mostró dados de baja también en LTS17231 — que es la extensión de ACT y tiene a las mismas
   personas inscriptas. El estado de una persona en un estudio no dice nada de su estado en otro.

   EL COLOR ES BINARIO A PROPÓSITO. Se evaluó un tercer color para distinguir «completó» de «se
   discontinuó» y el Director prefirió no sumar un color a una lista donde el color ya significa
   otras cosas. La diferencia se dice en PALABRAS: pintar de rojo a alguien que completó el estudio
   sería raro, pero decirlo mal sería peor, y el texto no lo dice mal.

   HISTORIA, porque ya hubo tres intentos:
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
     · El punto suelto arriba a la derecha (2026-09-14) arregló el layout pero dejó el dato
       ESCONDIDO: con 47 de 48 pacientes activos, un punto verde repetido 47 veces no informa, y el
       rojo del inactivo se lee como "hay un problema acá" antes de que se sepa qué dice. Por eso
       ahora, donde el estado tiene su propio rincón, va la BANDERA: mismo lugar y mismo dato, pero
       con la palabra escrita (handoff «Bandera de estado y enlace Resumen», 2026-09-17).

   LAS TRES FORMAS, y cuándo va cada una:
     · `bandera` — esquina superior derecha de una tarjeta o de una ficha: palabra + punto sobre un
       tinte del color semántico, apoyada en el radio de esa esquina. Es la forma por defecto.
     · `etiqueta` — punto + palabra en línea, para una columna "Estado" de tabla (Farmacia), donde
       la tabla ya reserva el ancho y no hay ninguna esquina en la que apoyarse.
     · `punto` — sólo el punto, con la palabra en el `title`. Queda para los lugares apretados.

   EL COLOR NO ES EL ÚNICO CANAL: la bandera y la etiqueta escriben la palabra, y en las tres formas
   el texto largo vive en el `title` (mouse) y en el `aria-label` (lector de pantalla). La bandera
   además lleva su punto adentro, así que la forma sigue siendo el segundo canal que pide WCAG 1.4.1.

   LOS TOKENS: verde `--spira-good` (4,02:1 sobre la card oscura, arriba del 3:1 que pide WCAG 1.4.11
   para lo no textual). Rojo `--spira-acc-deep-danger` y NO `--spira-danger`: en claro valen lo mismo,
   pero en oscuro `--spira-danger` se pierde y el acento profundo se aclara a salmón. Es el mismo rojo
   del punto de "rechazado" en el historial de dispensación, que fue el que estrenó ese token.
   La TINTA de la bandera es esa misma familia `--spira-acc-deep-*`, que existe justamente para
   TEXTO sobre un tinte del mismo color; los tintes de fondo van en la regla de la bandera y no en un
   token —el porqué, en `tokens.css`, donde vive la regla—.

   Sin bordes laterales de color, a pedido del Director: el estado es un dato del paciente, no una
   franja que tiña la tarjeta entera.
   ============================================================================ */

const VERDE = 'var(--spira-good)'
const ROJO = 'var(--spira-acc-deep-danger)'

function Punto({ color }: { color: string }) {
  return <span aria-hidden="true" style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', background: color, flex: '0 0 auto' }} />
}

type Forma = 'punto' | 'etiqueta' | 'bandera'

/** El color, la palabra y la forma, ya resueltos. Las dos variantes de abajo sólo deciden qué
 *  pregunta se contesta —la inscripción o la persona— y con qué palabras. */
function Semaforo({ abierto, palabra, corta, forma, style }: {
  abierto: boolean
  /** El texto largo y explicativo: va al `title` y al `aria-label` en las tres formas. */
  palabra: string
  /** El mismo dato en una palabra: es lo que la bandera escribe. */
  corta: string
  forma: Forma
  style?: CSSProperties
}) {
  const color = abierto ? VERDE : ROJO
  if (forma === 'bandera') {
    /* La bandera se ubica sola: el `position: absolute; top: 0; right: 0` vive en la clase, así que
       quien la usa sólo tiene que darle un ancestro posicionado. Es a propósito —se apoya SIEMPRE en
       la esquina de una superficie con radio— y evita repetir el mismo `style` en cada pantalla; lo
       único que cambia de una a otra es ese radio, que sí se pasa por `style`. */
    return (
      <span
        className={abierto ? 'spira-estado-bandera' : 'spira-estado-bandera spira-estado-bandera--off'}
        role="img"
        aria-label={palabra}
        title={palabra}
        style={style}
      >
        <span aria-hidden="true" className="spira-estado-bandera__punto" />{corta}
      </span>
    )
  }
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
export function EstadoPaciente({ estado, forma = 'bandera', style }: {
  /** Estado de la inscripción AL ESTUDIO EN CONTEXTO, no de la persona. `null` = sin dato. */
  estado: EnrollmentStatus | null
  forma?: Forma
  /** Para ajustarlo al contenedor (en la bandera, el radio de la esquina en la que se apoya). */
  style?: CSSProperties
}) {
  /* Sin dato se lee como abierta, igual que en `estaAbierta`: el `null` llega cuando la consulta no
     trajo la columna, y ahí «Activo» es la lectura honesta — la misma que ya daba el punto verde. */
  const conDato = estado ?? 'activo'
  return (
    <Semaforo
      abierto={estaAbierta(estado)}
      palabra={ETIQUETA_ESTADO[conDato]}
      corta={PALABRA_ESTADO[conDato]}
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
 * vino a cerrar. Acá la palabra corta SÍ es binaria —«Activo»/«Inactivo»—: la persona no tiene los
 * cuatro estados de una inscripción, tiene participaciones abiertas o no tiene ninguna.
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
      corta={activa ? 'Activo' : 'Inactivo'}
      forma={forma}
      style={style}
    />
  )
}
