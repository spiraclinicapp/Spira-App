import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { InfoTip } from '../../components/InfoTip'
import { UserAvatar } from '../../components/UserAvatar'
import { usePopover } from '../../components/usePopover'
import { useAuth } from '../../lib/auth'
import { initialsOf } from '../../lib/initials'
import { MODULES } from '../../modules/registry'
import { describeAccess, MODULO_ADMIN, ROLE_LABEL, resumenDeAccesoEnLinea } from '../../lib/roles'
import { useTeamAccess } from '../../data/team'
import type { TeamMemberRow } from '../../data/team'
import { useProtocols } from '../../data/protocols'
import { useAllProtocolAssignments } from '../../data/protocolAccess'
import type { ProtocolRow } from '../../data/protocols'
import { StCard, StPill, btnIcono, btnSolid } from './primitives'
import { AccesoEditor } from './AccesoEditor'
import { ResumenDeAcceso } from './ResumenDeAcceso'
import { CrearCuentaDialog } from './AccionesDeCuenta'

/* ============================================================================
   Equipo y accesos — reemplaza la maqueta de "Roles y permisos".

   La maqueta mostraba cinco personas inventadas de un centro que no era éste, y —peor— una tabla de
   "roles" con módulos asociados. Ese modelo NO EXISTE en la base: lo real es una matriz
   persona × módulo × nivel. Copiarlo habría enseñado a gerencia a razonar sobre permisos con un
   modelo falso, que en una app auditable es peor que el dato inventado.

   DOS CARAS, según la RLS y no según una decisión de esta pantalla:
     · con `gerencia` → el equipo entero, editable.
     · sin `gerencia` → "Tu acceso": tu propia fila, de solo lectura. Es LITERALMENTE lo que la RLS
       de `public.users` deja ver (`id = auth.uid() or has_module('gerencia')`), así que la pantalla
       no está escondiendo nada que el servidor fuera a entregar.

   ⚠️ EL CASO QUE OBLIGA A LA RAMA EXPLÍCITA. La RLS filtra EN SILENCIO: sin gerencia, la consulta
   devuelve UNA fila y ningún error. Si esta pantalla decidiera "vinieron pocas filas, será que no
   hay equipo", un usuario común vería una lista casi vacía indistinguible de un sistema roto — y un
   administrador con la migración sin aplicar vería exactamente lo mismo. Por eso la rama se decide
   ANTES, mirando `roles.gerencia` del propio `useAuth`, y no contando filas.
   ============================================================================ */

export function EquipoYAccesosSection() {
  const { roles, session } = useAuth()
  const esGerencia = roles[MODULO_ADMIN] != null
  const miId = session?.user?.id ?? ''

  const { data, loading, error, refetch } = useTeamAccess()
  /* Los protocolos se piden ACÁ y no adentro de `AccesoEditor`, aunque sólo los use él.
     `useSupabaseQuery` no cachea —el repo no usa react-query—, así que en la ficha se volvería a
     consultar la MISMA lista cada vez que se entra y se sale de una persona. Acá se pide una vez
     por apertura de Ajustes. Baja por prop, igual que `administradores`. */
  const protocolos = useProtocols()
  /* Las ASIGNACIONES suben por el mismo motivo, y de paso arreglan lo que faltaba: vivían adentro
     de `AccesoEditor`, así que se reconsultaban en cada entrada y salida de una ficha. Acá las
     necesitan tres: la línea de cada fila ("· 3 estudios"), el resumen del ojo y la ficha. */
  const asignaciones = useAllProtocolAssignments()
  const [editando, setEditando] = useState<string | null>(null)
  /* Quién tiene el resumen abierto. Misma forma que `editando` — y es lo que hace que las dos
     consultas de historial del resumen se disparen UNA vez, al abrirlo, y no una por persona al
     entrar a la sección. Ver el comentario de cabecera de `ResumenDeAcceso`. */
  const [viendo, setViendo] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)

  const equipo = useMemo(() => data ?? [], [data])
  const administradores = useMemo(
    () => equipo.filter((p) => p.accesos[MODULO_ADMIN] != null).map((p) => p.id),
    [equipo],
  )
  /** Cuántos estudios ve cada persona. Se cuenta acá, una vez, y no por fila. */
  const estudiosPorPersona = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of asignaciones.data ?? []) m.set(a.user_id, (m.get(a.user_id) ?? 0) + 1)
    return m
  }, [asignaciones.data])
  const personaEditada = equipo.find((p) => p.id === editando) ?? null

  if (loading) {
    return <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>Cargando el equipo…</div>
  }

  if (error) {
    return (
      <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 9, maxWidth: 720, fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', border: '1px solid rgba(166, 72, 59, 0.20)', borderRadius: 10, padding: '11px 14px' }}>
        <Icon name="alert" size={15} color="var(--spira-danger)" />
        {error}
      </div>
    )
  }

  /* ── Sin gerencia: tu propio acceso, de solo lectura ── */
  if (!esGerencia) {
    const yo = equipo.find((p) => p.id === miId) ?? null
    return <TuAcceso persona={yo} />
  }

  /* ── Con gerencia: el editor de una persona… ── */
  if (personaEditada) {
    return (
      <AccesoEditor
        persona={personaEditada}
        actorId={miId}
        administradores={administradores}
        protocolos={protocolos.data ?? []}
        protocolosCargando={protocolos.loading}
        asignaciones={asignaciones.data ?? []}
        asignacionesCargando={asignaciones.loading}
        onAsignacionesCambiadas={asignaciones.refetch}
        onCerrar={() => setEditando(null)}
        onGuardado={refetch}
      />
    )
  }

  /* ── …o la lista del equipo ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 820 }}>
      <StCard
        title="Equipo del centro"
        desc={`${equipo.length} ${equipo.length === 1 ? 'persona' : 'personas'}`}
        pad={false}
        action={
          <button style={btnSolid()} onClick={() => setCreando(true)}>
            <Icon name="plus" size={15} color="#fff" /> Crear cuenta
          </button>
        }
      >
        {equipo.map((p, i) => (
          <FilaDePersona
            key={p.id}
            persona={p}
            soyYo={p.id === miId}
            ultima={i === equipo.length - 1}
            estudios={estudiosPorPersona.get(p.id) ?? 0}
            protocolos={protocolos.data ?? []}
            protocolosDeLaPersona={(asignaciones.data ?? []).filter((a) => a.user_id === p.id).map((a) => a.protocol_id)}
            viendo={viendo === p.id}
            onVer={() => setViendo(viendo === p.id ? null : p.id)}
            onCerrarVista={() => setViendo(null)}
            onEditar={() => { setViendo(null); setEditando(p.id) }}
          />
        ))}
      </StCard>

      {/* Hasta la v0.44.0 acá decía que las cuentas se creaban desde el panel de Supabase. Ya no:
          el botón de arriba las crea de verdad. Lo que queda dicho es lo que sigue siendo cierto y
          no se ve — que todo esto deja rastro. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5, color: 'var(--spira-muted)', padding: '0 2px' }}>
        <Icon name="info" size={15} color="var(--spira-faint)" />
        <span>
          Cada alta, cambio de acceso y baja queda registrado con quién lo hizo y cuándo. Una cuenta
          nueva nace sin acceso a ningún módulo: se lo das desde su ficha.
        </span>
      </div>

      {creando && (
        <CrearCuentaDialog onCerrar={() => setCreando(false)} onCreada={refetch} />
      )}
    </div>
  )
}

/** Una fila del equipo: identidad, a qué entra dicho en castellano corrido, y los dos gestos.
 *
 *  ANTES ERAN CHIPS y ahora es prosa (§01 del handoff). No es sólo estética: cuatro píldoras
 *  —"Coordinación · Administrador", "Farmacia · Administrador", "Administra", "Sin acceso"— le dan
 *  el mismo peso visual a cosas de distinto orden, y en veinte filas el ojo no encuentra nada. La
 *  línea corrida se lee como una frase, y lo excepcional (una baja, un acceso sin estudios) es lo
 *  único que se tiñe.
 *
 *  EL OJO ES DUEÑO DEL POPOVER pero NO de las consultas: `usePopover` con `open=false` no engancha
 *  ni un listener, así que tenerlo en cada fila no cuesta nada, mientras que `ResumenDeAcceso`
 *  —que sí consulta— se monta únicamente en la fila abierta. */
function FilaDePersona({
  persona, soyYo, ultima, estudios, protocolos, protocolosDeLaPersona, viendo, onVer, onCerrarVista, onEditar,
}: {
  persona: TeamMemberRow
  soyYo: boolean
  ultima: boolean
  estudios: number
  protocolos: ProtocolRow[]
  protocolosDeLaPersona: string[]
  viendo: boolean
  onVer: () => void
  onCerrarVista: () => void
  onEditar: () => void
}) {
  const administra = persona.accesos[MODULO_ADMIN] != null
  const resumen = resumenDeAccesoEnLinea(persona.accesos, MODULES, persona.is_active, estudios)
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(viendo, onCerrarVista)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 18px', borderBottom: ultima ? 'none' : '1px solid var(--spira-line)' }}>
      <UserAvatar initials={initialsOf(persona.full_name)} size={38} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {persona.full_name}
            {soyYo && <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--spira-muted)' }}> · vos</span>}
          </span>
          {/* El escudito reemplaza a la píldora "Administra" Y al texto que lo repetía en la línea
              de abajo: una sola marca para una sola idea. Va en `acc-deep-track` y no en el
              petróleo crudo, que sobre la card del tema oscuro da 2,14:1 — o sea, la única señal de
              quién reparte el poder del centro sería la que no se ve. */}
          {administra && (
            <InfoTip
              icono="shield"
              size={14}
              color="var(--spira-acc-deep-track)"
              titulo="Administra los accesos"
              cuerpo="Ve a todo el equipo y le cambia el acceso a cualquiera del centro."
              etiqueta={`${persona.full_name} administra los accesos`}
            />
          )}
        </div>
        <LineaDeAcceso resumen={resumen} />
      </div>

      <button
        ref={triggerRef}
        type="button"
        style={btnIcono}
        aria-label={`Ver el acceso de ${persona.full_name}`}
        title="Ver el acceso"
        aria-expanded={viendo}
        onClick={onVer}
      >
        <Icon name="eye" size={16} color="var(--spira-muted)" />
      </button>
      <button type="button" className="spira-textlink spira-no-press" style={linkEditar} onClick={onEditar}>
        Editar acceso
      </button>

      {viendo && pos && (
        <ResumenDeAcceso
          persona={persona}
          protocolos={protocolos}
          protocolosDeLaPersona={protocolosDeLaPersona}
          popRef={popRef}
          pos={pos}
          onCerrar={onCerrarVista}
          onEditar={onEditar}
        />
      )}
    </div>
  )
}

/** La línea de abajo del nombre. La REGLA vive en `lib/roles.ts` con sus tests; acá sólo se pinta:
 *  qué caso gana sobre cuál es lo que puede fallar sin verse, y eso no se decide en un componente. */
function LineaDeAcceso({ resumen }: { resumen: ReturnType<typeof resumenDeAccesoEnLinea> }) {
  if (resumen.tipo === 'baja') {
    /* La ÚNICA fila que se tiñe. Una cuenta dada de baja queda sin módulos, así que sin esto se
       vería exactamente igual que alguien recién creado esperando accesos — y ahí es donde alguien
       le da accesos a una cuenta que se cerró a propósito, con su nombre en el `audit_log`. */
    return (
      <div style={{ marginTop: 3 }}>
        <StPill tone="danger"><Icon name="lock" size={12} color="var(--spira-acc-deep-danger)" /> Dada de baja</StPill>
      </div>
    )
  }

  if (resumen.tipo === 'sin-modulos') {
    return <div style={linea}>Sin acceso a ningún módulo</div>
  }

  return (
    <div style={{ ...linea, display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
      {resumen.modulos.map((m, i) => (
        <span key={m.nombre} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
          {i > 0 && <Punto />}
          <span style={{ color: 'var(--spira-ink)', fontWeight: 600 }}>{m.nombre}</span>
          <Punto />
          <span>{ROLE_LABEL[m.nivel]}</span>
        </span>
      ))}
      {/* El conteo puede NO IR: `estudios: null` significa que esta persona no scopea por estudio
          (no tiene Coordinación), y ahí un "0 estudios" al lado de "Farmacia · Administrador" diría
          que no ve pacientes, que es lo contrario de la verdad. */}
      {resumen.aviso === 'sin-estudios' ? (
        <><Punto /><span style={{ color: 'var(--spira-acc-deep-warn)', fontWeight: 600 }}>sin estudios asignados</span></>
      ) : resumen.estudios != null ? (
        <><Punto /><span>{resumen.estudios} {resumen.estudios === 1 ? 'estudio' : 'estudios'}</span></>
      ) : null}
    </div>
  )
}

/** El punto medio que separa. `aria-hidden` porque es puntuación: el lector de pantalla ya hace la
 *  pausa por el elemento, y "punto medio" leído quince veces por fila es ruido. */
function Punto() {
  return <span aria-hidden style={{ color: 'var(--spira-faint)' }}>·</span>
}

/* —— estilos de la fila —— */

/** La línea de acceso. `flexWrap` y no ellipsis: en 1185px de contenido una persona con los dos
 *  módulos entra holgada, y si algún día no entrara, cortar el acceso a la mitad es peor que
 *  ocupar dos renglones. */
const linea: CSSProperties = { fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }

/** «Editar acceso» es un LINK y no un botón con caja (§01 del handoff): comparte fila con el ojo,
 *  que sí la lleva, y dos cajas vecinas del mismo peso no dejan ver cuál es el gesto principal.
 *  `spira-no-press` porque el levante de 1px sobre un texto suelto se lee como un salto; su señal
 *  de estado es el subrayado que pone `.spira-textlink` al apuntarlo o enfocarlo. */
const linkEditar: CSSProperties = {
  flex: '0 0 auto', fontSize: 13, fontWeight: 600, color: 'var(--spira-acc-deep-track)',
  fontFamily: 'var(--spira-font-text)',
}

/** Lo que ve quien no administra: su propio acceso, explicado. */
function TuAcceso({ persona }: { persona: TeamMemberRow | null }) {
  const descripcion = describeAccess(persona?.accesos ?? {}, MODULES)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>
      <StCard title="Tu acceso" desc="A qué entrás hoy dentro de Spira">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 0 4px' }}>
          {descripcion.ve.length === 0 && descripcion.inertes.length === 0 && (
            <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>
              Por ahora sólo el Inicio. Pedile acceso a los módulos que necesites a quien administra el centro.
            </div>
          )}
          {descripcion.ve.map((a) => (
            <div key={a.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13.5 }}>
              <Icon name="check" size={14} color="var(--spira-acc-deep-good)" />
              <span style={{ color: 'var(--spira-ink)' }}>
                <strong style={{ fontWeight: 600 }}>{a.nombre}</strong> — {a.puede}
              </span>
            </div>
          ))}
          {descripcion.inertes.map((a) => (
            <div key={a.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13.5, color: 'var(--spira-acc-deep-warn)' }}>
              <Icon name="clock" size={14} color="var(--spira-acc-deep-warn)" />
              <span><strong style={{ fontWeight: 600 }}>{a.nombre}</strong> — todavía no está construido</span>
            </div>
          ))}
        </div>
      </StCard>

      {/* Sin esto, la sección se leería como "no hay nadie más en el centro". El motivo por el que
          no ves al resto no es que no exista: es que no te corresponde verlo. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5, color: 'var(--spira-muted)', padding: '0 2px' }}>
        <Icon name="lock" size={15} color="var(--spira-faint)" />
        <span>
          El equipo del centro y sus accesos los administra gerencia. Si necesitás un cambio en el tuyo,
          pedíselo a quien administra.
        </span>
      </div>
    </div>
  )
}
