# Spira · Handoff para IA de frontend

> **Para qué sirve este archivo:** es el punto de entrada para que un agente de IA
> (o una persona dev) replique el sistema de diseño de **Spira** tal cual está definido.
> Leelo primero, después abrí los archivos que se referencian abajo.

Spira es un **ecosistema de software para investigación clínica** (Argentina).
Identidad **"Sereno"**: petróleo sobre papel cálido, sobria y limpia. El símbolo
es el **vilano** (semilla del diente de león). *Spira* = del latín *spirare*, respirar.

> **Nota interna (no mostrar en UI):** el producto opera bajo marco regulatorio
> (ANMAT / ICH-GCP). Influye en el tono (trazabilidad, formalidad, datos sensibles)
> pero **no debe aparecer como copy ni en pantallas**.

---

## 1. Qué archivos pasar (paquete mínimo → completo)

**Mínimo imprescindible** (con esto ya se puede construir bien):
1. `HANDOFF.md` ← este archivo (el índice y las reglas).
2. `colors_and_type.css` ← **todos los tokens + el tema claro/oscuro**. Es la fuente de verdad de color/tipo.
3. `README.md` ← reglas de marca: voz y tono, fundamentos visuales, layout, iconografía.

**Recomendado para replicar "tal cual"** (sumar a lo anterior):
4. `App Shell - Final.html` + sus componentes JSX → es el **render de referencia** (el objetivo a igualar):
   - `spiraTokens.jsx` — tokens en JS + datos de dominio (módulos, submódulos, usuario, Pharma, Track).
   - `spiraShared2.jsx` — login, riel de módulos, top bar, popups, avatar, widget solo-lectura.
   - `FinalShell.jsx` — el shell completo (top unificado, doble panel, tema, navegación 2 niveles).
   - `PharmaContent.jsx` / `TrackContent.jsx` — contenido real por módulo (patrón a seguir para Lab/Contable).
   - `Icons.jsx` — set de íconos de línea (Lucide).
   - `SpiraVilanos.jsx` — el isotipo del vilano (usar `Vilano1`).
5. `assets/spira-vilano-*.svg` — el isotipo exportado (petróleo / papel / tinta).
6. `Manual de Marca.html` — manual presentable (útil como referencia visual humana).

> **Nota técnica:** los `.jsx` están escritos como **React + Babel inline con estilos inline**
> (no hay build, no usan las clases CSS). Sirven como **referencia de patrón y medidas**. Si el
> front se hace en React/Vue/etc. con CSS real, usá `colors_and_type.css` como tokens y replicá
> la estructura que ves en los JSX. Los dos describen el mismo sistema.

---

## 2. Tokens (resumen — la fuente completa es `colors_and_type.css`)

```
COLOR BASE        ink #14302E · primary #0F5F57 (petróleo, marca) · paper #F4F1EA
                  surface #FBFAF6 · white #FFFFFF · muted #7C8C87 · faint #A6B0AC
                  line #E4DECF · line-2 #D8CBB0
SEMÁNTICO         good #5C8A5A · warn #B0823F · danger #A6483B
ACENTO POR MÓDULO Track #2E7D74 (teal) · Pharma #C9A24A (ámbar, relleno #A8842F)
                  Lab #5C8A5A (salvia) · Contable #3A6B8C (azul acero)
TIPOGRAFÍA        display 'Schibsted Grotesk' 700 (títulos, marca, números)
                  text 'Hanken Grotesk' (cuerpo, UI) · mono 'IBM Plex Mono' (códigos, IDs)
RADIOS            sm 8 · md 10 · lg 16 (cards) · pill 999
SOMBRAS           sm 0 1px 2px rgba(20,48,46,.06) · md …/.10 · lg …/.14   (suaves, cálidas)
ESPACIADO         escala de 4 (4,8,12,16,20,24,32,40,48)
```

**Reglas de uso del color:** con intención, nunca decorativo. El acento es del **módulo activo**.
El texto sobre un fondo de acento usa `--spira-on-accent` (#F4F1EA, constante en ambos temas).

---

## 3. Tema claro / oscuro

El modo oscuro se activa con `[data-theme="dark"]` en `<html>` o un contenedor; los tokens se
redefinen por CSS variables (ver el bloque al final de `colors_and_type.css`).

- **Se mantienen** en ambos temas: acentos por módulo, primario, semánticos, `--spira-on-accent`.
- **Cambian**: paper, surface, white(card), ink, muted, faint, line, line-2, y el isotipo
  (`--spira-brand-mark`: petróleo en claro, menta `#9DE6D6` en oscuro).
- **Persistencia:** guardar la preferencia en `localStorage` con la clave **`spira-theme`**
  (`"light"` | `"dark"`), igual que el producto Spira Pharma. Toggle con ícono sol/luna en el top bar.

```js
// patrón de toggle
const t = localStorage.getItem('spira-theme') || 'light';
document.documentElement.dataset.theme = t;
// al alternar: guardar el nuevo valor en localStorage y actualizar dataset.theme
```

---

## 4. Estructura del app shell (qué replicar)

- **Top bar unificado** de ancho completo (no partido): a la izquierda el lockup (vilano +
  nombre del **módulo activo**); a la derecha búsqueda contextual (lupa que se expande),
  toggle de tema, notificaciones (popup), y cluster de usuario (nombre en `muted`, no negro).
- **Navegación de dos niveles:** riel angosto de **módulos** (íconos) + panel de **submódulos**
  (ícono de línea + label). El submódulo activo = **tinte de acento al ~14% + texto en acento**,
  **sin borde/arquito a la izquierda**. La tuerca de **Ajustes** va abajo a la izquierda (al pie del riel).
- **Permisos por rol:** los módulos sin acceso aparecen **bloqueados** (candado), no clickeables.
- **Contenido por módulo:** cada módulo tiene sus vistas propias (ver `PharmaContent.jsx` y
  `TrackContent.jsx` como patrón). Cards blancas/superficie, borde `line`, radio 16, sombra mínima.
  La card "hero" puede ir en el acento pleno del módulo con texto en `on-accent`.
- **Widget solo-lectura:** datos traídos de otro módulo llevan badge "Solo lectura" con el
  acento del módulo de origen; nunca editables desde el módulo actual.

---

## 5. Reglas no negociables (de marca)

- **Español rioplatense, voseo** en acciones ("Ingresá", "Nueva visita").
- **Sentence case** en títulos y botones; MAYÚSCULAS con tracking solo en *eyebrows* / rótulos.
- **Sin emoji.** Íconos de **línea** únicamente (Lucide, trazo 1.8–1.9, `currentColor`).
- **Sin italic** (suena editorial; no encaja en lo clínico).
- **Sin gradientes, sin texturas.** Fondos sólidos. Sombras suaves y cálidas, nunca duras.
- Números y códigos en **monoespaciada** + `font-variant-numeric: tabular-nums`.
- El **vilano** es la marca, no un ícono de UI: no lo reemplaces por un ícono cualquiera.
- **No mostrar el marco regulatorio (ANMAT / ICH-GCP) en la UI ni en copy.** Es contexto
  interno que influye en el tono; nunca aparece como texto en pantallas, footers o logins.

---

## 6. Cómo arrancar (sugerencia de prompt para la IA)

> "Acá tenés el sistema de diseño de Spira (HANDOFF.md + colors_and_type.css + README.md +
> los componentes de referencia). Usá `colors_and_type.css` como tokens y replicá la estructura
> del shell que ves en `App Shell - Final.html` / `FinalShell.jsx`. Respetá las reglas de la
> sección 5. Implementá el tema claro/oscuro con `[data-theme]` y `localStorage['spira-theme']`.
> Construí la pantalla X siguiendo el patrón de `PharmaContent.jsx`."
