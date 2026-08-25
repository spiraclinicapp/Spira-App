import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { UserAvatar } from '../../components/UserAvatar'
import { useAuth } from '../../lib/auth'
import { initialsOf } from '../../lib/initials'
import { MODULES } from '../../modules/registry'
import { describeAccess, MODULO_ADMIN, ROLE_LABEL } from '../../lib/roles'
import type { ModuleKey, ModuleRole } from '../../lib/roles'
import { useTeamAccess } from '../../data/team'
import type { TeamMemberRow } from '../../data/team'
import { ACCENT, StCard, StPill, btnGhost } from './primitives'
import { AccesoEditor } from './AccesoEditor'

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
  const [editando, setEditando] = useState<string | null>(null)

  const equipo = useMemo(() => data ?? [], [data])
  const administradores = useMemo(
    () => equipo.filter((p) => p.accesos[MODULO_ADMIN] != null).map((p) => p.id),
    [equipo],
  )
  const personaEditada = equipo.find((p) => p.id === editando) ?? null

  if (loading) {
    return <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>Cargando el equipo…</div>
  }

  if (error) {
    return (
      <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 9, maxWidth: 720, fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', border: '1px solid rgba(166, 72, 59, 0.20)', borderRadius: 10, padding: '11px 14px' }}>
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
      >
        {equipo.map((p, i) => (
          <FilaDePersona
            key={p.id}
            persona={p}
            soyYo={p.id === miId}
            ultima={i === equipo.length - 1}
            onEditar={() => setEditando(p.id)}
          />
        ))}
      </StCard>

      {/* El alta de cuentas no pasa por acá y decirlo es más honesto que un botón "Invitar" inerte:
          la maqueta tenía uno, deshabilitado, prometiendo algo que no existe. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5, color: 'var(--spira-muted)', padding: '0 2px' }}>
        <Icon name="info" size={15} color="var(--spira-faint)" />
        <span>
          Las cuentas nuevas se crean desde el panel de Supabase; acá se les da el acceso. Cada cambio
          queda registrado con quién lo hizo y cuándo.
        </span>
      </div>
    </div>
  )
}

/** Una fila del equipo: identidad + a qué entra + el gesto de editar. */
function FilaDePersona({
  persona, soyYo, ultima, onEditar,
}: { persona: TeamMemberRow; soyYo: boolean; ultima: boolean; onEditar: () => void }) {
  const entradas = Object.entries(persona.accesos) as [ModuleKey, ModuleRole][]
  const modulos = entradas.filter(([k]) => k !== MODULO_ADMIN)
  const administra = persona.accesos[MODULO_ADMIN] != null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 18px', borderBottom: ultima ? 'none' : '1px solid var(--spira-line)' }}>
      <UserAvatar initials={initialsOf(persona.full_name)} size={38} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)' }}>
          {persona.full_name}
          {soyYo && <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--spira-muted)' }}> · vos</span>}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {persona.email ?? 'Sin correo registrado'}
        </div>
      </div>

      <div style={{ flex: '1 1 260px', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
        {administra && (
          <StPill tone="accent"><Icon name="shield" size={12} color={ACCENT} /> Administra</StPill>
        )}
        {modulos.length === 0
          ? <StPill tone="neutral">Sin acceso a módulos</StPill>
          : modulos.map(([k, nivel]) => (
              <StPill key={k} tone="neutral">
                {MODULES.find((m) => m.key === k)?.name ?? k} · {ROLE_LABEL[nivel]}
              </StPill>
            ))}
      </div>

      <button style={{ ...btnGhost, flex: '0 0 auto' }} onClick={onEditar}>Editar acceso</button>
    </div>
  )
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
              <Icon name="check" size={14} color="#5C8A5A" />
              <span style={{ color: 'var(--spira-ink)' }}>
                <strong style={{ fontWeight: 600 }}>{a.nombre}</strong> — {a.puede}
              </span>
            </div>
          ))}
          {descripcion.inertes.map((a) => (
            <div key={a.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13.5, color: '#B0823F' }}>
              <Icon name="clock" size={14} color="#B0823F" />
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
