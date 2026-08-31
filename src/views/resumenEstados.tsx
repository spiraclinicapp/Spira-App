import { Icon } from '../components/Icon'

/**
 * Los estados de un BLOQUE del resumen: cargando y error.
 *
 * POR QUÉ POR BLOQUE Y NO POR PANTALLA: las dos vistas de resumen tapaban todo con un solo cartel
 * mientras cualquiera de sus consultas siguiera en vuelo, y lo reemplazaban entero si cualquiera
 * fallaba. En Coordinación eso significaba que un error en la consulta de pacientes borraba las
 * alertas de ventana vencida, que es información clínica. A las 8 de la mañana, media pantalla es
 * muchísimo mejor que una pantalla vacía: se diseña para el humano cansado, no para el caso feliz.
 *
 * El fantasma NO PULSA. `DESIGN.md` prohíbe el movimiento decorativo y la regla del Director es
 * que nada late; un bloque quieto del tamaño correcto ya comunica "esto se va a llenar", y encima
 * no compite por la atención con el contenido que sí terminó de cargar.
 */

/** Filas fantasma del alto de una fila real, para el hueco mientras carga. */
export function FilasFantasma({ n = 3 }: { n?: number }) {
  return (
    <div style={{ marginTop: 6 }} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          style={{
            display: 'flex', flexDirection: 'column', gap: 7, padding: '11px 0',
            borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--spira-line)',
          }}
        >
          {/* línea del nombre y línea de los identificadores: el mismo esqueleto de la fila real */}
          <span style={{ height: 12, width: '46%', borderRadius: 6, background: 'var(--spira-line)' }} />
          <span style={{ height: 10, width: '72%', borderRadius: 6, background: 'var(--spira-line)' }} />
        </div>
      ))}
    </div>
  )
}

/**
 * Error de UN bloque. Cada uno nombra lo que no pudo cargar: tres «No pudimos cargar el resumen»
 * en la misma pantalla se leen como un solo error roto, no como tres bloques independientes.
 */
export function ErrorBloque({ que, onReintentar }: { que: string; onReintentar: () => void }) {
  return (
    <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 0 4px' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--spira-danger)' }}>
        <Icon name="alertCircle" size={16} color="var(--spira-danger)" />
        No pudimos cargar {que}.
      </span>
      <button
        type="button"
        onClick={onReintentar}
        style={{
          alignSelf: 'flex-start', height: 30, padding: '0 12px', borderRadius: 9,
          borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
          background: 'var(--spira-white)', color: 'var(--spira-ink)',
          fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
        }}
      >
        Reintentar
      </button>
    </div>
  )
}

/**
 * Contadores coloreados de la cabecera: «8 visitas · 3 por llegar · 2 en el centro».
 *
 * Cada segmento aparece solo si su número es mayor que cero — un «0 finalizadas» ocupa lugar para
 * decir nada. Los números van en tabulares para que no bailen al refrescarse.
 */
export function ContadoresDia({
  conteo, accent,
}: {
  conteo: { total: number; porLlegar: number; enCentro: number; finalizadas: number }
  accent: string
}) {
  const sep = <span style={{ color: 'var(--spira-muted)' }}>·</span>
  return (
    <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', display: 'inline-flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
      <span>{conteo.total} {conteo.total === 1 ? 'visita' : 'visitas'}</span>
      {conteo.porLlegar > 0 && <>{sep}<span style={{ color: 'var(--spira-warn)', fontWeight: 600 }}>{conteo.porLlegar} por llegar</span></>}
      {conteo.enCentro > 0 && <>{sep}<span style={{ color: accent, fontWeight: 600 }}>{conteo.enCentro} en el centro</span></>}
      {conteo.finalizadas > 0 && <>{sep}<span style={{ color: 'var(--spira-muted)', fontWeight: 600 }}>{conteo.finalizadas} finalizadas</span></>}
    </span>
  )
}
