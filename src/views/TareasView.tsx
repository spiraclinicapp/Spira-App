import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { ActionMenu } from '../components/ActionMenu'
import { EmptyState } from '../components/EmptyState'
import { useAuth } from '../lib/auth'
import { formatAR, todayISO } from '../lib/dates'
import { useMyTasks, setTaskDone, deleteTask } from '../data/tareas'
import type { TaskRow } from '../data/tareas'
import {
  avanceDeTarea, cerreYoMiParte, estadoDeTarea, estaHecha, puedeEditar, puedeEliminar,
} from './tareas/estados'
import type { EstadoDeTarea } from './tareas/estados'
import { TareaModal } from './tareas/TareaModal'
import type { ViewProps } from './types'

/**
 * `Inicio › Tareas` — la agenda de pendientes propios, que hasta hoy era un renglón del menú
 * prometiendo una pantalla que no existía (caía al `Placeholder`).
 *
 * NO HAY MOCK DE ESTA PANTALLA, y conviene saberlo antes de "corregirla" contra el handoff: las
 * cuatro variantes de `design_handoff_resumen_tareas_enfoque` exploran dónde poner una CARD de
 * tareas dentro del mosaico del Resumen de Coordinación, no cómo es esta vista. De ese handoff se
 * toman los **campos** (título, duración estimada, vencimiento) y los **colores de los tags**;
 * el layout sigue el sistema y las pantallas de lista que ya existen.
 *
 * SE AGRUPA POR URGENCIA Y NO POR PERSONA NI POR FECHA EXACTA: la pregunta que trae a alguien acá
 * es "qué tengo que hacer", y la respuesta útil se ordena por cuánto apremia. Las hechas van al
 * final y plegadas — no se esconden, porque deshacer un tilde equivocado es el error más común de
 * una lista de pendientes.
 *
 * EL CIERRE LO RESUELVE EL SERVIDOR (`set_task_done`): en `cualquiera` cierra la tarea y en
 * `cada_uno` sólo TU parte. Esta vista no decide cuál — sólo dibuja lo que la regla pura le dice.
 */
export function TareasView({ module, submodule, setHeader }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  const { profile } = useAuth()
  const userId = profile?.id ?? null
  const tareas = useMyTasks()

  const [abierta, setAbierta] = useState<TaskRow | 'nueva' | null>(null)
  const [verHechas, setVerHechas] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* Qué tarea está esperando al servidor. Es por id y no un booleano global: con un booleano,
     tildar una fila deshabilitaría las cinco de al lado. */
  const [ocupada, setOcupada] = useState<string | null>(null)

  /* El botón de alta vive en el encabezado del shell, como en el resto de las pantallas de lista.
     Se limpia al desmontar o quedaría colgado en la siguiente vista. */
  useEffect(() => {
    setHeader?.({ actions: [{ key: 'nueva', label: 'Nueva tarea', icon: 'plus', primary: true, onClick: () => setAbierta('nueva') }] })
    return () => setHeader?.(null)
  }, [setHeader])

  const hoy = todayISO()
  const filas = tareas.data ?? []

  /* Los cinco grupos, en orden de urgencia. Se arma una sola vez por render y no con cinco
     `filter` sueltos: así una tarea no puede caer en dos grupos ni quedarse fuera de todos. */
  const grupos = useMemo(() => {
    const g: Record<EstadoDeTarea, TaskRow[]> = {
      vencida: [], vence_hoy: [], proxima: [], sin_fecha: [], hecha: [],
    }
    for (const t of filas) g[estadoDeTarea(t, t.task_assignees, hoy)].push(t)
    return g
  }, [filas, hoy])

  const pendientes = grupos.vencida.length + grupos.vence_hoy.length + grupos.proxima.length + grupos.sin_fecha.length

  const marcar = async (t: TaskRow, done: boolean) => {
    setOcupada(t.id); setError(null)
    const res = await setTaskDone(t.id, done)
    setOcupada(null)
    if (res.error) setError(res.error)
    else tareas.refetch()
  }

  const eliminar = async (t: TaskRow) => {
    setOcupada(t.id); setError(null)
    const res = await deleteTask(t.id)
    setOcupada(null)
    if (res.error) setError(res.error)
    else tareas.refetch()
  }

  if (tareas.loading) {
    return <EmptyState accent={accent} icon={submodule.icon} title="Cargando tus tareas…" description="Un momento." />
  }
  if (tareas.error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={avisoError}>
          <Icon name="alertCircle" size={17} color="var(--spira-danger)" />
          {tareas.error}
        </div>
        <button onClick={tareas.refetch} style={{ ...botonSuave, alignSelf: 'flex-start' }}>Reintentar</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && (
        <div style={avisoError}>
          <Icon name="alertCircle" size={17} color="var(--spira-danger)" />
          {error}
        </div>
      )}

      {filas.length === 0 ? (
        <EmptyState
          accent={accent}
          icon={submodule.icon}
          title="Todavía no tenés tareas"
          description="Anotá acá lo que tenés pendiente y lo que le pediste a alguien del equipo. Podés ponerle fecha, o dejarla para cuando puedas."
        />
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>
            {pendientes === 0 ? 'No te queda nada pendiente.'
              : `${pendientes} ${pendientes === 1 ? 'tarea pendiente' : 'tareas pendientes'}`}
          </div>

          {(['vencida', 'vence_hoy', 'proxima', 'sin_fecha'] as const).map((k) =>
            grupos[k].length === 0 ? null : (
              <section key={k} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span className="spira-eyebrow">{TITULO_GRUPO[k]}</span>
                  <span style={{ fontSize: 12, color: 'var(--spira-muted)' }}>{grupos[k].length}</span>
                  <span style={{ flex: 1, height: 1, background: 'var(--spira-line)' }} />
                </div>
                <div style={lista}>
                  {grupos[k].map((t) => (
                    <FilaDeTarea
                      key={t.id} t={t} userId={userId} hoy={hoy} accentSolid={accentSolid}
                      ocupada={ocupada === t.id}
                      onMarcar={marcar} onEditar={() => setAbierta(t)} onEliminar={eliminar}
                    />
                  ))}
                </div>
              </section>
            ),
          )}

          {/* Las hechas NO se esconden: deshacer un tilde equivocado es el error más común de una
              lista de pendientes, y si no están no hay dónde deshacerlo. Van plegadas y al final
              para que no compitan con lo que falta. */}
          {grupos.hecha.length > 0 && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={() => setVerHechas((v) => !v)}
                aria-expanded={verHechas}
                style={pieDespliegue}
              >
                <span className="spira-eyebrow">Hechas</span>
                <span style={{ fontSize: 12, color: 'var(--spira-muted)' }}>{grupos.hecha.length}</span>
                <span style={{ flex: 1, height: 1, background: 'var(--spira-line)' }} />
                <Icon name={verHechas ? 'chevronUp' : 'chevronDown'} size={15} color="var(--spira-muted)" stroke={2.2} />
              </button>
              {verHechas && (
                <div style={lista}>
                  {grupos.hecha.map((t) => (
                    <FilaDeTarea
                      key={t.id} t={t} userId={userId} hoy={hoy} accentSolid={accentSolid}
                      ocupada={ocupada === t.id}
                      onMarcar={marcar} onEditar={() => setAbierta(t)} onEliminar={eliminar}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {abierta && (
        <TareaModal
          tarea={abierta === 'nueva' ? null : abierta}
          accent={accent}
          accentSolid={accentSolid}
          onClose={() => setAbierta(null)}
          onGuardada={() => { setAbierta(null); tareas.refetch() }}
        />
      )}
    </div>
  )
}

const TITULO_GRUPO: Record<'vencida' | 'vence_hoy' | 'proxima' | 'sin_fecha', string> = {
  vencida: 'Vencidas', vence_hoy: 'Vencen hoy', proxima: 'Próximas', sin_fecha: 'Sin fecha',
}

/**
 * Una tarea. El tilde de la izquierda es el gesto principal y por eso es un `<button>` propio con
 * su `aria-pressed`: marcar hecha es lo que se hace acá el 90 % de las veces, y esconderlo en el
 * menú ⋮ sería enterrar la acción más común.
 *
 * EL RESTO DE LA FILA NO ES CLICKEABLE. Es deliberado y se aparta de las otras listas de la app
 * (donde la fila entera abre su ítem): acá el gesto grande está a dos píxeles del tilde, y una
 * fila que abre un modal cuando querías tildarla es la clase de error que se comete apurado.
 * Editar tiene su lugar en el menú, con nombre.
 */
function FilaDeTarea({ t, userId, hoy, accentSolid, ocupada, onMarcar, onEditar, onEliminar }: {
  t: TaskRow
  userId: string | null
  hoy: string
  accentSolid: string
  ocupada: boolean
  onMarcar: (t: TaskRow, done: boolean) => void
  onEditar: () => void
  onEliminar: (t: TaskRow) => void
}) {
  const hecha = estaHecha(t, t.task_assignees)
  const miParte = cerreYoMiParte(t, t.task_assignees, userId)
  const avance = avanceDeTarea(t, t.task_assignees)
  const estado = estadoDeTarea(t, t.task_assignees, hoy)
  const tono = TONO_ESTADO[estado]

  const acciones = []
  if (puedeEditar(t, t.task_assignees, userId)) {
    acciones.push({ key: 'editar', label: 'Editar la tarea', icon: 'pencil' as const, onClick: onEditar, disabled: ocupada })
  }
  if (puedeEliminar(t, userId)) {
    acciones.push({ key: 'borrar', label: 'Eliminar la tarea', icon: 'trash' as const, danger: true, disabled: ocupada, onClick: () => onEliminar(t) })
  }

  /* Quién la tiene. El propio nombre no se dibuja: en una lista de "mis tareas" decir "vos" en
     cada renglón es ruido. Lo que sí importa es quién MÁS está, o quién te la asignó. */
  const otros = t.task_assignees.filter((a) => a.user_id !== userId)
  const meLaAsignaron = t.created_by !== userId

  return (
    <div style={fila}>
      <button
        type="button"
        onClick={() => onMarcar(t, !miParte)}
        aria-pressed={miParte}
        aria-label={miParte ? `Desmarcar "${t.title}"` : `Marcar "${t.title}" como hecha`}
        disabled={ocupada}
        style={{
          ...tilde,
          borderColor: miParte ? accentSolid : 'var(--spira-line-2)',
          background: miParte ? accentSolid : 'var(--spira-white)',
          cursor: ocupada ? 'default' : 'pointer',
          opacity: ocupada ? 0.5 : 1,
        }}
      >
        {miParte && <Icon name="check" size={13} color="var(--spira-on-accent)" stroke={3} />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14.5, fontWeight: 600, lineHeight: 1.35,
          color: hecha ? 'var(--spira-muted)' : 'var(--spira-ink)',
          textDecoration: hecha ? 'line-through' : undefined,
        }}>
          {t.title}
        </div>
        {t.detail && (
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, lineHeight: 1.4 }}>{t.detail}</div>
        )}

        <div style={metadatos}>
          {t.due_date && (
            <span style={{ ...parte, color: tono, fontWeight: estado === 'vencida' || estado === 'vence_hoy' ? 700 : 600 }}>
              <Icon name="calendar" size={12} color={tono} stroke={2.2} />
              {/* El tiempo verbal sale de la FECHA y no del estado. Atado al estado, una tarea
                  hecha tarde decía "vence 29/08/2026" —presente sobre una fecha que ya pasó—,
                  porque su estado es `hecha` y no `vencida`. Son dos preguntas distintas: si la
                  fecha pasó, y si la tarea se resolvió. */}
              {t.due_date < hoy ? 'venció' : 'vence'} {formatAR(t.due_date)}
            </span>
          )}
          {t.estimated_minutes && (
            <span style={parte}>
              <Icon name="clock" size={12} color="var(--spira-faint)" stroke={2.2} />
              {duracion(t.estimated_minutes)}
            </span>
          )}
          {avance && (
            <span style={{ ...parte, fontWeight: 700, color: 'var(--spira-ink)' }}>
              <Icon name="users" size={12} color="var(--spira-faint)" stroke={2.2} />
              {avance.hechas} de {avance.total}
            </span>
          )}
          {otros.length > 0 && (
            <span style={parte}>
              {otros.map((a) => a.user_name).join(' · ')}
            </span>
          )}
          {meLaAsignaron && (
            <span style={parte}>te la asignó {t.created_by_name}</span>
          )}
        </div>
      </div>

      <span style={{ flex: '0 0 auto' }}>
        <ActionMenu items={acciones} ariaLabel={`Más acciones de la tarea "${t.title}"`} />
      </span>
    </div>
  )
}

/** "20 min", "1 h", "1 h 30". Sin decimales: nadie estima un pendiente en horas con coma. */
function duracion(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const r = min % 60
  return r === 0 ? `${h} h` : `${h} h ${r}`
}

/* Los tonos del handoff: `vence`/`urgente` en ámbar profundo y `atrasada` en rojo. Van por token y
   no por hex crudo porque son TEXTO: un hex no se aclara en tema oscuro (ver `alertSeverity.ts`). */
const TONO_ESTADO: Record<EstadoDeTarea, string> = {
  vencida: 'var(--spira-acc-deep-danger)',
  vence_hoy: 'var(--spira-acc-deep-warn)',
  proxima: 'var(--spira-muted)',
  sin_fecha: 'var(--spira-muted)',
  hecha: 'var(--spira-muted)',
}

const lista: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 'var(--spira-radius-lg)', padding: '2px 18px',
}
/* El separador es de la fila, así que la primera no lo lleva (`:first-child` no se puede escribir
   inline; el borde va arriba y el padding del contenedor lo absorbe). */
const fila: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 0',
  borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--spira-line)',
}
const tilde: CSSProperties = {
  width: 20, height: 20, marginTop: 1, flex: '0 0 auto', borderRadius: 6,
  borderWidth: 1.5, borderStyle: 'solid', display: 'grid', placeItems: 'center', padding: 0,
}
const metadatos: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 5,
  fontSize: 12, color: 'var(--spira-muted)',
}
const parte: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }
const pieDespliegue: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
  background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
  font: 'inherit',
}
const avisoError: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, fontSize: 13,
  color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)',
  borderRadius: 10, padding: '10px 13px',
}
const botonSuave: CSSProperties = {
  height: 38, padding: '0 14px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  borderRadius: 10, background: 'var(--spira-white)', color: 'var(--spira-ink)',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
}
