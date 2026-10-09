import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GRACIA_MS } from './useHoverIntent'
import { demoraDeApertura, formaDePista, ID_PISTA, quitarId, sumarId, ubicarPista } from './reglasDePista'
import type { FormaPista } from './reglasDePista'

/* ============================================================================
   Pistas — el `title` de TODA la app, dibujado en papel en vez del globo del navegador.

   Spec: `docs/superpowers/specs/2026-10-09-tooltip-propio-design.md` · mock: `docs/mock-tooltip-propio.html`.

   ── POR QUÉ UNO SOLO, ESCUCHANDO EL DOCUMENTO, Y NO UN `<Pista>` EN CADA SITIO ──
   Son ~180 `title` de ayuda repartidos en ~130 archivos. Envolverlos uno por uno era una PR enorme
   y, peor, dejaba cada `title` que se escriba mañana saliendo otra vez con el globo negro, porque
   nadie se va a acordar de envolverlo. Así, quien escribe `title="Cerrar"` no tiene que saber que
   esto existe. Y `Termino` —que vive adentro de filas que SON botones, las de los KPI del protocolo—
   no puede volverse un `<button>` para abrir un panel propio: un botón adentro de otro no existe.

   ── EL TRUCO: EL `title` SE VA SÓLO MIENTRAS EL MOUSE ESTÁ ENCIMA ──
   El globo nativo sale de leer el atributo, así que mientras se apunta se lo muda a
   `data-pista-texto` y al salir vuelve. Fuera de ese instante el DOM queda igual que siempre, y el
   lector de pantalla —que no apunta con el mouse— sigue leyendo lo mismo que leía. Al devolverlo NO
   se pisa un `title` que ya esté: si React lo reescribió durante el hover (cambió el prop), el suyo es
   el bueno.

   ── WCAG 2.1 AA · 1.4.13, igual que `InfoTip` ──
   Descartable con Esc, apuntable (la gracia de `useHoverIntent` deja entrar el mouse a la pista) y
   persistente (no se va sola por tiempo). Y el Esc es DE LA PISTA cuando hay una abierta: se corta en
   captura para que no se lleve el modal de atrás. Una capa por vez, como en `usePopover`.

   Fuera de esto: los `<iframe>` (su `title` es el nombre accesible del marco, no una ayuda) y lo que
   lleve `data-pista="nativa"`, la salida de emergencia por si aparece un caso que se dibuja mal.
   ============================================================================ */

interface PistaAbierta {
  el: HTMLElement
  forma: FormaPista
  texto: string
  /** Sólo en los términos: la palabra subrayada, que va arriba en negrita. */
  titulo: string | null
}

function textoDe(el: HTMLElement): string {
  return el.dataset.pistaTexto ?? el.getAttribute('title') ?? ''
}

/** Muda el `title` a `data-pista-texto` para que no salga el globo nativo. Idempotente. */
function guardar(el: HTMLElement) {
  const t = el.getAttribute('title')
  if (t == null) return
  el.dataset.pistaTexto = t
  el.removeAttribute('title')
}

/** Lo devuelve, salvo que React ya haya puesto uno nuevo mientras tanto. */
function restaurar(el: HTMLElement) {
  const t = el.dataset.pistaTexto
  if (t == null) return
  if (!el.hasAttribute('title')) el.setAttribute('title', t)
  delete el.dataset.pistaTexto
}

/** El elemento con pista que contiene a `n`, o `null`. `[data-pista-texto]` también cuenta: es el
 *  mismo elemento con el `title` ya mudado, y moverse entre sus hijos no tiene que perderlo. */
function objetivo(n: EventTarget | null, panel: HTMLElement | null): HTMLElement | null {
  if (!(n instanceof Element) || panel?.contains(n)) return null
  const el = n.closest('[title], [data-pista-texto]')
  if (!(el instanceof HTMLElement) || el.tagName === 'IFRAME' || el.dataset.pista === 'nativa') return null
  return el
}

export function Pistas() {
  const [abierta, setAbierta] = useState<PistaAbierta | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    /* La máquina vive en variables del efecto y no en estado de React: los listeners la leen y la
       escriben en el mismo evento, y un `setState` no se ve hasta el render siguiente. React sólo se
       entera de lo que hay que DIBUJAR (`setAbierta`). */
    let duenio: HTMLElement | null = null // el elemento cuya pista está abierta
    let pendiente: HTMLElement | null = null // el que espera su demora para abrir
    let tAbrir = 0
    let tCerrar = 0
    let ultimoCierre = -Infinity

    const panel = () => panelRef.current
    const enPanel = (n: EventTarget | null) => n instanceof Node && !!panel()?.contains(n)

    const cancelarCierre = () => window.clearTimeout(tCerrar)
    const cancelarApertura = () => {
      window.clearTimeout(tAbrir)
      if (pendiente) { restaurar(pendiente); pendiente = null }
    }

    /** Desengancha al dueño (su `aria-describedby` y su `title`) sin decidir qué se dibuja. */
    const soltarDuenio = () => {
      if (!duenio) return
      const ids = quitarId(duenio.getAttribute('aria-describedby'), ID_PISTA)
      if (ids) duenio.setAttribute('aria-describedby', ids)
      else duenio.removeAttribute('aria-describedby')
      restaurar(duenio)
      duenio = null
      ultimoCierre = performance.now()
    }

    const cerrar = () => {
      cancelarCierre()
      cancelarApertura()
      if (!duenio) return
      soltarDuenio()
      setAbierta(null)
    }

    const cerrarConGracia = () => {
      cancelarCierre()
      tCerrar = window.setTimeout(cerrar, GRACIA_MS)
    }

    const mostrar = (el: HTMLElement) => {
      cancelarCierre()
      if (pendiente === el) pendiente = null
      if (duenio !== el) soltarDuenio()
      const texto = textoDe(el)
      const forma = formaDePista({
        texto,
        esTermino: el.classList.contains('spira-termino'),
        textoVisible: el.textContent ?? '',
        cortado: el.scrollWidth > el.clientWidth + 1,
      })
      /* Sin forma (un nombre que se lee entero) no se dibuja nada, pero el `title` SIGUE mudado
         hasta que el mouse se vaya: devolverlo ahora haría salir el globo nativo, que es justo lo que
         `formaDePista` decidió que sobra. Lo devuelve el `pointerout`. */
      if (!forma) { setAbierta(null); return }
      duenio = el
      el.setAttribute('aria-describedby', sumarId(el.getAttribute('aria-describedby'), ID_PISTA))
      setAbierta({ el, forma, texto: texto.trim(), titulo: forma === 'termino' ? (el.textContent ?? '').trim() : null })
    }

    /* —— mouse (y lápiz). El touch no apunta: tocar un botón ya hace lo suyo. —— */
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      if (enPanel(e.target)) { cancelarCierre(); return }
      const el = objetivo(e.target, panel())
      if (!el) {
        /* También es la red para el dueño que se desmontó con el mouse encima (una fila que se va
           al cambiar de día): no hay `pointerout` de algo que ya no existe, pero el próximo
           `pointerover` cae en otra cosa y la pista se va. */
        if (duenio) cerrarConGracia()
        return
      }
      if (el === duenio) {
        cancelarCierre()
        guardar(el) // abierta por el teclado, todavía con su `title`: que no salgan los dos globos
        return
      }
      if (el === pendiente) return
      cancelarApertura()
      guardar(el)
      pendiente = el
      tAbrir = window.setTimeout(() => mostrar(el), demoraDeApertura(performance.now(), ultimoCierre, duenio != null))
    }

    const onOut = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const hacia = e.relatedTarget
      if (enPanel(e.target)) {
        if (!enPanel(hacia) && !(hacia instanceof Node && duenio?.contains(hacia))) cerrarConGracia()
        return
      }
      const el = objetivo(e.target, panel())
      if (!el) return
      if (hacia instanceof Node && el.contains(hacia)) return // a un hijo suyo: sigue adentro
      if (enPanel(hacia)) return // entró a leer la pista
      if (el === duenio) cerrarConGracia()
      else if (el === pendiente) cancelarApertura()
      else restaurar(el)
    }

    /* —— teclado: sólo con el foco VISIBLE (Tab), no con el que deja un clic ——
       El `title` no se muda acá: el lector de pantalla arma el anuncio con el foco, y sacarle el
       atributo en ese mismo instante podía dejar a un botón de ícono sin nombre. */
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target
      if (!(t instanceof HTMLElement) || objetivo(t, panel()) !== t || !t.matches(':focus-visible')) return
      cancelarApertura()
      mostrar(t)
    }
    const onFocusOut = (e: FocusEvent) => {
      if (e.target === duenio) cerrar()
    }

    /* —— tocar: sólo los términos sueltos se abren tocándolos; cualquier otro toque o clic cierra ——
       Un término adentro de un botón o enlace no: ahí el toque ya hace lo que hace la fila. */
    const onDown = (e: PointerEvent) => {
      if (enPanel(e.target)) return
      const el = objetivo(e.target, panel())
      if (e.pointerType === 'touch' && el?.classList.contains('spira-termino') && !el.parentElement?.closest('button, a, [role="button"]')) {
        if (el === duenio) cerrar()
        else { cancelarApertura(); mostrar(el) }
        return
      }
      cerrar()
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (duenio) { e.stopPropagation(); cerrar() }
      else cancelarApertura()
    }

    /* Cerrarla al scrollear es más simple y más tranquilo que perseguir al elemento.
       Y ese cierre NO deja la pista tibia: al scrollear, el mouse queda quieto pero la página pasa
       por debajo, así que cae sobre otro `title` a cada rato; tibia, cada uno saldría al instante y
       una lista con nombres se volvería un parpadeo de carteles. Medido en el banco: el scroll la
       cerraba y la volvía a abrir en el mismo cuadro. */
    const onCambio = () => {
      if (!duenio && !pendiente) return
      cerrar()
      ultimoCierre = -Infinity
    }

    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerout', onOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onCambio, true)
    window.addEventListener('resize', onCambio)
    window.addEventListener('blur', onCambio)
    return () => {
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onCambio, true)
      window.removeEventListener('resize', onCambio)
      window.removeEventListener('blur', onCambio)
      window.clearTimeout(tAbrir)
      window.clearTimeout(tCerrar)
      if (pendiente) restaurar(pendiente)
      soltarDuenio()
    }
  }, [])

  /* Se ubica ANTES del pintado: el panel ya está montado (con su tamaño real) y todavía no se vio,
     así que nunca aparece un cuadro en la esquina que después salta a su lugar. */
  useLayoutEffect(() => {
    const p = panelRef.current
    if (!abierta || !p) return
    const { top, left } = ubicarPista(
      abierta.el.getBoundingClientRect(),
      { width: p.offsetWidth, height: p.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    )
    p.style.top = `${top}px`
    p.style.left = `${left}px`
  }, [abierta])

  if (!abierta) return null
  return createPortal(
    <div ref={panelRef} id={ID_PISTA} role="tooltip" className="spira-ayuda" data-forma={abierta.forma}>
      {abierta.forma === 'termino'
        ? <><span className="spira-ayuda-titulo">{abierta.titulo}</span><span className="spira-ayuda-cuerpo">{abierta.texto}</span></>
        : abierta.texto}
    </div>,
    document.body,
  )
}
