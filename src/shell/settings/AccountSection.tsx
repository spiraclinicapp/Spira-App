import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { PasswordInput } from '../../components/PasswordInput'
import { UserAvatar } from '../../components/UserAvatar'
import { fieldInput } from '../../components/FormField'
import { SearchableSelect } from '../../components/SearchableSelect'
import { useAuth } from '../../lib/auth'
import { accessLabel } from '../../lib/roles'
import { lockedUntil } from '../../lib/perfil'
import { initialsOf } from '../../lib/initials'
import { ACCENT, StCard, StRow, StPill, btnGhost, btnSolid } from './primitives'
import { useMarkDirty } from './SettingsModal'

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

/* `accessLabel` (nivel más alto) y `lockedUntil` (la ventana de 30 días) se mudaron a `lib/roles.ts`
   y `lib/perfil.ts`: son reglas puras y ahora tienen tests. La segunda es de las que fallan callada
   —un signo invertido deja el campo bloqueado para siempre, y eso no se ve mal en pantalla—. */

export function AccountSection() {
  const { profile, session, roles, updateProfile, updatePuesto, requestEmailChange, updatePassword, signOutOthers } = useAuth()
  const name = profile?.fullName ?? 'Usuario'
  const email = session?.user?.email ?? ''
  const puesto = profile?.puesto ?? ''
  const centro = profile?.centro ?? 'Fundación Scherbovsky'
  const access = accessLabel(roles)
  const nameLock = lockedUntil(profile?.nameChangedAt ?? null)
  const emailLock = lockedUntil(profile?.emailChangedAt ?? null)
  /* Cambio de correo pedido y todavía sin confirmar. Sale de la SESIÓN, no de un useState: el aviso
     de "te mandamos un link" vivía en el estado del componente y se evaporaba al cerrar Ajustes, así
     que el usuario quedaba con un cambio a medio camino y ninguna pista de que existía. Supabase
     expone el correo pendiente en `user.new_email` hasta que se confirma; mientras esté ahí, el
     aviso está en pantalla, sobreviva lo que sobreviva. */
  const pendingEmail = session?.user?.new_email ?? null

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
  /* Un renglón POR CAMPO, no un string. Antes los tres errores se concatenaban con un espacio y
     salían pegoteados en una línea, sin decir cuál campo era cuál — y como el formulario solo se
     cerraba si NO había ningún error, una falla parcial te dejaba adentro sin saber que el puesto
     ya se había guardado. Cada campo es una operación independiente contra su propio RPC; el
     resultado tiene que leerse igual de independiente. */
  const [formErr, setFormErr] = useState<{ campo: string; error: string }[]>([])
  const [guardados, setGuardados] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const startEdit = () => {
    setDName(name); setDEmail(email); setDPuesto(puesto)
    setFormErr([]); setGuardados([]); setNotice(null); setEditing(true)
  }

  const save = async () => {
    setSaving(true); setFormErr([]); setGuardados([])

    /* Los tres campos van por RPCs distintos, así que "guardar" son hasta tres operaciones que
       pueden fallar por separado. Se intentan TODAS —no se corta en la primera que falla— y cada
       una deja su resultado: el usuario tiene que poder ver de un vistazo qué quedó guardado y qué
       hay que reintentar. */
    const errores: { campo: string; error: string }[] = []
    const ok: string[] = []

    if (dPuesto !== puesto) {
      const { error } = await updatePuesto(dPuesto || null)
      if (error) errores.push({ campo: 'Rol', error })
      else ok.push('el rol')
    }
    if (!nameLock && dName.trim() && dName.trim() !== name) {
      const { error } = await updateProfile(dName)
      if (error) errores.push({ campo: 'Nombre completo', error })
      else ok.push('el nombre')
    }
    let pedidoCorreo: string | null = null
    if (!emailLock && dEmail.trim() && dEmail.trim() !== email) {
      const { error, pending } = await requestEmailChange(dEmail)
      if (error) errores.push({ campo: 'Correo institucional', error })
      else if (pending) pedidoCorreo = dEmail.trim()
    }

    setSaving(false)

    if (errores.length) {
      /* Se queda en el formulario para poder reintentar, pero mostrando las DOS mitades: qué falló
         (por campo) y qué sí quedó guardado. Sin la segunda, el usuario reintenta a ciegas lo que
         ya había funcionado. */
      setFormErr(errores)
      setGuardados(ok)
      return
    }

    setNotice(
      pedidoCorreo
        ? `Te enviamos un link a ${pedidoCorreo} para confirmar el nuevo correo.`
        : 'Perfil actualizado.',
    )
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

  /* Con el perfil o la contraseña a medio editar, cerrar Ajustes pregunta antes de descartar. Los
     dos formularios cuentan: los dos tienen texto escrito que no está guardado en ningún lado. */
  useMarkDirty(editing || changing)

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

      {/* Cambio de correo pedido y sin confirmar. Va en ámbar (pendiente, no error ni éxito) y sale
          de la sesión, así que sigue acá aunque cierres Ajustes, recargues o entres mañana — hasta
          que el link se use. Antes esto era un `notice` de useState y desaparecía al primer cierre:
          el correo quedaba a medio cambiar sin nada en pantalla que lo dijera. */}
      {pendingEmail && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#B0823F', background: '#B0823F16', border: '1px solid #B0823F33', borderRadius: 10, padding: '10px 14px' }}>
          <Icon name="clock" size={15} color="#B0823F" />
          <span>Tenés un cambio de correo sin confirmar a <strong style={{ fontWeight: 600 }}>{pendingEmail}</strong>. Revisá esa casilla — el correo actual sigue siendo el de arriba hasta que lo confirmes.</span>
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
              <SearchableSelect
                id="acc-puesto"
                value={dPuesto || 'none'}
                onChange={(v) => setDPuesto(v === 'none' ? '' : v)}
                options={[{ value: 'none', label: 'Sin definir' }, ...PUESTOS.map((p) => ({ value: p, label: p }))]}
                placeholder="Sin definir"
                searchPlaceholder="Buscar puesto…"
                entity="puesto"
              />
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
            {formErr.length > 0 && (
              <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {formErr.map((f) => (
                  <div key={f.campo} style={err}><strong style={{ fontWeight: 600 }}>{f.campo}:</strong> {f.error}</div>
                ))}
                {/* Lo que SÍ se guardó, en verde: sin esto el usuario reintenta a ciegas lo que ya
                    funcionó, y en el caso del correo ese reintento consume la ventana de 30 días. */}
                {guardados.length > 0 && (
                  <div style={ok}>Se guardó {guardados.join(' y ')}.</div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btnSolid()} onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
              <button style={btnGhost} onClick={() => setEditing(false)} disabled={saving}>Cancelar</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 18px 20px', borderBottom: '1px solid var(--spira-line)' }}>
              <UserAvatar initials={initialsOf(name)} size={60} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--spira-ink)' }}>{name}</div>
                <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', marginTop: 2 }}>{puesto ? `${puesto} · ${centro}` : centro}</div>
              </div>
              <StPill tone="accent"><Icon name="shield" size={13} color={ACCENT} /> {access}</StPill>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 28px', padding: '6px 18px 14px' }}>
              {fields.map((f, i) => (
                <div key={f.l} style={{ padding: '13px 0', borderBottom: i < fields.length - 2 ? '1px solid var(--spira-line)' : 'none' }}>
                  <div style={{ fontSize: 11.5, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--spira-muted)', fontWeight: 700 }}>{f.l}</div>
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

const lbl: CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)', marginBottom: 6 }
const note: CSSProperties = { fontSize: 12, color: 'var(--spira-muted)', marginTop: 5 }
const err: CSSProperties = { fontSize: 12.5, color: 'var(--spira-danger)' }
const ok: CSSProperties = { fontSize: 12.5, color: 'var(--spira-good)' }
const readonlyField: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 14px', borderRadius: 10,
  border: '1px solid var(--spira-line)', background: 'var(--spira-surface)', color: 'var(--spira-muted)', fontSize: 14,
}
function inputMaybeLocked(locked: boolean): CSSProperties {
  return locked ? { ...fieldInput, background: 'var(--spira-surface)', color: 'var(--spira-muted)', cursor: 'not-allowed' } : fieldInput
}
