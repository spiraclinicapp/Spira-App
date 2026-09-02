import type { ProtocolStatus } from '../data/protocols'

/**
 * Color y rótulo del estado de un protocolo, compartidos por las dos pantallas que lo muestran
 * como punto + texto: la grilla de Pacientes (`ProtocolsView`) y el selector de protocolos de
 * Stock (`pharma/MedicamentosView`).
 *
 * Vive acá y no en `data/protocols` a propósito: el estado es dato, pero el COLOR es
 * presentación, y la capa de datos no tiene por qué conocer los tokens.
 *
 * `cerrado` usa `--spira-faint`, que NO es tono de texto (3,06:1): acá pinta sólo el punto de
 * 7px, que es gráfico y tiene piso de 3:1. El rótulo al lado va en `--spira-muted`.
 */
export function protocolStatusVar(status: ProtocolStatus): string {
  if (status === 'activo') return 'var(--spira-good)'
  if (status === 'pausado') return 'var(--spira-muted)'
  return 'var(--spira-faint)'
}

export function protocolStatusLabel(status: ProtocolStatus): string {
  if (status === 'activo') return 'Activo'
  if (status === 'pausado') return 'Pausado'
  return 'Cerrado'
}
