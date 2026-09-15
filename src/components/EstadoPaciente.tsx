import type { CSSProperties } from 'react'
import { Badge } from './Badge'
import type { PatientStatus } from '../data/patients'

/* ============================================================================
   Estado del PACIENTE (activo / inactivo), con UN solo lenguaje en toda la app.

   Hasta el 2026-09-14 había tres: la ficha armaba su badge a mano, la tabla de Farmacia tenía una
   píldora propia y la fila del protocolo no lo mostraba. Y las dos que existían estaban rotas de
   maneras que no se ven leyendo el código:
     · la ficha concatenaba alfa hex a un token (`var(--spira-good)` + `'14'`), que es CSS inválido:
       el navegador descartaba fondo y borde en silencio y quedaba el texto flotando con el padding
       de una caja que no se dibujaba (ver el gotcha "concatenar hex sobre un token");
     · la tabla escribía el texto en `--spira-good` sobre su propio tinte: 3,58:1, debajo del 4,5:1
       que pide AA. `Badge` ya resuelve ese par con `--spira-acc-deep-good`.

   EL PUNTO ES LA SEÑA, Y NO DEPENDE SÓLO DEL COLOR: activo es un punto LLENO verde; inactivo, un
   ANILLO gris. La forma distingue los dos estados aunque no se vea el color (daltonismo, pantalla
   con poco contraste, impresión en blanco y negro). Es la convención de presencia que cualquiera ya
   conoce —lleno "está", hueco "no está"—, así que se lee sin leyenda.

   Dos formas, según cuánto lugar y cuánto protagonismo le toca:
     · `pildora` — la ficha y la columna "Estado" de una tabla: punto + palabra.
     · `punto`   — el listado de pacientes del protocolo, delante del nombre. Discreto a propósito: la
       columna de identidad mide ~130-180px en la notebook de referencia y el IVRS ya se lleva ~95,
       así que un "● Inactivo" con texto no entraba sin comerle el nombre. Lleva `title` para quien
       apunta y `role="img"` + `aria-label` para el lector de pantalla, y es el MISMO punto de la
       píldora de la ficha: se aprende en un lado y se reconoce en el otro.

   Sin bordes laterales de color, a pedido del Director: el estado es un dato del paciente, no una
   franja que tiña la tarjeta entera.
   ============================================================================ */

const ETIQUETA: Record<PatientStatus, string> = { activo: 'Activo', inactivo: 'Inactivo' }

/** El punto solo. `size` 8 en el listado (convive con texto de 14px), 7 dentro de la píldora (12px). */
function Punto({ estado, size }: { estado: PatientStatus; size: number }) {
  const s: CSSProperties = estado === 'activo'
    ? { background: 'var(--spira-good)' }
    /* `faint` y no `muted` para el anillo: es un gráfico, no texto (3,46:1 sobre blanco, arriba del
       3:1 que pide WCAG 1.4.11 para lo no textual). Lo que se LEE —la palabra— sí va en `muted`. */
    : { border: '1.5px solid var(--spira-faint)', background: 'transparent' }
  return <span aria-hidden="true" style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', flex: '0 0 auto', ...s }} />
}

export function EstadoPaciente({ estado, forma }: { estado: PatientStatus; forma: 'pildora' | 'punto' }) {
  if (forma === 'punto') {
    const nombre = estado === 'activo' ? 'Paciente activo' : 'Paciente inactivo'
    return (
      /* `verticalAlign: middle` y no un flex: vive ADENTRO del renglón del nombre, que corta con
         `text-overflow: ellipsis`, y eso sólo funciona sobre un bloque con contenido en línea — si el
         renglón pasara a ser flex para alinear el punto, el nombre largo se cortaría en seco, sin
         puntos suspensivos. `top: -1px` compensa que `middle` alinea con la mitad de la x y no con
         la de las mayúsculas: sin él el punto queda apenas caído respecto del nombre. */
      <span
        role="img"
        aria-label={nombre}
        title={nombre}
        style={{ display: 'inline-block', verticalAlign: 'middle', position: 'relative', top: -1, marginRight: 8, lineHeight: 0 }}
      >
        <Punto estado={estado} size={8} />
      </span>
    )
  }
  /* Inactivo lleva borde `line`: la píldora neutra sin él es `surface` sobre la card blanca, y
     prácticamente no se ve el contorno — quedaría la palabra suelta, que es justo lo que había.
     Activo lleva el MISMO borde pero transparente: sin él medía 21px contra los 23 de la inactiva, y
     en la tabla dos filas vecinas quedaban con la píldora a distinta altura. */
  return estado === 'activo'
    ? <Badge tone="good" border="1px solid transparent"><Punto estado="activo" size={7} />{ETIQUETA.activo}</Badge>
    : <Badge tone="neutral" border="1px solid var(--spira-line)"><Punto estado="inactivo" size={7} />{ETIQUETA.inactivo}</Badge>
}
