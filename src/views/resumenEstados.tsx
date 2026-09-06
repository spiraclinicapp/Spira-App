import type { ReactNode } from 'react'
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
      <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--spira-acc-deep-danger)' }}>
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
 * El cuerpo de una tarjeta del mosaico: cargando → error → vacío → filas, en ese orden.
 *
 * ESTABA COPIADO CINCO VECES, palabra por palabra, y lo único que cambiaba entre las copias era el
 * texto del `que=`. Una escalera repetida así es donde se cuela el olvido invisible: la tarjeta que
 * no dibuja su error y se queda en blanco, o la que ignora el aviso de ámbito y dice "no hay nada"
 * cuando en realidad el trabajo lo hizo otro. Ninguna de las dos se ve mirando la pantalla en un día
 * normal, porque en un día normal los tres estados no aparecen.
 *
 * EL ORDEN NO ES ARBITRARIO y por eso vive acá y no en cada tarjeta: cargando gana sobre vacío
 * —mostrar "no hay nada" mientras la consulta viaja es afirmar algo que todavía no se sabe— y el
 * error gana sobre las filas, porque una lista a medias con un error debajo se lee como una lista
 * completa.
 *
 * `vacioDelAmbito` PISA al vacío propio cuando existe. La distinción importa: "no hay reportes
 * pendientes" y "no atendiste vos ninguna visita con reportes pendientes" son cosas distintas, y la
 * segunda tiene salida ("Ver todo"). Quien decide cuál va es la vista, que es la única que conoce
 * el ámbito; la tarjeta sólo muestra lo que le den (ver el prop del mismo nombre en cada una).
 *
 * NO DECIDE SI LA LISTA ESTÁ VACÍA — se lo pasan hecho. Cada tarjeta tiene su propio criterio y no
 * siempre es `.length > 0`: Reportes se considera vacía cuando ninguna fila pasa `esReportePendiente`,
 * aunque la consulta haya traído filas. Calcularlo acá obligaría a esa regla a mudarse, y es de la
 * tarjeta.
 */
export function CuerpoDeTarjeta({
  loading, error, que, onReintentar, vacia, vacio, vacioDelAmbito, children,
}: {
  loading: boolean
  error: string | null
  /** Qué no se pudo cargar, en minúscula y con artículo: «las alertas», «los reportes pendientes». */
  que: string
  onReintentar: () => void
  vacia: boolean
  /** El vacío PROPIO de la tarjeta: lo que dice cuando de verdad no hay nada. */
  vacio: ReactNode
  /** El vacío del ámbito, si corresponde. Pisa al propio. */
  vacioDelAmbito?: ReactNode
  children: ReactNode
}) {
  if (loading) return <FilasFantasma />
  if (error) return <ErrorBloque que={que} onReintentar={onReintentar} />
  if (vacia) return <>{vacioDelAmbito ?? vacio}</>
  return <>{children}</>
}

/** El texto de un vacío propio. Existe para que las cinco tarjetas no repitan el mismo `style`. */
export function VacioSimple({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>{children}</div>
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
      {conteo.porLlegar > 0 && <>{sep}<span style={{ color: 'var(--spira-acc-deep-warn)', fontWeight: 600 }}>{conteo.porLlegar} por llegar</span></>}
      {conteo.enCentro > 0 && <>{sep}<span style={{ color: accent, fontWeight: 600 }}>{conteo.enCentro} en el centro</span></>}
      {conteo.finalizadas > 0 && <>{sep}<span style={{ color: 'var(--spira-muted)', fontWeight: 600 }}>{conteo.finalizadas} finalizadas</span></>}
    </span>
  )
}
