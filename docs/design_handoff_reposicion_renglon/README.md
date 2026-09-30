# Handoff — Reposición: tabla y renglón abierto (opción A)

Referencia visual: `Reposicion - Renglon abierto v2.html` (en esta carpeta). Es un mock estático en HTML: recrear en los componentes de la app, no copiar el HTML.

Código afectado:
- `src/data/pharma/reposicionPeriodoModel.ts` (`RenglonDelPeriodo`, `Boleta`, `armarRenglon`)
- La vista del renglón abierto (hoy `RenglonAbierto`, ver `docs/superpowers/plans/2026-09-18-reposicion-parte-2-pantallas.md` línea ~4890)

## 1. Tabla (renglón cerrado)

Se sacan las columnas **Había / Entró / Salió / Hay** y **Mínimo**. Quedan 4 columnas + chevron:

| Columna | Contenido | Fuente |
|---|---|---|
| Medicamento | nombre · debajo: presentación + regla («1 envase por mes» / «a demanda, tener N») | `nombre`, `presentacion`, `modo`, `envasesPorMes`, `stockFijo` |
| Pacientes | número (— si es a demanda) | `pacientes` |
| En el estante | «hoy» en grande · debajo: `empezó con H · +E −S` o «sin movimientos» si E=S=0 | `libro.hay`, `libro.habia`, `libro.entro`, `libro.salio` |
| A comprar | `N envases` si `comprar > 0`; si no, tag **Alcanza** (verde) · debajo: «N en camino» si `enCamino > 0` | `comprar`, `estado`, `enCamino` |

Encima de la tabla, una línea de contexto: **Pedido del período DD/MM → DD/MM** · «Corte el D de cada mes · hoy DD/MM». Reemplaza los dos encabezados de grupo («Este período…» / «Para este período»).

Motivo: «Mínimo 2 / Comprar 2» repetía el número; el mínimo se explica dentro de la cuenta del renglón abierto.

## 2. Renglón abierto (tres bloques, en este orden)

### 2.1 Por qué hay que comprar N
- Título: `Por qué hay que comprar {aComprar}`.
- Frase de contexto, solo si es **pedido tarde** (`tarde != null`): «El período empezó el {periodo.desde} y todavía no tiene pedido. Se pide lo que les falta retirar a los pacientes de este período; el del {proximo.desde} se pide en el próximo corte.»
- Ecuación horizontal: una tarjeta por `boleta.lineas` (valor grande, título, aclaración) separadas por el `signo` (− / +), y al final la tarjeta oscura **A comprar** con `aComprar`.
- Títulos cortos en las tarjetas (cambio de texto en el modelo):
  - `hacen_falta` tarde → «Les falta retirar»; normal → «Necesitan el período que viene»
  - `tener_siempre` → «Tener siempre»
  - `faltan_este_periodo` → «Faltan para terminar este período»
  - `quedan_al_corte` → «Quedan en el estante al corte»
  - `hay_en_el_estante` → «Hay en el estante»
  - `ya_pedido` → «En camino»
- Las líneas con valor 0 se muestran igual (se leen «sin stock hoy», «sin pedidos abiertos»), para que la cuenta sea siempre la misma forma.

### 2.2 Pacientes que lo reciben (nuevo)
Solo para `modo === 'mensual'`. Subtítulo: `{n} · {cuántos suman}` (p. ej. «2 · ambos suman a la cuenta», o «3 · 1 no suma»).

Columnas:
| Columna | Fuente (`PacientePeriodoInsumo`) |
|---|---|
| Paciente | `patient_name` |
| Estado | `enrollment_status` (tag) |
| Por mes | `envases_por_mes ?? envasesPorMes del estudio` + «· del estudio» / «· propia» |
| Retiró en el período | barra + `min(retirado_periodo, mensual) de mensual` |
| Último retiro | `ultimo_retiro` (fecha) + tag ámbar «+90 días» si es anterior a hoy−90 o null («Nunca») |
| Cronograma hasta | `ultima_programada` (— si `tiene_cronograma` es false) |
| (acción) | «Ver ficha →» al enrolamiento (`enrollment_id`) |

Los avisos que hoy se listan al pie se mueven a cada fila:
- `sin_retiros` → tag «+90 días» en Último retiro. Nota fija debajo de la tabla: «Sin retiros en más de 90 días: siguen sumando mientras tengan el medicamento asignado.»
- `termino_cronograma` → la fila aparece atenuada, tag neutro «Terminó · no suma».
- `dos_presentaciones` → tag ámbar «Otra presentación · no suma».
- `varios_meses` → tag neutro «Se llevó más de un mes».
- `vence` (no es de paciente) → queda como aviso debajo de la ecuación.

El modelo tiene que exponer la lista: agregar a `RenglonDelPeriodo` un `detallePacientes: { enrollmentId, nombre, estado, porMes, propia, retiro, ultimoRetiro, cronogramaHasta, suma, marcas[] }[]`, armado en `armarRenglon` con los mismos filtros que ya usa (`suman`, `delObjetivo`, `terminaron`, `dobles`, `varios`).

### 2.3 Movimientos del estante en el período
Tira de 4 datos: Empezó con · Entró (+) · Salió (−) · Hay hoy. Es el `libro` que antes ocupaba la tabla. Si hay `ajustes ≠ 0`, agregar «Ajustes ±N» antes de «Hay hoy».

### Pie
Botón «Cambiar cómo se repone» (o «Cargar cómo se repone» si `sin_cargar`) + texto muted con la regla actual.

## 3. Tokens usados
- Fondo `#F4F1EA`, tarjeta `#FFFFFF`, renglón abierto `#FBFAF6`
- Bordes `#E4DECF` (fuertes `#D8CBB0`), separadores internos `#EFEADF`
- Tinta `#14302E`, secundaria `#465A57`, muted `#61706C`, acento `#0F5F57`
- Tag verde `#E3EFEC`/`#0F5F57`, ámbar `#F7EBD2`/`#7A4E0B`, neutro `#EFEADF`/`#465A57`
- Tipos: Inter (UI), Schibsted Grotesk (números grandes). Números con `tabular-nums`.
- Radios: tarjeta 16, bloques internos 12, botón 10, tags pill.

## 4. Casos a probar
- Pedido tarde (Frevia): ecuación de 3 términos, frase de contexto visible.
- Normal con stock y en camino (Seretide): tabla dice «Alcanza · 6 en camino».
- A demanda (Salbutral): sin tabla de pacientes; Pacientes = «—».
- Paciente con cantidad propia, con otra presentación y con cronograma terminado.
- Período que no está en curso (`sin_cuenta`): A comprar muestra «—» y no hay ecuación.
