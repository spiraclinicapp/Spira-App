import { Icon } from '../../components/Icon'
import { useAuth } from '../../lib/auth'
import type { ModuleKey, ModuleRole } from '../../lib/auth'
import { initialsOf } from '../../lib/initials'
import { ACCENT, StCard, StRow, StPill, btnGhostSoon } from './primitives'

/* Mi cuenta. Muestra SOLO datos reales: nombre + email (de la sesión) y los
   accesos por módulo (de user_module_roles). Los campos que el perfil todavía no
   tiene (teléfono, centro, zona horaria, nivel único de acceso) NO se inventan:
   se omiten hasta extender el perfil. Seguridad va como "Próximamente" (ningún
   control está cableado; nada de "2FA activada" falso). */

const MODULE_LABEL: Record<ModuleKey, string> = {
  track: 'Track', pharma: 'Pharma', lab: 'Lab', contable: 'Contable', gerencia: 'Gerencia',
}
const ROLE_LABEL: Record<ModuleRole, string> = {
  viewer: 'Lectura', operator: 'Operador', leader: 'Líder', admin: 'Administrador',
}

export function AccountSection() {
  const { profile, session, roles } = useAuth()
  const name = profile?.fullName ?? 'Usuario'
  const email = session?.user?.email ?? ''
  const initials = initialsOf(name)
  const moduleEntries = (Object.entries(roles) as [ModuleKey, ModuleRole][])
    .filter(([, r]) => r != null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>
      <StCard title="Perfil" desc="Tus datos dentro de Spira" pad={false}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 18px 20px' }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%', flex: '0 0 auto', background: ACCENT, display: 'grid', placeItems: 'center',
            fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 22, color: 'var(--spira-on-accent)',
          }}>{initials}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--spira-ink)' }}>{name}</div>
            {email && <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', marginTop: 2 }}>{email}</div>}
          </div>
        </div>
      </StCard>

      <StCard title="Accesos" desc="Tus módulos y tu nivel en cada uno">
        {moduleEntries.length === 0 ? (
          <StRow label="Sin accesos asignados" sub="Pedile a un administrador que te habilite un módulo" last />
        ) : (
          moduleEntries.map(([mod, role], i) => (
            <StRow key={mod} label={MODULE_LABEL[mod]} last={i === moduleEntries.length - 1}>
              <StPill tone="accent">{ROLE_LABEL[role]}</StPill>
            </StRow>
          ))
        )}
      </StCard>

      <StCard title="Seguridad">
        <StRow label="Contraseña" sub="Gestioná tu contraseña de ingreso">
          <button style={btnGhostSoon} disabled title="Próximamente">Cambiar</button>
        </StRow>
        <StRow label="Verificación en dos pasos" sub="Todavía no disponible">
          <StPill tone="neutral"><Icon name="clock" size={12} color="var(--spira-muted)" /> Próximamente</StPill>
        </StRow>
        <StRow label="Sesiones activas" sub="Cerrar sesión en otros dispositivos" last>
          <button style={btnGhostSoon} disabled title="Próximamente">Cerrar otras</button>
        </StRow>
      </StCard>
    </div>
  )
}
