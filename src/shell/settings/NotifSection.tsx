import { useState } from 'react'
import { StCard, StRow, StToggle, StNote, btnGhostSoon } from './primitives'
import { DEMO_NOTIF_CATS } from './settingsData'

/* Notificaciones. Matriz categoría × canal (App/Email) con un toggle por celda.
   Estado local de demo: refleja el cambio pero todavía no persiste. */

export function NotifSection() {
  const [cats, setCats] = useState(DEMO_NOTIF_CATS.map((c) => ({ ...c })))
  const [resumen, setResumen] = useState(true)
  const toggle = (i: number, ch: 'app' | 'email') =>
    setCats((cs) => cs.map((c, j) => (j === i ? { ...c, [ch]: !c[ch] } : c)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>
      <StCard title="Qué te avisamos" desc="Elegí por dónde recibir cada tipo de aviso" pad={false}>
        {/* encabezado de columnas */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 18px', borderBottom: '1px solid var(--spira-line)', background: 'var(--spira-surface)' }}>
          <div style={{ flex: 1, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--spira-faint)', fontWeight: 700 }}>Categoría</div>
          <div style={{ width: 70, textAlign: 'center', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--spira-faint)', fontWeight: 700 }}>App</div>
          <div style={{ width: 70, textAlign: 'center', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--spira-faint)', fontWeight: 700 }}>Email</div>
        </div>
        <div style={{ padding: '0 18px' }}>
          {cats.map((c, i) => (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', padding: '13px 0', borderBottom: i < cats.length - 1 ? '1px solid var(--spira-line)' : 'none' }}>
              <div style={{ flex: 1, fontSize: 14, color: 'var(--spira-ink)' }}>{c.label}</div>
              <div style={{ width: 70, display: 'grid', placeItems: 'center' }}>
                <StToggle on={c.app} onClick={() => toggle(i, 'app')} label={`${c.label} — en la app`} />
              </div>
              <div style={{ width: 70, display: 'grid', placeItems: 'center' }}>
                <StToggle on={c.email} onClick={() => toggle(i, 'email')} label={`${c.label} — por email`} />
              </div>
            </div>
          ))}
        </div>
      </StCard>

      <StCard title="Email">
        <StRow label="Resumen diario" sub="Un correo cada mañana con lo pendiente del día">
          <StToggle on={resumen} onClick={() => setResumen((v) => !v)} label="Resumen diario por email" />
        </StRow>
        <StRow label="Horario de silencio" sub="Sin avisos entre 20:00 y 08:00" last>
          <button style={btnGhostSoon} disabled title="Próximamente">Configurar</button>
        </StRow>
      </StCard>

      <StNote>Estas preferencias de notificación todavía no se guardan entre sesiones.</StNote>
    </div>
  )
}
