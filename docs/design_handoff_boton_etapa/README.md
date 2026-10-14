# Handoff: Botón de etapa dividido (Visitas y Estudios y pacientes)

## Resumen
El botón que mueve la visita a la etapa siguiente pasa a ser un **botón dividido**:
- **Cara principal** (izquierda): avanza de etapa, igual que hoy.
- **Flecha** (derecha): abre un menú con acciones sobre la visita: volver a la etapa anterior, reprogramar, copiar el ID del paciente, eliminar la visita y, en visitas completas, pedir un retest.

Aparece en dos lugares, con el mismo componente:
1. **Fila de la lista de Visitas** (vista Día).
2. **Barra de acción del modal de visita.** Es el mismo modal que se abre desde **Estudios y pacientes → Cronograma de visitas**, que es la única puerta a estas acciones desde ese módulo.

## Sobre estos archivos
`referencia.html` es una **referencia de diseño en HTML**: muestra el aspecto y el comportamiento buscados. No es código de producción. Hay que recrearlo en el código de Spira App (React + TSX) con sus componentes y tokens (`spira-app-tokens.css`): `.spira-menu-item`, `.spira-menu-item--danger`, `--spira-danger`, el toast existente y el selector de fecha de «Reprogramar».

Abrí `referencia.html` en el navegador: es interactiva (abrir y cerrar menús, confirmar eliminación, confirmar llegada, popup de retest).

## Fidelidad
**Alta.** Colores, tipografía, medidas y textos son finales, salvo lo marcado en «Pendientes».

---

## Capturas

| # | Archivo | Qué muestra |
|---|---|---|
| 1 | `capturas/01-fila-menu.png` | Fila de la lista con el menú abierto (etapa Concurrió) |
| 2 | `capturas/02-fila-eliminar-confirmacion.png` | Confirmación de «Eliminar visita» dentro del mismo menú |
| 3 | `capturas/03-modal-concurrio.png` | Barra de acción del modal, menú abierto |
| 4 | `capturas/04-agendada-menu.png` | Visita futura (Agendada): menú |
| 5 | `capturas/05-agendada-confirmar-llegada.png` | Registrar llegada en una visita que no es de hoy |
| 6 | `capturas/06-en-atencion-menu.png` | Etapa En atención: menú |
| 7 | `capturas/07-completa-acciones.png` | Visita completa: botón «Acciones» y menú con «Pedir retest» |
| 8 | `capturas/08-popup-retest.png` | Popup «Pedir retest» |
| 9 | `capturas/09-reglas.png` | Tabla de reglas (igual que la sección «Reglas» de abajo) |

Las capturas se tomaron con la ventana angosta (~900 px). En el ancho real de la app la fila entra en un solo renglón y la barra del modal no corta «2 DE 4».

---

## 1. Botón dividido

### Anatomía
```
┌──────────────────────────┬──────┐
│  Iniciar atención   →    │  ⌄   │
└──────────────────────────┴──────┘
   cara principal (main)     flecha (more)
```
Son **dos `<button>` independientes**, uno al lado del otro, sin espacio entre ellos.

| Propiedad | Cara principal | Flecha |
|---|---|---|
| Alto | 40 px (lista) · 42 px (modal) | igual |
| Ancho | según el texto | 36 px (lista) · 38 px (modal) |
| Padding | 0 16 px 0 18 px | — (ícono centrado) |
| Radio | 10 px 0 0 10 px | 0 10 px 10 px 0 |
| Fondo | `#2E7D74` (track) | `#2E7D74` |
| Fondo hover | `#256A62` | `#256A62` (también mientras el menú está abierto) |
| Texto | `#F4F1EA`, Schibsted Grotesk 700, 14,5 px | — |
| Ícono | flecha → 16 px, trazo 1,8, separada 8 px del texto | chevron ⌄ 16 px; gira 180° al abrir (.14 s ease-out) |
| Separador | — | `border-left: 1px solid rgba(244,241,234,.28)` |
| Foco | `outline: 2px solid #14302E; outline-offset: 2px` | igual |

Cada mitad tiene su propio hover: al pasar por la flecha, la cara principal no cambia.

> `#256A62` es un tono nuevo y no está en los tokens. Proponemos sumarlo como `--spira-track-hover`.

### Variante «Acciones» (solo visitas completas)
Sin etapa siguiente no hay cara principal. Queda **un solo botón secundario** que abre el mismo menú:
- Alto 42 px, padding 0 12 px 0 16 px, radio 10 px.
- Fondo `#FFFFFF`, borde `1px solid #D8CBB0`, texto `#14302E` Schibsted Grotesk 600 14 px.
- Hover y abierto: fondo `#F4F1EA`.
- Texto: **Acciones** + chevron (`#556966`).

### En la lista
- Se **quita el ⋮** del final de la fila: sus acciones pasan al botón dividido. *(Si el ⋮ tiene hoy acciones que no figuran acá, hay que sumarlas al menú.)*
- Orden: `[Atención médica]` (secundario) · 10 px · `[botón dividido]`.

### En el modal
- Barra de acción: indicador de etapa a la izquierda; a la derecha `[Solicitar atención médica]` · 12 px · `[botón dividido]`, los dos de 42 px de alto.

---

## 2. Menú

### Contenedor
- Se abre **debajo** de la flecha, alineado a la **derecha** del botón, a 6 px.
- Ancho 316 px, padding 6 px, fondo `#FFFFFF`, borde `1px solid #E4DECF`, radio 12 px.
- Sombra: `0 14px 34px rgba(20,48,46,.16), 0 2px 6px rgba(20,48,46,.06)`.
- `role="menu"`; la flecha lleva `aria-haspopup="menu"` y `aria-expanded`.

### Encabezado
- Izquierda: `VISITA V2 W4`, 10,5 px, 700, mayúsculas, letter-spacing .1em, `#A6B0AC`.
- Derecha: `Concurrió · 2 de 4`, 12 px, 600, `#556966`, números tabulares.
- Padding 8 px 10 px 9 px y borde inferior `1px solid #E4DECF`, de lado a lado del menú.

### Ítems
- Padding 8 px 10 px, radio 8 px, ícono de 16 px a 10 px del texto (alineado arriba, +2 px).
- Título: Inter 600 13,5 px `#14302E`. Bajada: 12 px 500 `#7C8C87`.
- Hover y foco: fondo `#F4F1EA` (igual que `.spira-menu-item`).
- **Deshabilitado**: título e ícono `#A6B0AC`, sin hover; la bajada dice por qué. Usar `aria-disabled="true"`, no `disabled`, para que se lea con lector de pantalla.
- **Peligro** (Eliminar): texto e ícono `#A6483B`; hover `rgba(166,72,59,.08)` (igual que `.spira-menu-item--danger`).
- Separador antes de Eliminar: 1 px `#E4DECF`, margen 6 px 2 px.

### Orden y textos por etapa

| Etapa | Cara principal | Ítem 1 | Reprogramar | Copiar ID | Eliminar |
|---|---|---|---|---|---|
| **Agendada** | Registrar llegada | Volver a la etapa anterior · *Es la primera etapa* — **deshabilitado** | habilitado · *Hoy para el 28 oct 2026* | ✓ | ✓ |
| **Concurrió** | Iniciar atención | Volver a Agendada · *Borra la llegada de las 11:37* | **deshabilitado** · *Ya concurrió al centro* | ✓ | ✓ |
| **En atención** | Finalizar visita | Volver a Concurrió · *Borra el inicio de atención de las 11:52* | **deshabilitado** · *Ya concurrió al centro* | ✓ | ✓ |
| **Completa** | *(no hay: botón «Acciones»)* | **Pedir retest** · *Repetir procedimientos de esta visita* | **deshabilitado** · *La visita está completa* | ✓ | ✓ |

- «Volver a …» **siempre nombra la etapa destino** y en la bajada dice qué dato se borra (hora real del registro).
- «Copiar ID de paciente» muestra el Nº de sujeto a la derecha (12 px `#7C8C87`, tabular).

### Íconos (trazo 1,8, puntas redondeadas, 24×24)
- Volver: flecha curva hacia atrás (undo).
- Reprogramar: calendario.
- Copiar ID: dos rectángulos superpuestos (copy).
- Pedir retest: flecha circular (redo / refresh).
- Eliminar: tacho.

Usar los equivalentes de la librería de íconos que ya usa Spira.

---

## 3. Comportamiento

### Abrir y cerrar
- Clic en la flecha: abre y cierra el menú. Abrir uno cierra cualquier otro abierto.
- Clic afuera o **Esc**: cierra y devuelve el foco a la flecha.
- Teclado: con foco en la flecha, **Enter** o **↓** abre y enfoca el primer ítem habilitado; **↑/↓** recorren solo los habilitados (con vuelta al principio).

### Volver a la etapa anterior
- Cambia la etapa a la anterior y borra el registro de la etapa actual (hora de llegada o inicio de atención).
- Confirma con el toast estándar.
- Reemplaza al «Deshacer» del toast, que solo duraba unos segundos. Este queda disponible siempre.

### Reprogramar
- Abre el **mismo selector de fecha** que «Reprogramar» del encabezado de Estudios y pacientes.
- Solo se habilita mientras la visita está **Agendada**.

### Copiar ID de paciente
- Copia el Nº de sujeto (p. ej. `032001520003`) al portapapeles y muestra el toast **«ID copiado»**.

### Eliminar visita (también en visitas completas)
- La confirmación aparece **dentro del mismo menú** (no abre otro modal). Reemplaza la fila «Eliminar visita» por:
  - «¿Eliminar la visita V2 W4?» (13 px `#14302E`)
  - «Se borra con sus registros. No se puede deshacer.» (12 px `#7C8C87`)
  - `[Cancelar]` (secundario) · `[Eliminar]` (fondo y borde `#A6483B`, texto blanco). Botones de 32 px de alto y radio 8 px, alineados a la derecha; el foco va a **Eliminar**.
- Cancelar vuelve al menú normal. Eliminar cierra el menú y muestra «Visita eliminada».

### Registrar llegada en una visita que no es de hoy
- La cara principal **se puede usar aunque la fecha de la visita no sea hoy** (ni pasada ni futura).
- Si la fecha agendada ≠ hoy, al tocarla aparece una confirmación en el mismo lugar que el menú (316 px, mismo contenedor, padding 14 px):
  - «Esta visita está agendada para el **28 oct**.»
  - «Se registra la llegada hoy, 13 oct, y la fecha de la visita pasa a ser hoy.»
  - `[Cancelar]` · `[Registrar llegada hoy]` (primario `#2E7D74`).
- Si la fecha es hoy, avanza directo como siempre (sin confirmación).

### Pedir retest (visitas completas)
Es un **atajo** del alta manual de retest que **ya existe**: usa el mismo flujo y crea la misma visita nueva asociada a la original, que **sigue completa**. La creación manual sigue disponible donde está hoy.

**Popup** (modal centrado):
- Overlay `rgba(20,48,46,.38)`. Tarjeta de 520 px máx., radio 16 px, sombra `0 24px 60px rgba(20,48,46,.25)`, alto máximo el de la pantalla menos 48 px con scroll interno.
- **Encabezado**: «Pedir retest» (Schibsted 700 18 px) + «Visita V6 W16 · completa el 30 sep · Ricardo Lucio Aguero» (12,5 px `#7C8C87`) + botón cerrar 30×30.
- **Procedimientos a repetir**: lista con casillas (18 px, `accent-color #2E7D74`). Cada fila tiene el nombre del procedimiento (13,5 px 600) y a la derecha su resultado (12 px `#7C8C87`; si hubo problema, en `#A6483B` 600, p. ej. «Muestra hemolizada»). Vienen pre-marcados los que tuvieron problema. Hay un link «Marcar todos» / desmarcar todos.
- **Motivo** (uno solo): Muestra no válida · Valor fuera de rango · Pedido del sponsor · Otro.
- **Cuándo** (uno solo): Hoy · Próxima visita (V7 W20) · Elegir fecha… (abre el selector de fecha).
- **Comentario** (opcional): textarea.
- **Pie**: contador «1 procedimiento / N procedimientos» a la izquierda · `[Cancelar]` · `[Pedir retest]`. Si no hay ningún procedimiento marcado, el botón queda deshabilitado y el contador dice «Elegí al menos uno».
- Opciones seleccionadas (Motivo/Cuándo): fondo `rgba(46,125,116,.14)`, borde `#2E7D74`, texto `#0F5F57`.
- Cierra con Esc, con la ✕ o con un clic en el overlay. Al confirmar crea la visita de retest y muestra el toast «Retest pedido · N procedimientos».

---

## 4. Estado

Por visita, el componente necesita:
- `etapa`: `agendada | concurrio | atencion | completa`.
- `etapaAnterior` y la hora del registro que se borraría (para la bajada de «Volver»).
- `fechaAgendada` (para decidir si «Registrar llegada» pide confirmación).
- `nroSujeto` (Copiar ID).
- `procedimientos[]` con su resultado (popup de retest).

UI local: `menuAbierto`, `confirmandoEliminar`, `confirmandoLlegada`, `retestAbierto` (+ selección del popup).

---

## 5. Tokens usados

| Uso | Valor |
|---|---|
| Tinta | `#14302E` |
| Primario oscuro | `#0F5F57` |
| Track / botón primario | `#2E7D74` |
| Hover botón primario (**nuevo**) | `#256A62` |
| Papel | `#F4F1EA` |
| Superficie | `#FBFAF6` |
| Blanco | `#FFFFFF` |
| Texto suave | `#556966` |
| Texto apagado | `#7C8C87` |
| Texto tenue | `#A6B0AC` |
| Línea | `#E4DECF` |
| Línea 2 | `#D8CBB0` |
| Peligro | `#A6483B` (`--spira-danger`) |
| Tipos | Schibsted Grotesk (botones, títulos) · Inter (texto) |
| Radios | 8 px ítems/botones chicos · 10 px botones · 12 px menú · 16 px popup |

---

## 6. Pendientes
- Confirmar qué contiene hoy el ⋮ de la fila antes de quitarlo.
- Sumar `#256A62` a los tokens.
- Validar con el equipo los **textos de las bajadas**, los **motivos** de retest y la lista real de procedimientos por visita (en la referencia son de ejemplo).
- Confirmar que, al registrar la llegada fuera de fecha, la fecha de la visita se mueve a hoy.

## Archivos
- `referencia.html`: referencia interactiva (secciones 1 Lista · 2 Modal · 3 Etapas · 4 Reglas).
- `capturas/`: 9 capturas de los estados.
