import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { FormField, fieldInput } from '../../components/FormField'
import {
  crearCuenta, darDeBaja, eliminarCuenta, generarLinkRestablecimiento,
  normalizarActividad, useActividadDeCuenta,
} from '../../data/team'
import type { TeamMemberRow } from '../../data/team'
import { resumirActividad } from './actividadDeCuenta'
import {
  btnGhost, btnPeligro, btnSolid, dialogCard, dialogScrim, dialogTitulo, StCard, StRow,
} from './primitives'

/* ============================================================================
   Las acciones sobre la CUENTA (docs/plan-alta-de-cuentas.md, PR-3).

   Tres cosas, y las tres comparten un mismo principio: quien administra puede DESBLOQUEAR a alguien,
   nunca SUPLANTARLO.

   Por eso no hay ningún campo de contraseña en este archivo, ni lo va a haber. La Admin API de
   Supabase permite fijar la contraseña de otra persona; el diseño no. Si un administrador pudiera
   poner una contraseña conocida, podría entrar como esa persona y el audit_log diría que dispensó
   la farmacéutica cuando fue otro — y eso es lo único del sistema que la auditoría no puede
   reconstruir después. Lo que sí puede es generar un link de un solo uso, que sólo ella completa.

   POR QUÉ "ELIMINAR" Y "DAR DE BAJA" SON DOS BOTONES Y NO UNO (decisión del Director, 2026-08-25).
   A alguien que ya trabajó en el sistema NO se lo puede borrar: `public.users` tiene 38 claves
   foráneas apuntándole y casi todas bloquean el borrado. Un solo botón "Eliminar" que a veces
   borrara y a veces diera de baja haría que el mismo gesto tuviera dos resultados distintos según
   un dato que no está a la vista. Con dos botones, el que no se puede usar se ve gris ANTES de
   pulsarlo y dice por qué.
   ============================================================================ */

/* ---------- el link, con su botón de copiar ---------- */

/**
 * Muestra el link generado y lo copia al portapapeles.
 *
 * SE MUESTRA EL LINK ENTERO Y NO SÓLO UN BOTÓN "Copiar": si el portapapeles falla —pasa en http, en
 * navegadores viejos y cuando el documento no tiene foco— quien administra tiene que poder
 * seleccionarlo a mano. Un botón que dice "Copiado" sin haber copiado nada terminaría en una
 * persona esperando un link que nunca le llegó.
 */
export function PanelDeLink({ link, onListo }: { link: string; onListo?: () => void }) {
  const [copiado, setCopiado] = useState(false)
  const [falloCopiar, setFalloCopiar] = useState(false)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      setFalloCopiar(false)
      window.setTimeout(() => setCopiado(false), 2200)
    } catch {
      // Sin portapapeles: se lo decimos en vez de mentirle con un "Copiado".
      setFalloCopiar(true)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: 'var(--spira-ink)' }}>
        <Icon name="externalLink" size={15} color={'var(--spira-muted)'} />
        <span>
          Pasale este link para que <strong style={{ fontWeight: 600 }}>defina su contraseña</strong>.
          Es de un solo uso y vence. Vos no ves ni elegís la contraseña: la define quien lo abre.
        </span>
      </div>

      <div
        className="spira-mono"
        style={{
          fontSize: 12, color: 'var(--spira-ink)', background: 'var(--spira-surface)',
          border: '1px solid var(--spira-line)', borderRadius: 9, padding: '10px 12px',
          wordBreak: 'break-all', userSelect: 'all', lineHeight: 1.5,
        }}
      >
        {link}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" style={btnSolid()} onClick={() => void copiar()}>
          <Icon name={copiado ? 'check' : 'copy'} size={15} color="#fff" />
          {copiado ? 'Copiado' : 'Copiar link'}
        </button>
        {onListo && <button type="button" style={btnGhost} onClick={onListo}>Listo</button>}
        {falloCopiar && (
          <span style={{ fontSize: 12.5, color: '#B0823F' }}>
            No pudimos copiarlo. Seleccionalo y copialo a mano.
          </span>
        )}
      </div>
    </div>
  )
}

/* ---------- alta ---------- */

/** Diálogo de alta. Dos estados: el formulario y, cuando la cuenta ya existe, el link. */
export function CrearCuentaDialog({ onCerrar, onCreada }: { onCerrar: () => void; onCreada: () => void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creada, setCreada] = useState<{ link: string | null; aviso?: string } | null>(null)

  const puedeCrear = fullName.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const crear = async () => {
    setGuardando(true)
    setError(null)
    const { data, error: err } = await crearCuenta({ email: email.trim(), fullName: fullName.trim() })
    setGuardando(false)
    if (err || !data) { setError(err ?? 'No pudimos crear la cuenta.'); return }
    // La cuenta ya existe: a partir de acá cerrar sin copiar el link es válido (se puede regenerar
    // desde la ficha), pero la lista tiene que refrescarse igual.
    setCreada({ link: data.actionLink, aviso: data.aviso })
    onCreada()
  }

  return (
    <div style={dialogScrim} role="presentation" onMouseDown={onCerrar}>
      <div
        style={{ ...dialogCard, width: 'min(520px, 100%)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Crear una cuenta"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={dialogTitulo}>{creada ? 'Cuenta creada' : 'Crear una cuenta'}</div>

        {!creada && (
          <>
            <div style={{ fontSize: 13, color: 'var(--spira-muted)', marginTop: 6, lineHeight: 1.5 }}>
              La cuenta nace <strong style={{ fontWeight: 600 }}>sin acceso a ningún módulo</strong>. Se lo das
              después desde su ficha, y ese cambio queda registrado.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
              <FormField label="Nombre y apellido">
                <input
                  style={fieldInput}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ana Gómez"
                  autoFocus
                />
              </FormField>
              <FormField label="Correo">
                <input
                  style={fieldInput}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ana@ejemplo.com"
                />
              </FormField>
            </div>

            {error && <Aviso tono="danger">{error}</Aviso>}

            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button type="button" style={btnGhost} onClick={onCerrar} disabled={guardando}>Cancelar</button>
              <button type="button" style={btnSolid()} onClick={() => void crear()} disabled={!puedeCrear || guardando}>
                {guardando ? 'Creando…' : 'Crear cuenta'}
              </button>
            </div>
          </>
        )}

        {creada && (
          <div style={{ marginTop: 14 }}>
            {creada.aviso && <Aviso tono="warn">{creada.aviso}</Aviso>}
            {creada.link
              ? <PanelDeLink link={creada.link} onListo={onCerrar} />
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 13, color: 'var(--spira-muted)' }}>
                    Podés generar el link desde la ficha de la persona, con “Generar link de contraseña”.
                  </div>
                  <div><button type="button" style={btnGhost} onClick={onCerrar}>Listo</button></div>
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- acciones sobre una cuenta existente ---------- */

interface AccionesProps {
  persona: TeamMemberRow
  /** Id de quien está mirando: nadie puede darse de baja ni eliminarse a sí mismo. */
  actorId: string
  /** Se llama cuando algo cambió y la lista tiene que refrescarse. */
  onCambio: () => void
  /** Se llama tras una eliminación: la ficha abierta ya no tiene a quién mostrar. */
  onEliminada: () => void
}

export function AccionesDeCuenta({ persona, actorId, onCambio, onEliminada }: AccionesProps) {
  const soyYo = persona.id === actorId
  const actividad = useActividadDeCuenta(persona.id)
  const resumen = normalizarActividad(actividad.data)

  const [trabajando, setTrabajando] = useState<'link' | 'baja' | 'eliminar' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<'baja' | 'eliminar' | null>(null)

  const generarLink = async () => {
    if (!persona.email) return
    setTrabajando('link'); setError(null); setLink(null)
    const { actionLink, error: err } = await generarLinkRestablecimiento(persona.email)
    setTrabajando(null)
    if (err || !actionLink) { setError(err ?? 'No pudimos generar el link.'); return }
    setLink(actionLink)
  }

  const confirmarBaja = async () => {
    setConfirmando(null); setTrabajando('baja'); setError(null)
    const { error: err } = await darDeBaja(persona.id)
    setTrabajando(null)
    if (err) { setError(err); onCambio(); return }  // refresca igual: la revocación pudo sí ocurrir
    onCambio()
  }

  const confirmarEliminar = async () => {
    setConfirmando(null); setTrabajando('eliminar'); setError(null)
    const { error: err } = await eliminarCuenta(persona.id, {
      email: persona.email,
      full_name: persona.full_name,
    })
    setTrabajando(null)
    if (err) { setError(err); actividad.refetch(); return }
    onEliminada()
  }

  /* El motivo por el que "Eliminar" está gris. Se calcula ANTES de pulsar y se muestra al lado del
     botón: enterarse después de pulsar de que no se podía es la clase de sorpresa que esta pantalla
     evita. Mientras carga NO se dice "no se puede" —todavía no se sabe—, se dice que está mirando. */
  const motivoNoEliminar = (): string | null => {
    if (soyYo) return 'No podés eliminar tu propia cuenta.'
    if (actividad.loading) return 'Estamos viendo si dejó registros…'
    if (actividad.error) return actividad.error
    if (!resumen.puedeEliminarse) {
      return `No se puede eliminar: registró ${resumirActividad(resumen.referencias)}. La auditoría tiene que conservarlos. Podés darle de baja.`
    }
    return null
  }
  const noEliminar = motivoNoEliminar()

  return (
    <>
      <StCard title="La cuenta" desc="Contraseña, baja y eliminación">
        {error && <div style={{ padding: '10px 0 2px' }}><Aviso tono="danger">{error}</Aviso></div>}

        <StRow
          label="Contraseña"
          sub={
            persona.email
              ? 'Generá un link para que defina una contraseña nueva. Vos nunca la ves ni la elegís.'
              : 'Esta cuenta no tiene correo registrado, así que no se le puede generar un link.'
          }
        >
          <button
            type="button"
            style={btnGhost}
            onClick={() => void generarLink()}
            disabled={!persona.email || trabajando !== null}
          >
            {trabajando === 'link' ? 'Generando…' : 'Generar link'}
          </button>
        </StRow>

        {link && (
          <div style={{ padding: '4px 0 14px' }}>
            <PanelDeLink link={link} onListo={() => setLink(null)} />
          </div>
        )}

        <StRow
          label={persona.is_active ? 'Dar de baja' : 'Cuenta dada de baja'}
          sub={
            persona.is_active
              ? soyYo
                ? 'No podés darte de baja a vos mismo.'
                : 'Le revoca todos los accesos y le bloquea el ingreso. Queda en el historial.'
              : 'Ya no tiene accesos ni puede ingresar. Su historial se conserva.'
          }
        >
          {persona.is_active
            ? (
              <button
                type="button"
                style={btnPeligro}
                onClick={() => setConfirmando('baja')}
                disabled={soyYo || trabajando !== null}
              >
                {trabajando === 'baja' ? 'Dando de baja…' : 'Dar de baja'}
              </button>
            )
            : <span style={{ fontSize: 13, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>Sin acceso</span>}
        </StRow>

        <StRow label="Eliminar definitivamente" sub={noEliminar ?? 'Esta cuenta nunca registró actividad, así que se puede borrar sin perder nada.'} last>
          <button
            type="button"
            style={btnPeligro}
            onClick={() => setConfirmando('eliminar')}
            disabled={noEliminar !== null || trabajando !== null}
            title={noEliminar ?? undefined}
          >
            {trabajando === 'eliminar' ? 'Eliminando…' : 'Eliminar'}
          </button>
        </StRow>
      </StCard>

      {confirmando === 'baja' && (
        <Confirmacion
          titulo={`¿Dar de baja a ${persona.full_name}?`}
          confirmar="Sí, dar de baja"
          onCancelar={() => setConfirmando(null)}
          onConfirmar={() => void confirmarBaja()}
        >
          Pierde el acceso a todos los módulos y no va a poder ingresar. <strong style={{ fontWeight: 600 }}>Su
          historial se conserva</strong>: todo lo que registró sigue figurando a su nombre, como tiene que ser.
          Queda registrado quién la dio de baja.
        </Confirmacion>
      )}

      {confirmando === 'eliminar' && (
        <Confirmacion
          titulo={`¿Eliminar la cuenta de ${persona.full_name}?`}
          confirmar="Sí, eliminar"
          onCancelar={() => setConfirmando(null)}
          onConfirmar={() => void confirmarEliminar()}
        >
          Esta cuenta nunca registró actividad, así que se borra por completo y <strong style={{ fontWeight: 600 }}>esto
          no se puede deshacer</strong>. En la auditoría queda constancia de que existió y de quién la eliminó.
          Si tenés dudas, dale de baja en vez de eliminarla.
        </Confirmacion>
      )}
    </>
  )
}

/* ---------- piezas chicas ---------- */

function Aviso({ tono, children }: { tono: 'danger' | 'warn'; children: ReactNode }) {
  const color = tono === 'danger' ? 'var(--spira-danger)' : '#B0823F'
  const fondo = tono === 'danger' ? 'rgba(166, 72, 59, 0.10)' : '#B0823F16'
  const borde = tono === 'danger' ? 'rgba(166, 72, 59, 0.20)' : '#B0823F33'
  return (
    <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, color, background: fondo, border: `1px solid ${borde}`, borderRadius: 10, padding: '10px 14px', marginTop: 10 }}>
      <Icon name="alert" size={15} color={color} />
      <span>{children}</span>
    </div>
  )
}

function Confirmacion({
  titulo, children, confirmar, onCancelar, onConfirmar,
}: {
  titulo: string
  children: ReactNode
  confirmar: string
  onCancelar: () => void
  onConfirmar: () => void
}) {
  return (
    <div style={dialogScrim} role="presentation" onMouseDown={onCancelar}>
      <div style={dialogCard} role="alertdialog" aria-modal="true" aria-label={titulo} onMouseDown={(e) => e.stopPropagation()}>
        <div style={dialogTitulo}>{titulo}</div>
        <div style={cuerpoDialogo}>{children}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button type="button" style={btnGhost} onClick={onCancelar}>Cancelar</button>
          <button type="button" style={btnPeligro} onClick={onConfirmar}>{confirmar}</button>
        </div>
      </div>
    </div>
  )
}

const cuerpoDialogo: CSSProperties = {
  fontSize: 13.5, color: 'var(--spira-muted)', marginTop: 8, lineHeight: 1.5,
}
