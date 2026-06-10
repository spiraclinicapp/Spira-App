# Spira · Sistema de Diseño e Identidad de Marca

> Ecosistema de software profesional para **investigación clínica** en Argentina.
> Usado por farmacéuticas, coordinadoras y médicos en centros de ensayos clínicos.
>
> **Nota interna (no mostrar en UI):** el producto opera en un marco regulatorio
> (ANMAT / ICH-GCP). Tenerlo en cuenta para decisiones de diseño —trazabilidad,
> formalidad, datos sensibles— pero **no usarlo como copy ni mostrarlo en pantallas**.

El nombre **Spira** viene del latín *spirare* — respirar. El símbolo de marca es el
**vilano**: la semilla voladora del diente de león. Representa respiración, vuelo,
dispersión y cuidado.

---

## 1. Contexto de producto

Spira es un **ecosistema modular**. Cada módulo tiene un acento de color propio dentro
de la misma familia cromática:

| Módulo | Qué hace | Acento |
|---|---|---|
| **Spira Track** | Seguimiento de ensayos: estudios, pacientes, visitas, queries, desvíos | Teal `#2E7D74` |
| **Spira Pharma** | Farmacia clínica: dispensación de medicación, stock, lotes, reportes a sponsor | Ámbar `#C9A24A` (relleno `#A8842F`) |
| **Spira Lab** | Muestras y análisis: resultados, cadena de frío | Salvia `#5C8A5A` |
| **Spira Contable** | Facturación y costos del estudio | Azul acero `#3A6B8C` |

El acceso a cada módulo depende del **rol** del usuario (coordinadora, farmacéutica,
empleado, administrativo). Los módulos sin permiso aparecen bloqueados.

> **Nota de color:** Spira Pharma usa su **ámbar/dorado histórico** `#C9A24A` como
> acento, con `#A8842F` (ámbar oscuro) para rellenos sólidos —botones y cards— para
> mantener buen contraste con texto papel. Contable toma el **azul acero** `#3A6B8C`
> para no chocar con el ámbar de Pharma.

---

## 2. Fundamentos de contenido (voz y tono)

- **Idioma:** español rioplatense. Voseo en acciones dirigidas al usuario
  ("Ingresá", "Respirá tranquilidad", "Decímelo").
- **Tono:** sereno, claro y profesional. Transmite **confianza clínica y calma** —
  nunca alarmista, nunca frío. La simpleza y la limpieza son valores centrales.
- **Personas:** "vos" para hablarle al usuario; la marca habla en primera persona
  institucional con sobriedad.
- **Mayúsculas:** Sentence case en títulos y botones ("Acceso al sistema",
  "Nueva dispensación"). MAYÚSCULAS con tracking solo en *eyebrows*/rótulos
  ("SUBMÓDULOS", "SOLO LECTURA").
- **Números y datos:** cifras tabulares; códigos de estudio/lote en monoespaciada
  (`EC-0117`, `L-2291`).
- **Sin emoji.** En un entorno profesional resta formalidad — se usan íconos de línea.
- **Ejemplos de copy:** *"Respirá tranquilidad en cada ensayo." · "Trazabilidad completa
  de tus estudios clínicos, en un solo lugar." · "Solo lectura · no editable desde este módulo."*

---

## 3. Fundamentos visuales

- **Color:** petróleo `#0F5F57` como color de marca sobre **papel cálido** `#F4F1EA`.
  Paleta serena y de baja saturación. Los acentos por módulo conviven en la misma
  familia (verdes/azules/ámbar apagados). El color se usa con intención: bloques de
  marca, acento del módulo activo, estados. Nunca decorativo de más.
- **Tipografía:** **Schibsted Grotesk** (display/marca/números, peso 700) +
  **Hanken Grotesk** (cuerpo y UI). **IBM Plex Mono** para códigos y datos.
  El italic se evita (suena demasiado editorial para lo clínico).
- **Fondos:** sólidos. Papel cálido para producto; petróleo pleno para paneles de
  marca y login. El vilano puede aparecer como **gráfico protagonista** o **marca de
  agua** muy sutil (opacidad ~7–10%). Sin gradientes, sin texturas.
- **Esquinas:** radios suaves — 8–10px en controles, 16px en cards, pill en chips/badges.
- **Sombras:** suaves y cálidas (`rgba(20,48,46,.06–.14)`), nunca duras. Elevación
  mínima; se prefiere borde `--spira-line` a sombra fuerte.
- **Bordes:** 1px `#E4DECF` para divisores y cards; `#D8CBB0` para inputs.
- **Cards:** fondo blanco/superficie, borde fino, radio 16px, sombra apenas perceptible.
  La card "hero" del dashboard puede ir en el acento pleno del módulo (texto en papel).
- **Movimiento:** sutil. Transiciones de opacidad/posición cortas (.12–.18s). Sin
  bounces ni animaciones llamativas — coherente con la calma de la marca.
  **Micro-interacción estándar:** todo elemento pulsable (botones, cards, controles)
  se levanta ~1px al *hover* y se asienta al pulsar — la señal de "esto se toca" que no
  depende del cursor. Está implementada **global** en `src/styles/tokens.css`
  (`@media (prefers-reduced-motion: no-preference)` sobre
  `:where(button, a[href], [role=button])`), así que cualquier control nuevo la hereda
  solo. Los **deshabilitados/bloqueados no se mueven**; para excluir un caso puntual
  (p. ej. la navegación, que se marca por resaltado) se usa la clase `.spira-no-press`.
- **Estados:** hover = tinte del acento al ~8–16% o fondo `surface`; activo = tinte de
  acento + texto en acento + barra/indicador. Foco visible.
- **Transparencia/blur:** popups y overlays sobrios; el menú de foco usa blur sutil.
- **Layout:** top bar unificado de ancho completo; navegación de dos niveles
  (riel de módulos + panel de submódulos). Densidad media, mucho aire.
- **Temas:** claro y oscuro. El modo oscuro usa fondo petróleo-carbón `#0E1B1A` y
  superficies `#142523`/`#17302C`, con texto claro. Los **acentos por módulo y el
  primario se mantienen** en ambos temas; el texto sobre acento usa `--spira-on-accent`
  (papel, constante) y el isotipo usa `--spira-brand-mark` (petróleo en claro, menta en
  oscuro). Toggle persistido en `localStorage` (`spira-theme`), como en Spira Pharma.

---

## 4. Iconografía

- **Set:** **Lucide** (íconos de línea, licencia ISC) — trazo 1.8–1.9px, `currentColor`,
  esquinas redondeadas, viewBox 24×24. Embebido en `Icons.jsx` (no se usa CDN para que
  funcione offline y con un trazo consistente).
- **Uso:** un ícono por módulo (Track = actividad/pulso, Pharma = pastilla, Lab = matraz,
  Contable = recibo) y uno por submódulo. El ícono toma el **acento del módulo** cuando
  está activo; gris `--spira-muted` cuando no.
- **Isotipo:** el **vilano** es vectorial propio (`SpiraVilanos.jsx` → `Vilano1`, y
  exportado a `assets/spira-vilano-*.svg`). No es un ícono de UI — es la marca.
- **Sin emoji. Sin unicode como íconos.**

---

## 5. Índice de archivos

**Raíz**
- `README.md` — este documento.
- `colors_and_type.css` — tokens de color, tipografía, radios, sombras, espaciado.
- `SKILL.md` — instrucciones para usar este sistema como skill.

**Marca y componentes**
- `SpiraVilanos.jsx` — 4 tratamientos del isotipo del vilano (`Vilano1` es el oficial).
- `Icons.jsx` — set de íconos de línea (Lucide).
- `spiraTokens.jsx` — tokens + datos de dominio (módulos, submódulos, usuario, Pharma).
- `spiraShared2.jsx` — login, riel, dashboard, popups (piezas del shell).
- `FinalShell.jsx` — **app shell definitivo** (top unificado, doble panel, etc.).
- `PharmaContent.jsx` — contenido real del módulo Spira Pharma.

**Vistas / entregables**
- `App Shell — Final.html` — el shell del producto (login → dashboard, navegable).
- `Manual de Marca.html` — manual de marca presentable (logo, color, tipo, aplicaciones).
- `Spira — Identidad Visual` (`index.html`) — exploración inicial de 4 identidades.
- `Login Variantes.html` — exploración de variantes de login.

**Assets**
- `assets/spira-vilano-petrol.svg` · `-paper.svg` · `-ink.svg` — isotipo en 3 colores.

**Preview** (`preview/`) — tarjetas del tab Sistema de Diseño.
