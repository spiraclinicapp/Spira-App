import type { CSSProperties } from 'react'
import { Drawer } from '../../../components/Drawer'
import { Icon } from '../../../components/Icon'
import { PanelNuevaDispensacion } from './PanelNuevaDispensacion'

/**
 * Cajón del alta manual: el formulario que da de alta lo que sale por el mostrador.
 *
 * Tiene DOS ramas bajo un alternador (ver `PanelNuevaDispensacion`): la **de protocolo**, que crea
 * una solicitud y abre el cajón de preparación —donde vive el riel de proceso—, y la
 * **ambulatoria**, que entrega en un solo acto y termina ahí. Por eso son dos callbacks y no uno:
 * lo que pasa después de confirmar es distinto, y un único `onCreated` obligaría a que quien lo
 * recibe adivine cuál de las dos fue.
 *
 * Antes mostraba acá la barra de pasos marcando "Preparando". Se sacó al reemplazarla por el riel:
 * el riel enumera los requisitos de un pedido REAL (constancia, renglones, unidades) y acá todavía
 * no hay pedido del que hablar — habría que inventarle un estado a algo que no existe.
 */
export function NuevaDispensacionDrawer({ onClose, onCreated, onEntregado }: {
  onClose: () => void
  onCreated: (requestId: string) => void
  onEntregado: (mensaje: string) => void
}) {
  return (
    // Mismo ancho que el cajón de una solicitud existente: son el mismo flujo.
    <Drawer title="Nueva dispensación · Alta manual" onClose={onClose} maxWidth={560}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* El encabezado lo dibuja el panel, en el mismo renglón que su alternador. */}
        <PanelNuevaDispensacion
          encabezado={
            <div style={head}>
              <span style={ico}><Icon name="plus" size={20} color="var(--spira-acc-deep-track)" /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--spira-font-display)', fontSize: 16, fontWeight: 700, color: 'var(--spira-ink)' }}>
                  Nueva dispensación
                </div>
                <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 3 }}>
                  Alta manual · Farmacia
                </div>
              </div>
            </div>
          }
          onClose={onClose} onCreated={onCreated} onEntregado={onEntregado}
        />
      </div>
    </Drawer>
  )
}

const head: CSSProperties = { display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }

/**
 * El círculo del ícono del encabezado. Glifo y tinte salen de `--spira-acc-deep-track`, no de
 * `--spira-pharma-solid` ni de un rgba fijo: los dos valen #0F5F57 en claro, pero sólo el acc-deep
 * se aclara a menta en oscuro. Con el sólido, el ícono quedaba petróleo sobre la card casi negra y
 * se leía apagado. En claro no cambia nada.
 */
const ico: CSSProperties = {
  width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center',
  background: 'color-mix(in srgb, var(--spira-acc-deep-track) 14%, transparent)', flex: '0 0 auto',
}
