import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { SearchableSelect } from '../../components/SearchableSelect'
import { formatDateAR } from '../../lib/dates'
import type { IpDocumentRow } from '../../data/pharma'
import { MOTIVOS_FUERA_CRONOGRAMA } from './motivosFueraCronograma'
import { ConstanciaDropzone, ConstanciaPendiente, ConstanciaVista } from './ConstanciaIp'
import type { Badge } from './dispensaciones/estados'
import { Sub, WARN_TINT, btnChico, itemRow, muted, pillBase } from './panelDispensacion'
import type { ContenidoIp } from './seccionIpModel'

/** Aviso "Falta la constancia": texto en TINTA, el ámbar queda solo en el ícono y el fondo
 *  (`--spira-warn` a 12,5px bold sobre este tinte da 3,2:1; AA pide 4,5:1 — medido en el mock). */
const warnBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 11px', borderRadius: 10,
  background: WARN_TINT, fontSize: 12.5, color: 'var(--spira-ink)', fontWeight: 600, marginBottom: 9,
}

/** Desenlace de un pedido YA cerrado: el mismo renglón del pie común (fecha · estado · comprobante)
 *  pero sin el filete, porque no cierra la tarjeta sino la sección. */
const desenlaceStyle: CSSProperties = {
  marginTop: 9, display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap',
}

/** Una línea de texto de la sección: el estado vacío, el cierre, el desenlace. */
const lineaStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--spira-ink-soft)',
}

/** La línea con un botón al lado (`no_prevista` y `desenlace`, mismo armado de renglón). `wrap` + base
 *  de 200px: en la notebook (tarjeta de ~560px) texto y botón van en un renglón como en el mock; en
 *  una tarjeta angosta el botón baja. Sin eso, con 286px de tarjeta el botón se quedaba con todo y el
 *  texto caía a 38px de ancho, una palabra por renglón (QA, 2026-09-14). */
const lineaConAccion: CSSProperties = { ...lineaStyle, flexWrap: 'wrap', rowGap: 8 }

/** El texto de esa línea: base de 200px para que el botón tenga dónde bajar. */
const textoDeLineaConAccion: CSSProperties = { flex: '1 1 200px', minWidth: 0 }


export interface ExcepcionIp {
  /** El aviso de dispensación reciente, en tono de alerta (R11: hasta que la 3b lo reemplace). */
  aviso: ReactNode
  /** El motivo SELLADO en el pedido. `null` = todavía hay que elegirlo en el desplegable. */
  motivoSellado: string | null
  motivo: string
  onMotivo: (v: string) => void
}

/**
 * La sección «Producto en investigación» de la tarjeta de Dispensación. Existe SIEMPRE (plan D18):
 * qué muestra lo decide `contenidoSeccionIp` (reglas y porqués en `seccionIpModel.ts`); acá sólo se dibuja.
 *
 * Es de presentación a propósito: la constancia elegida, el motivo y el envío siguen viviendo en el
 * panel, porque la solicitud es UNA —renglones y constancia salen juntos por `enviar()`— y partir ese
 * estado entre dos componentes es partir el acto.
 *
 * LA EXCEPCIÓN VIVE ADENTRO. Antes el IP fuera de cronograma abría una subsección aparte, «Fuera de
 * cronograma», arriba de todo, y se llegaba con un botón suelto al pie. Ahora el rótulo de ESTA
 * sección pasa a ámbar con ⓘ —el tratamiento de siempre para la excepción— y adentro van, en orden,
 * el aviso de dispensación reciente, el motivo y la constancia: todo lo del IP en un lugar.
 */
export function SeccionIp({
  contenido, excepcion, readOnly, accent, busy,
  archivo, onQuitarArchivo, onElegirArchivo,
  constanciaAbierta, reemplazando, onReemplazar,
  constanciaIncompleta, entregado, desenlace, onRegistrarEntrega, onPedirFueraDeCronograma, salidas,
}: {
  contenido: ContenidoIp
  /** `null` = la visita no está en excepción. */
  excepcion: ExcepcionIp | null
  readOnly: boolean
  accent: string
  busy: boolean
  archivo: File | null
  onQuitarArchivo: () => void
  onElegirArchivo: (f: File) => void
  constanciaAbierta: IpDocumentRow | null
  reemplazando: boolean
  onReemplazar: () => void
  /** El pedido abierto la exige y no la tiene (ver `constanciaIncompleta` en el panel). */
  constanciaIncompleta: boolean
  entregado: { doc: IpDocumentRow; pedidoEl: string; badge: Badge; comprobante: number | null } | null
  /** Qué pasó con el IP, en la frase de `v_visit_ip_status` (`desenlaceIp`): el cierre y el desenlace. */
  desenlace: string | null
  /** La puerta de la sección (spec 2026-09-19, E3): abre el modo corrección. `null` = no se ofrece. */
  onRegistrarEntrega: (() => void) | null
  /** `null` = no se ofrece (en la ficha). */
  onPedirFueraDeCronograma: (() => void) | null
  /** Las salidas del IP (`IpSalidas`), o `null` cuando no hay ninguna disponible. */
  salidas?: ReactNode
}) {
  let cuerpo: ReactNode = null
  switch (contenido) {
    case 'pendiente':
      // Elegida y todavía sin enviar. Manda sobre cualquier otra rama —incluso sobre una constancia
      // ya cargada, cuando se está reemplazando—: es lo que va a quedar cuando se cierre la solicitud.
      cuerpo = archivo && <ConstanciaPendiente file={archivo} accent={accent} onQuitar={onQuitarArchivo} />
      break
    case 'en_curso':
      // Hay un pedido abierto que SÍ acepta la constancia: se carga o se reemplaza CONTRA ÉL.
      cuerpo = readOnly
        ? constanciaAbierta
          ? <ConstanciaVista doc={constanciaAbierta} size="chica" accent={accent} />
          : <div style={{ ...muted, padding: '2px 0' }}>Sin constancia cargada.</div>
        : constanciaAbierta && !reemplazando
          ? <ConstanciaVista doc={constanciaAbierta} size="chica" accent={accent} onReemplazar={onReemplazar} />
          : <ConstanciaDropzone accent={accent} busy={busy} onFile={onElegirArchivo} />
      break
    case 'entregado':
      // La constancia es la nota fuente de una entrega que ya ocurrió. Va en LECTURA (sin
      // "Reemplazar") y en lugar del dropzone —que acá crearía un segundo pedido para una visita ya
      // dispensada— va el desenlace.
      cuerpo = entregado && (
        <>
          <ConstanciaVista doc={entregado.doc} size="chica" accent={accent} />
          <div style={desenlaceStyle}>
            <span style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>
              Pedido del {formatDateAR(entregado.pedidoEl)}
            </span>
            <span style={{ ...pillBase, color: entregado.badge.color, background: entregado.badge.tint }}>
              {entregado.badge.label}
            </span>
            {entregado.comprobante !== null && (
              <span style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>
                Comprobante N° <span className="spira-mono">{entregado.comprobante}</span>
              </span>
            )}
          </div>
        </>
      )
      break
    case 'cargando':
      // Sin este freno, durante la primera lectura la sección afirma "no lo pide" o abre un dropzone
      // que crearía un pedido NUEVO sobre una visita que ya tiene uno. Los refetch conservan las filas
      // viejas (`useSupabaseQuery`), así que es sólo el primer montaje.
      cuerpo = <div style={{ ...muted, padding: '2px 0' }}>Cargando…</div>
      break
    case 'cierre':
      // Sin tilde: «No corresponde» no es algo hecho (no cuenta en Procedimientos, `cuentaIp`), y el
      // mismo texto sirve para los dos cierres. Deshacerlo es de la fila de Procedimientos, no de acá.
      cuerpo = <div style={lineaStyle}>{desenlace ?? 'Se cerró sin entrega en esta visita.'}</div>
      break
    case 'desenlace':
      // Lo que dice `v_visit_ip_status`, con la MISMA frase que la fila de Procedimientos (spec del
      // 2026-09-19, E1). Con el IP sin entregar va su propia puerta (E3): abre el modo corrección de la
      // tarjeta, el mismo que «Registrar entrega» de concomitante, que nadie iba a buscar ahí para el IP.
      cuerpo = (
        <div style={lineaConAccion}>
          <span style={textoDeLineaConAccion}>{desenlace ?? 'Sin entrega registrada.'}</span>
          {onRegistrarEntrega && (
            <button
              type="button" onClick={onRegistrarEntrega} style={btnChico}
              aria-label="Registrar la entrega del producto en investigación"
            >
              Registrar la entrega
            </button>
          )}
        </div>
      )
      break
    case 'historica':
      // Fechada antes de la 0119, cuando Spira no registraba el IP: el dato vivía en papel y la base no
      // sabe qué pasó. Se dice eso y nada más (E2): sin acción y sin alerta.
      cuerpo = <div style={{ ...muted, padding: '2px 0' }}>Visita anterior al registro del IP en Spira.</div>
      break
    case 'sin_registro':
      // Prevista y sin nada en la base. El caso raro es una visita fechada después de la 0119 con la marca
      // en falso y el cronograma tildado más tarde. También es el resguardo si la marca no se pudo leer.
      cuerpo = <div style={{ ...muted, padding: '2px 0' }}>Sin entrega registrada.</div>
      break
    case 'adjuntar':
      cuerpo = <ConstanciaDropzone accent={accent} busy={busy} onFile={onElegirArchivo} />
      break
    case 'no_prevista':
      cuerpo = (
        <div style={lineaConAccion}>
          <span style={textoDeLineaConAccion}>El cronograma no lo pide en esta visita.</span>
          {onPedirFueraDeCronograma && (
            <button
              type="button" onClick={onPedirFueraDeCronograma} style={btnChico}
              aria-label="Pedir producto en investigación fuera de cronograma"
            >
              <Icon name="plus" size={14} color={accent} /> Pedir fuera de cronograma
            </button>
          )}
        </div>
      )
      break
    default: {
      // Guardia de exhaustividad: si `ContenidoIp` suma un caso nuevo sin su `case` acá, esto rompe la
      // compilación en vez de dejar la sección en blanco en producción.
      const sinCaso: never = contenido
      void sinCaso
    }
  }

  return (
    <Sub label="Producto en investigación" excepcion={excepcion !== null}>
      {excepcion && (
        <>
          {excepcion.aviso}
          {excepcion.motivoSellado !== null ? (
            // Con el pedido ya creado manda el motivo SELLADO en la fila, no el desplegable: es el
            // texto que Farmacia ve en el cajón y que sale impreso en el comprobante.
            <div style={{ ...itemRow, color: 'var(--spira-ink)' }}>{excepcion.motivoSellado}</div>
          ) : readOnly ? null : (
            // `searchable="never"`: son cinco motivos cortos, entran todos en el menú.
            <SearchableSelect
              value={excepcion.motivo}
              onChange={excepcion.onMotivo}
              options={MOTIVOS_FUERA_CRONOGRAMA}
              placeholder="Motivo de la excepción…"
              searchable="never"
            />
          )}
          {cuerpo && <div style={{ height: 9 }} />}
        </>
      )}

      {constanciaIncompleta && (
        <div style={warnBox}>
          <Icon name="alert" size={15} color="var(--spira-warn)" stroke={2} style={{ marginTop: 1, flex: '0 0 auto' }} />
          <div>
            Falta la constancia
            <span style={{ display: 'block', color: 'var(--spira-ink-soft)', fontWeight: 400, marginTop: 2 }}>
              Farmacia no puede emitir el comprobante hasta que esté cargada.
            </span>
          </div>
        </div>
      )}

      {cuerpo}

      {/* Las dos salidas explícitas del IP («No corresponde», «Se entregó en otra visita») y su
          deshacer. Llegaron acá con el rediseño del modal de visita: vivían en la fila del IP del
          panel de Procedimientos, que ya no existe. Van al final, después del desenlace que las
          explica: son la excepción, no la regla. */}
      {salidas}
    </Sub>
  )
}
