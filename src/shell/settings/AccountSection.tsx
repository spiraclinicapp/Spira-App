import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { PasswordInput } from '../../components/PasswordInput'
import { fieldInput } from '../../components/FormField'
import { useAuth } from '../../lib/auth'
import type { ModuleKey, ModuleRole } from '../../lib/auth'
import { initialsOf } from '../../lib/initials'
import { ACCENT, StCard, StRow, StPill, btnGhost, btnSolid } from './primitives'

/* Mi cuenta. Datos reales (nombre + email de la sesión, accesos por módulo de
   user_module_roles) y TRES acciones reales: editar el nombre (RLS permite el
   perfil propio), cambiar la contraseña (auth.updateUser) y cerrar las otras
   sesiones (signOut scope 'others'). Los formularios se expanden inline —no en un
   modal anidado— para no chocar con el z-index/foco del propio modal de Ajustes.
   2FA queda como "Próximamente" (es un flujo aparte, no se finge disponible). */

const MODULE_LABEL: Record<ModuleKey, string> = {
  track: 'Track', pharma: 'Pharma', lab: 'Lab', contable: 'Contable', gerencia: 'Gerencia',
}
const ROLE_LABEL: Record<ModuleRole, string> = {
  viewer: 'Lectura', operator: 'Operador', leader: 'Líder', admin: 'Administrador',
}

export function AccountSection() {
  const { profile, session, roles, updateProfile, updatePassword, signOutOthers } = useAuth()
  const name = profile?.fullName ?? 'Usuario'
  const email = session?.user?.email ?? ''
  const moduleEntries = (Object.entries(roles) as [ModuleKey, ModuleRole][]).filter(([, r]) => r != null)

  /* editar nombre */
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
        action={!editing ? <button style={btnGhost} onClick={startEdit}>Editar</button> : undefined}
        pad={false}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '18px 18px 20px' }}>
          <div style={avatar}>{initialsOf(name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360 }}>
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
            ) : (
              <>
                <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--spira-ink)' }}>{name}</div>
                {email && <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', marginTop: 2 }}>{email}</div>}
              </>
            )}
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
