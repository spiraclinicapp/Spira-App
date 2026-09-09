# Salida ambulatoria — revisión: todo desde Dispensaciones

**Fecha:** 2026-09-08 (después de `v0.64.0`) · **Estado:** diseño acordado, sin implementar
**Revisa:** [`2026-09-08-dispensacion-ambulatoria-design.md`](../specs/2026-09-08-dispensacion-ambulatoria-design.md) — **sustituye las decisiones D5 y D6**.

---

## Por qué se revisa

`v0.64.0` puso la entrega ambulatoria en el kebab del medicamento, dentro de Stock. El Director,
con la pantalla en producción:

> *"No quiero que sea así, quiero que se pueda manejar todo desde el mismo panel. Genera muchísima
> fricción si lo hacemos en el panqueque de stock."*

**Es el contra que el propio spec le había puesto a esa decisión**, textual en D5:

> *"Es un lugar donde se va a mirar el inventario, no donde se va a entregar algo. Si la
> farmacéutica piensa primero en la persona y después en el medicamento, el recorrido le queda al
> revés."*

Se recomendó igual, apoyándose en que reusaba el patrón de Reasignar. Ése era el argumento del que
escribe el código, no el de quien usa la pantalla: hoy, para entregar algo hay que ir a Stock,
buscar el medicamento, desplegar el panqueque y abrir el kebab — **cuatro pasos para un acto que es
uno**.

## Decisiones nuevas

| # | Reemplaza | Decisión |
|---|---|---|
| **D5'** | D5 | El alta vive **dentro de "Nueva dispensación"**, en Dispensaciones, con un alternador de tipo. **Se retira el renglón del kebab de Stock.** |
| **D6'** | D6 | Las salidas ambulatorias se ven **intercaladas por día en el Historial** de Dispensaciones, no en una lista aparte. **Se retira el bloque "Últimas salidas" del pie de Stock.** |

El resto del spec (D1, D2, D3, D4, D7 — tabla propia, destinatario, autorizante, acto único, sólo
lotes ambulatorios) **no cambia**. Tampoco cambia la `0116`: la tabla, el RPC y la vista de lectura
quedan como están.

## El alta unificada

```
  Farmacia › Dispensaciones › [ Nueva dispensación ]
       │
       ▼
  ┌─────────────────┬──────────────┐
  │  De protocolo   │ Ambulatoria  │   ← alternador, arriba de todo
  └─────────────────┴──────────────┘

  De protocolo   enrolamiento → visita → motivo si hace falta → medicación
  Ambulatoria    quién recibe → quién autoriza → medicamento → lote (FEFO) → cantidad
```

El orden va como pasa en el mostrador: **primero la persona, después el medicamento**. Es
exactamente al revés del recorrido actual.

**El modal cambia de forma.** Hoy `SalidaAmbulatoriaModal` recibe los lotes desde el contexto de
Stock; ahora tiene que ofrecer el **medicamento** (de los que tienen stock ambulatorio) y resolver
el lote por FEFO, como ya hace la rama de protocolo. Deja de ser un modal propio y pasa a ser una
rama de `PanelNuevaDispensacion`.

## El historial intercalado, y por qué necesita la base

Se evaluó intercalarlas desde el front y **no sirve**, por dos razones que no son de diseño visual:

1. **El historial está paginado del lado del servidor** (`useDispensationHistory`, página +
   "Cargar más"). Mezclar dos fuentes paginadas por día rompe el orden: una salida vieja puede
   aparecer *después* de cargar la página 2. Es un defecto invisible con cinco filas de prueba.
2. **Sus filtros son por protocolo y por código de paciente**, y una salida ambulatoria **no tiene
   ninguno de los dos**.

Por eso va una **vista nueva en la base** (`0117`) que une las dos fuentes en una sola forma de
fila, ordenada y paginada por el servidor.

### Qué devuelve la vista (forma de PRESENTACIÓN, no de detalle)

El historial es una lista: al hacer clic abre el cajón, que ya trae el detalle por id. Así que la
vista no reproduce los embeds anidados de `dispensation_requests` — devuelve lo que el renglón
dibuja, y nada más.

| Columna | De protocolo | Ambulatoria |
|---|---|---|
| `tipo` | `'protocolo'` | `'ambulatoria'` |
| `id` | `dispensation_requests.id` | `ambulatory_dispensations.id` |
| `ordenado_por` | `updated_at` | `created_at` |
| `codigo` | `dispensation_code` | `null` |
| `destinatario` | nombre del paciente | `recipient_name` |
| `destinatario_id` | `patients.id` (para el link) | `null` — no hay ficha que abrir |
| `destinatario_ref` | IVRS | `recipient_document` |
| `protocol_code` / `protocol_id` | del protocolo | `null` |
| `medicamentos` | nombres, ya concatenados | nombre del medicamento |
| `unidades` | del libro | `quantity` |
| `estado` | `request_status` | `'entregada'` (nace entregada) |
| `autorizado_por` | `null` | `authorized_by_name` |

**Los filtros excluyen las ambulatorias, y es lo correcto:** si preguntás "qué pasó en PROT-A", una
entrega a alguien que no es paciente de nada **no forma parte de esa respuesta**. Con
`protocol_code IS NULL`, el filtro por protocolo las deja afuera solo; el de código de paciente,
también.

### El renglón

Una sola `Fila` que ramifica por `tipo`. La ambulatoria:

- Chip **Ambulatoria** en azul (`--spira-acc-deep-blue`) donde la de protocolo lleva el código del
  estudio. El color no es la única señal: lleva la etiqueta al lado.
- El nombre de quien recibe va **en tinta pero sin link**: no hay ficha que abrir, y un link que no
  lleva a ningún lado es peor que texto plano.
- Badge de estado **Entregada**, que es el único que puede tener.
- Segunda línea: `medicamento · N u. · autorizó <nombre>`.

## Alcance

| Archivo | Qué |
|---|---|
| `supabase/migrations/0117_historial_de_farmacia.sql` | **Crear.** La vista unida + su índice de apoyo si hace falta |
| `src/data/pharma/historialModel.ts` (+ test) | **Crear.** La fila unificada y sus reglas puras |
| `src/data/pharma/dispensations.ts` | **Modificar.** `useDispensationHistory` pasa a leer la vista nueva |
| `src/views/pharma/dispensaciones/HistorialPorDias.tsx` | **Modificar.** `Fila` ramifica por tipo |
| `src/views/pharma/dispensaciones/PanelNuevaDispensacion.tsx` | **Modificar.** Alternador + rama ambulatoria |
| `src/views/pharma/SalidaAmbulatoriaModal.tsx` | **Retirar.** Sus campos pasan al panel |
| `src/views/pharma/MedicamentosView.tsx` | **Modificar.** Sacar el renglón del kebab y el bloque "Últimas salidas" |

**Sin cambios de datos:** la `0116` queda intacta; la `0117` sólo agrega una vista de lectura. Es
**aditiva** → va **antes** del deploy.

## Lo que NO cambia

- La tabla `ambulatory_dispensations`, el RPC `dispensar_ambulatoria` y `v_ambulatory_dispensations`
  siguen igual. Lo que se mueve es **dónde se llama y dónde se mira**, no qué se guarda.
- Las siete decisiones de dominio del spec original, salvo D5 y D6.

## Riesgo principal

`PanelNuevaDispensacion` y `HistorialPorDias` **son código en producción que funciona**. La rama de
protocolo no debe cambiar de comportamiento: el alternador tiene que dejarla exactamente donde
está, y el renglón del historial de protocolo tiene que renderizarse igual que hoy. Cualquier test
que se escriba conviene que fije eso primero.

---

## Lo implementado (2026-09-08, rama `feat/dispensacion-panel-unico`)

**Estado:** construido y con `npm run build` verde (**883 tests**, eran 843). Falta aplicar la
**`0117`** y el QA logueado contra producción.

### Tres decisiones que este plan dejaba abiertas

| # | Qué | Decisión |
|---|---|---|
| **D8'** | Qué hace el clic sobre una salida ambulatoria en el historial | **Cajón de sólo lectura.** El plan decía "el detalle lo trae el cajón por id" pensando en las de protocolo; una ambulatoria no tiene riel ni escaneo ni comprobante. Pero el renglón deja afuera **documento, lote, nota, quién despachó y la hora**, que en base auditable son el motivo por el que la fila se guarda. Segmento propio en la URL con prefijo `a-`, como el `p-` de Pacientes: una ambulatoria nunca tiene código legible, así que sin marca no habría cómo saber en cuál de las dos fuentes buscarla. |
| **D9'** | De dónde salen las `unidades` de la fila de protocolo | **De `dispensation_request_items`, no del libro de stock.** La tabla de este plan decía "del libro" y habría cambiado el número: en una rechazada no hay asiento, y en una con sustitución el número es otro. La regla "la rama de protocolo no cambia de comportamiento" gana. |
| **D10'** | "Resolver el lote por FEFO" | **Se resuelve, no se obliga.** Elegir el medicamento deja el lote puesto por FEFO —con las DOS reglas que la base ya aplica en `dispensar` (0050:316): el vencido no entra, y el que no tiene vencimiento va al final— pero el desplegable queda con todos los lotes. Quitarle la decisión a quien tiene el estante enfrente sería decidir con menos información que ella. |

### Lo que el alcance no listaba y hubo que tocar

`src/views/pharma/DispensacionesView.tsx`. Resolvía la URL y alimentaba el cajón buscando la fila
en `acumuladas`; con filas de presentación eso deja de servir, así que el detalle pasa a traerse
por id (`useDispensationRequest`, que ya existía, y `useSalidaAmbulatoria`, nuevo). Se pregunta
primero por el tablero: si la fila ya está cargada ahí, no se gasta una consulta.

### La red que protege la rama de protocolo

El riesgo que este plan señalaba se fijó con un test que recorre **las 20 combinaciones** de
`request_status` × `dispensation_status` y exige que `badgeDeHistorial` devuelva exactamente lo
mismo que `badgeOf` sobre la misma fila. No compara contra valores escritos a mano: compara contra
la función vieja. Y `badgeOf` pasó a delegar en la misma regla, así que no son dos cuerpos que haya
que acordarse de mantener iguales.

### Verificado en el navegador (banco de pruebas temporal, sin sesión)

Las dos formas de renglón a 1181px (la notebook de referencia): **las seis filas miden 65px**, o
sea que la ambulatoria no se sale de la grilla. Chip **Ambulatoria** medido en **4,8:1** sobre su
tinte (AA pide 4,5 a 10,5px/600) — medido, no estimado, por el precedente de los chips teñidos. La
fila ambulatoria tiene **0 links** y la de protocolo 2, que es la regla de "no hay ficha que
abrir". El renglón sin renglones de medicación (pedido de IP solo) dice `0 u.` y ya no arrastra el
separador colgando que tenía antes — **es la única diferencia cosmética respecto de hoy en la rama
de protocolo**, y es una corrección.

### Falta

1. **Aplicar la `0117`** (aditiva → va ANTES del deploy) y comprobarla con la sonda de PostgREST.
2. **QA logueado** contra producción: alternador, alta ambulatoria de punta a punta, historial
   intercalado, cajón, y que Stock ya no ofrezca "Entregar" ni "Últimas salidas".
3. Sigue afuera y a propósito: **Reportes** no levanta las salidas ambulatorias (es su propia
   tanda, ver el punto 1 del handoff del 2026-09-08).
