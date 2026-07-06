import { Icon } from '../../components/Icon'
import { initialsOf } from '../../lib/initials'
import { ACCENT, StCard, StPill, btnGhostSoon } from './primitives'
import { DEMO_TEAM, DEMO_ROLES } from './settingsData'

/* Roles y permisos. Vista previa con datos de ejemplo (el header del modal la
   marca como tal). La gestión real (invitar/cambiar rol/revocar) va contra la
   gestión de usuarios cuando exista; hoy el botón "Invitar" es inerte. */

export function RolesSection() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 820 }}>
      <StCard
        title="Equipo del centro"
        desc={`${DEMO_TEAM.length} personas · datos de ejemplo`}
        action={<button style={btnGhostSoon} disabled title="Próximamente"><Icon name="plus" size={15} color="var(--spira-muted)" /> Invitar usuario</button>}
        pad={false}
      >
        {DEMO_TEAM.map((m, i) => (
          <div key={m.email} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 18px', borderBottom: i < DEMO_TEAM.length - 1 ? '1px solid var(--spira-line)' : 'none' }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%', flex: '0 0 auto', display: 'grid', placeItems: 'center',
              background: m.tu ? ACCENT : 'var(--spira-surface)', border: m.tu ? 'none' : '1px solid var(--spira-line)',
              fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14, color: m.tu ? 'var(--spira-on-accent)' : 'var(--spira-muted)',
            }}>{initialsOf(m.name)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)' }}>
                {m.name} {m.tu && <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--spira-muted)' }}>· vos</span>}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 1 }}>{m.email}</div>
            </div>
            <div style={{ width: 190, flex: '0 0 auto' }}><StPill tone="neutral">{m.rol}</StPill></div>
            <div style={{ width: 130, flex: '0 0 auto' }}>
              {m.estado === 'activo'
                ? <StPill tone="good" dot>Activo</StPill>
                : <StPill tone="warn"><Icon name="clock" size={12} color="#B0823F" /> Pendiente</StPill>}
            </div>
            <div style={{ width: 88, flex: '0 0 auto', fontSize: 12, color: 'var(--spira-faint)', textAlign: 'right' }}>{m.visto}</div>
          </div>
        ))}
      </StCard>

      <StCard title="Roles" desc="Qué módulos ve cada rol" pad={false}>
        {DEMO_ROLES.map((r, i) => (
          <div key={r.rol} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', borderBottom: i < DEMO_ROLES.length - 1 ? '1px solid var(--spira-line)' : 'none' }}>
            <div style={{ width: 200, flex: '0 0 auto' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)' }}>{r.rol}</div>
              <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>{r.desc}</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
              {r.mods.map((mm) => (
                <span key={mm} style={{ fontSize: 12, fontWeight: 500, color: 'var(--spira-ink)', background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', borderRadius: 7, padding: '3px 9px' }}>{mm}</span>
              ))}
            </div>
          </div>
        ))}
      </StCard>
    </div>
  )
}
