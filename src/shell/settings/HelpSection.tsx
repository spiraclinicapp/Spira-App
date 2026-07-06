import { Icon } from '../../components/Icon'
import { SPIRA_VERSION } from '../../lib/version'
import { ACCENT, StCard, StRow, StPill, btnGhostSoon } from './primitives'
import { DEMO_HELP_TOPICS, SHORTCUTS } from './settingsData'

/* Ayuda. Temas y buscador son vista previa (el header del modal lo marca). La
   VERSIÓN sí es real (de lib/version.ts). El estado del sistema no tiene fuente
   real todavía → "Próximamente" en vez de un "Operativo" inventado. */

export function HelpSection() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, height: 46, padding: '0 16px', background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)', borderRadius: 12, opacity: 0.7 }}>
        <Icon name="search" size={18} color="var(--spira-muted)" />
        <input
          disabled
          placeholder="Buscar en la ayuda de Spira (próximamente)…"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--spira-font-text)', fontSize: 14.5, color: 'var(--spira-ink)', cursor: 'default' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {DEMO_HELP_TOPICS.map((t) => (
          <button
            key={t.title}
            style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '16px', textAlign: 'left', background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 14, cursor: 'default', opacity: 0.75 }}
            disabled
            title="Próximamente"
            className="spira-no-press"
          >
            <span style={{ width: 40, height: 40, borderRadius: 11, background: ACCENT + '14', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
              <Icon name={t.icon} size={19} color={ACCENT} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--spira-ink)' }}>{t.title}</div>
              <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 1 }}>{t.n} artículos</div>
            </div>
            <Icon name="chevronRight" size={16} color="var(--spira-faint)" />
          </button>
        ))}
      </div>

      <StCard title="Atajos de teclado">
        {SHORTCUTS.map((s, i) => (
          <StRow key={s.desc} label={s.desc} last={i === SHORTCUTS.length - 1}>
            <span className="spira-mono" style={{ fontSize: 12, fontWeight: 500, color: 'var(--spira-ink)', background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', borderRadius: 7, padding: '4px 10px' }}>{s.keys}</span>
          </StRow>
        ))}
      </StCard>

      <StCard title="Soporte">
        <StRow label="Contactar soporte" sub="Todavía no disponible">
          <button style={btnGhostSoon} disabled title="Próximamente"><Icon name="mail" size={15} color="var(--spira-muted)" /> Escribir</button>
        </StRow>
        <StRow label="Estado del sistema" sub="Sin monitoreo en vivo todavía">
          <StPill tone="neutral"><Icon name="clock" size={12} color="var(--spira-muted)" /> Próximamente</StPill>
        </StRow>
        <StRow label="Versión" sub={`Canal ${SPIRA_VERSION.channel}`} last>
          <span className="spira-mono" style={{ fontSize: 13, color: 'var(--spira-muted)' }}>v{SPIRA_VERSION.app}</span>
        </StRow>
      </StCard>
    </div>
  )
}
