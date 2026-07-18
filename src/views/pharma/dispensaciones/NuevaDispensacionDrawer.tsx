import type { CSSProperties } from 'react'
import { Drawer } from '../../../components/Drawer'
import { Icon } from '../../../components/Icon'
import { StepBar } from './StepBar'
import { PanelNuevaDispensacion } from './PanelNuevaDispensacion'

/**
 * Cajón del alta manual. Mismo chasis que el de una solicitud existente (encabezado + barra de
 * pasos + panel), para que la farmacéutica no sienta que entró a otra pantalla: es el mismo flujo,
 * arrancado un paso antes.
 *
 * La barra de pasos marca "Preparar + escanear" porque la solicitud nace y se toma en el mismo
 * gesto: al crearla se abre su cajón de preparación.
 */
export function NuevaDispensacionDrawer({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (requestId: string) => void
}) {
  return (
    <Drawer title="Nueva dispensación · Alta manual" onClose={onClose} maxWidth={480}>
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

        <StepBar current="preparando" />

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
  background: 'rgba(168, 132, 47, 0.14)', flex: '0 0 auto',
}
