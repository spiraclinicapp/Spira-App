import type { CSSProperties } from 'react'
import { Modal } from '../../../components/Modal'
import { btnOutline } from '../../../components/buttons'
import { useDispensationHistorial } from '../../../data/pharma'
import type { NombreMedicamento } from './historial'
import { interpretarHistorial } from './historial'
import { LineaDeTiempo } from './LineaDeTiempo'

/**
 * Todo lo que le pasó al pedido, leído del `audit_log`.
 *
 * Existe porque la farmacéutica se topa seguido con un pedido que "está raro" —volvió a la cola,
 * tiene un renglón que no pidió, el contador en cero— y hasta ahora la única forma de saber por qué
 * era preguntarle a quien lo tocó. El registro ya estaba; lo que faltaba era una ventana.
 *
 * SE LEE COMO UNA CRÓNICA, NO COMO UN DIFF (reescrito el 2026-08-15, pedido del Director: "se ve el
 * código, no es visual para que lo vea un operario"). La versión anterior listaba los campos que
 * habían cambiado con su nombre de columna y su valor crudo —`executed_by → c6d75358-2901-…`,
 * `status → en_preparacion`, y un `notes — → —` por cada columna que quedó vacía— que es el schema,
 * no un historial.
 *
 * Tres piezas, cada una con un trabajo:
 *   · este archivo    — consigue los datos y pone el marco
 *   · `historial.ts`  — traduce cada fila del log a un hecho en castellano (puro, testeado)
 *   · `LineaDeTiempo` — lo pinta
 *
 * La traducción vive separada y con tests porque una regla mal puesta no se ve rota: se ve como una
 * frase prolija que dice algo que no pasó.
 */
export function ModalHistorial({ requestId, codigo, nombreMedicamento, onClose }: {
  requestId: string
  codigo: string
  /** Resuelve `medication_id` → nombre. Sin esto los renglones dirían qué pasó, pero no con qué. */
  nombreMedicamento?: NombreMedicamento
  onClose: () => void
}) {
  const { data, loading, error } = useDispensationHistorial(requestId)
  const eventos = interpretarHistorial(data ?? [], nombreMedicamento)

  return (
    <Modal title={`Historial · ${codigo}`} onClose={onClose} maxWidth={620} icon="clock">
      {loading && <div style={aviso}>Buscando el historial…</div>}
      {error && <div style={{ ...aviso, color: 'var(--spira-danger)' }} role="alert">{error}</div>}

      {!loading && !error && eventos.length === 0 && (
        <div style={aviso}>Este pedido todavía no tiene movimientos registrados.</div>
      )}

      {eventos.length > 0 && <LineaDeTiempo eventos={eventos} />}

      <div style={{ display: 'flex', marginTop: 18 }}>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onClose} style={btnOutline}>Cerrar</button>
      </div>
    </Modal>
  )
}

const aviso: CSSProperties = {
  fontSize: 13, color: 'var(--spira-muted)', lineHeight: 1.5, marginTop: 4,
}
