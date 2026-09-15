import type { CSSProperties } from 'react'
import type { PatientStatus } from '../data/patients'

/* ============================================================================
   Estado del PACIENTE (activo / inactivo), con UN solo lenguaje en toda la app: un punto de color.
   Verde = activo, rojo = inactivo (decisión del Director, 2026-09-14). Al apuntarlo, un `title`
   dice en palabras en qué estado está.

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

const COLOR: Record<PatientStatus, string> = {
  activo: 'var(--spira-good)',
  inactivo: 'var(--spira-acc-deep-danger)',
}
const ETIQUETA: Record<PatientStatus, string> = { activo: 'Activo', inactivo: 'Inactivo' }
/* "En seguimiento" es la palabra que ya usa Inicio para contar a los activos ("23 pacientes en
   seguimiento"); inactivo es el cese clínico (spec de eliminar paciente, 2026-06-19). */
const EXPLICACION: Record<PatientStatus, string> = {
  activo: 'Paciente activo: en seguimiento',
  inactivo: 'Paciente inactivo: ya no está en seguimiento',
}

function Punto({ estado }: { estado: PatientStatus }) {
  return <span aria-hidden="true" style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', background: COLOR[estado], flex: '0 0 auto' }} />
}

export function EstadoPaciente({ estado, forma = 'punto', style }: {
  estado: PatientStatus
  /** `punto`: sólo el punto, en la esquina de la ficha y de la tarjeta del listado.
   *  `etiqueta`: punto + palabra, para una columna "Estado" de tabla. */
  forma?: 'punto' | 'etiqueta'
  /** Para posicionarlo (p. ej. `position: absolute` en la esquina de la tarjeta). */
  style?: CSSProperties
}) {
  if (forma === 'etiqueta') {
    return (
      <span title={EXPLICACION[estado]} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--spira-ink)', whiteSpace: 'nowrap', cursor: 'help', ...style }}>
        <Punto estado={estado} />{ETIQUETA[estado]}
      </span>
    )
  }
  return (
    /* La caja de 16px es la zona que responde al mouse: un punto de 8 es un blanco demasiado chico
       para que el `title` aparezca sin buscarlo. El punto se centra adentro. */
    <span
      role="img"
      aria-label={EXPLICACION[estado]}
      title={EXPLICACION[estado]}
      style={{ display: 'grid', placeItems: 'center', width: 16, height: 16, flex: '0 0 auto', cursor: 'help', ...style }}
    >
      <Punto estado={estado} />
    </span>
  )
}
