import { describe, expect, it } from 'vitest'
import { alertaDeLaFicha } from './fichaAlertas'

/*
 * El modal «Alertas del paciente» rotulaba «No vino» como «Reporte de procedimiento vencido», con el
 * reloj: un rótulo equivocado que no falla, sólo dice otra cosa. Estos casos fijan el nombre de cada
 * clase, y sobre todo que «No vino» no hable de reportes.
 */
describe('alertaDeLaFicha', () => {
  it('REGRESIÓN · «No vino» dice que no vino y no tiene fecha nueva, no que venció un reporte', () => {
    const a = alertaDeLaFicha('por_reprogramar', 'V3 W4')
    expect(a.texto).toBe('No vino · sin fecha nueva · V3 W4')
    expect(a.texto.toLowerCase()).not.toContain('reporte')
    expect(a.icono).toBe('calendar')
  })

  it('la ventana vencida queda como estaba', () => {
    expect(alertaDeLaFicha('ventana_vencida', 'V5 W12')).toEqual({ texto: 'Ventana vencida · V5 W12', icono: 'alert' })
  })

  it('el reporte vencido queda como estaba', () => {
    expect(alertaDeLaFicha('item_vencido', 'V2')).toEqual({ texto: 'Reporte de procedimiento vencido · V2', icono: 'clock' })
  })

  it('un estado que no es de alerta dice el suyo, no el de otra clase', () => {
    const a = alertaDeLaFicha('completa', 'V1')
    expect(a.texto).not.toContain('Reporte')
    expect(a.texto).not.toContain('No vino')
    expect(a.texto).toContain('V1')
  })
})
