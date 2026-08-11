import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'

/**
 * Card con título e ícono, para las secciones del detalle de visita y del popup de atención médica.
 *
 * `aside` es el hueco a la derecha del rótulo, para el dato que RESUME la sección (el "1/1
 * realizados" de Procedimientos). Va acá y no en el cuerpo: puesto abajo abría una línea propia y
 * empujaba el contenido, que es exactamente el desfasaje que reportó el Director (2026-08-09).
 */
export function Panel({ title, icon, accent, aside, highlight = false, tint, children }: {
  title: string
  icon: IconName
  accent: string
  aside?: ReactNode
  /**
   * Realce de la tarjeta (Dispensación). **Banda sólida**: el acento pleno en la franja del rótulo y
   * el cuerpo apenas teñido.
   *
   * Es la tercera y última forma que tomó, y las dos anteriores explican por qué esta funciona. Al
   * 6% de tinte (2026-08-09) la tarjeta se leía igual que las neutras de al lado: teñir por debajo
   * del umbral en el que se nota es lo mismo que no teñir. Al 14% ya se distinguía, pero el color
   * seguía repartido parejo por toda la superficie, que es la manera cara de resaltar — cuanto más
   * sube el tinte, menos contraste les queda a las cajas blancas de adentro, que son las que de
   * verdad se leen.
   *
   * La banda pone el color pleno **donde se mira primero** —el rótulo— y le devuelve el cuerpo casi
   * limpio al contenido. Aparte del color, suma una señal que el tinte no tenía: un borde superior
   * con forma, que separa la sección de sus vecinas sin gastar un borde de acento alrededor (que
   * está prohibido en este sistema).
   */
  highlight?: boolean
  /**
   * Los dos colores del realce, como tokens con **un valor por tema**. Obligatorio si `highlight`.
   *
   * No se derivan del `accent` con un alfa: el acento a secas como fondo de banda deja el rótulo en
   * 4,33:1 (AA pide 4,5 a 14px bold), y el tinte del cuerpo se da vuelta en oscuro, donde teñir con
   * el petróleo deja la tarjeta más apagada que las neutras de al lado.
   */
  tint?: { band: string; body: string }
  children: ReactNode
}) {
  // Sin realce: la tarjeta neutra de siempre, intacta (Ruta, Paciente, Procedimientos, Comentarios).
  if (!highlight) {
    return (
      <div style={{ ...card, padding: '14px 16px', background: 'var(--spira-surface)' }}>
        <div style={{ ...head, marginBottom: 12 }}>
          <Icon name={icon} size={15} color={accent} />
          <Titulo>{title}</Titulo>
          {aside && <Aside>{aside}</Aside>}
        </div>
        {children}
      </div>
    )
  }

  return (
    // `overflow: hidden` para que la banda respete el redondeo de la tarjeta: sin eso las esquinas
    // superiores del color quedan en punta adentro del borde redondeado.
    <div style={{ ...card, overflow: 'hidden', background: tint?.body ?? `${accent}24` }}>
      <div style={{ ...head, gap: 9, padding: '11px 14px', background: tint?.band ?? accent }}>
        {/* Cuadro del ícono en blanco translúcido y no en un token propio: sobre el acento pleno
            tiene que aclarar, y el blanco al 18% da el mismo resultado con CUALQUIER acento (el de
            Track hoy, el de un protocolo mañana) sin pedir una variante de token por cada uno. */}
        <span style={chip}>
          <Icon name={icon} size={15} color="var(--spira-on-accent)" />
        </span>
        <Titulo color="var(--spira-on-accent)">{title}</Titulo>
        {aside && <Aside>{aside}</Aside>}
      </div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </div>
  )
}

function Titulo({ color, children }: { color?: string; children: ReactNode }) {
  return (
    <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14, color }}>
      {children}
    </span>
  )
}

function Aside({ children }: { children: ReactNode }) {
  return (
    <span style={{ marginLeft: 'auto', flex: '0 0 auto', display: 'inline-flex', alignItems: 'center' }}>
      {children}
    </span>
  )
}

const card: CSSProperties = { border: '1px solid var(--spira-line)', borderRadius: 14 }

const head: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

const chip: CSSProperties = {
  flex: '0 0 auto', width: 26, height: 26, borderRadius: 8,
  background: 'rgba(255, 255, 255, 0.18)', display: 'grid', placeItems: 'center',
}
