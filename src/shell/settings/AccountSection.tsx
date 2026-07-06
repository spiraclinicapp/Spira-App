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

/* Mi cuenta. Card de perfil editable "de verdad" (reglas server-side, migración 0045):
   · Nombre y correo → 1 cambio cada 30 días (RPC + timestamps; el input se bloquea
     con la fecha en que vuelve a estar disponible). El correo dispara un mail de
     confirmación (aplica al confirmarlo).
   · Puesto → desplegable de un catálogo (cosmético, NO cambia permisos).
   · Centro → solo lectura (forzado al que se asoció la cuenta).
   El "badge" verde es el NIVEL DE ACCESO real (derivado de user_module_roles), que
   NO se edita acá — lo maneja un admin. Seguridad (contraseña / sesiones) sigue abajo. */

/** Catálogo de puestos. DEBE coincidir con el validador de update_my_puesto (0045). */
const PUESTOS = ['Coordinadora', 'Investigador principal', 'Data manager', 'Farmacéutico', 'Enfermería', 'Administración']

const ROLE_RANK: Record<ModuleRole, number> = { viewer: 1, operator: 2, leader: 3, admin: 4 }
const ROLE_LABEL: Record<ModuleRole, string> = { viewer: 'Lectura', operator: 'Operador', leader: 'Líder', admin: 'Administrador' }

/** Nivel de acceso más alto del usuario (para el badge). */
function accessLabel(roles: Partial<Record<string, ModuleRole>>): string {
  const rs = Object.values(roles).filter(Boolean) as ModuleRole[]
  if (rs.length === 0) return 'Sin acceso'
  return ROLE_LABEL[rs.reduce((a, b) => (ROLE_RANK[b] > ROLE_RANK[a] ? b : a))]
}

/** Si el campo está bloqueado por la regla de 30 días, devuelve la fecha en que se
    libera (dd/mm/aaaa); si ya está disponible, null. */
function lockedUntil(iso: string | null): string | null {
  if (!iso) return null
  const next = new Date(iso).getTime() + 30 * 24 * 60 * 60 * 1000
  return next > Date.now() ? new Date(next).toLocaleDateString('es-AR') : null
}

export function AccountSection() {
  const { profile, session, roles, updateProfile, updatePuesto, requestEmailChange, updatePassword, signOutOthers } = useAuth()
  const name = profile?.fullName ?? 'Usuario'
  const email = session?.user?.email ?? ''
  const puesto = profile?.puesto ?? ''
  const centro = profile?.centro ?? 'Fundación Scherbovsky'
  const access = accessLabel(roles)
  const nameLock = lockedUntil(profile?.nameChangedAt ?? null)
  const emailLock = lockedUntil(profile?.emailChangedAt ?? null)

  const fields: { l: string; v: string; icon: IconName }[] = [
    { l: 'Nombre completo', v: name, icon: 'user' },
    { l: 'Correo institucional', v: email || '—', icon: 'mail' },
    { l: 'Rol', v: puesto || 'Sin definir', icon: 'shield' },
    { l: 'Centro', v: centro, icon: 'activity' },
  ]

  /* edición del perfil */
  const [editing, setEditing] = useState(false)
  const [dName, setDName] = useState(name)
  const [dEmail, setDEmail] = useState(email)
  const [dPuesto, setDPuesto] = useState(puesto)
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const startEdit = () => { setDName(name); setDEmail(email); setDPuesto(puesto); setFormErr(null); setNotice(null); setEditing(true) }
  const save = async () => {
    setSaving(true); setFormErr(null)
    const errors: string[] = []
    if (dPuesto !== puesto) {
      const { error } = await updatePuesto(dPuesto || null)
      if (error) errors.push(error)
    }
    if (!nameLock && dName.trim() && dName.trim() !== name) {
      const { error } = await updateProfile(dName)
      if (error) errors.push(error)
    }
    let pending = false
    if (!emailLock && dEmail.trim() && dEmail.trim() !== email) {
      const { error, pending: p } = await requestEmailChange(dEmail)
      if (error) errors.push(error)
      else pending = p
    }
    setSaving(false)
    if (errors.length) { setFormErr(errors.join(' ')); return }
    setNotice(pending ? `Te enviamos un link a ${dEmail.trim()} para confirmar el nuevo correo.` : 'Perfil actualizado.')
    setEditing(false)
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
      {notice && !editing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--spira-good)', background: '#5C8A5A16', border: '1px solid #5C8A5A33', borderRadius: 10, padding: '10px 14px' }}>
          <Icon name="check" size={15} color="#5C8A5A" /> {notice}
        </div>
      )}

      <StCard
        title="Perfil"
        desc="Tus datos dentro de Spira"
        action={!editing ? <button style={btnGhost} onClick={startEdit}>Editar perfil</button> : undefined}
        pad={false}
      >
        {editing ? (
          <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
            <div>
              <label htmlFor="acc-name" style={lbl}>Nombre completo</label>
              <input id="acc-name" value={dName} onChange={(e) => setDName(e.target.value)} autoComplete="name" disabled={!!nameLock} style={inputMaybeLocked(!!nameLock)} />
              {nameLock && <div style={note}>Podés cambiarlo de nuevo el {nameLock}.</div>}
            </div>
            <div>
              <label htmlFor="acc-email" style={lbl}>Correo institucional</label>
              <input id="acc-email" type="email" value={dEmail} onChange={(e) => setDEmail(e.target.value)} autoComplete="email" disabled={!!emailLock} style={inputMaybeLocked(!!emailLock)} />
              {emailLock
                ? <div style={note}>Podés cambiarlo de nuevo el {emailLock}.</div>
                : <div style={note}>Si lo cambiás, te mandamos un link de confirmación al correo nuevo.</div>}
            </div>
            <div>
              <label htmlFor="acc-puesto" style={lbl}>Rol</label>
              <select id="acc-puesto" value={dPuesto} onChange={(e) => setDPuesto(e.target.value)} style={{ ...fieldInput, cursor: 'pointer' }}>
                <option value="">Sin definir</option>
                {PUESTOS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Centro</label>
              <div style={readonlyField}>
                <Icon name="activity" size={15} color="var(--spira-muted)" />
                <span style={{ flex: 1 }}>{centro}</span>
                <Icon name="lock" size={14} color="var(--spira-faint)" />
              </div>
              <div style={note}>Definido por el centro asociado a tu cuenta.</div>
            </div>
            {formErr && <div style={err}>{formErr}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btnSolid()} onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
              <button style={btnGhost} onClick={() => setEditing(false)} disabled={saving}>Cancelar</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 18px 20px', borderBottom: '1px solid var(--spira-line)' }}>
              <div style={avatar}>{initialsOf(name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--spira-ink)' }}>{name}</div>
                <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', marginTop: 2 }}>{puesto ? `${puesto} · ${centro}` : centro}</div>
              </div>
              <StPill tone="accent"><Icon name="shield" size={13} color={ACCENT} /> {access}</StPill>
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
const note: CSSProperties = { fontSize: 12, color: 'var(--spira-faint)', marginTop: 5 }
const err: CSSProperties = { fontSize: 12.5, color: 'var(--spira-danger)' }
const ok: CSSProperties = { fontSize: 12.5, color: 'var(--spira-good)' }
const readonlyField: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 14px', borderRadius: 10,
  border: '1px solid var(--spira-line)', background: 'var(--spira-surface)', color: 'var(--spira-muted)', fontSize: 14,
}
function inputMaybeLocked(locked: boolean): CSSProperties {
  return locked ? { ...fieldInput, background: 'var(--spira-surface)', color: 'var(--spira-muted)', cursor: 'not-allowed' } : fieldInput
}
