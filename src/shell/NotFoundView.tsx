import type { MouseEvent as ReactMouseEvent } from 'react'
import { Icon } from '../components/Icon'
import { Vilano } from '../components/Vilano'
import { HOME, homeUrl } from '../lib/router'
import { pushUrl } from '../lib/useUrlState'

/**
 * Pantalla serena para una URL que no lleva a ninguna parte.
 *
 * UN SOLO MENSAJE PARA "no existe" Y "no tenés acceso" a un recurso, a propósito: distinguirlos
 * convierte la URL en un oráculo — probando códigos de protocolo se averigua cuáles existen aunque la
 * RLS no los deje ver. Los MÓDULOS sí se distinguen (`motivo='acceso'`), porque el candado del riel
 * ya dice públicamente que ese módulo existe y no es tuyo: ahí ocultarlo no protege nada y confunde.
 *
 * `motivo='proximamente'` es un tercer caso, aparte de 'acceso': para Lab y Contable (`proximamente`
 * en MODULES) el consejo de 'acceso' —"pedile acceso a quien coordina tu módulo"— es un trámite
 * imposible, porque nadie puede dar acceso a algo que todavía no está construido. El riel, para esos
 * mismos módulos, ya dice "· próximamente"; este mensaje tiene que decir la misma verdad.
 */
export function NotFoundView({ motivo }: { motivo: 'ruta' | 'acceso' | 'proximamente' }) {
  const titulo =
    motivo === 'acceso' ? 'No tenés acceso a esta sección'
      : motivo === 'proximamente' ? 'Esta sección todavía no está disponible'
        : 'Esa dirección no existe'
  const detalle =
    motivo === 'acceso' ? 'Si creés que deberías poder verla, pedile acceso a quien coordina tu módulo.'
      : motivo === 'proximamente' ? 'Es parte del roadmap de Spira, pero todavía no está construida. Todavía no hay fecha.'
        : 'Puede que el link esté incompleto o que la pantalla haya cambiado de nombre.'

  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: '48px 24px' }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ opacity: 0.5 }}><Vilano size={44} /></div>
        <div
          style={{
            fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 20,
            letterSpacing: '-0.02em', marginTop: 14, color: 'var(--spira-ink)',
          }}
        >
          {titulo}
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--spira-ink-soft)', marginTop: 7 }}>
          {detalle}
        </div>
        {/* Un <a> real y no un botón: es una dirección, y así se puede abrir en otra pestaña (ctrl/⌘
            + click, click del medio). El click NORMAL sí navega por la SPA (pushUrl) y no por el
            href: dejarlo ir por el href recargaba la app entera —re-auth, roles, todo— por volver al
            inicio, y en la Fase C esto va a renderizarse ADENTRO del shell (NotFoundView por un
            recurso puntual sin acceso), así que el costo de una recarga completa se agrava. */}
        <a
          href={homeUrl()}
          onClick={(e: ReactMouseEvent<HTMLAnchorElement>) => {
            if (e.defaultPrevented || e.button !== 0) return
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return // dejar pasar: pestaña nueva, etc.
            e.preventDefault()
            pushUrl(HOME)
          }}
          className="spira-card-link"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 20, height: 38,
            padding: '0 15px', borderRadius: 10, border: '1px solid var(--spira-line-2)',
            background: 'var(--spira-white)', color: 'var(--spira-ink)',
            fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, textDecoration: 'none',
          }}
        >
          <Icon name="arrowLeft" size={15} color="var(--spira-ink)" /> Volver al inicio
        </a>
      </div>
    </div>
  )
}
