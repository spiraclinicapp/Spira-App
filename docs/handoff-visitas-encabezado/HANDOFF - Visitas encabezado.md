# Visitas · encabezado y cuerpo — handoff

Especificación para replicar la pantalla de visita: encabezado (utilidades, identidad, médico, datos, fechas), barra de acción con la ruta de estados, y cuerpo en dos columnas.

**Archivos de esta carpeta**
- `Visitas - Handoff.html` — visita completa (encabezado + cuerpo) y los tres estados del encabezado, con notas.
- `Visitas - Encabezado definitivo.html` — solo el encabezado en sus tres estados.

Los dos son HTML sueltos: se abren en el navegador, no necesitan build. El modal se dibuja a **1120px** y se muestra dentro de un marco escalado `transform: scale(.78)` solo para la presentación; en producción va a tamaño real.

---

## 1 · Fundaciones

### Tipografías
| Uso | Familia | Pesos |
|---|---|---|
| Display (nombres, títulos, botón primario) | Schibsted Grotesk | 700 |
| Texto (datos, etiquetas, controles) | Inter | 400 / 500 / 600 / 700 |

```html
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Tokens
```css
:root{
  --ink:#14302E;        /* estructura, microcopy fuerte */
  --ink-2:#2A4744;      /* nombres y valores (un punto menos negro) */
  --ink-soft:#556966;   /* texto secundario, fecha estimada */
  --muted:#7C8C87;      /* íconos neutros, texto deshabilitado */
  --faint:#A6B0AC;      /* etiquetas en versalitas, candado, código */
  --primary:#0F5F57;    /* texto sobre tintes petróleo */
  --track:#2E7D74;      /* acción primaria, riel de etapa, cabecera dispensación */
  --paper:#F4F1EA;      /* fondo del modal */
  --surface:#FBFAF6;    /* barra de acción y panel neutro */
  --white:#FFFFFF;      /* fila de utilidades, identidad, campos */
  --line:#E4DECF;       /* hairline estructural */
  --line-2:#D8CBB0;     /* borde de control, fondo del riel */
  --on-accent:#F4F1EA;  /* texto sobre --track */
}
```
Ámbar (solo desvío de fecha y «médico solicitado»): fondo `rgba(176,130,63,.16)`, texto `#8A6224`.
Tinte petróleo de bloque: `rgba(46,125,116,.10)` a `.15`; borde tintado `rgba(46,125,116,.28)`.

### Escala de radio y alto
| Elemento | Radio | Alto |
|---|---|---|
| Modal | 20 | — |
| Acción primaria / secundaria / bloque punteado | 11 | 42 |
| Campo de fecha, select, panel interno | 8–10 | 32 (fecha) / 42 (select) |
| Pill de navegación, coordinador | 9 / 999 | 30 / 28 |
| Botón chico (selector de médico) | 7 | 22 |
| Avatar / chipico | 9–12 | 26–30 |

Números siempre con `font-variant-numeric: tabular-nums` (número de paciente, fechas, horas, contador).

---

## 2 · Estructura y altos

```
.modal  (1120px, --paper, radio 20, border 1px --line)
├─ .hd                     fondo --white, border-bottom 1px --line
│  ├─ .util                51px · protocolo · código · tag de visita · coordinador · navegación · cerrar
│  ├─ .idw                 ~140px · identidad+médico | datos | fechas
│  └─ .actbar              68px · fondo --surface, hairline arriba y abajo
└─ .body                   dos columnas 1fr 1fr, gap 14px, padding 16px 22px 24px
```
Encabezado total **~259px**. Los tres bloques de `.idw` se separan con `border-left: 1px solid var(--line)` y `padding-left: 22–24px`; `.idw` lleva `padding: 15px 22px` y `align-items: stretch`.

---

## 3 · Fila de utilidades (51px)

De izquierda a derecha: nombre de protocolo (display 13/700) · código (12.5px `--faint`, tabular) · **tag de tipo de visita** (pill 25px, fondo `rgba(46,125,116,.14)`, texto `--primary` display 13/700, ícono de agenda 13px) · **coordinador** (empujado con `margin-left:auto`) · navegación · cerrar.

**Coordinador** — pill 28px, `padding: 0 10px 0 11px`, radio 999:
- Asignado y editable: borde `--line`, ícono persona 13px, etiqueta `COORDINADOR` 9.5px/.11em `--faint`, nombre 12.5px/600 `--ink-2`, chevron 13px. **El nombre va solo, sin título profesional.**
- Sin asignar: borde punteado `--line-2`, texto «Asignar coordinador» en `--muted`.
- Visita concretada: `<span>` en lugar de `<button>`, sin chevron, candado 11px `--faint` al final.

**Navegación** — pill de 30px con borde `--line`: flecha 30×28, contador («1 de 4») 12px/600 `--ink-soft` con hairline a cada lado, flecha. **Cerrar** queda afuera del grupo, 30px radio 9, con 10px de aire.

---

## 4 · Identidad y médico a cargo

- Barra de acento: `border-left: 3px solid var(--track)`, `padding-left: 13px`.
- Nombre del paciente: display **23px/700**, `letter-spacing:-.02em`, color `--ink-2`.
- Número de paciente: **17px/600** `--ink-soft`, tabular, 5px debajo del nombre.
- **Médico a cargo**, 12px más abajo: etiqueta `MÉDICO A CARGO` 9.5px/700/.11em `--faint`, y abajo (2px) el nombre en display **15px/700** `--ink-2`. Sin avatar.
  - Editable: botón chevron de 22px (radio 7, borde `--line`, **`padding:0`**) a 8px del nombre.
  - Concretada: sin botón; candado 11px `--faint` a 6px de la etiqueta.

> El `padding:0` del botón no es opcional: el padding por defecto del UA descentra el chevron dentro de una caja de 22px.

---

## 5 · Datos del paciente

Rejilla de **2 columnas** `repeat(2, minmax(0,auto))`, `gap: 10px 26px`. Por celda: etiqueta 10.5px/700/.1em versalitas `--faint` y valor 13px/600 `--ink-2` (`margin-top: 1px`, `white-space: nowrap`).

Celdas: Sexo · Edad · F. nacimiento · Fértil. **«Fértil» solo se dibuja cuando aplica**; si no, la celda se cae y la rejilla se recompone.

---

## 6 · Fechas (bloque derecho)

Dos campos apilados, 8px entre ellos, en la última columna. **Siempre editables: no hay modo, ni lápiz, ni doble clic.**

| | Fecha est. | Fecha real |
|---|---|---|
| Etiqueta | `FECHA EST.` 10px/700/.1em `--faint` | `FECHA REAL` + pastilla de desvío |
| Campo | 32px, radio 8, borde `--line-2`, fondo `--white` | igual |
| Valor | 14px/600 `--ink-soft`, tabular | 14px/600 `--ink-2`, tabular |
| Vacío | — | «—» en `--faint`/500 |
| Ícono | agenda 16px a la derecha (`margin-left:auto`) | idem |

- Foco: borde `--track` + halo `0 0 0 3px rgba(46,125,116,.13)`. Al costado aparecen **confirmar** (32px sólido `--track`, check 15px `--on-accent`) y **descartar** (32px borde `--line-2`, cruz 14px). Enter guarda, escape descarta. El encabezado no cambia de alto.
- **Desvío**: pastilla 19px ámbar al lado de la *etiqueta* «Fecha real» (no del valor, para no ensanchar el campo). Solo cuando hay dos fechas y difieren. Formato `+3 d`.
- La fecha real se autocompleta con el día en que se marcó el fin de atención; corregirla no mueve la ruta ni las horas de las marcas.
- Sin permiso de edición: mismo texto y tamaño, sin borde ni ícono. Ningún salto de layout.

---

## 7 · Barra de acción (68px)

Fondo `--surface`, hairline `--line` arriba y abajo, `padding: 12px 22px`, `gap: 18px`.

**Indicador de etapa** (izquierda, `flex:1`, máx 440px):
- Línea: nombre de etapa display 14/700 · hora 11.5px/600 `--ink-soft` tabular · contexto 11.5px `--ink-soft` («· sigue inicio de atención», «la marca la hace Recepción») · fracción a la derecha 11px/700/.06em versalitas («2 DE 4»).
- Riel: 4px, radio 2, fondo `--line-2`, relleno `--track` al 25/50/75/100%.

**Acciones** (derecha, `gap: 14px`):
- Primaria 42px radio 11, `--track`, sombra `0 2px 8px rgba(46,125,116,.24)`, texto `--on-accent` 14/700, flecha 16px. **Una sola por pantalla: la que avanza la etapa.**
- Dividido: `+38px` con borde izquierdo `rgba(244,241,234,.30)` y chevron; abre retroceder una etapa y ver historial. Retrocede de a un paso, solo la última marca, y queda registrado con autor y hora.
- Secundaria «Solicitar médico»: 42px, borde `--line-2`, fondo `--white`, 13.5px/600, ícono persona 15px + flecha externa 13px. Nunca sólida, no mueve la ruta.
- Etapa de otro rol: la primaria se reemplaza por bloque punteado 42px «Requiere acción de Recepción» (`--muted`, candado 15px). La secundaria queda si el rol la tiene.
- Finalizada: pastilla 42px `rgba(46,125,116,.14)`, check 15px, «Finalizada» 13/700 `--primary` + «14/08/2026 · 11:20 · Dra. Sosa» 500 `--ink-soft`.
- Médico ya solicitado: chip ámbar 26px «Médico solicitado · 10:42» a la izquierda de la primaria.

---

## 8 · Cuerpo

Rejilla `1fr 1fr`, `gap: 14px`, `padding: 16px 22px 24px`, `align-items: start`. **Procedimientos a la izquierda, Dispensación a la derecha.**

**Procedimientos** — panel neutro: borde `--line`, radio 14, fondo `--surface`, `padding: 14px 16px`, mínimo 150px. Cabecera: ícono 15px + título display 14/700; vacío en 12.5px `--faint`.

**Dispensación** — bloque tintado: radio 14, borde `rgba(46,125,116,.28)`, fondo `rgba(46,125,116,.10)`. Cabecera sólida `--track` de 48px con chipico 26px `rgba(255,255,255,.20)` y título display 14/700 blanco. Cuerpo `padding: 13px 16px 16px`: aviso «FUERA DE CRONOGRAMA» 11px/700/.13em `--ink-soft` con ícono 12px, select 42px (borde `--line-2`, fondo `--white`, placeholder `--muted`), y botón fantasma 42px «Agregar medicación» (borde `--line`, fondo `--white`).

Los controles del cuerpo van a 42px: el mismo alto que la acción primaria.

---

## 9 · Estados y permisos

| Estado de la visita | Médico | Coordinador | Fecha est. | Fecha real | Barra |
|---|---|---|---|---|---|
| Pendiente / por llegar | editable | editable o sin asignar | editable | «—» editable | etapa 1 de 4, primaria del rol que marca |
| En curso (concurrió, en atención) | editable | editable | editable | «—» editable | primaria que avanza + «Solicitar médico» |
| Concretada / finalizada | **candado** | **candado** | editable | editable, con desvío | pastilla «Finalizada» |

Cambiar médico o coordinador con la visita ya concretada es tarea de soporte, no de la pantalla. Todo guardado (fechas, marcas, reasignaciones) registra autor y hora y entra al historial de la visita.

---

## 10 · Responsive

- < 1100px: las fechas pasan a dos columnas debajo de los datos del paciente; el coordinador se queda en la fila de utilidades.
- < 900px: la barra de acción apila la etapa arriba y las acciones abajo, a lo ancho; el cuerpo pasa a una columna (Procedimientos primero).

---

## 11 · Íconos

Todos son SVG de trazo, `viewBox="0 0 24 24"`, `fill:none`, `stroke-width:1.8` (2.4 para checks y avisos), `stroke-linecap/linejoin: round`. Colores por clase: `.ico` `--track` · `.ico.n` `--muted` · `.ico.s` `--ink-soft`.

| Uso | Path |
|---|---|
| Agenda (tipo de visita, campo de fecha) | `M8 2v4` · `M16 2v4` · `rect x=3 y=4 w=18 h=18 rx=2` · `M3 10h18` |
| Persona (médico, coordinador, solicitar) | `M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2` · `circle 12,7 r=4` |
| Candado (bloqueado, requiere rol) | `rect x=3 y=11 w=18 h=11 rx=2` · `M7 11V7a5 5 0 0 1 10 0v4` |
| Chevron | `m6 9 6 6 6-6` |
| Flechas de navegación | `m15 18-6-6 6-6` / `m9 18 6-6-6-6` |
| Cerrar | `M18 6 6 18` · `m6 6 12 12` |
| Check | `M20 6 9 17l-5-5` |
| Avanzar (primaria) | `M5 12h14` · `m12 5 7 7-7 7` |
| Portapapeles (procedimientos) | `rect x=8 y=2 w=8 h=4 rx=1` · `M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2` · `m9 14 2 2 4-4` |
| Píldora (dispensación) | `m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z` · `m8.5 8.5 7 7` |
| Aviso | `circle 12,12 r=10` · `M12 16v-4` · `M12 8h.01` |
| Deshacer (historial) | `M3 7v6h6` · `M21 17a9 9 0 0 0-15-6.7L3 13` |

---

## 12 · CSS de referencia

Copiable tal cual; los tokens del punto 1 tienen que estar declarados.

```css
.util{display:flex;align-items:center;gap:10px;padding:10px 22px;border-bottom:1px solid var(--line)}
.coord{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 10px 0 11px;border-radius:999px;border:1px solid var(--line);background:var(--white);font-size:12.5px;font-weight:600;color:var(--ink-2);cursor:pointer;margin-left:auto;flex:0 0 auto;white-space:nowrap}
.coord.empty{border-style:dashed;border-color:var(--line-2);color:var(--muted)}
.coord .cl{font-size:9.5px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:var(--faint)}

.idw{padding:15px 22px;display:flex;align-items:stretch;gap:22px}
.idn{min-width:0;flex:1;border-left:3px solid var(--track);padding-left:13px}
.nm{font-family:var(--fd);font-weight:700;font-size:23px;letter-spacing:-.02em;margin:0;color:var(--ink-2)}
.pid{font-size:17px;font-weight:600;color:var(--ink-soft);font-variant-numeric:tabular-nums;letter-spacing:.02em}
.doc2{margin-top:12px}
.doc2 .mlab{display:flex;align-items:center;gap:6px;font-size:9.5px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:var(--faint)}
.doc2 .nrow{display:flex;align-items:center;gap:8px;margin-top:2px}
.mn{font-family:var(--fd);font-size:15px;font-weight:700;letter-spacing:-.01em;color:var(--ink-2);white-space:nowrap}
.sw{width:22px;height:22px;padding:0;line-height:0;border-radius:7px;border:1px solid var(--line);background:var(--white);display:grid;place-items:center;cursor:pointer;flex:0 0 auto}

.col{flex:0 0 auto;padding-left:22px;border-left:1px solid var(--line);display:flex;flex-direction:column;justify-content:center}
.facts{display:grid;grid-template-columns:repeat(2,minmax(0,auto));gap:10px 26px}
.k{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);white-space:nowrap}
.v{font-size:13px;font-weight:600;margin-top:1px;white-space:nowrap;color:var(--ink-2)}

.dcol{padding-left:24px}
.dcol .dfl+.dfl{margin-top:8px}
.dlb{display:flex;align-items:center;gap:7px;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin-bottom:4px}
.big{display:flex;align-items:center;gap:9px;height:32px;padding:0 10px;border-radius:8px;border:1px solid var(--line-2);background:var(--white);font-size:14px;font-weight:600;color:var(--ink-2);font-variant-numeric:tabular-nums;white-space:nowrap;cursor:text}
.big .ico{margin-left:auto}
.big.soft{color:var(--ink-soft)}
.big.ph{color:var(--faint);font-weight:500}
.big.on{border-color:var(--track);box-shadow:0 0 0 3px rgba(46,125,116,.13)}
.dev{display:inline-flex;align-items:center;height:19px;padding:0 6px;border-radius:5px;background:rgba(176,130,63,.16);color:#8A6224;font-size:10.5px;font-weight:700;font-variant-numeric:tabular-nums}

.actbar{display:flex;align-items:center;gap:18px;padding:12px 22px;background:var(--surface);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.underbar{display:flex;flex-direction:column;gap:7px;flex:1;min-width:0;max-width:440px}
.underbar .rail{height:4px;border-radius:2px;background:var(--line-2);overflow:hidden}
.underbar .rail i{display:block;height:100%;background:var(--track);border-radius:2px}
.cta{border:0;cursor:pointer;background:var(--track);color:var(--on-accent);box-shadow:0 2px 8px rgba(46,125,116,.24);font-weight:700;font-size:14px;display:inline-flex;align-items:center;gap:8px;height:42px;border-radius:11px;padding:0 20px}
.sec{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 16px;border-radius:11px;border:1px solid var(--line-2);background:var(--white);font-weight:600;font-size:13.5px;color:var(--ink-2);cursor:pointer}
.gated{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 15px;border-radius:11px;border:1px dashed var(--line-2);background:var(--white);font-size:13px;font-weight:600;color:var(--muted)}

.body{padding:16px 22px 24px;display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
.panel{border:1px solid var(--line);border-radius:14px;background:var(--surface);padding:14px 16px;min-height:150px}
.disp{border-radius:14px;border:1px solid rgba(46,125,116,.28);background:rgba(46,125,116,.10);overflow:hidden}
.disp-hd{display:flex;align-items:center;gap:8px;padding:11px 14px;background:var(--track)}
```

---

## 13 · Checklist de QA

- [ ] El estado de la visita se dice **una sola vez**, en el listón de la barra. La identidad no lleva chip de estado.
- [ ] Una sola acción sólida por pantalla, y es la que avanza la etapa.
- [ ] Botones con caja fija llevan `padding:0` (si no, el ícono se descentra).
- [ ] Todos los números con `tabular-nums`.
- [ ] Alternar entre editable y bloqueado **no cambia el alto** del encabezado.
- [ ] «Fértil» ausente no deja hueco.
- [ ] Fecha real vacía muestra «—» y el bloque conserva su tamaño al completarse.
- [ ] Sin permiso de edición, los campos pierden borde e ícono pero no tamaño de texto.
