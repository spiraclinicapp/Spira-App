import type { ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { PatientLink } from '../components/PatientLink'
import { horaExacta, tiempoRelativo, tinte, TIPOS } from './notificaciones'
import type { Momento, TipoDeTarjeta } from './notificaciones'

/**
 * Lo que una tarjeta muestra, ya resuelto a texto. Las ocho clases de origen —alertas de visita,
 * reportes, IP, pedidos, constancias, correcciones— se aplanan a esto ANTES de dibujar, para que la
 * tarjeta se escriba una sola vez.
 */
export interface DatosDeTarjeta {
  /** Estable y única: es la clave de React y la de «leída» (`leidas.ts`). */
  clave: string
  tipo: TipoDeTarjeta
  pacienteNombre: string
  /** El IVRS de la inscripción en contexto (ver memoria «el IVRS es por estudio»). */
  pacienteCodigo: string | null
  protocoloCodigo: string | null
  motivo: string
  momento: Momento | null
}

/**
 * La tarjeta de notificación del handoff v2 (variante C5: ícono junto al nombre).
 *
 * ES LA MISMA EN EL LISTADO Y EN LA ALERTA DE LA CAMPANA. Un aviso que se ve igual que la fila del
 * panel no hay que aprenderlo dos veces; y como vive en un solo archivo, el día que alguien la
 * retoque no quedan contando lo mismo de dos formas distintas.
 *
 * DOS DESTINOS, como en Pendientes: la tarjeta entera abre lo que la notificación cuenta (la visita,
 * el tablero, la entrega), y el nombre lleva a quién —la ficha del paciente—. Por eso el nombre es
 * un `PatientLink` y no texto plano, aunque el mock lo dibuje plano: se ve igual hasta que lo apuntás.
 *
 * Es `role="button"` con `tabIndex` cuando hay a dónde ir. El `onKeyDown` filtra
 * `e.target !== e.currentTarget` por lo mismo que Pendientes: un Enter sobre el nombre o sobre el
 * tacho, que viven adentro, no tiene que disparar también el destino de la tarjeta.
 */
export function TarjetaNotificacion({
  datos, hoy, ahoraMs, noLeida = false, nueva = false, enAlerta = false, onAbrir, abrirPaciente, descartar,
}: {
  datos: DatosDeTarjeta
  /** `YYYY-MM-DD` de hoy y el instante actual: el relativo y la hora exacta dependen de los dos. */
  hoy: string
  ahoraMs: number
  noLeida?: boolean
  /** Recién llegada con el panel abierto: entra con su animación. */
  nueva?: boolean
  /** Adentro de la alerta de la campana: sin borde y sin «Descartar». */
  enAlerta?: boolean
  onAbrir?: () => void
  abrirPaciente?: () => void
  /** El botón «Descartar» (con su popover de motivo). Lo arma quien sabe si se puede archivar. */
  descartar?: ReactNode
}) {
  const tipo = TIPOS[datos.tipo]
  const hora = horaExacta(datos.momento, hoy)
  const relativo = tiempoRelativo(datos.momento, ahoraMs, hoy)
  const clases = [
    'spira-tarjeta',
    noLeida ? 'spira-tarjeta--no-leida' : '',
    nueva ? 'spira-tarjeta--nueva' : '',
    enAlerta ? 'spira-tarjeta--en-alerta' : '',
    // `spira-no-press`: la fila se RESALTA, no se levanta (`role="button"` la metería en la
    // micro-interacción global).
    onAbrir ? 'spira-tarjeta--link spira-no-press' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={clases}
      role={onAbrir ? 'button' : undefined}
      tabIndex={onAbrir ? 0 : undefined}
      onClick={onAbrir}
      onKeyDown={onAbrir
        ? (e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir() }
        }
        : undefined}
      aria-label={onAbrir
        ? `${noLeida ? 'Sin leer. ' : ''}${datos.pacienteNombre} — ${datos.motivo}${relativo ? `, ${relativo}` : ''}`
        : undefined}
    >
      {noLeida && !enAlerta && <span className="spira-tarjeta-punto" aria-hidden="true" />}

      <div className="spira-tarjeta-enc">
        <span className="spira-tarjeta-dato">Paciente<b>{datos.pacienteCodigo ?? '—'}</b></span>
        {datos.protocoloCodigo && (
          <span className="spira-tarjeta-dato">Protocolo<b>{datos.protocoloCodigo}</b></span>
        )}
        <span className="spira-tarjeta-hora-slot">
          <span className="spira-tarjeta-hora">{hora}</span>
          {!enAlerta && descartar}
        </span>
      </div>

      <div className="spira-tarjeta-fila">
        {/* `tinte()` y no concatenar alpha sobre el token: `var(--…)18` es CSS inválido y el cuadrado
            queda transparente sin un solo warning. */}
        <span className="spira-tarjeta-icono" style={{ background: tinte(tipo.base, 10) }} aria-hidden="true">
          <Icon name={tipo.icono} size={12} stroke={2} color={tipo.tinta} />
        </span>
        <span className="spira-tarjeta-nombre" title={datos.pacienteNombre}>
          <PatientLink onOpen={abrirPaciente} label={`Abrir la ficha de ${datos.pacienteNombre}`}>
            {datos.pacienteNombre}
          </PatientLink>
        </span>
        {relativo && <span className="spira-tarjeta-rel">{relativo}</span>}
      </div>

      <div className="spira-tarjeta-motivo" title={datos.motivo}>{datos.motivo}</div>
    </div>
  )
}
