import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, ComponentProps, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { usePopover } from './usePopover'
import { btnPrimary } from './buttons'
import { InfoTip } from './InfoTip'

export interface SelectOption {
  value: string
  label: string
  /** Punto de color a la izquierda de la opción (y del disparador cuando está elegida). Nació para
   *  las categorías de procedimiento (0089): el color IDENTIFICA la categoría, y va en un punto y no
   *  tiñendo el texto porque `color: tono` sobre `tono + alpha` no llega al 4.5:1 de WCAG. El punto
   *  es decoración con el rótulo al lado, así que el contraste lo cumple el texto en tinta. */
  dot?: string
  /** Segunda línea de la opción: QUÉ significa elegirla. Opcional y de estreno en la consola de
   *  accesos (2026-09-07), donde "Líder" no le dice a nadie qué gana la persona.
   *
   *  Sólo cambia la forma de la opción cuando está presente: sin `desc`, el renglón se dibuja
   *  exactamente igual que siempre —una línea con ellipsis— en los ~24 consumidores que ya existen.
   *  Con `desc`, el menú conviene abrirlo con `menuWidth="auto"`: un disparador angosto recorta
   *  una frase. */
  desc?: string
  /** Un ⓘ al final de la opción, con la explicación adentro en vez de impresa (§03 del handoff de
   *  Ajustes: "el menú de niveles también trae un ⓘ por opción, para comparar antes de elegir").
   *
   *  Convive con `desc` y no lo reemplaza: son dos formas de decir lo mismo y cuál conviene depende
   *  de la lista. Una lista corta de niveles se compara mejor con las frases a la vista; una larga
   *  de estudios se lee mejor sin ellas, con la explicación a un apunte de distancia. */
  info?: { titulo: string; cuerpo: string }
}

/** A partir de cuántas opciones aparece el buscador cuando searchable='auto'. */
const SEARCH_THRESHOLD = 5

/* El modo se elige por props DISCRIMINADAS y no por un `value: string | string[]` suelto: con la
   union floja, cada uno de los ~24 consumidores de una sola opción tendría que estrechar el tipo en
   su `onChange`, y una vista que se olvide de pasar `multiple` compilaría igual pasando un array.
   Así, quien no dice `multiple` sigue teniendo exactamente la firma de siempre. */
interface BaseProps {
  options: readonly SelectOption[]
  placeholder: string
  /** Solo relevante si el buscador se muestra. */
  searchPlaceholder?: string
  /** Nombre del ítem para los textos de crear/eliminar (ej. 'laboratorio', 'monodroga', 'dosis'). */
  entity?: string
  /** 'auto' (default): el buscador aparece con SEARCH_THRESHOLD+ opciones. 'always'/'never' fuerzan. */
  searchable?: 'auto' | 'always' | 'never'
  /** Ancho del menú. 'trigger' (default): igual al disparador (menú alineado al campo, lo estándar
   *  en formularios). 'auto': crece a su contenido (mín. el ancho del disparador), para disparadores
   *  compactos donde clavarlo al ancho recortaría las opciones (ej. el mes/año del calendario). */
  menuWidth?: 'trigger' | 'auto'
  /** Permitir que el popover flipee hacia arriba si no entra abajo (default true). Los dropdowns de
   *  mes/año del calendario lo apagan para abrir siempre hacia abajo (que los dos coincidan). */
  flip?: boolean
  /** Disparador inerte + atenuado: no abre el popover ni dispara onChange. */
  disabled?: boolean
  /** Enfoca el disparador al montar (equivalente al autoFocus de un input). */
  autoFocus?: boolean
  /** Crear un ítem nuevo (FK crea registro; texto devuelve el valor). Habilita "Agregar nuevo".
   *  Devuelve la opción a fijar, o `{ error }` para mostrar el motivo en el panel. */
  onCreate?: (name: string) => Promise<SelectOption | { error: string }> | SelectOption | { error: string }
  /** Eliminar un ítem (solo catálogos con registro real). Habilita el borrado por opción. */
  onDelete?: (option: SelectOption) => Promise<{ error: string | null }>
  mono?: boolean
  id?: string
  /** Apariencia del disparador. 'field' (default): el campo de ancho completo de siempre. 'chip':
   *  un pill compacto (inline) para meterlo en una línea densa —ej. el coordinador en el header del
   *  modal de visita—. 'boton': un botón sólido de acento que NO muestra lo elegido, sólo invita a
   *  abrir el menú —"+ Añadir estudio"—; va de la mano de `modo: 'sumar'`, donde lo elegido se ve
   *  afuera, en chips. El popover y todo lo demás no cambian en ninguna de las tres. */
  variant?: 'field' | 'chip' | 'boton'
  /** Ícono al inicio del disparador (sólo se dibuja en variant 'chip' y 'boton'). */
  leadingIcon?: ComponentProps<typeof Icon>['name']
}

interface SingleProps extends BaseProps {
  multiple?: false
  value: string
  onChange: (value: string) => void
}

interface MultiProps extends BaseProps {
  /** Varias opciones a la vez. El menú NO cierra al elegir —se sigue tildando— y el disparador
   *  resume cuántas hay. Sin alta ni baja de ítems: elegir de un conjunto y administrarlo son dos
   *  trabajos distintos, y mezclarlos en el mismo panel invita a borrar cuando querías filtrar. */
  multiple: true
  value: readonly string[]
  onChange: (value: string[]) => void
  onCreate?: never
  onDelete?: never
  /** Cómo nombrar el conjunto cuando hay más de uno ("3 protocolos"). Default: `entity` en plural. */
  pluralLabel?: string
  /** Cómo se comporta el menú.
   *
   *  'alternar' (default, lo de siempre): lista TODO, tilda y destilda, quitar se hace desde acá.
   *
   *  'sumar': el menú ofrece ÚNICAMENTE lo que falta, cada fila termina en `+`, y elegir SUMA y
   *  limpia la búsqueda para seguir sumando. Quitar NO se hace desde el menú — se hace afuera, en
   *  el chip de lo elegido. La diferencia no es cosmética: en 'alternar' el menú es el inventario
   *  completo y el tilde dice el estado; en 'sumar' el menú es una bandeja de lo que queda, así
   *  que una fila que ya no está ES la señal de que se sumó. Mezclar las dos —lista completa y
   *  botón de `+`— daría un `+` sobre algo ya agregado, que es un click que no hace nada. */
  modo?: 'alternar' | 'sumar'
  /** Sólo con `modo: 'sumar'`. Qué mostrar cuando ya no queda nada por sumar: el rótulo que toma el
   *  disparador (que además se deshabilita solo) y la frase que ocupa el lugar de la lista. Van
   *  juntos en un objeto porque son el mismo estado dicho en dos lugares, y las frases las pone
   *  quien llama porque el género lo manda la entidad ("todos los estudios", "todas las dosis"). */
  sinRestantes?: { label: string; mensaje: string }
}

type Props = SingleProps | MultiProps

/**
 * Desplegable estándar de la App: una opción, con buscador interno que aparece según la cantidad
 * de opciones (umbral SEARCH_THRESHOLD), navegación por teclado (WCAG 2.1 AA), y alta ("Agregar
 * nuevo") / baja por ítem opcionales. El popover se posiciona `fixed` (getBoundingClientRect) para
 * NO recortarse dentro de un modal con overflow. Cierra al elegir, click afuera o Esc.
 */
export function SearchableSelect(props: Props) {
  const {
    options, placeholder, searchPlaceholder, entity = 'ítem',
    searchable = 'auto', menuWidth = 'trigger', flip = true, disabled = false, autoFocus = false,
    mono, id, variant = 'field', leadingIcon,
  } = props
  /* `multiple` estrecha la union en cada uso: TS no deja leer `onCreate` en el modo múltiple ni
     pasarle un array al `onChange` de una sola opción. */
  const multiple = props.multiple === true
  const onCreate = multiple ? undefined : props.onCreate
  const onDelete = multiple ? undefined : props.onDelete
  /** El menú suma en vez de alternar. Sólo existe en modo múltiple: alternar una sola opción no es
   *  "sumar", es reemplazar, y ahí un `+` mentiría sobre lo que va a pasar. */
  const sumar = multiple && props.modo === 'sumar'
  /** Selección normalizada a lista, para que el resto del componente no ramifique en cada línea. */
  const selected: readonly string[] = multiple ? props.value : (props.value ? [props.value] : [])
  const value = multiple ? '' : props.value
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [extra, setExtra] = useState<Record<string, string>>({}) // etiquetas recién agregadas
  const [mode, setMode] = useState<'list' | 'create'>('list')
  const [createName, setCreateName] = useState('')
  const [createConfirm, setCreateConfirm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SelectOption | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(open, () => setOpen(false), flip)
  const searchRef = useRef<HTMLInputElement>(null)
  const createRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const typeahead = useRef<{ buf: string; at: number }>({ buf: '', at: 0 })
  const baseId = useId()
  const listId = `${baseId}-listbox`

  // Enfocar el disparador al montar si autoFocus.
  useEffect(() => { if (autoFocus) triggerRef.current?.focus() }, [autoFocus])

  // Al cerrar, volver a estado limpio (búsqueda, modo crear/eliminar, errores).
  useEffect(() => {
    if (open) return
    setQ(''); setMode('list'); setCreateName(''); setCreateConfirm(false); setDeleteTarget(null); setErr(null); setBusy(false)
  }, [open])

  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? extra[v] ?? ''
  /* Con una sola opción, su etiqueta. Con varias: la etiqueta si es una, y el recuento si son más
     —listarlas todas desborda un disparador que vive en una fila de filtros—. */
  const current = multiple
    ? (selected.length === 0 ? '' : selected.length === 1 ? labelOf(selected[0]) : `${selected.length} ${props.pluralLabel ?? `${entity}s`}`)
    : (value ? labelOf(value) : '')
  /* Punto de la opción elegida (si la tiene). Sale de `options` y no de `extra`, así que una opción
     recién creada con `onCreate` no muestra punto hasta que el refetch la traiga — correcto: todavía
     no sabemos de qué color es. */
  /* El punto solo tiene sentido cuando el disparador nombra UNA opción: con varias no hay una
     categoría que pintar. */
  const currentDot = multiple
    ? (selected.length === 1 ? options.find((o) => o.value === selected[0])?.dot : undefined)
    : (value ? options.find((o) => o.value === value)?.dot : undefined)
  const typed = q.trim()
  /* El inventario del que se elige. En 'sumar' lo ya elegido SALE de la lista: el menú es la
     bandeja de lo que falta, no el inventario con estados. Una fila que ya no está ES la señal de
     que se sumó — por eso no hace falta tilde, y por eso un `+` sobre algo ya agregado (que sería
     un click que no hace nada) no puede existir. */
  const disponibles = sumar ? options.filter((o) => !selected.includes(o.value)) : options
  const filtered = disponibles.filter((o) => o.label.toLowerCase().includes(typed.toLowerCase()))
  /** No queda nada por sumar. Sólo puede pasar en 'sumar': en 'alternar' la lista es fija. */
  const agotado = sumar && disponibles.length === 0
  /* Con descripciones cada opción ocupa dos renglones, así que el techo de siempre (220px) dejaba
     una lista de cinco a media pantalla y con scroll. El techo alto sólo aplica cuando hay `desc`:
     una lista de rótulos sueltos no gana nada con ser más larga. */
  const hayDesc = options.some((o) => o.desc != null)

  /* El buscador se muestra según searchable + umbral, solo en el modo lista.
     El umbral mira `options` y NO `disponibles` a propósito, aunque en 'sumar' la lista se achique
     al elegir: si mirara los restantes, el buscador desaparecería a mitad de la tarea —justo
     cuando quedan pocos— y se llevaría el foco del teclado con él. Que sobre un buscador para dos
     opciones es más barato que perder el cursor mientras alguien está escribiendo. */
  const showSearch = mode === 'list' && !deleteTarget &&
    (searchable === 'always' || (searchable !== 'never' && options.length >= SEARCH_THRESHOLD))

  // Al abrir la lista: ubicar la opción activa en la elegida (o la primera) y, sin buscador,
  // llevar el foco al contenedor de la lista para capturar el teclado.
  useEffect(() => {
    if (!open || mode !== 'list' || deleteTarget) return
    // Al abrir NO se pre-resalta ninguna opción: activeIndex arranca en la elegida (que ya se ve
    // con su tinte propio) o en -1 = "ninguna activa". El resalte gris aparece recién con hover o
    // teclado, no por el solo hecho de abrir.
    setActiveIndex(options.findIndex((o) => o.value === value))
    if (!showSearch) requestAnimationFrame(() => listRef.current?.focus())
  }, [open, mode, deleteTarget, showSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mantener activeIndex dentro del rango del filtro, preservando -1 = "ninguna activa".
  useEffect(() => {
    setActiveIndex((i) => (i < 0 ? -1 : Math.min(i, filtered.length - 1)))
  }, [filtered.length])

  // Scrollear la opción activa a la vista.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  const backToList = () => { setMode('list'); setCreateName(''); setCreateConfirm(false); setDeleteTarget(null); setErr(null) }
  const pick = (o: SelectOption) => {
    if (props.multiple) {
      if (props.modo === 'sumar') {
        /* SUMA y nunca quita: en este modo el menú no es un interruptor. Quitar se hace desde la ×
           del chip, afuera. El `includes` es una red por si un click doble llegara antes de que el
           padre propague el estado nuevo — sumar dos veces el mismo id no rompe nada visible, pero
           mandaría un cambio de más al servidor.
           Limpia la búsqueda y devuelve el foco al buscador: la tarea sigue siendo "sumar varios",
           así que lo que se espera después de elegir es escribir el siguiente, no volver a apuntar. */
        if (!props.value.includes(o.value)) props.onChange([...props.value, o.value])
        setQ('')
        searchRef.current?.focus()
        return
      }
      /* Togglea y deja el menú ABIERTO: elegir varios es una sola tarea, y cerrar en cada tilde
         obligaría a reabrir el panel una vez por opción. Cierra con Esc, con un click afuera o con
         el propio disparador, como cualquier popover del repo. */
      const ya = props.value.includes(o.value)
      props.onChange(ya ? props.value.filter((v) => v !== o.value) : [...props.value, o.value])
      return
    }
    props.onChange(o.value)
    setOpen(false)
  }

  const move = (delta: number) => setActiveIndex((i) => {
    if (filtered.length === 0) return -1
    if (i < 0) return delta > 0 ? 0 : filtered.length - 1 // primera flecha desde "ninguna activa"
    return (i + delta + filtered.length) % filtered.length
  })

  // Teclado de la lista (lo comparten el buscador y el contenedor sin buscador).
  const onListKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Home') { e.preventDefault(); setActiveIndex(0) }
    else if (e.key === 'End') { e.preventDefault(); setActiveIndex(Math.max(0, filtered.length - 1)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      // Enter elige la opción activa; si no hay ninguna resaltada pero se está buscando, elige el
      // primer resultado (typeahead + Enter) sin necesidad de resaltarlo.
      const o = filtered[activeIndex] ?? (typed ? filtered[0] : undefined)
      if (o) pick(o)
    }
  }

  // Typeahead cuando NO hay buscador: tipear salta a la opción que matchea.
  const onListTypeahead = (e: ReactKeyboardEvent) => {
    if (e.key.length !== 1 || e.altKey || e.ctrlKey || e.metaKey) return
    const now = Date.now()
    const ta = typeahead.current
    ta.buf = now - ta.at > 700 ? e.key : ta.buf + e.key
    ta.at = now
    const idx = filtered.findIndex((o) => o.label.toLowerCase().startsWith(ta.buf.toLowerCase()))
    if (idx >= 0) setActiveIndex(idx)
  }

  const doCreate = async () => {
    /* Se chequea `props.multiple` y no solo `onCreate` para ESTRECHAR la union: el alta fija la
       opción recién creada como valor, y ese `onChange` es el de una sola opción. En el modo
       múltiple `onCreate` no existe (el tipo lo prohíbe), así que esta rama no corre nunca ahí. */
    if (props.multiple || !props.onCreate) return
    const onCreate = props.onCreate
    const name = createName.trim()
    if (!name) { createRef.current?.focus(); return }
    setBusy(true); setErr(null)
    const res = await onCreate(name)
    setBusy(false)
    if ('error' in res) { setErr(res.error); return }
    setExtra((m) => ({ ...m, [res.value]: res.label }))
    props.onChange(res.value)
    setOpen(false)
  }

  const doDelete = async () => {
    if (!onDelete || !deleteTarget) return
    setBusy(true); setErr(null)
    const res = await onDelete(deleteTarget)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    backToList()
  }

  const boxStyle = { ...searchWrap, ...(searchFocused ? searchWrapFocus : null) }
  const activeId = filtered[activeIndex] ? `${baseId}-opt-${activeIndex}` : undefined

  const sinRestantes = multiple ? props.sinRestantes : undefined
  /* El disparador 'boton' NO nombra lo elegido —eso se ve afuera, en chips—: nombra la acción. Y
     cuando no queda nada por sumar, nombra el final. */
  const triggerLabel = variant === 'boton'
    ? (agotado && sinRestantes ? sinRestantes.label : placeholder)
    : (current || placeholder)
  /* Se apaga solo al quedarse sin nada por sumar… pero NUNCA mientras su propio menú está abierto:
     a ese estado se llega justamente sumando el último CON el menú abierto, y un botón inerte ahí
     dejaría un click muerto sobre lo único que puede cerrar lo que él mismo abrió. */
  const triggerDisabled = disabled || (agotado && !open)

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        // El chip lleva foco de teclado propio (halo suave en vez del outline petróleo de 2px, que
        // sobre el pill compacto pesa como un recuadro duro). Ver `.spira-chip-select` en tokens.css.
        className={variant === 'chip' ? 'spira-chip-select' : undefined}
        disabled={triggerDisabled}
        aria-disabled={triggerDisabled || undefined}
        onClick={() => { if (!triggerDisabled) setOpen((o) => !o) }}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={variant === 'chip'
          ? { ...chipBtn, ...(current ? null : chipBtnEmpty), ...(open ? chipBtnOpen : null), ...(triggerDisabled ? chipBtnDisabled : null) }
          : variant === 'boton'
            ? { ...botonBtn, ...(triggerDisabled ? botonBtnDisabled : null) }
            : { ...fieldBtn, ...(open ? fieldBtnOpen : null), ...(triggerDisabled ? fieldBtnDisabled : null) }}
      >
        {variant !== 'field' && leadingIcon && (
          <Icon
            name={leadingIcon}
            size={variant === 'boton' ? 15 : 14}
            color={variant === 'boton' ? 'var(--spira-on-accent)' : 'var(--spira-primary)'}
            style={{ flex: '0 0 auto' }}
          />
        )}
        {currentDot && <span aria-hidden style={{ ...dotStyle, background: currentDot }} />}
        <span className={mono && current ? 'spira-mono' : undefined} style={variant === 'chip'
          ? { color: current ? 'var(--spira-ink)' : 'var(--spira-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 210 }
          : variant === 'boton'
            ? { whiteSpace: 'nowrap' }
            : { flex: 1, textAlign: 'left', color: current ? 'var(--spira-ink)' : 'var(--spira-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {triggerLabel}
        </span>
        {/* El 'boton' no lleva chevron: no es un campo que muestra un valor y se despliega, es una
            acción. El §04 del handoff lo dice explícito — "ya no es un select con chevron". */}
        {variant !== 'boton' && (
          <Icon name="chevronDown" size={variant === 'chip' ? 13 : 16} color="var(--spira-muted)" style={{ flex: '0 0 auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          style={{
            ...popover,
            top: pos.top,
            left: pos.left,
            // 'trigger': clavado al ancho del disparador (menú alineado al campo). 'auto': crece a
            // su contenido —nunca más angosto que el disparador, con un techo— para que un
            // disparador angosto (mes/año del calendario) no recorte las opciones ni deje blanco
            // muerto cuando el contenido es corto (los años).
            ...(menuWidth === 'auto'
              ? { minWidth: pos.width, width: 'max-content', maxWidth: 'min(320px, calc(100vw - 16px))' }
              : { width: pos.width }),
          }}
        >
          {deleteTarget ? (
            <div style={{ padding: 6 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--spira-ink)' }}>¿Eliminar «{deleteTarget.label}»?</div>
              <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 2 }}>Esta acción no se puede deshacer.</div>
              {err && <div style={errText}>{err}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" onClick={() => void doDelete()} disabled={busy} style={btnDanger}>{busy ? 'Eliminando…' : 'Sí, eliminar'}</button>
                <button type="button" onClick={backToList} style={btnCancel}>Cancelar</button>
              </div>
            </div>
          ) : mode === 'create' ? (
            <div style={{ padding: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--spira-muted)', padding: '2px 6px 7px' }}>Agregar {entity}</div>
              <input
                ref={createRef}
                className="spira-bare-input"
                value={createName}
                onChange={(e) => { setCreateName(e.target.value); setCreateConfirm(false); setErr(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createName.trim() && setCreateConfirm(true) } }}
                autoFocus
                placeholder="Nombre"
                style={createInput}
              />
              {err && <div style={errText}>{err}</div>}
              {createConfirm && <div style={{ fontSize: 12.5, color: 'var(--spira-ink)', padding: '8px 6px 2px' }}>¿Crear «{createName.trim()}»?</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {!createConfirm ? (
                  <>
                    <button type="button" onClick={() => { createName.trim() ? setCreateConfirm(true) : createRef.current?.focus() }} style={btnCreate}>Crear</button>
                    <button type="button" onClick={backToList} style={btnCancel}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => void doCreate()} disabled={busy} style={btnCreate}>{busy ? 'Creando…' : 'Sí, crear'}</button>
                    <button type="button" onClick={() => setCreateConfirm(false)} style={btnCancel}>Volver</button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              {showSearch && (
                <div style={boxStyle}>
                  <Icon name="search" size={14} color="var(--spira-muted)" style={{ flex: '0 0 auto' }} />
                  <input
                    ref={searchRef}
                    className="spira-bare-input"
                    role="combobox"
                    aria-expanded
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={activeId}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={onListKeyDown}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    autoFocus
                    placeholder={searchPlaceholder ?? 'Buscar…'}
                    style={searchInput}
                  />
                </div>
              )}
              <div
                ref={listRef}
                id={listId}
                role="listbox"
                aria-multiselectable={multiple || undefined}
                className="spira-scroll"
                tabIndex={showSearch ? undefined : -1}
                aria-activedescendant={showSearch ? undefined : activeId}
                onKeyDown={(e) => { onListKeyDown(e); if (!showSearch) onListTypeahead(e) }}
                style={{ maxHeight: hayDesc ? 340 : 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, outline: 'none' }}
              >
                {filtered.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', padding: '10px 10px', lineHeight: 1.4 }}>
                    {/* Dos vacíos distintos y hay que decirlos distinto: "no encontré lo que
                        buscás" invita a corregir la búsqueda; "ya está todo" dice que la tarea
                        terminó. Confundirlos manda a alguien a buscar algo que no falta. */}
                    {agotado && sinRestantes
                      ? sinRestantes.mensaje
                      : 'No se encuentran resultados para tu búsqueda.'}
                  </div>
                ) : filtered.map((o, idx) => {
                  const on = selected.includes(o.value)
                  const active = idx === activeIndex
                  return (
                    <div key={o.value} data-idx={idx} style={{ display: 'flex', alignItems: 'center', borderRadius: 8, ...(on ? { background: 'rgba(15,95,87,.10)' } : active ? { background: 'var(--spira-surface)' } : null) }}>
                      <button type="button" id={`${baseId}-opt-${idx}`} role="option" aria-selected={on} onMouseEnter={() => setActiveIndex(idx)} onClick={() => pick(o)} style={{ ...option, flex: 1, color: on ? 'var(--spira-acc-deep-track)' : 'var(--spira-ink)', fontWeight: on ? 600 : 400 }}>
                        {o.dot && <span aria-hidden style={{ ...dotStyle, background: o.dot }} />}
                        {/* Con descripción, el rótulo y su explicación van en columna. Se ramifica
                            en vez de envolver siempre para no tocar el renglón de una línea de los
                            ~24 consumidores que no usan `desc`: el ellipsis es sensible a la caja
                            que lo contiene y no vale arriesgarlo por uniformidad. El `minWidth: 0`
                            es lo que deja al ellipsis funcionar adentro de un flex. */}
                        {o.desc ? (
                          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <span className={mono ? 'spira-mono' : undefined} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</span>
                            <span style={optionDesc}>{o.desc}</span>
                          </span>
                        ) : (
                          <span className={mono ? 'spira-mono' : undefined} style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</span>
                        )}
                        {/* El tilde solo en múltiple: con una sola opción, el resalte de la fila ya
                            dice cuál está elegida y no hay nada que destildar. En 'sumar' no hay
                            tilde que poner —lo elegido no está en la lista— y va un `+`, que dice
                            qué pasa al tocar en vez de qué estado tiene la fila. */}
                        {multiple && (
                          <span aria-hidden style={{ flex: '0 0 auto', display: 'grid', placeItems: 'center', width: 16 }}>
                            {sumar
                              ? <Icon name="plus" size={15} color="var(--spira-muted)" stroke={2.2} />
                              : on && <Icon name="check" size={14} color="var(--spira-primary)" stroke={2.6} />}
                          </span>
                        )}
                      </button>
                      {/* HERMANO de la opción, nunca adentro: un `<button>` dentro de otro es HTML
                          inválido y el navegador lo desarma, dejando el ⓘ fuera de la fila. Su
                          panel se portalea a `body` y le caería "afuera" a este menú, que cerraría
                          en el `mousedown` antes de que el click llegue a la opción — pero
                          `usePopover` mantiene el registro de popovers abiertos y reconstruye el
                          parentesco que el portal corta, así que el menú se reconoce dueño y no se
                          cierra. Ver el comentario de `abiertos` en usePopover.ts. */}
                      {o.info && (
                        <span style={{ flex: '0 0 auto', marginRight: 6, display: 'grid', placeItems: 'center' }}>
                          <InfoTip titulo={o.info.titulo} cuerpo={o.info.cuerpo} size={14} />
                        </span>
                      )}
                      {onDelete && (
                        <button type="button" aria-label={`Eliminar ${o.label}`} title="Eliminar" onClick={() => { setDeleteTarget(o); setErr(null) }} style={trashBtn}>
                          <Icon name="trash" size={14} color="var(--spira-muted)" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              {onCreate && (
                <>
                  <div style={divider} />
                  <button type="button" onClick={() => { setMode('create'); setCreateName(typed); setCreateConfirm(false); setErr(null) }} style={addNew}>
                    <Icon name="plus" size={15} color="var(--spira-primary)" /> Agregar nuevo
                  </button>
                </>
              )}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}

const fieldBtn: CSSProperties = {
  width: '100%', height: 44, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 8,
  background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)', borderRadius: 10,
  cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontSize: 14,
}
const fieldBtnOpen: CSSProperties = { boxShadow: '0 5px 14px rgba(20,48,46,.10)' }
const fieldBtnDisabled: CSSProperties = { opacity: 0.55, cursor: 'default', boxShadow: 'none' }
// Variante 'chip': pill compacto e inline (no ocupa una fila). Mismo popover/lógica que el campo.
// OJO con el borde: va en longhands (`borderWidth`/`borderStyle`/`borderColor`), NO en la abreviada
// `border`. Los estados de abajo pisan solo el color o solo el estilo, y al mezclar abreviada +
// longhand en estilos inline React borra la longhand al salir del estado pero NO restaura la parte
// correspondiente de la abreviada: el color caía al inicial (negro) y el chip quedaba con un borde
// negro duro después de abrir y cerrar el desplegable una vez.
const chipBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 8px', maxWidth: '100%',
  background: 'var(--spira-white)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontSize: 12, fontWeight: 600,
}
const chipBtnEmpty: CSSProperties = { borderStyle: 'dashed' } // sin valor: invita a elegir
const chipBtnOpen: CSSProperties = { boxShadow: '0 4px 12px rgba(20,48,46,.10)', borderColor: 'var(--spira-faint)' }
const chipBtnDisabled: CSSProperties = { opacity: 0.6, cursor: 'default', boxShadow: 'none' }
/* Variante 'boton': una acción sólida de acento, no un campo. Las medidas (34 / radio 9 / 13px) no
   son las del `btnPrimary` genérico (40 / 10 / 14): son las del primario COMPACTO de Ajustes
   (`btnSolid`), porque este disparador vive pegado a esa familia —en la misma tarjeta que "Crear
   cuenta"— y un botón medio centímetro más alto que su vecino se lee como un error, no como una
   variante. El handoff lo pide explícito: "mismo estilo que «Nueva recepción» o «Crear cuenta»".
   Sin estado `open`: la sombra de "abierto" es la señal de un campo desplegado, y este botón ya se
   levanta al pulsar como cualquier pulsable de la casa. */
const botonBtn: CSSProperties = {
  ...btnPrimary('var(--spira-primary)'),
  height: 34, padding: '0 14px', borderRadius: 9, fontSize: 13,
  display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
}
/** Sin nada por sumar. La opacidad 0.5 es la del §04 del handoff. */
const botonBtnDisabled: CSSProperties = { opacity: 0.5, cursor: 'default' }
const popover: CSSProperties = {
  position: 'fixed', zIndex: 'var(--spira-z-popover)', background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)',
  borderRadius: 12, boxShadow: '0 12px 30px rgba(20,48,46,.16)', padding: 6,
}
const searchWrap: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 11px', marginBottom: 4,
  background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', borderRadius: 9,
}
const searchWrapFocus: CSSProperties = { boxShadow: '0 5px 14px rgba(20,48,46,.10)' }
const searchInput: CSSProperties = {
  flex: 1, minWidth: 0, height: '100%', border: 'none', background: 'transparent', outline: 'none',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 13.5,
}
const createInput: CSSProperties = {
  width: '100%', height: 40, padding: '0 12px', background: 'var(--spira-surface)', border: '1px solid var(--spira-line)',
  borderRadius: 9, color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 14,
}
const option: CSSProperties = {
  minHeight: 36, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8,
  border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--spira-font-text)',
  fontSize: 13.5, minWidth: 0,
}
/** Segunda línea de una opción (`SelectOption.desc`): qué significa elegirla. Envuelve a propósito
 *  (`normal`) — es una frase, no un rótulo, y recortarla con puntos suspensivos sería esconder
 *  justo la mitad que explica. `fontWeight: 400` fijo: la opción elegida pone el rótulo en 600 y
 *  la explicación no tiene por qué engordar con él. */
const optionDesc: CSSProperties = {
  fontSize: 12, lineHeight: 1.35, color: 'var(--spira-muted)', whiteSpace: 'normal', fontWeight: 400,
}
/** Punto de color opcional de una opción (`SelectOption.dot`). Decorativo: el significado lo lleva
 *  el rótulo de al lado, así que no necesita contraste propio. */
const dotStyle: CSSProperties = { width: 8, height: 8, borderRadius: '50%', flex: '0 0 auto' }
const trashBtn: CSSProperties = {
  width: 30, height: 30, flex: '0 0 auto', marginRight: 4, border: 'none', background: 'transparent',
  cursor: 'pointer', display: 'grid', placeItems: 'center', borderRadius: 7,
}
const divider: CSSProperties = { height: 1, background: 'var(--spira-line)', margin: '4px 6px' }
const addNew: CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, border: 'none',
  background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--spira-font-text)', fontSize: 13, fontWeight: 600, color: 'var(--spira-acc-deep-track)',
}
const btnCreate: CSSProperties = {
  height: 36, padding: '0 14px', border: 'none', borderRadius: 9, background: 'var(--spira-primary)', color: 'var(--spira-paper)',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
}
const btnDanger: CSSProperties = { ...btnCreate, background: 'var(--spira-danger)' }
const btnCancel: CSSProperties = {
  height: 36, padding: '0 14px', border: '1px solid var(--spira-line-2)', borderRadius: 9, background: 'var(--spira-white)',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
}
const errText: CSSProperties = { fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166,72,59,0.10)', borderRadius: 8, padding: '7px 10px', marginTop: 8 }
