import type { CSSProperties } from 'react'
import { Drawer } from '../../../components/Drawer'
import { Icon } from '../../../components/Icon'
import { PanelNuevaDispensacion } from './PanelNuevaDispensacion'

/**
 * Cajón del alta manual: el formulario que CREA la solicitud. Al confirmarla se abre el cajón de
 * preparación, que es donde vive el riel de proceso.
 *
 * Antes mostraba acá la barra de pasos marcando "Preparando". Se sacó al reemplazarla por el riel:
 * el riel enumera los requisitos de un pedido REAL (constancia, renglones, unidades) y acá todavía
 * no hay pedido del que hablar — habría que inventarle un estado a algo que no existe.
 */
export function NuevaDispensacionDrawer({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (requestId: string) => void
}) {
  return (
    // Mismo ancho que el cajón de una solicitud existente: son el mismo flujo.
    <Drawer title="Nueva dispensación · Alta manual" onClose={onClose} maxWidth={560}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={head}>
          <span style={ico}><Icon name="plus" size={20} color="var(--spira-pharma-solid)" /></span>
          <div>
            <div style={{ fontFamily: 'var(--spira-font-display)', fontSize: 16, fontWeight: 700, color: 'var(--spira-ink)' }}>
              Nueva dispensación
            </div>
            <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 3 }}>
              Alta manual · Farmacia
            </div>
          </div>
        </div>

        <PanelNuevaDispensacion onClose={onClose} onCreated={onCreated} />
      </div>
    </Drawer>
  )
}

const head: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 13, padding: '2px 22px 16px',
}

const ico: CSSProperties = {
  width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center',
  background: 'rgba(15, 95, 87, 0.14)', flex: '0 0 auto',
}
