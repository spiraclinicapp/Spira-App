import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../components/Icon'
import { InfoTip } from '../../components/InfoTip'
import { UserAvatar } from '../../components/UserAvatar'
import type { PopoverPos } from '../../components/usePopover'
import { initialsOf } from '../../lib/initials'
import { MODULES } from '../../modules/registry'
import { mezclarHistorial, MODULO_ADMIN, ROLE_LABEL } from '../../lib/roles'
import type { ModuleKey, ModuleRole } from '../../lib/roles'
import { puedeEnModulo } from '../../lib/permisos'
import { formatDateAR } from '../../lib/dates'
import { useAccessAudit } from '../../data/team'
import type { TeamMemberRow } from '../../data/team'
import { useProtocolAccessAudit } from '../../data/protocolAccess'
import type { ProtocolRow } from '../../data/protocols'
import { ACCENT, EstudioChip, SectionLabel, btnGhost, btnSolid } from './primitives'

/* ============================================================================
   Resumen de acceso — el vistazo de solo lectura que abre el ojo de la lista.

   ES UN POPOVER ANCLADO AL OJO, no un diálogo centrado (§02 del handoff: "sobre el modal, sin
   scrim de página completa"). La diferencia importa: un scrim a pantalla completa encima de un
   modal que YA tiene scrim se lee como otra pantalla, y esto es un vistazo — se abre, se mira y se
   cierra sin haber salido de la lista.

   ⚠️ VA PORTALEADO, SIEMPRE. El scrim del modal de Ajustes lleva `backdrop-filter`, y eso convierte
   a cualquier ancestro en bloque contenedor de sus descendientes `position: fixed`: un panel
   dibujado adentro del modal aterriza contra el scrim y no contra la ventana. Encima, el card tiene
   `overflow: hidden` por su borde redondeado, así que lo que se desborde se recorta EN SILENCIO.
   `usePopover` —que vive en la fila, ver `EquipoYAccesosSection`— lo portalea a `body` y lo pone en
   `--spira-z-popover` (300), que ya tapa al modal (220) sin inventar ningún z-index.

   NO HAY NINGÚN CONTROL EDITABLE ACÁ. Es lectura: el pie ofrece cerrar o saltar a la ficha, que es
   donde se cambia. Por eso los chips de estudios no llevan ×.

   Las DOS consultas de historial se disparan al MONTARSE este componente, y por eso lo monta sólo
   la fila abierta. `useAccessAudit(null)` no se saltea la consulta —filtra por un UUID centinela y
   viaja igual—, así que un resumen montado por fila serían 2 × N viajes al abrir Ajustes. Con las
   23 personas del padrón, 46 consultas para no mostrar nada. Ver TODOS.md.
   ============================================================================ */

interface Props {
  persona: TeamMemberRow
  /** Los protocolos del centro, para traducir ids a código + nombre. */
  protocolos: ProtocolRow[]
  /** Ids de los protocolos que esta persona ve hoy. */
  protocolosDeLaPersona: string[]
  /** Del `usePopover` de la fila: la fila es dueña del ancla (su botón de ojo). */
  popRef: (node: HTMLDivElement | null) => void
  pos: PopoverPos
  onCerrar: () => void
  onEditar: () => void
}

export function ResumenDeAcceso({
  persona, protocolos, protocolosDeLaPersona, popRef, pos, onCerrar, onEditar,
}: Props) {
  const audit = useAccessAudit(persona.id)
  const auditProtocolos = useProtocolAccessAudit(persona.id)

  /* El "último cambio" NO es una consulta nueva ni una redacción paralela: es la primera línea del
     MISMO historial mezclado que muestra la ficha. Dos textos para el mismo hecho se desincronizan
     solos, y en un sistema auditable el que quede viejo es el que alguien va a citar. */
  const ultimo = useMemo(
    () => mezclarHistorial(
      audit.data ?? [],
      auditProtocolos.data ?? [],
      (key) => MODULES.find((m) => m.key === key)?.name ?? key,
    )[0] ?? null,
    [audit.data, auditProtocolos.data],
  )

  const entradas = (Object.entries(persona.accesos) as [ModuleKey, ModuleRole][])
    .filter(([k]) => k !== MODULO_ADMIN)
  const modulos = MODULES
    .filter((m) => m.key !== 'inicio')
    .map((m) => [m, entradas.find(([k]) => k === m.key)] as const)
    .filter((par): par is readonly [typeof MODULES[number], [ModuleKey, ModuleRole]] => par[1] != null)
  const administra = persona.accesos[MODULO_ADMIN] != null
  const tieneCoordinacion = persona.accesos.track != null

  const estudios = protocolos.filter((p) => protocolosDeLaPersona.includes(p.id))

  /* Techo de altura para no desbordarse de la ventana. Con el panel DEBAJO del ojo —el caso normal—
     `pos.top` sale del borde inferior del disparador y no depende del alto del panel, así que
     recortarlo no puede realimentar nada.

     Cuando `usePopover` flipea hacia arriba sí hay realimentación (`top = trigger.top - 6 - alto`),
     y por lo tanto recortar mueve el panel, que vuelve a recortar. NO se dispara: converge en una
     pasada o dos a un punto fijo donde el alto ES el techo, y ahí se queda. Medido en el navegador
     el 2026-09-09 con la ventana apretada a 485px, que es lo que fuerza el caso: [top 251, alto
     220] idéntico al instante, a los 400ms y a los 1100ms. El piso de 220 es lo que garantiza que
     ese punto fijo exista en vez de irse a cero.

     El panel scrollea por dentro (`.spira-scroll`), así que apretarlo recorta la vista, no el
     contenido — y el pie con "Cerrar" queda afuera de esa área, siempre visible. */
  const maxHeight = Math.max(220, window.innerHeight - pos.top - 14)

  return createPortal(
    <div ref={popRef} role="dialog" aria-label={`Acceso de ${persona.full_name}`} style={{ ...panel, top: pos.top, left: pos.left, maxHeight }}>
      <div className="spira-scroll" style={{ overflowY: 'auto', minHeight: 0, padding: '16px 18px 4px' }}>
        {/* identidad — acá SÍ va el correo: salió de la fila para que la línea diga acceso y no
            identidad de cuenta, y éste es el lugar donde la pregunta "¿cuál de los dos pablo?"
            se responde sin entrar a editar nada. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <UserAvatar initials={initialsOf(persona.full_name)} size={42} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 17, color: 'var(--spira-ink)' }}>
              {persona.full_name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--spira-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {persona.email ?? 'Sin correo registrado'}
            </div>
          </div>
        </div>

        <div style={separador} />
        <SectionLabel>A qué entra</SectionLabel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {modulos.length === 0 && (
            <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>
              Sin acceso a ningún módulo. Sólo el Inicio.
            </div>
          )}
          {modulos.map(([m, par]) => (
            <div key={m.key} style={fila}>
              <span style={etiqueta}>{m.name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <strong style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--spira-ink)' }}>{ROLE_LABEL[par[1]]}</strong>
                {/* La explicación del nivel vive ACÁ y no impresa debajo (§02 del handoff). Es el
                    mismo diccionario que usa la ficha —`puedeEnModulo`, donde cada frase cita la
                    policy que la hace verdad—, con la primera en mayúscula. */}
                <InfoTip titulo={ROLE_LABEL[par[1]]} cuerpo={mayuscula(puedeEnModulo(m.key, par[1]))} size={14} />
              </span>
            </div>
          ))}

          {tieneCoordinacion && (
            <div style={{ ...fila, alignItems: 'flex-start' }}>
              <span style={{ ...etiqueta, paddingTop: 4 }}>Estudios</span>
              {estudios.length === 0 ? (
                <span style={{ fontSize: 13, color: 'var(--spira-acc-deep-warn)', textAlign: 'right', lineHeight: 1.4 }}>
                  Ninguno: entra a Coordinación pero no ve pacientes
                </span>
              ) : (
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'flex-end', minWidth: 0 }}>
                  {estudios.map((p) => <EstudioChip key={p.id} codigo={p.code} nombre={p.name} />)}
                </span>
              )}
            </div>
          )}

          {administra && (
            <div style={fila}>
              <span style={etiqueta}>Administración</span>
              <span style={pillAdmin}>
                <Icon name="shield" size={13} color="var(--spira-acc-deep-track)" />
                Administra los accesos
              </span>
            </div>
          )}
        </div>

        <div style={separador} />
        <SectionLabel>La cuenta</SectionLabel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, paddingBottom: 4 }}>
          <div style={fila}>
            <span style={etiqueta}>Estado</span>
            <span style={{ fontSize: 13.5, color: persona.is_active ? 'var(--spira-ink)' : 'var(--spira-acc-deep-danger)', fontWeight: persona.is_active ? 400 : 600 }}>
              {persona.is_active ? 'Activa' : 'Dada de baja'}
            </span>
          </div>
          <div style={{ ...fila, alignItems: 'flex-start' }}>
            <span style={{ ...etiqueta, paddingTop: 1 }}>Último cambio</span>
            <span style={{ fontSize: 13.5, color: 'var(--spira-ink)', textAlign: 'right', lineHeight: 1.4, minWidth: 0 }}>
              {audit.loading || auditProtocolos.loading
                ? <span style={{ color: 'var(--spira-muted)' }}>Cargando…</span>
                : ultimo
                  ? <>{ultimo.texto} <span style={{ color: 'var(--spira-muted)' }}>· {formatDateAR(ultimo.occurred_at)}</span></>
                  : <span style={{ color: 'var(--spira-muted)' }}>Sin cambios registrados</span>}
            </span>
          </div>
        </div>
      </div>

      {/* El pie queda FUERA del área que scrollea: es la salida, y una salida que hay que ir a
          buscar bajando no es una salida. */}
      <div style={pie}>
        <button type="button" style={btnGhost} onClick={onCerrar}>Cerrar</button>
        <button type="button" style={btnSolid()} onClick={onEditar}>Editar acceso</button>
      </div>
    </div>,
    document.body,
  )
}

/** La primera letra en mayúscula. Las frases de `permisos.ts` están escritas para ir DESPUÉS de un
 *  guión ("Coordinación — puede cargar y editar"), y acá arrancan una oración. */
function mayuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/* —— estilos —— */

const panel: CSSProperties = {
  position: 'fixed', zIndex: 'var(--spira-z-popover)', width: 'min(430px, calc(100vw - 24px))',
  background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)', borderRadius: 16,
  boxShadow: '0 18px 44px rgba(20, 48, 46, .22)', display: 'flex', flexDirection: 'column',
  overflow: 'hidden', animation: 'spOverlayIn .13s ease-out',
}
const separador: CSSProperties = { height: 1, background: 'var(--spira-line)', margin: '15px 0 13px' }
const fila: CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'space-between' }
const etiqueta: CSSProperties = { fontSize: 13.5, color: 'var(--spira-muted)', flex: '0 0 auto' }
/** El texto va en `acc-deep-track` y no en el petróleo crudo: #0F5F57 sobre la card del tema oscuro
 *  da 2,14:1. El tinte de fondo sí se queda en el acento — es decoración, no información. */
const pillAdmin: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999,
  background: ACCENT + '14', color: 'var(--spira-acc-deep-track)', fontSize: 13, fontWeight: 600,
}
const pie: CSSProperties = {
  display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px 14px',
  borderTop: '1px solid var(--spira-line)', flex: '0 0 auto',
}
