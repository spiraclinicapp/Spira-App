import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { SearchableSelect } from '../../components/SearchableSelect'
import { MODULES } from '../../modules/registry'
import { setModuleAccess } from '../../data/team'
import type { TeamMemberRow } from '../../data/team'
import { useAccessAudit } from '../../data/team'
import {
  auditLine, canRevokeAdmin, describeAccess, MODULO_ADMIN, ROLE_LABEL, ROLE_RANK,
} from '../../lib/roles'
import type { Accesos, ModuleKey, ModuleRole } from '../../lib/roles'
import { formatDateAR } from '../../lib/dates'
import {
  ACCENT, StCard, StRow, StPill, StToggle, btnGhost, btnSolid, dialogCard, dialogScrim, dialogTitulo,
} from './primitives'
import { AccionesDeCuenta } from './AccionesDeCuenta'
import { useMarkDirty } from './SettingsModal'

/* ============================================================================
   Editor de acceso de UNA persona.

   Tres bloques y en este orden, que no es casual:
     1. MÓDULOS — la grilla de siempre, un nivel por módulo.
     2. ADMINISTRACIÓN — `gerencia` SOLO, en su propio bloque y con confirmación. No es un módulo:
        no tiene pantallas, es el permiso de tocar los accesos de todo el centro. Listarlo como una
        fila más al lado de Coordinación y Farmacia hacía que se marcara sin entender qué se estaba
        dando (decisión del Director, 2026-08-25).
     3. CON ESTO VE… — la consecuencia, en castellano, ANTES de guardar.

   El bloque 3 es el que evita el error caro de esta pantalla. Marcar "operator en Farmacia" no le
   dice a nadie qué va a encontrar la persona al entrar; y sobre todo, no avisa que darle un módulo
   que todavía no está construido no le da absolutamente nada.

   ⚠️ Es una SIMULACIÓN de solo lectura. NO es entrar como esa persona: suplantar a alguien en un
   sistema auditable rompe el rastro, porque las acciones quedarían firmadas por quien no las hizo.

   Guardado con BOTÓN (decisión del Director): los cambios se juntan y se aplican al confirmar. Por
   eso avisa al modal con `useMarkDirty` — si no, cerrar Ajustes con Esc, con la X, con un clic
   afuera o con el atrás del navegador los tiraría sin decir una palabra.
   ============================================================================ */

/** Los módulos asignables, en el orden del registro. `inicio` no se asigna (lo tiene todo el mundo)
    y la administración va aparte, en su propio bloque. */
const MODULOS_ASIGNABLES = MODULES.filter((m) => m.key !== 'inicio')

const NIVELES: ModuleRole[] = (Object.keys(ROLE_RANK) as ModuleRole[]).sort(
  (a, b) => ROLE_RANK[a] - ROLE_RANK[b],
)

/** Nombre visible de un módulo a partir de su key interna (para el historial). */
function nombreModulo(key: string): string {
  return MODULES.find((m) => m.key === key)?.name ?? key
}

interface Props {
  persona: TeamMemberRow
  /** Id del usuario en sesión: hace falta para el guard de "no te saques la administración". */
  actorId: string
  /** Ids de TODOS los que hoy administran accesos (para el guard del último). */
  administradores: string[]
  onCerrar: () => void
  /** Se llama tras guardar con éxito, para que la lista se refresque. */
  onGuardado: () => void
}

export function AccesoEditor({ persona, actorId, administradores, onCerrar, onGuardado }: Props) {
  /* El borrador arranca como una copia del acceso vigente. El vigente (`persona.accesos`) se
     conserva intacto porque es el `expected` que viaja al servidor en cada cambio: es lo que el
     navegador creía cuando el usuario empezó a editar, y compararlo contra la base es lo que
     detecta que otra administradora tocó lo mismo mientras tanto. */
  const [borrador, setBorrador] = useState<Accesos>({ ...persona.accesos })
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<string[]>([])
  const [confirmandoAdmin, setConfirmandoAdmin] = useState(false)

  const audit = useAccessAudit(persona.id)

  const cambios = useMemo(
    () =>
      MODULES.map((m) => m.key as ModuleKey)
        .concat(MODULO_ADMIN)
        .filter((k, i, arr) => arr.indexOf(k) === i && k !== ('inicio' as ModuleKey))
        .filter((k) => (borrador[k] ?? null) !== (persona.accesos[k] ?? null))
        .map((k) => ({ module: k, role: borrador[k] ?? null, expectedRole: persona.accesos[k] ?? null })),
    [borrador, persona.accesos],
  )

  useMarkDirty(cambios.length > 0)

  const descripcion = useMemo(() => describeAccess(borrador, MODULES), [borrador])
  const revocar = canRevokeAdmin(persona.id, actorId, administradores)
  const esAdminAhora = borrador[MODULO_ADMIN] != null

  const setNivel = (module: ModuleKey, role: ModuleRole | null) =>
    setBorrador((b) => {
      const siguiente = { ...b }
      if (role === null) delete siguiente[module]
      else siguiente[module] = role
      return siguiente
    })

  /* El switch de administración: DAR pide confirmación (es el único control de la app que reparte
     poder sobre todo el centro), QUITAR no la pide pero puede estar bloqueado por los guards. */
  const toggleAdmin = () => {
    if (esAdminAhora) {
      if (!revocar.puede) return
      setNivel(MODULO_ADMIN, null)
    } else {
      setConfirmandoAdmin(true)
    }
  }

  const guardar = async () => {
    setGuardando(true)
    setErrores([])
    const fallas: string[] = []
    /* Secuencial y no en paralelo: son escrituras sobre la misma persona y cada una lleva su
       compare-and-swap. En paralelo, dos que tocaran el mismo módulo se pisarían entre ellas —y
       además el orden importa para leer después el historial. */
    for (const c of cambios) {
      const { error } = await setModuleAccess({
        userId: persona.id,
        module: c.module,
        role: c.role,
        expectedRole: c.expectedRole,
      })
      if (error) fallas.push(`${nombreModulo(c.module)}: ${error}`)
    }
    setGuardando(false)
    if (fallas.length) {
      // Igual que en Mi cuenta: un renglón por lo que falló, y el resto SÍ quedó guardado.
      setErrores(fallas)
      onGuardado() // refresca para que el borrador se reconcilie con lo que de verdad quedó
      return
    }
    onGuardado()
    onCerrar()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* identidad */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={onCerrar} style={{ ...btnGhost, padding: '0 11px' }}>
          <Icon name="chevronLeft" size={15} color="var(--spira-muted)" /> Volver
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 17, color: 'var(--spira-ink)' }}>
            {persona.full_name}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>{persona.email ?? 'Sin correo registrado'}</div>
        </div>
      </div>

      {errores.length > 0 && (
        <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', border: '1px solid rgba(166, 72, 59, 0.20)', borderRadius: 10, padding: '10px 14px' }}>
          {errores.map((e) => <div key={e}>{e}</div>)}
        </div>
      )}

      {/* 1 · módulos */}
      <StCard title="Módulos" desc="Qué ve y con qué nivel">
        {MODULOS_ASIGNABLES.map((m, i) => (
          <StRow
            key={m.key}
            label={m.name}
            sub={m.proximamente ? 'Todavía no está construido: darle acceso no le muestra nada' : undefined}
            last={i === MODULOS_ASIGNABLES.length - 1}
          >
            <div style={{ width: 190 }}>
              <SearchableSelect
                id={`acceso-${m.key}`}
                value={borrador[m.key as ModuleKey] ?? 'none'}
                onChange={(v) => setNivel(m.key as ModuleKey, v === 'none' ? null : (v as ModuleRole))}
                options={[
                  { value: 'none', label: 'Sin acceso' },
                  ...NIVELES.map((n) => ({ value: n, label: ROLE_LABEL[n] })),
                ]}
                placeholder="Sin acceso"
                searchPlaceholder="Buscar nivel…"
                entity="nivel"
              />
            </div>
          </StRow>
        ))}
      </StCard>

      {/* 2 · administración — aparte, porque no es un módulo */}
      <StCard title="Administración del centro">
        <StRow
          label="Puede administrar los accesos"
          sub={
            esAdminAhora && !revocar.puede
              ? revocar.motivo ?? undefined
              : 'Ver a todo el equipo y cambiarle el acceso a cualquiera, incluido a vos'
          }
          last
        >
          <StToggle
            on={esAdminAhora}
            onClick={toggleAdmin}
            label="Puede administrar los accesos del centro"
          />
        </StRow>
      </StCard>

      {/* 3 · la consecuencia, antes de guardar */}
      <StCard title={`Con esto, ${persona.full_name.split(' ')[0]} ve…`} desc="Vista previa de lo que va a encontrar al entrar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 0 4px' }}>
          {descripcion.ve.length === 0 && descripcion.inertes.length === 0 && (
            <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>
              Sólo el Inicio. No va a poder entrar a ningún módulo.
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
          {/* El caso que nadie ve venir: acceso dado a un módulo que todavía no existe. */}
          {descripcion.inertes.map((a) => (
            <div key={a.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13.5 }}>
              <Icon name="clock" size={14} color="#B0823F" />
              <span style={{ color: '#B0823F' }}>
                <strong style={{ fontWeight: 600 }}>{a.nombre}</strong> — le diste acceso, pero el módulo
                todavía no está construido, así que no lo va a ver
              </span>
            </div>
          ))}
          {descripcion.noVe.length > 0 && (
            <div style={{ fontSize: 13, color: 'var(--spira-muted)' }}>
              No ve: {descripcion.noVe.join(' · ')}
            </div>
          )}
          {descripcion.administra && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13.5, color: ACCENT }}>
              <Icon name="shield" size={14} color={ACCENT} />
              <span>Además, puede cambiarle el acceso a cualquiera del centro.</span>
            </div>
          )}
        </div>
      </StCard>

      {/* 4 · la cuenta en sí: contraseña, baja y eliminación.
             Va DESPUÉS del acceso y ANTES del historial a propósito: primero lo que se edita y se
             guarda con el botón de abajo, después lo que se aplica en el acto, y al final el
             registro de las dos cosas. Estas acciones NO pasan por el borrador — se ejecutan al
             confirmarlas—, y por eso cada una tiene su propia confirmación. */}
      <AccionesDeCuenta
        persona={persona}
        actorId={actorId}
        onCambio={onGuardado}
        onEliminada={() => { onGuardado(); onCerrar() }}
      />

      {/* 5 · el historial (lo escribe el trigger de la 0003, acá sólo se lee) */}
      <StCard title="Historial de accesos" desc="Quién le cambió el acceso, y cuándo" pad={false}>
        {audit.loading && <div style={vacio}>Cargando…</div>}
        {!audit.loading && (audit.data?.length ?? 0) === 0 && (
          <div style={vacio}>Sin cambios registrados.</div>
        )}
        {(audit.data ?? []).map((r, i) => (
          <div
            key={r.id}
            style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '11px 18px', borderBottom: i < (audit.data?.length ?? 0) - 1 ? '1px solid var(--spira-line)' : 'none' }}
          >
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--spira-ink)' }}>{auditLine(r, nombreModulo)}</span>
            <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-muted)', flex: '0 0 auto' }}>
              {formatDateAR(r.occurred_at)}
            </span>
          </div>
        ))}
      </StCard>

      {/* acciones */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button style={btnSolid()} onClick={guardar} disabled={guardando || cambios.length === 0}>
          {guardando ? 'Guardando…' : cambios.length ? `Guardar ${cambios.length} cambio${cambios.length > 1 ? 's' : ''}` : 'Sin cambios'}
        </button>
        <button style={btnGhost} onClick={onCerrar} disabled={guardando}>Cancelar</button>
      </div>

      {/* Confirmación de DAR la administración. El único control de la app que reparte poder sobre
          todo el centro merece que se lea qué se está dando antes de marcarlo. */}
      {confirmandoAdmin && (
        <div style={dialogScrim} role="presentation" onMouseDown={() => setConfirmandoAdmin(false)}>
          <div style={dialogCard} role="alertdialog" aria-modal="true" aria-label="Dar la administración de accesos" onMouseDown={(e) => e.stopPropagation()}>
            <div style={dialogTitulo}>
              ¿Darle la administración del centro?
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', marginTop: 8, lineHeight: 1.5 }}>
              <strong style={{ fontWeight: 600, color: 'var(--spira-ink)' }}>{persona.full_name}</strong> va a poder ver
              los datos de todo el equipo y cambiarle el acceso a cualquiera — incluida tu propia cuenta.
              Queda registrado quién se lo dio.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button type="button" style={btnGhost} onClick={() => setConfirmandoAdmin(false)}>Cancelar</button>
              <button
                type="button"
                style={btnSolid()}
                onClick={() => { setNivel(MODULO_ADMIN, 'admin'); setConfirmandoAdmin(false) }}
              >
                Sí, darle la administración
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const vacio: CSSProperties = { padding: '16px 18px', fontSize: 13, color: 'var(--spira-muted)' }

/** Chip de nivel, reusado por la lista del equipo. */
export function ChipDeAcceso({ nombre, nivel }: { nombre: string; nivel: ModuleRole }) {
  return <StPill tone="neutral">{nombre} · {ROLE_LABEL[nivel]}</StPill>
}
