import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { todayISO } from '../../lib/dates'
import { setTaskDone } from '../../data/tareas'
import type { TaskRow } from '../../data/tareas'
import { duracionEstimada, estaHecha, etiquetaDeVencimiento } from '../tareas/estados'
import { TareaModal } from '../tareas/TareaModal'
import { esTareaMia } from './ambito'
import { CabeceraDeTarjeta, card, ChipDestino, filaAncha, MAX_FILAS } from './piezas'
import { CuerpoDeTarjeta, VacioSimple } from '../resumenEstados'

/**
 * "Tareas personales" en el mosaico del Resumen de Coordinación.
 *
 * Del handoff `docs/design_handoff_resumen_tareas_enfoque/`, cuyas cuatro variantes exploran
 * exactamente una cosa: dónde vive esta tarjeta. Va **arriba a la derecha** (variante A), que es la
 * columna de lo tuyo y lo que viene — tus tareas, lo que le pediste a Farmacia, quién llega mañana.
 *
 * ES LA ÚNICA TARJETA DEL MOSAICO QUE ESCRIBE, y el gesto es uno solo: tildar. Lo que querés hacer
 * con una tarea que ves a la mañana es tacharla, y `set_task_done` decide **en el servidor** qué
 * cierra —en `cualquiera` la tarea entera, en `cada_uno` sólo tu parte—, así que acá no se decide
 * nada. Editar, borrar y ver el detalle siguen viviendo en la pantalla de Tareas: un resumen que
 * abre un formulario de edición es más de lo que la situación pide.
 *
 * UNA TAREA DELEGADA NO LLEVA TILDE. Si la creaste y se la encargaste a otra persona, la RLS te la
 * muestra (sos el autor) pero no sos asignado, y `set_task_done` te rechazaría: un tilde que rebota
 * es peor que no tenerlo. `esTareaMia` decide LAS DOS COSAS —si entra en "Lo mío" y si lleva
 * tilde—, y que salgan de la misma función es lo que impide una fila filtrada como propia y
 * dibujada como ajena. El hueco del control se conserva (`anchoTilde`) para que el título de esas
 * filas no arranque corrido respecto de las otras.
 *
 * TRES COSAS DEL MOCK NO SE PORTAN:
 *
 * · **La precisión de minutos.** El mock dice "vencida hace 8 min" y "restan 12 min"; `due_date` es
 *   `date` (0108), sin hora. Lo que se puede decir es "venció 04/09" — y `estimated_minutes` es
 *   cuánto DURA la tarea, no cuánto falta, que el mock mezcla en la misma línea.
 * · **El contador en pastilla ámbar.** Va como dato al margen, en `muted`, igual que el "3 de 8" de
 *   Reportes y el "Mañana" de Próximas visitas. El patrón `color: tono / background: tono+alpha`
 *   viene fallando contraste en esta app, y acá no hay banda teñida que lo justifique.
 * · **Las dos columnas internas** (vencida / próxima) de la variante A: con tres filas y el ancho de
 *   media columna del mosaico, partirlas en dos deja títulos de veinte caracteres.
 */
export function TareasCard({
  rows, loading, error, onReintentar, userId, accent, accentSolid,
  onVerTodas, nombreDestino, onCambio, vacioDelAmbito,
}: {
  /** Ya filtradas por ámbito por la vista. Vienen CON las hechas: las saca esta tarjeta. */
  rows: TaskRow[]
  loading: boolean
  error: string | null
  onReintentar: () => void
  userId: string | null
  accent: string
  accentSolid: string
  onVerTodas?: () => void
  /** El rótulo del submódulo destino, leído del registry por la vista (ver `AlertasCard`). */
  nombreDestino?: string | null
  /** Refrescar la consulta: lo dispara el tilde y el alta. */
  onCambio: () => void
  /** Qué mostrar EN LUGAR del vacío propio, cuando el ámbito es "Lo mío". */
  vacioDelAmbito?: ReactNode
}) {
  const [nueva, setNueva] = useState(false)
  const [errorEscritura, setErrorEscritura] = useState<string | null>(null)
  /* Qué tarea espera al servidor. Por id y no un booleano global: con un booleano, tildar una fila
     deshabilitaría las otras dos. Mismo criterio que la pantalla de Tareas. */
  const [ocupada, setOcupada] = useState<string | null>(null)

  /* `todayISO` y no `new Date().toISOString()`: eso último da la fecha en UTC, que a la noche
     en Argentina ya es el día siguiente — una tarea de mañana se mostraría vencida. */
  const hoy = todayISO()
  /* Las pendientes, con `estaHecha` y NO con un `completed_at === null`: en modo `cada_uno` el
     cierre vive en los asignados y la columna de la tarea sigue en null aunque ya la haya cerrado
     todo el mundo. Filtrar por la columna mostraría como pendiente algo que el equipo terminó. */
  const pendientes = rows.filter((t) => !estaHecha(t, t.task_assignees))
  const visibles = pendientes.slice(0, MAX_FILAS)

  const marcar = async (t: TaskRow) => {
    setOcupada(t.id); setErrorEscritura(null)
    const res = await setTaskDone(t.id, true)
    setOcupada(null)
    /* El error se muestra y la fila NO se mueve: una tarea que se tacha sola y vuelve es peor que
       un aviso. Sólo se refresca cuando el servidor confirmó. */
    if (res.error) setErrorEscritura(res.error)
    else onCambio()
  }

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
      {/* El ícono venía en `--spira-acc-deep-warn`, que es el token de ADVERTENCIA, sobre una
          tarjeta que no advierte nada: una tarea con fecha lejana no es una alerta. Ahora toma el
          acento del módulo, como las otras cuatro. El ámbar queda reservado para severidad. */}
      <CabeceraDeTarjeta
        icon="clipboardCheck"
        titulo="Tareas personales"
        extra={pendientes.length > 0 ? (
          <span style={{ fontSize: 12.5, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>
            {pendientes.length} {pendientes.length === 1 ? 'pendiente' : 'pendientes'}
          </span>
        ) : undefined}
      />

      {errorEscritura && (
        <div role="alert" style={aviso}>
          <Icon name="alertCircle" size={15} color="var(--spira-danger)" />
          {errorEscritura}
        </div>
      )}

      <CuerpoDeTarjeta
        loading={loading}
        error={error}
        que="tus tareas"
        onReintentar={onReintentar}
        vacia={pendientes.length === 0}
        vacio={<VacioSimple>No te queda nada pendiente.</VacioSimple>}
        vacioDelAmbito={vacioDelAmbito}
      >
        <div style={{ marginTop: 8 }}>
          {visibles.map((t, i) => (
            <FilaDeTarea
              key={t.id}
              t={t}
              hoy={hoy}
              primera={i === 0}
              mia={esTareaMia(t, userId)}
              userId={userId}
              ocupada={ocupada === t.id}
              onMarcar={() => marcar(t)}
              onAbrir={onVerTodas}
              nombreDestino={nombreDestino}
            />
          ))}
        </div>
      </CuerpoDeTarjeta>

      {/* El pie NO es un `VerMas`: lleva dos acciones, y el `<button>` a ancho completo de aquél
          sólo admite una. La fila hereda la geometría de `filaAncha` (borde de arriba y sangrado a
          los bordes) y el gesto vive en cada botón. */}
      <div style={{ ...filaAncha, alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 'auto', cursor: 'default' }}>
        {onVerTodas && nombreDestino ? (
          <button
            type="button"
            className="spira-textlink spira-no-press spira-dest-group"
            onClick={onVerTodas}
            aria-label={`Ver todas tus tareas en ${nombreDestino}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--spira-acc-deep-track)' }}
          >
            Ver todas
            <ChipDestino nombre={nombreDestino} />
          </button>
        ) : <span />}
        {/* El alta desde acá es del handoff (variantes A y B) y tiene su momento: te acordás de algo
            mirando el resumen a la mañana. No cuesta nada cerrado — `TareaModal` pide el padrón del
            equipo desde adentro, así que esa consulta no corre hasta que se abre. */}
        <button
          type="button"
          onClick={() => setNueva(true)}
          style={{ ...botonPrimario, background: accentSolid }}
        >
          <Icon name="plus" size={14} color="var(--spira-on-accent)" stroke={2.6} />
          Nueva tarea
        </button>
      </div>

      {nueva && (
        <TareaModal
          tarea={null}
          accent={accent}
          accentSolid={accentSolid}
          onClose={() => setNueva(false)}
          onGuardada={() => { setNueva(false); onCambio() }}
        />
      )}
    </div>
  )
}

/**
 * Una fila. El GESTO GRANDE lleva a la pantalla de Tareas y el tilde la cierra ahí mismo.
 *
 * ES UN `<div role="button">` Y NO UN `<button>` porque contiene otro botón —el tilde—, y un botón
 * adentro de otro es HTML inválido; y porque el título necesita `text-overflow: ellipsis`, que
 * dentro de un `<button>` corta EN SECO, sin puntos suspensivos.
 *
 * Las dos guardas son la misma de siempre y las dos hacen falta: `stopPropagation` en el click del
 * tilde, y `e.target !== e.currentTarget` en el `onKeyDown`, o Enter sobre el tilde marca la tarea
 * Y navega.
 */
function FilaDeTarea({
  t, hoy, primera, mia, userId, ocupada, onMarcar, onAbrir, nombreDestino,
}: {
  t: TaskRow
  hoy: string
  primera: boolean
  mia: boolean
  userId: string | null
  ocupada: boolean
  onMarcar: () => void
  onAbrir?: () => void
  nombreDestino?: string | null
}) {
  const vence = etiquetaDeVencimiento(t.due_date, hoy)
  /* Quién la tiene, cuando no sos vos: es lo que reemplaza al tilde en esas filas y lo que explica
     por qué no está. El propio nombre no se dibuja nunca — en "tus tareas" decir "vos" es ruido. */
  const otros = t.task_assignees.filter((a) => a.user_id !== userId).map((a) => a.user_name)

  return (
    <div
      role={onAbrir ? 'button' : undefined}
      tabIndex={onAbrir ? 0 : undefined}
      className={onAbrir ? 'spira-row-link spira-no-press' : undefined}
      onClick={onAbrir}
      onKeyDown={onAbrir ? (e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir() }
      } : undefined}
      aria-label={onAbrir && nombreDestino ? `${t.title} — ver en ${nombreDestino}` : undefined}
      style={{
        ...filaAncha, alignItems: 'center',
        ...(primera ? { borderTopWidth: 0 } : null),
        ...(onAbrir ? null : { cursor: 'default' }),
      }}
    >
      {mia ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMarcar() }}
          disabled={ocupada}
          aria-label={`Marcar "${t.title}" como hecha`}
          /* SIN clase de realce propia, y sin `.spira-no-press`: hereda la micro-interacción global
             —se levanta 1px al apuntarlo y se asienta al pulsarlo—, que es exactamente la regla de
             la casa. El realce es ELEVACIÓN, nunca un borde de color: el acento en el borde está
             reservado para el estado "hecha" en la pantalla de Tareas, donde significa algo. */
          style={{
            ...tilde,
            cursor: ocupada ? 'default' : 'pointer',
            opacity: ocupada ? 0.5 : 1,
          }}
        />
      ) : (
        /* El hueco del tilde, para que el título no arranque corrido respecto de las filas de al
           lado. `aria-hidden` porque no hay nada que anunciar: la línea de abajo ya dice de quién es. */
        <span aria-hidden="true" style={{ width: anchoTilde, flex: '0 0 auto' }} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t.title}
        </div>
        <div style={{ fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {/* El estado va INTEGRADO en la oración, separado por punto medio y sin caja propia: el
              pill sólido con fondo teñido se descartó en el handoff, y es el mismo patrón que usan
              las filas de Dispensaciones y de Reportes. */}
          {mia
            ? t.estimated_minutes && <span style={{ color: 'var(--spira-muted)' }}>estimada {duracionEstimada(t.estimated_minutes)}</span>
            : otros.length > 0 && <span style={{ color: 'var(--spira-muted)' }}>le pediste a {otros.join(' · ')}</span>}
          {vence && (
            <>
              {((mia && t.estimated_minutes) || (!mia && otros.length > 0)) && <span style={{ color: 'var(--spira-faint)' }}> · </span>}
              <span style={{ color: vence.vencida ? 'var(--spira-acc-deep-danger)' : 'var(--spira-muted)', fontWeight: 700 }}>
                {vence.texto}
              </span>
            </>
          )}
          {/* Sin duración, sin gente y sin fecha la línea quedaría vacía y la fila se leería a medio
              dibujar. "Sin fecha" es cierto y es lo único que hay para decir. */}
          {!vence && !(mia && t.estimated_minutes) && !(!mia && otros.length > 0) && (
            <span style={{ color: 'var(--spira-muted)' }}>sin fecha</span>
          )}
        </div>
      </div>

    </div>
  )
}

const anchoTilde = 19

/* En LONGHANDS y no con la abreviada `border`: es la regla de la casa para cualquier borde que un
   estado pueda tocar (ver `gotcha-border-shorthand-longhand`). Acá hoy no cambia, pero el día que
   alguien le agregue un estado, la abreviada dejaría el borde en negro al salir de él. */
const tilde: CSSProperties = {
  width: anchoTilde, height: anchoTilde, borderRadius: 6,
  borderWidth: 1.5, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)', flex: '0 0 auto', padding: 0,
  display: 'grid', placeItems: 'center',
}

const botonPrimario: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px',
  border: 'none', borderRadius: 9, color: 'var(--spira-on-accent)',
  fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  flex: '0 0 auto',
}

const aviso: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginTop: 10,
  fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', lineHeight: 1.4,
}
