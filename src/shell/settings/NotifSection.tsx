import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { StCard, StRow, StToggle, StPill, PreviewBanner } from './primitives'
import { DEMO_NOTIF_CATS } from './settingsData'

/* Notificaciones. Solo el canal APP (los avisos in-app existen — la campana de la
   top bar). El email todavía no existe (no hay envío de correo), así que NO se
   ofrecen toggles de email que prometan algo que no pasa: va como "Próximamente".
   Las preferencias por categoría son estado local (todavía no persisten). */

export function NotifSection() {
  const [cats, setCats] = useState(DEMO_NOTIF_CATS.map((c) => ({ ...c })))
  const toggle = (i: number) => setCats((cs) => cs.map((c, j) => (j === i ? { ...c, app: !c.app } : c)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>
      <PreviewBanner>Todavía es una maqueta: los controles no se guardan aún.</PreviewBanner>

      <StCard title="Qué te avisamos" desc="Elegí qué avisos ver dentro de la app">
        {cats.map((c, i) => (
          <StRow key={c.key} label={c.label} last={i === cats.length - 1}>
            <StToggle on={c.app} onClick={() => toggle(i)} label={`${c.label} — en la app`} />
          </StRow>
        ))}
      </StCard>

      <StCard title="Notificaciones por email">
        <StRow label="Avisos y resumen diario por correo" sub="Novedades y un resumen del día en tu casilla" last>
          <StPill tone="neutral"><Icon name="clock" size={12} color="var(--spira-muted)" /> Próximamente</StPill>
        </StRow>
      </StCard>
    </div>
  )
}
