import { isVisitAlertDismissed } from './alertDismissalModel'
import type { AlertDismissalRow } from './alertDismissalModel'
import { inscripcionCerrada, isVisitDeviationRecorded } from './deviationModel'
import type { ProtocolDeviationRow } from './deviationModel'
import type { TrackVisitRow } from './visits'

/**
 * Qué alertas de visita siguen PIDIENDO ACCIÓN.
 *
 * Tres razones para que una salga de la lista, y ninguna la borra:
 *   1. está descartada (0070) — "esta alerta no correspondía";
 *   2. está documentada (0130) — "el desvío ocurrió, y acá está el porqué";
 *   3. su inscripción está cerrada — el paciente ya no está en el estudio.
 *
 * LA TERCERA ES LA MENOS OBVIA y vale el comentario. Al cerrar una inscripción, la 0127 borra las
 * visitas pendientes FUTURAS (`window_end >= current_date`) y CONSERVA las ya vencidas — lo cual
 * está bien: son evidencia de algo que pasó mientras el paciente estaba en el estudio. Pero sin
 * este filtro seguían reclamando para siempre sobre alguien que ya no está, y eso es sedimento
 * puro: nadie las va a resolver porque no hay nada que hacer con ellas. Siguen consultables —la
 * pantalla las muestra en su panel, marcadas "sin documentar"—; lo que dejan es de pedir acción.
 *
 * Vive fuera del `useMemo` de `useActiveAlerts` para poder testearse: es la regla que decide qué
 * ven las tres pantallas de alertas, y falla en silencio en los dos sentidos.
 */
export function alertasVigentes(
  alertas: readonly TrackVisitRow[],
  /* Los descartes NO van `readonly`: `isVisitAlertDismissed` recibe `AlertDismissalRow[]`, y
     marcarlo acá obligaría a un cast en la llamada. Un cast para acomodar una firma propia es
     deuda, no un tipo. */
  descartes: AlertDismissalRow[],
  desviaciones: readonly ProtocolDeviationRow[],
): TrackVisitRow[] {
  return alertas.filter(
    (a) =>
      !inscripcionCerrada(a.enrollment_status) &&
      !isVisitDeviationRecorded(desviaciones, a) &&
      !isVisitAlertDismissed(descartes, a),
  )
}
