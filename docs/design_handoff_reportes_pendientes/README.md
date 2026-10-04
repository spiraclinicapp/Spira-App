# HANDOFF — Reportes pendientes (submódulo + widget del Resumen)

Módulo **Coordinación**. Dos entregas:
1. **Submódulo nuevo** `Coordinación › Reportes pendientes`.
2. **Rediseño del widget** "Reportes pendientes" en `Coordinación › Resumen`.

Idioma de la UI: **español rioplatense**.
Fecha del handoff: 03/10/2026 · v2. Suma el selector de estudios y los filtros desplegables.

---

## 0. Contenido del bundle

| Archivo | Qué es |
|---|---|
| `Reportes pendientes - Referencia.html` | **Referencia principal e interactiva.** A la izquierda el submódulo (1120px), a la derecha el widget (500px). Todo funciona: elegir estudios, filtrar, buscar, abrir pacientes y cambiar estados. |
| `referencias/01-modulo-un-estudio.png` | Estado inicial: un estudio enfocado y el primer paciente abierto. |
| `referencias/02-modulo-dos-estudios-sumados.png` | Dos estudios sumados; vuelve a aparecer la columna "Estudio · Visita". |
| `referencias/03-filtro-estado-abierto.png` | Desplegable "Estado" abierto. |
| `referencias/04-filtro-activo-limpiar.png` | Un filtro activo: botón teñido, contador, línea "N de M pendientes" y "× Limpiar 1". |
| `referencias/05-widget-resumen.png` | Widget del Resumen con un paciente abierto. |
| `spira-app-tokens.css`, `colors_and_type.css` | Tokens de Spira. Si el codebase ya los tiene, usar esos y no volver a declarar hex. |

**Los HTML son referencias de diseño, no código de producción.** Tienen estilos inline y datos mock. Hay que recrearlos con los componentes del codebase. El patrón de tarjetas de estudio y los botones de filtro **ya existen en `Coordinación › Pendientes`**: reutilizar esos componentes, no duplicarlos.

**Fidelidad: high-fidelity.** Colores, tipografía, espaciados, copy y comportamiento son definitivos. Los datos son mock.

---

## 1. Qué problema resuelve

Antes había **una fila por reporte**: un paciente con 3 informes aparecía 3 veces, y no se veía de un vistazo el número de paciente, el estudio y la visita, qué faltaba, ni qué estaba descargado.

Ahora:
- **Una fila por paciente** (paciente + visita), que resume el estado de todos sus reportes y se despliega para actuar.
- **Selector de estudios grande** arriba, como filtro rápido, que permite sumar varios estudios.
- **Filtros desplegables** con el mismo formato que Pendientes.

---

## 2. Vocabulario (copy)

- La unidad se llama **"pendiente"**: "10 pendientes", "1 pendiente". **No usar "abiertos".**
- Un pendiente es un reporte que todavía no se evolucionó (está `sin_descargar` o `descargado`).
- El rótulo de la sección de estudios es **"Estudios con pendientes"**, en paralelo con "Protocolos con pendientes" de la otra pantalla.

---

## 3. Modelo de datos y estados

Se agrupa por **paciente + visita**. Si un paciente tiene pendientes de dos visitas, son dos filas (cada visita tiene su propio plazo).

```
PacienteVisita {
  numero        // "222714" — identificador visible principal
  nombre        // "Maria Julieta Calderon"
  estudio       // "ACT18301"  (+ nombre corto del estudio: "AIRLYMPUS")
  visita        // "V17", "V4 · W8"
  fechaVisita   // 18/06
  plazo         // días respecto al vencimiento: >0 vencido, <=0 por vencer
  reportes[]: { tipo, estado }
}
```

### Estados del reporte (en este orden)

| Estado | Significado | Color | Ícono |
|---|---|---|---|
| `sin_descargar` | Llegó y nadie lo bajó | neutro (`--spira-line` / `--spira-ink-soft`). **Rojo** (`--spira-danger`) si la visita está vencida | círculo vacío |
| `descargado` | Se bajó pero todavía no pasó a la HC | azul `#3A6B8C` (`--spira-contable`) | flecha de descarga |
| `evolucionado` | Ya está en la HC; deja de ser pendiente | verde `--spira-good` | check |

Un paciente sale de la lista cuando todos sus reportes están evolucionados. Hasta que se refresca la vista, la fila muestra "Todo evolucionado" (módulo) o "Listo" (widget) en verde, para que la fila no desaparezca de golpe.

### Plazo (por paciente/visita)

| Condición | Módulo | Widget | Color / peso |
|---|---|---|---|
| plazo > 0 | `Vencido hace N días` | `Vencido hace N d` | `--spira-danger` · 700 |
| plazo = 0 | `Vence hoy` | `Vence hoy` | `--spira-warn` · 500 |
| −3 ≤ plazo < 0 | `Vence en N días` | `Vence en N d` | `--spira-warn` · 500 |
| plazo < −3 | `Vence en N días` | `Vence en N d` | `--spira-ink-soft` · 500 |

**Orden de la lista:** del más vencido al menos vencido (plazo descendente).

---

## 4. Pieza clave: la barra de estado del paciente

Permite ver el estado sin desplegar. Es **un segmento por reporte**, en el mismo orden en que aparecen al desplegar.

- Contenedor `display:flex; gap:3px`. Ancho **120px** en el módulo y **72px** en el widget.
- Segmento `flex:1; border-radius:3px`. Alto **8px** en el módulo y **7px** en el widget.
- Colores: sin descargar `--spira-line` · sin descargar con visita vencida `rgba(166,72,59,.28)` · descargado `#3A6B8C` · evolucionado `--spira-good`.
- Cada segmento lleva `title`/`aria-label` con `"{tipo}: {estado}"`.

**Conteo** al lado (12px · 700): `N sin desc.` (rojo si está vencido, si no `--spira-ink`) · `N desc.` (azul). Se omite la parte que da 0. Si las dos dan 0, va `Todo evolucionado` o `Listo` en verde.

---

## 5. Submódulo — `Coordinación › Reportes pendientes`

Orden vertical: **Encabezado → Selector de estudios → Filtros → Línea de resumen → Tabla**. Padding horizontal de la página: **26px**.

Entrada en la lista de submódulos de Coordinación, debajo de "Pendientes": título `Reportes`, descriptor `Informes por descargar y evolucionar`, ícono `file-text`.

### 5.1 Encabezado
Padding `22px 26px 0`.
- Migas: 12.5px `--spira-ink-soft`; el último tramo en 700 `--spira-ink`; separador `›` en `--spira-faint`. Texto: `Spira Coordinación › Reportes pendientes`.
- Título: `--spira-font-display` 700 · 26px · `letter-spacing:-.02em`. Texto: `Reportes pendientes`.

### 5.2 Selector de estudios (ver `01`, `02`)
Bloque con padding `16px 26px 4px`.

**Línea de rótulo** (`display:flex; gap:12px; margin-bottom:10px`):
- Izquierda: `ESTUDIOS CON PENDIENTES`, en el estilo eyebrow (10.5px · 700 · uppercase · `letter-spacing:.16em`), color `--spira-ink-soft`.
- Centro: una línea de 1px `--spira-line-2` que ocupa el espacio libre.
- Derecha (12.5px `--spira-ink-soft`):
  - sin selección: `Mostrando los 4`
  - con selección: `Mostrando N de 4 · ` + link `Ver todos` (600, `--spira-primary`), que limpia la selección.

**Grilla**: `grid-template-columns: repeat(4, minmax(0,1fr)); gap:12px`. Si hay más de 4 estudios, sigue en filas nuevas (como en Pendientes).

**Tarjeta de estudio** (es un `button`): padding `14px 16px 12px`, radio 14, `flex column; gap:10px`. De arriba a abajo:

| Elemento | Especificación | Ejemplo |
|---|---|---|
| Código | `--spira-font-display` 700 · 17px · `--spira-primary` · ellipsis | `ACT18301` |
| Nombre | 12.5px · 600 · `--spira-ink-2` · `margin-top:2px` · ellipsis | `AIRLYMPUS` |
| Cifra | `--spira-font-display` 700 · 26px · `line-height:1`. **Rojo** `--spira-danger` si el estudio tiene algún paciente vencido; si no, `--spira-ink` | `10` |
| Texto de la cifra | 12.5px `--spira-ink-soft`, en la misma línea base: `pendientes · N pac.` (singular `pendiente`) | `pendientes · 4 pac.` |
| Barra apilada | alto 6, pill, `gap:2px`. Proporcional a la cantidad de reportes del estudio: vencidos sin descargar `rgba(166,72,59,.45)` → sin descargar `--spira-line-2` → descargados `#3A6B8C` → evolucionados `--spira-good` | |
| Leyenda | 11.5px `--spira-ink-soft`, `gap:10px`, punto de 6px + rótulo + número en 700 `--spira-ink`: `Vencidos N` (solo si hay; cuenta pacientes) · `Sin desc. N` · `Desc. N` | |
| Pie | 12px · 600, alineado a la derecha | ver estados |

**Estados de la tarjeta:**

| Estado | Fondo / borde | Opacidad | Pie |
|---|---|---|---|
| Sin ninguna selección | blanco · `1px --spira-line` | 1 | `Ver sólo este` (`--spira-ink-soft`) |
| Seleccionada | `rgba(15,95,87,.07)` · `1.5px --spira-primary` | 1 | ✓ `Enfocado` (`--spira-primary`) |
| No seleccionada, con otras elegidas | blanco · `1px --spira-line` | **.62** | `+ Sumar` (`--spira-ink-soft`) |

Hover: `box-shadow:0 6px 18px rgba(20,48,46,.08)`, transición `.14s`.

**Comportamiento (multi-selección):**
1. Sin selección se ven todos los estudios.
2. Clic en una tarjeta no seleccionada → **se suma** a la selección.
3. Clic en una tarjeta seleccionada → se quita. Si era la única, se vuelve a ver todo.
4. `Ver todos` limpia la selección.
5. **Default al entrar:** sin selección. En la referencia arranca con ACT18301 solo para mostrar el estado enfocado. Si se llega con `?estudio=ACT18301` (por ejemplo, desde la ficha del protocolo), entra con ese estudio elegido.
6. Las cifras de cada tarjeta **no dependen** de los filtros de abajo: siempre muestran el total del estudio.
7. La selección persiste en la URL (`?estudio=ACT18301,CKJX839D12302`).

### 5.3 Filtros (ver `03`, `04`)
Fila con padding `18px 26px 0`, `display:flex; gap:8px; align-items:center; flex-wrap:wrap`.

**Botón de filtro** (mismo componente que en Pendientes): alto 38, padding `0 12px 0 13px`, radio 10, 14px · 600, `gap:8px`. Lleva ícono 15px + rótulo + chevron 15px.
- Inactivo: fondo blanco, borde `1px --spira-line-2`, texto `--spira-ink`, íconos `--spira-ink-soft`.
- Activo (≥1 opción marcada): fondo `rgba(15,95,87,.10)`, borde `1px --spira-primary`, texto e íconos `--spira-primary`, más un **contador** (círculo de 20px, fondo `--spira-primary`, texto `--spira-on-accent`, 11.5px · 700) con la cantidad de opciones marcadas, entre el rótulo y el chevron.

**Filtros, en este orden:**

| Botón | Ícono | Opciones (multi-selección) | Un paciente pasa si… |
|---|---|---|---|
| `Estado` | filtro (embudo) | `Sin descargar` · `Descargado, sin evolucionar` | tiene ≥1 reporte en alguno de los estados marcados |
| `Informe` | documento | los tipos de informe presentes en los estudios elegidos (`Espirometría Pre`, `Sangre`, `ECG`…) | tiene ≥1 pendiente de alguno de esos tipos |
| — divisor vertical 1×24 `--spira-line-2`, margen `0 4px` — | | | |
| `Antigüedad` | reloj | `Vencidos` (plazo > 0) · `Vencen en 7 días` (−7 ≤ plazo ≤ 0) · `Más adelante` (plazo < −7) | su plazo cae en alguno de los rangos marcados |

Entre filtros distintos se combinan con **Y**; dentro de un mismo filtro, con **O**.

**Menú desplegable** (ver `03`): se abre debajo del botón (`top:44px`), mínimo 240px de ancho, padding 6, fondo blanco, borde `1px --spira-line`, radio 12, `--spira-shadow-md`. Cada opción: padding `9px 10px`, radio 8, 13px, hover `--spira-surface`. Lleva un checkbox de 16px (radio 4; vacío con borde `1.5px --spira-line-2`; marcado con fondo `--spira-primary` y check `--spira-on-accent`), el rótulo y, a la derecha, la cantidad en 12px `--spira-ink-soft`. El menú **no se cierra al marcar**; se cierra con clic afuera o Esc.

**Buscador**, a la derecha (empujado con `flex:1`): 240×38, radio 10, borde `1px --spira-line-2`, ícono lupa 15px `--spira-muted`, texto 13px, placeholder `Paciente o número…`. Busca por nombre o número de paciente dentro de lo ya filtrado.

### 5.4 Línea de resumen
Debajo de los filtros: `margin-top:10px`, 12.5px `--spira-ink-soft`, tabular-nums, `display:flex; gap:12px`.
- Sin filtros activos: `{P} pendientes · {N} pacientes`
- Con filtros: `{p} de {P} pendientes · {n} pacientes` + botón `× Limpiar {k}` (600, `--spira-ink-2`), donde k es el total de opciones marcadas en los tres filtros. Limpiar no toca el selector de estudios ni la búsqueda.

P cuenta los pendientes de los estudios elegidos.

### 5.5 Tabla
Padding de página `12px 26px 26px`. Tarjeta blanca, borde `1px --spira-line`, radio 14, `overflow:hidden`. **Sin cabecera de estudio**: la tabla muestra directamente lo que dejan el selector y los filtros.

Columnas, que dependen de cuántos estudios hay elegidos:
```
1 estudio elegido:        28px 96px minmax(0,1fr)  80px 230px 160px   → col 4 = "Visita"
0 ó 2+ estudios elegidos: 28px 96px minmax(0,1fr) 150px 230px 160px   → col 4 = "Estudio · Visita"
gap: 12px
```

| # | Cabecera | Fila |
|---|---|---|
| 1 | — | chevron 16px `--spira-ink-soft` (derecha = cerrado, abajo = abierto) |
| 2 | `N° paciente` | `--spira-font-display` 700 · 15px · tabular-nums |
| 3 | `Paciente` | 14px · 600 · `--spira-ink-2` · ellipsis |
| 4 | `Visita` / `Estudio · Visita` | 13px. Con estudio: `ACT18301` en 600 + ` · V17` en `--spira-ink-soft` |
| 5 | `Estado de reportes` | barra (§4) + conteo, `gap:12px` |
| 6 | `Plazo` | alineado a la derecha, tabla del §3, 12.5px |

- Cabecera: padding `10px 18px`, fondo `--spira-surface`, 11px · 700 · uppercase · `letter-spacing:.04em` · `--spira-ink-soft`.
- Fila: padding `14px 18px`, `border-top:1px --spira-line`. **Toda la fila** abre y cierra. En hover y con la fila abierta, el fondo pasa a `--spira-surface`.

### 5.6 Paciente desplegado
Panel con fondo `--spira-surface`, padding `4px 18px 14px 58px`. Un renglón por reporte:
- Tarjeta blanca, borde `1px --spira-line`, radio 10, padding `9px 14px`, `margin-top:6px`.
- Columnas `minmax(0,1fr) 150px 130px`, `gap:12px`.
- **Col 1:** ícono documento 15px `--spira-muted` + `Informe {tipo}` (13.5px · 600) + ` · visita del {dd/mm}` (12px · 400 · `--spira-ink-soft`).
- **Col 2: chip de estado.** Alto 24, pill, 11.5px · 600, ícono 12px.
  - Sin descargar: blanco, borde `1px dashed --spira-line-2`, texto `--spira-ink-soft`.
  - Sin descargar con la visita vencida: texto `--spira-danger`, fondo `rgba(166,72,59,.08)`, borde dashed `rgba(166,72,59,.55)`.
  - Descargado: fondo `rgba(58,107,140,.12)`, texto `#3A6B8C`.
  - Evolucionado: fondo `rgba(92,138,90,.14)`, texto `--spira-good`.
- **Col 3: acción**, a la derecha. Alto 30, radio 8, 12.5px · 600, ícono 14px.
  - `Descargar`: borde `1px #3A6B8C`, texto `#3A6B8C`, fondo blanco.
  - `Evolucionar`: fondo `--spira-primary`, texto `--spira-on-accent`.
  - `Deshacer` (cuando está evolucionado): link subrayado `--spira-ink-soft`; vuelve a descargado.

Por defecto todas las filas arrancan **cerradas** y se pueden abrir varias a la vez. Si se llega desde el widget tocando un paciente, ese paciente arranca abierto y con su estudio elegido.

### 5.7 Vacíos
- Los filtros o la búsqueda no devuelven nada: renglón 13px `--spira-ink-soft`, padding 24, con el texto `Sin pacientes para este filtro.`
- No hay ningún pendiente: el selector no se muestra y la tabla dice `No te queda ningún reporte pendiente.`

---

## 6. Widget — `Coordinación › Resumen` (ver `05`)

Reemplaza al widget actual, con el mismo lugar y el mismo ancho (en la referencia, 500px). No lleva selector ni filtros.

### 6.1 Encabezado (sin cambios)
Padding `18px 20px 12px`. Ícono documento 18px + `Reportes pendientes` (`--spira-font-display` 700 · 16.5px). A la derecha, una barra 96×5 (fondo `--spira-line`, relleno `--spira-primary`) + `664 de 690` en 12.5px `--spira-ink-soft`.

### 6.2 Fila
Muestra los **5 pacientes más urgentes**, de todos los estudios. Padding `11px 20px`, `border-top:1px --spira-line`; toda la fila abre y cierra.
```
grid-template-columns: 16px minmax(0,1fr) auto; gap:10px
```
- Chevron 15px.
- Línea 1: número (`--spira-font-display` 700 · 14px) + nombre (13.5px · 600 · `--spira-ink-2` · ellipsis), `gap:8px`, alineados por la línea base.
- Línea 2 (12px `--spira-ink-soft`, `margin-top:2px`): `ACT18301 · V17 · ` + plazo corto con su color.
- Derecha: columna alineada a la derecha, `gap:5px`: barra de 72px arriba y conteo abajo.

### 6.3 Desplegado
Fondo `--spira-surface`, padding `0 20px 10px 46px`. Renglones **sin tarjeta**, separados por `border-top:1px --spira-line`, con `grid-template-columns: minmax(0,1fr) 110px 100px; gap:8px; padding:7px 0`:
- Tipo (13px, **sin** el prefijo "Informe").
- Estado como texto con ícono, 12px · 600, sin fondo, con los colores del chip.
- Acción compacta: alto 26, radio 7, 12px. Mismos tres casos que en el módulo.

### 6.4 Pie
Link de ancho completo, padding `12px 20px`, `border-top:1px --spira-line`, 13px · 600 `--spira-primary`, con una flecha a la derecha.
Texto: `Ver los {N} pacientes en Reportes pendientes`. Navega al submódulo sin estudio elegido.

---

## 7. Reglas de comportamiento

1. **Descargar** baja el archivo y, si sale bien, pasa el reporte a `descargado`. Si falla, el estado no cambia y aparece un toast de error.
2. **Evolucionar** marca el reporte como pasado a la HC. No abre nada.
3. **Deshacer** vuelve de `evolucionado` a `descargado`, mientras el paciente siga en la lista.
4. **Clic en el chip de estado** (solo en el módulo) avanza al estado siguiente, en ciclo: sin descargar → descargado → evolucionado → sin descargar. Sirve para corregir a mano; el camino principal es el botón de acción.
5. Cualquier cambio actualiza al instante la barra, el conteo, las cifras de las tarjetas de estudio, las cantidades de los menús, la línea de resumen y el `N de M` del widget.
6. El widget y el submódulo usan el mismo origen de datos.
7. Abrir y cerrar no anima la altura. Como mucho, rota el chevron (`.15s`, `--spira-ease-out`).
8. **Accesibilidad:**
   - Fila de paciente y tarjeta de estudio: `button` con `aria-expanded` y `aria-pressed`, respectivamente.
   - Botón de filtro: `aria-haspopup="listbox"`, con opciones `role="option"` y `aria-selected`.
   - El estado nunca se comunica solo con color: el chip "Sin descargar" lleva además el borde punteado, y la barra lleva el estado en el `aria-label`.

---

## 8. A confirmar con producto

- Si "Descargar" baja el archivo o solo lo marca, cuando el reporte vive en una plataforma externa (IQVIA, LabCorp, etc.).
- Si con muchos estudios activos (más de 8) el selector se pliega en una fila con "Ver más", como en Pendientes ("Mostrando 1 de 4").
- Paginación: con más de ~50 pacientes, cargar de a 25.
