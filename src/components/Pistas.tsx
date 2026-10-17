import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useAyudaPublicada } from '../ayuda/puente'
import { TarjetaTutorial } from '../ayuda/TarjetaTutorial'
import { MODULES } from '../modules/registry'
import { Icon } from './Icon'
import { GRACIA_MS } from './useHoverIntent'
import { abrePorFoco, anclaDePista, cierraLaPista, demoraDeApertura, describeAparte, estaCortado, formaDePista, ID_PISTA, quitarId, sumarId, tieneTarjeta, ubicarPista } from './reglasDePista'
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

   ── EL TRUCO: EL `title` QUEDA VACÍO SÓLO MIENTRAS EL MOUSE ESTÁ ENCIMA ──
   El globo nativo sale de leer el atributo, así que mientras se apunta un elemento su texto se muda a
   `data-pista-texto` y el `title` queda en `""` (un `title` vacío no muestra globo y no deja que el
   navegador use el de un ancestro). Al salir vuelve. Fuera de ese instante el DOM queda igual que
   siempre, y el lector de pantalla —que no apunta con el mouse— sigue leyendo lo mismo que leía.
   VACÍO Y NO QUITADO, a propósito (menores de la #414, 2026-10-11): React puede cambiar el `title`
   durante el hover —el «por qué no» de un botón que se habilita mientras el mouse está encima— y un
   `MutationObserver` lo ve, porque el atributo existe. Si lo quitábamos, el `removeAttribute` de React
   sobre un atributo ausente no dejaba rastro, y al salir volvía el texto viejo: un botón habilitado
   seguía diciendo por qué no se podía.
   Dos cosas que salieron de la revisión del 2026-10-09 y que no son obvias:
     · Se mudan también los `title` de los ANCESTROS. El navegador, si el elemento apuntado no tiene
       `title`, busca el del ancestro más cercano: el IVRS de la lista de pacientes es un `<span
       title>` que envuelve al enlace a la ficha, y con sólo el enlace mudado aparecían la pista de
       papel Y el globo negro del IVRS, a la vez.
     · El `title` vuelve cuando el mouse SE VA, no cuando la pista se cierra. Un clic, un Esc o un
       scroll cierran la pista con el mouse todavía encima: devolverlo ahí hacía reabrir la pista al
       instante al moverse un píxel adentro del mismo botón (y le daba al navegador un `title` "nuevo"
       para pintar su globo). Por eso el ciclo del `title` (`silenciado`) va aparte del de la pista
       (`duenio`).

   ── WCAG 2.1 AA · 1.4.13, igual que `InfoTip` ──
   Descartable con Esc, apuntable (la gracia de `useHoverIntent` deja entrar el mouse a la pista) y
   persistente (no se va sola por tiempo). Y el Esc es DE LA PISTA cuando hay una abierta: se corta en
   captura para que no se lleve el modal de atrás. Una capa por vez, como en `usePopover`. Se corta
   con `stopImmediatePropagation`: los visores de PDF escuchan el Esc en el MISMO nodo y la misma fase,
   y un `stopPropagation` no los frena (cerraba pista y visor de un saque). `Pistas` se monta primero,
   así que su listener corre antes que el de cualquier visor.

   Fuera de esto: los `<iframe>` (su `title` es el nombre accesible del marco, no una ayuda) y lo que
   lleve `data-pista="nativa"`, la salida de emergencia por si aparece un caso que se dibuja mal.

   ── EL TUTORIAL EN LA PISTA (T5b del plan de tutoriales, DD10) ──
   Un control con `data-tutorial="<id>"` cuyo video está publicado muestra, en vez del papel, la TARJETA con el
   video pausado: el texto de su `title` + play adentro, con sonido (`TarjetaTutorial`, la misma pieza que el
   globo de la píldora «Cómo se hace»). Sin fijar se porta como cualquier pista; al dar play SE FIJA y sólo la
   cierran el ✕, Esc o un clic afuera (`cierraLaPista`). Lo demás de este archivo no cambia: la máquina de
   arriba es la misma para los ~180 `title` de siempre. Los controles que lo llevan se eligen a mano, uno por
   flujo. Lo que sabe la Ayuda llega por `ayuda/puente.ts`: esto vive afuera de AppShell (cubre el login).
   ============================================================================ */

interface PistaAbierta {
  el: HTMLElement
  forma: FormaPista
  texto: string
  /** Sólo en los términos: la palabra subrayada, que va arriba en negrita. */
  titulo: string | null
  /** Dónde estaba el mouse al abrir; `null` si abrió el teclado o un toque (ver `anclaDePista`). */
  puntero: { x: number; y: number } | null
  /** El tutorial de la tarjeta, si el elemento lleva `data-tutorial` publicado (T5b). */
  tutorial: string | null
}

function textoDe(el: HTMLElement): string {
  return el.dataset.pistaTexto ?? el.getAttribute('title') ?? ''
}

/** Muda el texto a `data-pista-texto` y deja el `title` vacío. Idempotente. */
function guardar(el: HTMLElement) {
  const t = el.getAttribute('title')
  if (t == null || el.dataset.pistaTexto != null) return
  el.dataset.pistaTexto = t
  el.setAttribute('title', '')
}

/** Lo devuelve. Si React quitó el `title` mientras tanto, el observador ya borró el texto guardado
 *  y no hay nada que devolver. */
function restaurar(el: HTMLElement) {
  const t = el.dataset.pistaTexto
  if (t == null) return
  if (el.getAttribute('title') === '') el.setAttribute('title', t)
  delete el.dataset.pistaTexto
}

/** Muda el `title` del elemento y el de cada ancestro que tenga uno (ver «EL TRUCO», arriba), y le
 *  avisa a `observar` cada nodo que tocó. */
function guardarCadena(el: HTMLElement, observar: (n: HTMLElement) => void) {
  let n: Element | null = el
  while (n) {
    if (n instanceof HTMLElement) { guardar(n); observar(n) }
    n = n.parentElement?.closest('[title]') ?? null
  }
}

/** Devuelve todos los que `guardarCadena` mudó. Hay una sola cadena mudada por vez. */
function restaurarCadena(el: HTMLElement) {
  let n: Element | null = el
  while (n) {
    if (n instanceof HTMLElement) restaurar(n)
    n = n.parentElement?.closest('[data-pista-texto]') ?? null
  }
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
  /* La tarjeta del tutorial (T5b). La Ayuda va por ref: la máquina de abajo vive en un efecto que corre una
     sola vez, y tiene que ver los publicados de AHORA. `fijada` va dos veces —ref para los listeners, estado
     para dibujar el ✕—, como el resto de la máquina. */
  const ayuda = useAyudaPublicada()
  const ayudaRef = useRef(ayuda)
  ayudaRef.current = ayuda
  const fijadaRef = useRef(false)
  const [fijada, setFijada] = useState(false)
  const cerrarRef = useRef<() => void>(() => {})

  useEffect(() => {
    /* La máquina vive en variables del efecto y no en estado de React: los listeners la leen y la
       escriben en el mismo evento, y un `setState` no se ve hasta el render siguiente. React sólo se
       entera de lo que hay que DIBUJAR (`setAbierta`). */
    let duenio: HTMLElement | null = null // el elemento cuya pista está abierta
    let pendiente: HTMLElement | null = null // el que espera su demora para abrir
    let silenciado: HTMLElement | null = null // el que está bajo el mouse, con su cadena de `title` mudada
    let ultimaTecla: string | null = null // para saber si un foco llegó con Tab (`abrePorFoco`)
    let puntero: { x: number; y: number } | null = null // dónde está el mouse, para anclar en contenedores grandes
    let tAbrir = 0
    let tCerrar = 0
    let ultimoCierre = -Infinity

    const panel = () => panelRef.current
    const enPanel = (n: EventTarget | null) => n instanceof Node && !!panel()?.contains(n)

    const cancelarCierre = () => window.clearTimeout(tCerrar)
    const cancelarApertura = () => {
      window.clearTimeout(tAbrir)
      pendiente = null
    }

    /* —— el ciclo del `title`: atado al mouse, no a la pista ——
       Mientras la cadena está mudada, un observador mira si React le escribe el `title`: si lo cambia,
       el texto nuevo pasa a ser el guardado (y la pista abierta lo muestra); si lo quita, no queda nada
       que devolver (y la pista abierta se cierra). El `""` que ponemos nosotros se ignora. Se desconecta
       ANTES de devolver los textos: si no, tomaría nuestro propio `setAttribute` por uno de React. */
    const observador = new MutationObserver((cambios) => {
      for (const c of cambios) {
        const n = c.target
        if (!(n instanceof HTMLElement)) continue
        const ahora = n.getAttribute('title')
        if (ahora === '') continue
        if (ahora == null) delete n.dataset.pistaTexto
        else { n.dataset.pistaTexto = ahora; n.setAttribute('title', '') }
        if (n === duenio) mostrar(n, puntero)
      }
    })
    const observar = (n: HTMLElement) => observador.observe(n, { attributes: true, attributeFilter: ['title'] })
    const silenciar = (el: HTMLElement) => {
      if (silenciado === el) return
      observador.disconnect()
      if (silenciado) restaurarCadena(silenciado)
      guardarCadena(el, observar)
      silenciado = el
    }
    const liberar = () => {
      observador.disconnect()
      if (silenciado) restaurarCadena(silenciado)
      silenciado = null
    }

    /** Desengancha al dueño (su `aria-describedby`) sin decidir qué se dibuja. */
    const soltarDuenio = () => {
      if (!duenio) return
      const ids = quitarId(duenio.getAttribute('aria-describedby'), ID_PISTA)
      if (ids) duenio.setAttribute('aria-describedby', ids)
      else duenio.removeAttribute('aria-describedby')
      duenio = null
      ultimoCierre = performance.now()
    }

    const cerrar = () => {
      cancelarCierre()
      cancelarApertura()
      fijadaRef.current = false
      setFijada(false)
      if (!duenio) return
      soltarDuenio()
      setAbierta(null)
    }
    cerrarRef.current = cerrar

    const cerrarConGracia = () => {
      cancelarCierre()
      if (!cierraLaPista('mouseAfuera', fijadaRef.current)) return
      tCerrar = window.setTimeout(cerrar, GRACIA_MS)
    }

    const mostrar = (el: HTMLElement, desde: { x: number; y: number } | null) => {
      cancelarCierre()
      if (pendiente === el) pendiente = null
      /* Se desmontó durante la demora (una actualización en vivo, el ↑/↓ que remonta el encabezado de
         la visita): medido desprendido, su caja es todo ceros y la pista quedaba pegada arriba a la
         izquierda, sobre la barra, explicando algo que ya no está. */
      if (!el.isConnected) return
      /* Una tarjeta fijada (sonando) no la reemplaza la pista de otro elemento que el mouse cruce. */
      if (fijadaRef.current && duenio !== el) return
      if (duenio !== el) soltarDuenio()
      const texto = textoDe(el)
      const publicados = new Set((ayudaRef.current?.tutoriales ?? []).map((x) => x.id))
      if (texto.trim() && tieneTarjeta(el.dataset.tutorial, publicados)) {
        /* Sin `aria-describedby`: la tarjeta tiene controles, y una descripción no puede tenerlos. El texto
           sigue en el `title`, que el lector de pantalla lee como siempre (el mouse no lo toca para él). */
        duenio = el
        const nombre = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim()
        setAbierta({ el, forma: 'frase', texto: texto.trim(), titulo: nombre, puntero: desde, tutorial: el.dataset.tutorial ?? null })
        return
      }
      const forma = formaDePista({
        texto,
        esTermino: el.classList.contains('spira-termino'),
        textoVisible: el.textContent ?? '',
        cortado: estaCortado(el),
      })
      /* Sin forma (un nombre que se lee entero) no se dibuja nada, y el `title` sigue mudado hasta
         que el mouse se vaya: devolverlo ahora haría salir el globo nativo, que es justo lo que
         `formaDePista` decidió que sobra. */
      if (!forma) { soltarDuenio(); setAbierta(null); return }
      duenio = el
      /* La pista se anuncia aparte sólo si agrega algo al nombre del control (`describeAparte`). */
      const nombre = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim()
      if (describeAparte(texto, nombre)) el.setAttribute('aria-describedby', sumarId(el.getAttribute('aria-describedby'), ID_PISTA))
      setAbierta({ el, forma, texto: texto.trim(), titulo: forma === 'termino' ? (el.textContent ?? '').trim() : null, puntero: desde, tutorial: null })
    }

    /* —— mouse (y lápiz). El touch no apunta: tocar un botón ya hace lo suyo. —— */
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      puntero = { x: e.clientX, y: e.clientY }
      if (enPanel(e.target)) { cancelarCierre(); return }
      const el = objetivo(e.target, panel())
      if (!el) {
        /* También es la red para el dueño que se desmontó con el mouse encima (una fila que se va
           al cambiar de día): no hay `pointerout` de algo que ya no existe, pero el próximo
           `pointerover` cae en otra cosa y la pista se va. */
        liberar()
        cancelarApertura()
        if (duenio) cerrarConGracia()
        return
      }
      /* Moverse adentro del mismo elemento no cambia nada: ni reabre la pista que un clic acaba de
         cerrar, ni la vuelve a agendar. */
      if (el === silenciado) {
        if (el === duenio) cancelarCierre()
        return
      }
      silenciar(el)
      if (el === duenio) { cancelarCierre(); return } // la abrió el teclado y ahora llegó el mouse
      cancelarApertura()
      pendiente = el
      /* Con el puntero de CUANDO abre, no de cuando entró: en una fila grande, el mouse pudo moverse
         durante la demora, y el globo nativo también aparece donde está el cursor en ese momento. */
      tAbrir = window.setTimeout(() => mostrar(el, puntero), demoraDeApertura(performance.now(), ultimoCierre, duenio != null))
    }

    /* Sólo anota dónde está el mouse: dos números, sin dibujar nada. */
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') puntero = { x: e.clientX, y: e.clientY }
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
      if (el === pendiente) cancelarApertura()
      if (el === duenio) cerrarConGracia()
      if (el === silenciado) liberar()
    }

    /* —— teclado: sólo el foco que llega con Tab (`abrePorFoco`) ——
       El `title` no se muda acá: el lector de pantalla arma el anuncio con el foco, y sacarle el
       atributo en ese mismo instante podía dejar a un botón de ícono sin nombre. */
    const onFocusIn = (e: FocusEvent) => {
      const tecla = ultimaTecla
      ultimaTecla = null // una tecla abre a lo sumo un foco: el siguiente, si lo mueve el código, no
      const t = e.target
      if (!abrePorFoco(tecla) || !(t instanceof HTMLElement) || objetivo(t, panel()) !== t) return
      cancelarApertura()
      mostrar(t, null)
    }
    const onFocusOut = (e: FocusEvent) => {
      if (e.target === duenio && cierraLaPista('foco', fijadaRef.current)) cerrar()
    }

    /* —— tocar: sólo los términos sueltos se abren tocándolos; cualquier otro toque o clic cierra ——
       Un término adentro de un botón o enlace no: ahí el toque ya hace lo que hace la fila. */
    const onDown = (e: PointerEvent) => {
      ultimaTecla = null
      if (enPanel(e.target)) return
      const el = objetivo(e.target, panel())
      if (e.pointerType === 'touch' && el?.classList.contains('spira-termino') && !el.parentElement?.closest('button, a, [role="button"]')) {
        if (el === duenio) cerrar()
        else { cancelarApertura(); mostrar(el, null) }
        return
      }
      cerrar()
    }

    const onKey = (e: KeyboardEvent) => {
      ultimaTecla = e.key
      if (e.key !== 'Escape') return
      if (duenio) { e.stopImmediatePropagation(); cerrar() }
      else cancelarApertura()
    }

    /* Cerrarla al scrollear es más simple y más tranquilo que perseguir al elemento.
       Y ese cierre NO deja la pista tibia: al scrollear, el mouse queda quieto pero la página pasa
       por debajo, así que cae sobre otro `title` a cada rato; tibia, cada uno saldría al instante y
       una lista con nombres se volvería un parpadeo de carteles. Medido en el banco: el scroll la
       cerraba y la volvía a abrir en el mismo cuadro. */
    const onCambio = () => {
      if (!duenio && !pendiente) return
      if (!cierraLaPista('scroll', fijadaRef.current)) return
      cerrar()
      ultimoCierre = -Infinity
    }

    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerout', onOut)
    document.addEventListener('pointermove', onMove, { passive: true })
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
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onCambio, true)
      window.removeEventListener('resize', onCambio)
      window.removeEventListener('blur', onCambio)
      window.clearTimeout(tAbrir)
      window.clearTimeout(tCerrar)
      liberar()
      soltarDuenio()
    }
  }, [])

  /* Se ubica ANTES del pintado: el panel ya está montado (con su tamaño real) y todavía no se vio,
     así que nunca aparece un cuadro en la esquina que después salta a su lugar. */
  useLayoutEffect(() => {
    const p = panelRef.current
    if (!abierta || !p) return
    const { top, left } = ubicarPista(
      anclaDePista(abierta.el.getBoundingClientRect(), abierta.puntero),
      { width: p.offsetWidth, height: p.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    )
    p.style.top = `${top}px`
    p.style.left = `${left}px`
  }, [abierta])

  if (!abierta) return null

  /* —— La tarjeta del tutorial (T5b) —— */
  const tutorial = abierta.tutorial ? ayuda?.tutoriales.find((x) => x.id === abierta.tutorial) ?? null : null
  if (tutorial && ayuda) {
    const acento = MODULES.find((m) => m.key === tutorial.modulo)?.accentSolid ?? 'var(--spira-primary)'
    return createPortal(
      <div
        ref={panelRef} id={ID_PISTA} role="dialog" aria-label={`Tutorial: ${tutorial.titulo}`}
        className="spira-ayuda" data-forma="tutorial"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {fijada && (
          <button type="button" onClick={() => cerrarRef.current()} aria-label="Cerrar y detener" style={cerrarTarjeta}>
            <Icon name="x" size={15} color="var(--spira-muted)" />
          </button>
        )}
        <TarjetaTutorial
          tutorial={tutorial}
          base={ayuda.base}
          acento={acento}
          titulo={abierta.titulo ?? tutorial.titulo}
          texto={abierta.texto}
          visto={ayuda.vistos.has(tutorial.id)}
          onVisto={() => ayuda.marcarVisto(tutorial.id)}
          onArranca={() => { fijadaRef.current = true; setFijada(true) }}
          onVerEnGrande={(segundo) => {
            // El foco al control ANTES de abrir la Ayuda: el `Drawer` lo toma como disparador y se lo
            // devuelve al cerrar (la tarjeta, con su botón, ya no va a estar).
            abierta.el.focus()
            cerrarRef.current()
            ayuda.abrirTutorial(tutorial.id, { segundo })
          }}
        />
      </div>,
      document.body,
    )
  }
  /* Un clic ADENTRO de la pista (para seleccionar su texto) no es un clic afuera de nadie: se corta acá
     para los que escuchan el `mousedown` en burbuja (los menús de `AboutMenu`, `UserMenu`…), y
     `usePopover`, que escucha en captura y llega antes, lo reconoce por el id. Sin esto, el clic
     cerraba el menú abierto debajo. */
  return createPortal(
    <div
      ref={panelRef} id={ID_PISTA} role="tooltip" className="spira-ayuda" data-forma={abierta.forma}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {abierta.forma === 'termino'
        ? <><span className="spira-ayuda-titulo">{abierta.titulo}</span><span className="spira-ayuda-cuerpo">{abierta.texto}</span></>
        : abierta.texto}
    </div>,
    document.body,
  )
}

/* El ✕ de la tarjeta fijada, arriba a la derecha (mock de tutoriales, recuadro 2b). */
const cerrarTarjeta: CSSProperties = {
  position: 'absolute', top: 8, right: 8, width: 28, height: 28, border: 'none', borderRadius: 8,
  background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer', zIndex: 1,
}
