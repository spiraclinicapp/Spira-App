import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { PasswordInput } from '../../components/PasswordInput'
import { fieldInput } from '../../components/FormField'
import { useAuth } from '../../lib/auth'
import type { ModuleRole } from '../../lib/auth'
import { initialsOf } from '../../lib/initials'
import { ACCENT, StCard, StRow, StPill, btnGhost, btnSolid } from './primitives'

/* Mi cuenta. Card de perfil rico (nombre · rol · correo · centro) + Seguridad
   con acciones reales. Los campos se llenan de su fuente REAL: nombre/correo de
   la sesión, ROL derivado del nivel más alto en user_module_roles (no un título
   inventado), y CENTRO = la constante de la organización. Sin datos fabricados
   por usuario (teléfono/zona no existen en el perfil → no se muestran). */

/** Espejo de public.role_rank (auth.tsx): viewer < operator < leader < admin. */
const ROLE_RANK: Record<ModuleRole, number> = { viewer: 1, operator: 2, leader: 3, admin: 4 }
const ROLE_LABEL: Record<ModuleRole, string> = { viewer: 'Lectura', operator: 'Operador', leader: 'Líder', admin: 'Administrador' }
/** Centro real: Spira es la plataforma de la Fundación Scherbovsky (Mendoza, AR). */
const CENTRO = 'Fundación Scherbovsky'

/** Rol a mostrar = el nivel más alto que el usuario tiene en cualquier módulo. */
function topRoleLabel(roles: Partial<Record<string, ModuleRole>>): string {
  const rs = Object.values(roles).filter(Boolean) as ModuleRole[]
  if (rs.length === 0) return 'Sin rol asignado'
  const top = rs.reduce((a, b) => (ROLE_RANK[b] > ROLE_RANK[a] ? b : a))
  return ROLE_LABEL[top]
}

export function AccountSection() {
  const { profile, session, roles, updateProfile, updatePassword, signOutOthers } = useAuth()
  const name = profile?.fullName ?? 'Usuario'
  const email = session?.user?.email ?? ''
  const roleLabel = topRoleLabel(roles)

  const fields: { l: string; v: string; icon: IconName }[] = [
    { l: 'Nombre completo', v: name, icon: 'user' },
    { l: 'Correo institucional', v: email || '—', icon: 'mail' },
    { l: 'Rol', v: roleLabel, icon: 'shield' },
    { l: 'Centro', v: CENTRO, icon: 'activity' },
  ]

  /* editar nombre (único campo editable) */
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [savingName, setSavingName] = useState(false)
  const [nameErr, setNameErr] = useState<string | null>(null)
  const startEdit = () => { setDraft(name); setNameErr(null); setEditing(true) }
  const saveName = async () => {
    setSavingName(true); setNameErr(null)
    const { error } = await updateProfile(draft)
    setSavingName(false)
    if (error) setNameErr(error)
    else setEditing(false)
  }

  /* cambiar contraseña */
  const [changing, setChanging] = useState(false)
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [savingPass, setSavingPass] = useState(false)
  const [passErr, setPassErr] = useState<string | null>(null)
  const [passDone, setPassDone] = useState(false)
  const startPass = () => { setP1(''); setP2(''); setPassErr(null); setPassDone(false); setChanging(true) }
  const savePass = async () => {
    setPassErr(null)
    if (p1.length < 8) { setPassErr('Usá al menos 8 caracteres.'); return }
    if (p1 !== p2) { setPassErr('Las contraseñas no coinciden.'); return }
    setSavingPass(true)
    const { error } = await updatePassword(p1)
    setSavingPass(false)
    if (error) { setPassErr(error); return }
    setChanging(false); setPassDone(true)
  }

  /* cerrar otras sesiones */
  const [closing, setClosing] = useState(false)
  const [sess, setSess] = useState<{ ok: boolean; msg: string } | null>(null)
  const closeOthers = async () => {
    setClosing(true); setSess(null)
    const { error } = await signOutOthers()
    setClosing(false)
    setSess(error ? { ok: false, msg: error } : { ok: true, msg: 'Listo, cerramos tus otras sesiones.' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>
      <StCard
        title="Perfil"
        desc="Tus datos dentro de Spira"
        action={!editing ? <button style={btnGhost} onClick={startEdit}>Editar perfil</button> : undefined}
        pad={false}
      >
        {editing ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '18px' }}>
            <div style={avatar}>{initialsOf(draft || name)}</div>
            <div style={{ flex: 1, minWidth: 0, maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label htmlFor="acc-name" style={lbl}>Nombre completo</label>
                <input id="acc-name" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="name" style={fieldInput} />
              </div>
              {nameErr && <div style={err}>{nameErr}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnSolid()} onClick={saveName} disabled={savingName}>{savingName ? 'Guardando…' : 'Guardar'}</button>
                <button style={btnGhost} onClick={() => setEditing(false)} disabled={savingName}>Cancelar</button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 18px 20px', borderBottom: '1px solid var(--spira-line)' }}>
              <div style={avatar}>{initialsOf(name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--spira-ink)' }}>{name}</div>
                <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', marginTop: 2 }}>{roleLabel} · {CENTRO}</div>
              </div>
              <StPill tone="accent"><Icon name="shield" size={13} color={ACCENT} /> {roleLabel}</StPill>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 28px', padding: '6px 18px 14px' }}>
              {fields.map((f, i) => (
                <div key={f.l} style={{ padding: '13px 0', borderBottom: i < fields.length - 2 ? '1px solid var(--spira-line)' : 'none' }}>
                  <div style={{ fontSize: 11.5, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--spira-faint)', fontWeight: 700 }}>{f.l}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                    <Icon name={f.icon} size={15} color="var(--spira-muted)" />
                    <span style={{ fontSize: 14, color: 'var(--spira-ink)' }}>{f.v}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </StCard>

      <StCard title="Seguridad">
        {changing ? (
          <div style={{ padding: '13px 0', borderBottom: '1px solid var(--spira-line)' }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--spira-ink)', marginBottom: 10 }}>Cambiar contraseña</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360 }}>
              <div>
                <label htmlFor="acc-p1" style={lbl}>Contraseña nueva</label>
                <PasswordInput id="acc-p1" value={p1} onChange={setP1} autoComplete="new-password" />
              </div>
              <div>
                <label htmlFor="acc-p2" style={lbl}>Repetir contraseña</label>
                <PasswordInput id="acc-p2" value={p2} onChange={setP2} autoComplete="new-password" />
              </div>
              {passErr && <div style={err}>{passErr}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnSolid()} onClick={savePass} disabled={savingPass}>{savingPass ? 'Guardando…' : 'Guardar contraseña'}</button>
                <button style={btnGhost} onClick={() => setChanging(false)} disabled={savingPass}>Cancelar</button>
              </div>
            </div>
          </div>
        ) : (
          <StRow label="Contraseña" sub={passDone ? 'Contraseña actualizada' : 'Cambiá tu contraseña de ingreso'}>
            {passDone
              ? <StPill tone="good"><Icon name="check" size={13} color="#5C8A5A" /> Actualizada</StPill>
              : <button style={btnGhost} onClick={startPass}>Cambiar</button>}
          </StRow>
        )}

        <StRow label="Verificación en dos pasos" sub="Todavía no disponible">
          <StPill tone="neutral"><Icon name="clock" size={12} color="var(--spira-muted)" /> Próximamente</StPill>
        </StRow>

        <StRow label="Sesiones activas" sub="Cerrá tu sesión en otros dispositivos" last>
          {sess
            ? <span style={sess.ok ? ok : err}>{sess.msg}</span>
            : <button style={btnGhost} onClick={closeOthers} disabled={closing}>{closing ? 'Cerrando…' : 'Cerrar otras'}</button>}
        </StRow>
      </StCard>
    </div>
  )
}

const avatar: CSSProperties = {
  width: 60, height: 60, borderRadius: '50%', flex: '0 0 auto', background: ACCENT, display: 'grid', placeItems: 'center',
  fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 22, color: 'var(--spira-on-accent)',
}
const lbl: CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)', marginBottom: 6 }
const err: CSSProperties = { fontSize: 12.5, color: 'var(--spira-danger)' }
const ok: CSSProperties = { fontSize: 12.5, color: 'var(--spira-good)' }
