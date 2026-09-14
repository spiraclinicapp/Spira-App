# Plan · Stock mínimo mensual y faltante a comprar por estudio

> `/plan-eng-review` del 2026-09-14, sobre `main` en `1a4444f` (v0.71.0, última migración `0124`).
> **Cuarenta y ocho decisiones del Director, ninguna abierta** (D1-D32 de ingeniería, D33-D48 de
> diseño; la D44 simplificó la card y reemplaza a D35-D42). Tres entregas = tres PRs. Se escribe **primero el modelo** (con tests), después la migración
> **`0125`** (aditiva: se aplica antes que el front), después la card. **El mock ya está en el repo**
> (`docs/design_handoff_reposicion/`, `/plan-design-review` del mismo día).

## El pedido, textual

> Necesito que en base a la medicación asignada a cada paciente, se haga una cuenta de un stock minimo
> que tiene que haber al comenzar el mes. Teniendo en cuenta de que hay medicaciones que se compra un
> stock personalizado ya que no son de un uso 100% mensual es como a demanda, como lo puede ser una
> medicación de rescate. Y de esto que se vaya haciendo en el panel de estadisticas, que haya un card
> que sea el faltante por estudio es decir que haga la cuenta de cuanto hay que comprar al siguiente
> mes. Y que haga una cuenta segun lo gastado y un estimativo en base a las visitas estimadas en el
> tiempo desde que se solicita hasta que llega esa compra.

Dos aclaraciones del Director durante la revisión, que **corrigieron la primera lectura** (ver
«Cómo se leyó el pedido» al final):

> **(D5)** La visita te marca cuando es que puede llegar a venir el paciente, pero en el caso de que son
> 3 meses por ejemplo tienen que venir a buscar medicacion por eso existe la visita no programada de
> entrega de medicacion. […] no quiero marcar que se entrega medicación eso quedo unicamente para el ip.

> **(D8)** En realidad la proyeccion es para la compra, pero no del promedio de los meses anteriores. Ese
> dato esta bueno pero en realidad tiene que haber medicación para todos. Si el mes pasado justo no vino
> nadie a buscar no es que este mes vas a comprar 15 menos por eso.

## Lo que ya existe (y se reusa, no se reconstruye)

| Pieza | Hoy | Dónde | Qué hace el plan |
|---|---|---|---|
| Medicación habilitada por paciente | `patient_medications` (qué, **no cuánto**) | `0050:26-36`, `0124:119` | Se reusa; suma una columna opcional de excepción (D2). |
| Medicamentos del estudio | `protocol_medications`, sólo lista de permitidos, crece sola | `0032:31-37`, `0040:24`, `0051:47`, `0113:218` | Suma modo, cantidad mensual y stock fijo (D2-D4, D25). |
| Stock por estudio | `medication_lots` por (medicamento, protocolo), con vencimiento | `0032:52`, `0035:27` | Se lee lote por lote (FEFO, D15). |
| «Estante» | lotes no vencidos del protocolo | `0121:485-494` (`stock_de_la_visita`) | Mismo criterio de base, más FEFO hacia el mes siguiente. |
| Cuándo baja el estante | al pasar la dispensación a `lista` | `0071:678` | «Ya retiró» se mide ahí (D14). |
| Visitas futuras | `patient_visits.estimated_date`, desde la randomización, fechas automáticas | `0029:47-65`, `0022:23` | Sólo para saber **quién terminó** (D16, D23). |
| Estado del enrolamiento / del protocolo | `enrollment_status`, `protocol_status` | `0001:39-41` | Cortan la suma (D16, D26). |
| Salidas pasadas | `stock_movements` (sin protocolo: se une por lote) | `0002:328`, `0071:673-724` | Referencia y avisos; **no mueven la compra** (D8). |
| Sustitución de renglón | habilita la alternativa y deja activa la original | `0076:207-217` | Se detecta para no contar doble (D21). |
| Marca «una entrega» | trigger que la limpia en todo update directo | `0124:134-147` | La excepción no se ofrece ahí (D27). |
| Recepciones | el stock entra al verificar | `0040:20` | Descuentan los pedidos en camino (D20). |
| Panel de estadísticas | `pharma/reportes` → `ReportesView`, con retornos anticipados | `registry.ts:148`, `ReportesView.tsx:294-386` | Card arriba, fuera de esos cortes (D13, D28). |
| Umbral de stock bajo / `protocol_alerts` | global sin carga / tabla muerta sin medicamento | `0002:225`, `0002:347-355` | **No se usan.** |
| «Previsto» por paciente | pedido bloqueado en `TODOS.md` («adherencia real») | `TODOS.md` | La cantidad mensual de este plan **es** ese previsto (T8). |

## Decisiones (no re-discutir)

### El qué

- **D1 · La card dice cuánto comprar.** *(Precisada por D8, D10 y D31.)*
- **D2 · Cantidad por estudio y medicamento, con excepción por paciente.** La excepción gana.
- **D3 · La cantidad es por mes** (envases por mes por paciente).
- **D4 · A demanda / rescate = número fijo por estudio.** «Tener siempre N».
- **D5 · Al paciente se le entrega todos los meses** (visita programada o VNP de entrega). El tilde
  «entrega medicación» del cronograma **no se usa**: quedó para el IP.
- **D6 · Una sola demora de compra para toda Farmacia**, editable.
- **D7 · Sólo medicación de base de cada estudio.** Afuera: producto en investigación y Ambulatoria.
- **D8 · La compra se calcula por pacientes, nunca por el promedio de lo gastado.** Lo gastado es
  referencia.
- **D9 · Todo el alcance, en tres entregas.**
- **D25 · Tercer modo «No se compra»** (lo manda el sponsor, uso puntual): plegado al pie, fuera de la
  cuenta. Así «falta cargar» sigue significando algo.
- **D26 · Estudio cerrado: no aparece. Pausado: suma, con «estudio pausado».**

### La cuenta

- **D10 · «Para todos», por mes calendario.** La demora no cambia el número: da la fecha límite.
- **D14 · «Ya retiró» = lo dispensado este mes (hora AR) en `lista` o `entregada`.**
- **D15 · Vencimientos por FEFO.** Lo pendiente del mes en curso sale primero de lo que vence antes; al
  1° del mes siguiente cuenta lo vigente; lo que vence durante ese mes cuenta y se avisa.
- **D16 + D23 · Suma salvo que terminó, y ninguna exclusión es silenciosa.** Suma todo enrolamiento en
  `screening`/`activo` con la medicación habilitada. No suma si está `completado`/`discontinuado`.
  «Tiene cronograma» = tiene visitas programadas de definiciones **`date_mode = 'automatica'`** (las libres
  también son `programada`, `0022:23`). Con cronograma cuya última visita cae antes del mes: **no suma y
  se lista** («terminaron su cronograma y siguen activos: Susana R., 03/09»). Sin cronograma: suma.
- **D17 + D24 · Siempre el mes siguiente, más el mes al que se llega.** A tiempo: «Pedir antes del
  11/09». Tarde: «Pedí hoy: llega el 04/10 · los que vengan antes pueden no tener», y además la fecha
  límite del primer mes al que todavía se llega («Noviembre: pedir antes del 17/09»).
- **D20 · Pedidos en camino.** Farmacia marca el pedido con «Ya lo pedí» (**todo el pedido de una vez, D47**; antes era renglón por renglón). Se
  descuenta de «A comprar» hasta que entra la recepción de ese medicamento en ese estudio: se netea
  **solo** contra lo recibido (verificado) desde la fecha del pedido, el más viejo primero. Nadie marca
  «ya llegó».
- **D21 · Sustitución.** Si un paciente tiene más de una presentación activa de la misma droga, suma una
  sola (la última entregada; si ninguna, la más nueva) y se avisa «2 presentaciones habilitadas».
- **D22 · Habilitado sin uso: suma y avisa.** «Sin retiros en 90 días», con nombres. Respeta D8.
- **D30 · Varios meses de una vez: aviso, la cuenta no cambia.** «Susana R. se llevó 3 en septiembre (1
  por mes)».
- **D31 · Lo que falta este mes entra en la compra.** «10 para octubre + 2 que faltan este mes».
- **Regla vigente del Director (honestidad de datos):** «falta cargar» no suma cero; pacientes activos sin
  medicación habilitada se cuentan y se muestran; sin demora cargada, la card la pide.

### El cómo

- **D11 · Una función trae los datos y TypeScript hace la cuenta.** `SECURITY DEFINER` porque Farmacia no
  tiene `select` sobre `patient_visits` (`0006:162`). La cuenta en `reposicionModel.ts`, con tests.
- **D12 · La carga por estudio es de `operator`, por función** (`protocol_medications` exige `leader`,
  `0032:193`).
- **D13 + D28 · La card va en Estadísticas, arriba de todo, fuera de los retornos anticipados**, antes de
  los filtros del período, con su propio cargando y error. Ignora el período ~~y respeta el filtro de
  estudio~~ **y tampoco la mueve el filtro de estudio: siempre muestra todos (D37, revisión de
  diseño)**. Se ajusta el texto del recorte (`ReportesView.tsx:562-566`). Se carga ahí mismo.
- **D27 · Excepción por paciente con update directo, sin control en asignaciones con `habilitacion_id`**
  (el trigger `0124:137` borraría la marca; esos renglones no suman).
- **D29 · Orden: modelo → migración → card → cuadre.** La forma del JSON se fija con el modelo y sus
  tests antes de escribir la `0125`, que es inmutable.
- **D32 · Higiene SQL:** `salidas` unidas por lote; `revoke all … from public` en toda función nueva;
  `created_by`/`updated_by` sellados por trigger, nunca desde el cliente.

### Verificación

- **D18 · Sonda de cuadre** para un estudio real, **después** de la carga real (D29).
- **D19 · QA de la carga con valores reales** dictados por el Director o la farmacéutica. **El agente no
  inventa cantidades clínicas.**

## La cuenta

```
 hoy = 14/09       M0 = septiembre (en curso)       M1 = octubre (siguiente)

 ESTUDIOS: protocol_status <> 'cerrado'  (pausado → etiqueta)                            D26

 por cada (estudio, medicamento):
   modo = null        → «falta cargar», no calcula
   modo = no_se_compra → plegado al pie, no calcula                                      D25
   modo = a_demanda   → A COMPRAR = max(0, stock_fijo − estante_M1 − en_camino)          D4
   modo = mensual     ↓

   pacientes(M) = enrolamientos del estudio con el medicamento activo y sin habilitacion_id
                  · estado screening|activo                                               D16
                  · sin cronograma automático → suma
                  · con cronograma y última programada automática < 1° de M
                        → NO suma, se lista «terminó su cronograma»                       D23
                  · dos presentaciones activas de la misma droga → suma una, avisa         D21
   mensual(p)   = excepción ?? cantidad del estudio                                       D2

   pendiente_M0 = Σ max(0, mensual(p) − retirado_M0(p))          sobre pacientes(M0)      D14
   lotes vigentes hoy, por vencimiento ascendente (sin vencimiento al final)
       └─ se les descuenta pendiente_M0 del que vence antes                              D15
   estante_M1   = lo que queda en lotes con vencimiento >= 1° de M1
   falta_M0     = max(0, pendiente_M0 − Σ lotes vigentes hoy)
   necesidad_M1 = Σ mensual(p)                                   sobre pacientes(M1)
   en_camino    = Σ pedidos − recibido desde cada pedido (el más viejo primero)          D20

   A COMPRAR    = max(0, necesidad_M1 + falta_M0 − estante_M1 − en_camino)               D31

 FECHAS (demora null → «cargá la demora»)                                                D17 D24
   límite(M) = 1° de M − demora
   hoy <= límite(M1) → «Pedir antes del DD/MM»
   hoy >  límite(M1) → «Pedí hoy: llega el DD/MM · los que vengan antes pueden no tener»
                       + «<primer mes con límite >= hoy>: pedir antes del DD/MM»

 AVISOS (no mueven el número): vence durante M1 · sin retiros en 90 días (D22) ·
   se llevó varios meses (D30) · 2 presentaciones (D21) · terminó su cronograma (D23) ·
   pacientes sin medicación habilitada · pedido que ya debía haber llegado (hoy > pedido + demora)
 REFERENCIA: salidas netas de los últimos 90 días                                        D8
```

**Ejemplo (números inventados, para los tests):** Seretide, 10 pacientes siguen en octubre, 1 por mes.
Hoy 14/09, 8 en el estante, 6 de 10 ya retiraron septiembre, demora 20 días, sin pedidos.
Pendiente de septiembre 4 → al 1/10 quedan 4 → octubre necesita 10 → **comprar 6**. Límite 11/09, ya
pasó → «Pedí hoy: llega el 04/10». Con 3 en el estante y 5 pendientes → **comprar 12** («10 para octubre
+ 2 que faltan este mes»). Con un pedido de 6 del 12/09 sin recibir → **comprar 0** («6 en camino»).

## Modelo de datos · migración `0125` (aditiva)

Se escribe **después** del modelo (D29). Nada de esto lo consulta el front desplegado y no agrega FKs
a tablas embebidas en `select`s existentes: **migración primero, front después** (`CLAUDE.md` §3).

1. **`protocol_medications`**: filas viejas en null = «falta cargar» (el check pasa).
   - `reposicion_modo text null check (in ('mensual','a_demanda','no_se_compra'))`
   - `envases_por_mes integer null check (> 0)` · `stock_fijo integer null check (>= 0)`
   - forma: `null ⇒ ambas null` · `mensual ⇒ envases_por_mes` · `a_demanda ⇒ stock_fijo` ·
     `no_se_compra ⇒ ambas null`. Ya tiene auditoría (`0032:320`) e `id`.
2. **`patient_medications.envases_por_mes integer null check (> 0)`**: excepción (entrega 3). Update
   directo de `operator` (`0050:151`); **0 filas = sin permiso**.
3. **`farmacia_ajustes`** (una fila): `id uuid pk default gen_random_uuid()` (`audit_row()` necesita `id`),
   `unica boolean not null default true unique check (unica)`, `demora_compra_dias integer null check
   (between 0 and 365)`, `updated_at`, `updated_by` **sellado por trigger** (D32). Fila inicial con
   demora null. RLS: select `pharma`/`gerencia`; update `operator`. Auditoría.
4. **`reposicion_pedidos`**: `id`, `grupo uuid` (los renglones de un mismo «Ya lo pedí», D47), `protocol_id`,
   `medication_id`, `cantidad integer check (> 0)`, `pedido_el date`, `created_by` sellado, `created_at`.
   Auditoría. Escritura sólo por funciones.
5. **Funciones** (todas `SECURITY DEFINER`, `set search_path = public`, chequeo de rol adentro porque
   `0007:30` da `EXECUTE` a `authenticated`, y **`revoke all … from public`**, D32):
   - `configurar_reposicion(p_protocol_medication_id, p_modo, p_envases_por_mes, p_stock_fijo)`:
     `operator`; sólo esas tres columnas.
   - `registrar_pedido_reposicion(p_renglones jsonb, p_pedido_el date)` (D47: todo el pedido en una
     llamada atómica, un `grupo`) y `anular_pedido_reposicion(p_grupo uuid)` («Deshacer»): `operator`.
     Anular borra las filas del grupo (quedan en `audit_log`).
   - `insumos_de_reposicion(p_protocol_ids uuid[], p_hoy date) → jsonb`, `stable`, `viewer` o
     `gerencia`. La **forma exacta** la fija el modelo (D29). Como mínimo:
     - `estudios` (id, código, estado);
     - `renglones` de `protocol_medications` (modo, cantidades, `drug_id`, `salidas_90d` unidas por lote);
     - `pacientes` por enrolamiento y medicamento activo: nombre, estado, excepción, `habilitacion_id`,
       `drug_id`, `tiene_cronograma_automatico`, `ultima_programada_automatica`, `retirado_mes`,
       `ultimo_retiro`;
     - `sin_medicacion` por estudio;
     - `lotes` vigentes a `p_hoy`;
     - `pedidos` con `recibido_desde_pedido`;
     - `demora_compra_dias`.
   - **Trampas conocidas:** calificar todo (`0056`/`0058`); `gen_random_uuid()` y nunca
     `uuid_generate_v4()` (`0113`); cero dollar-quotes sueltos en comentarios (`0071`); `p_hoy` y el mes
     vienen del front, en hora AR (`current_date` es UTC en Supabase).
   - **A verificar al escribirla:**
     - que la `devolucion` de `apply_dispensation_stock` use `reference_type = 'dispensation'`
       (`0071:714-724`), para que el neto de «retirado» cierre;
     - qué columna fecha la verificación de una recepción (`0040:20`), para netear pedidos;
     - que `dispensation_requests.enrollment_id` esté poblado en todos los caminos (visita, alta manual,
       saldo, «Otro»).

## Front

| Archivo | Qué |
|---|---|
| `src/data/pharma/reposicionModel.ts` (nuevo) | La cuenta pura, con el diagrama de arriba en el comentario de cabecera y los tipos del JSON. `hoy` siempre por parámetro. |
| `src/data/pharma/reposicionModel.test.ts` (nuevo) | Ver «Tests». |
| `src/data/pharma/reposicion.ts` (nuevo) | `useInsumosDeReposicion(protocolIds)` (**sin el período en las deps**), `configurarReposicion`, `guardarDemoraCompra`, `registrarPedido`, `anularPedido`, `guardarExcepcionDelPaciente`. Tipos a mano citando la `0125`; errores por `pharmaErrorMessage`. |
| `src/views/pharma/reportes/ComprasDelMes.tsx` (nuevo) | La card (D44-D45): resumen plegado con sus estados, lista de todos los medicamentos, renglón abierto, carga en línea (modo por chips de valores fijos + cantidad) y la demora. |
| `src/views/pharma/reportes/VerPedido.tsx` (nuevo) | «Ver pedido» (D46-D47): los tres órdenes, «Imprimir» (hoja con el membrete de Estadísticas) y «Ya lo pedí» con confirmación de fecha. |
| `src/views/pharma/reportes/ReportesView.tsx` | Monta la card **antes** de `if (angosto)`/`error`/`cargando` y de los filtros (D28); **no** le pasa el filtro de estudio (D37: `p_protocol_ids` null = todos); ajusta el texto de `:562-566`. Ver «Revisión de diseño». |
| Tarjeta de medicación del paciente (`PatientMedicationsCard.tsx`) | Entrega 3: «1 por mes (del estudio) · cambiar», oculto con `habilitacion_id`. |
| `supabase/README.md` | Fila de la `0125`; «Aplicada en prod (fecha)» al confirmarse. |

Realce por elevación, nunca borde verde; Lucide; copy corto y sin tecnicismos. Identidad del paciente
con nombre visible.

## Entregas

1. **Rama local: modelo + tests + tipos del JSON** (D29). Todavía sin PR.
2. **Entrega 1 · `0125`** (sólo SQL, PR propia), escrita contra esa forma. Se aplica apenas se mergea →
   sondas sin sesión.
3. **Entrega 2 · Card + carga + demora + pedidos en camino.** Mock y `/plan-design-review` **hechos**
   (ver «Revisión de diseño»): se implementa copiando `docs/design_handoff_reposicion/`. QA logueado de lectura + **carga real dictada** (D19) → **sonda de cuadre**
   (D18).
4. **Entrega 3 · Excepción por paciente.**

**Antes de construir, una sonda de sólo lectura en prod** (D22): cuántas asignaciones activas no
tuvieron retiros en 90 días y cuántos pacientes tienen dos presentaciones activas de la misma droga. Si
son muchos, se lo dice al Director **antes** de la card, porque el total va a salir inflado hasta que
Farmacia limpie.

## Tests

```
CAMINOS DE CÓDIGO (reposicionModel.ts)                  FLUJOS DE USUARIO
├── meses(hoy): 14/09 · 31/12→ene · 31/01→feb · bisiesto  [+] Farmacia mira la card
├── estudiosVisibles: cerrado fuera · pausado etiqueta      ├── [QA] arriba de los filtros; «Año» no la mueve
├── sigueEnElMes                              D16 D23       ├── [QA] visible con «No hubo movimientos»
│   ├── screening/activo sin cronograma → suma              ├── [QA] error de la función ≠ error del informe
│   ├── completado/discontinuado → no                       ├── [QA] respeta el filtro de estudio
│   ├── cronograma auto terminado → no + listado            └── [QA] ventana angosta: la card sigue
│   ├── visitas libres pasadas NO cuentan como cronograma   [+] Farmacia carga (entrega 2)
│   └── última programada dentro del mes → suma             ├── [QA] mensual / a demanda / no se compra
├── cantidadMensual                           D2 D21 D27    ├── [QA] carga real → aparece el número
│   ├── excepción gana · a demanda ignora excepciones       ├── [QA] viewer: sin botón · 42501 → mensaje
│   ├── sin cantidad → «falta cargar», no 0                 ├── [QA] demora vacía → la pide
│   ├── con habilitacion_id → no suma                       └── [QA] doble click → una sola escritura
│   └── 2 presentaciones misma droga → una (última retirada; [+] Pedidos (entrega 2)
│       si ninguna, la más nueva) + aviso                   ├── [QA] «Ya lo pedí» → «0 para comprar · 18 en camino»
├── pendienteDelMes: todo / parte / nada / de más → 0 D14  └── [QA] «Deshacer» → vuelve el número
├── estanteAlComienzo (FEFO)                  D15         [+] Excepción (entrega 3)
│   ├── vencido hoy no cuenta · sin vencimiento al final    ├── [QA] cambia el total del estudio
│   ├── pendiente sale del que vence antes                  └── [★ test] oculto con habilitacion_id
│   ├── vence durante M1 → cuenta + aviso                 [+] SQL insumos_de_reposicion
│   └── pendiente > lotes → estante 0 y falta_M0            ├── [SONDA] existe · sin módulo → 42501
├── enCamino                                  D20           ├── [SONDA] SECURITY DEFINER (pg_proc)
│   ├── recibido parcial · dos pedidos: el viejo primero    └── [CUADRE] estudio real, después de cargar
│   ├── recepción anterior al pedido no netea
│   └── pedido vencido (hoy > pedido + demora) → aviso
├── aComprar                                  D10 D31 D4
│   ├── Seretide 8/6-de-10 → 6 · 3/5 pendientes → 12 · con pedido 6 → 0
│   ├── sobra → 0, nunca negativo · a demanda N − estante − en camino
│   └── modo null / no_se_compra → sin número
├── fechas                                    D17 D24
│   ├── a tiempo · justo el día límite · tarde
│   ├── tarde con demora 45 → también «Noviembre: pedir antes del 17/09»
│   └── demora null → pide cargarla
├── avisos: sin retiros 90 d (D22) · varios meses (D30) · sin medicación habilitada
└── armarReposicion: paciente en DOS estudios → suma en cada uno, por enrolamiento
```

- Fechas **fijas** en los tests, nunca `new Date()`: CI corre en UTC.
- Fábricas locales de filas mínimas, sin Supabase (patrón de `estados.test.ts`); el modelo no importa el
  cliente (patrón `*Model.ts`).
- **Cobertura planeada: 52 caminos · 38 con test unitario · 14 por QA/sonda/cuadre.** Regresiones: ninguna
  (código nuevo; `ReportesView` sólo suma un bloque fuera de sus ramas).

## Modos de falla

| Camino | Falla realista | ¿Test? | ¿Manejo? | ¿Se ve? |
|---|---|---|---|---|
| `insumos_de_reposicion` | alguien la reescribe `security_invoker` → Farmacia pura ve 0 | sonda `pg_proc` | comentario en la función | silenciosa sin la sonda |
| retirado del mes | borde de mes en UTC | test + cuadre | `p_hoy` y huso AR | silenciosa → cuadre |
| enrolamiento sin `enrollment_id` en el pedido | un camino no lo puebla → «no retiró» → compra de más | cuadre | a verificar al escribir la función | sobra, no falta |
| pedido en camino | la recepción se carga en otro estudio → nunca netea → compra de menos | test | aviso «ya debía haber llegado» | se ve |
| sustitución | dos presentaciones | test | suma una + aviso | se ve |
| habilitado sin uso | total inflado | test | aviso con nombres | se ve |
| cronograma terminado | paciente que sigue tomando queda fuera | test | listado visible | se ve |
| card en `ReportesView` | carga o error tapan el informe | QA | bloque aislado | se ve |
| carga | `operator` sin permiso | QA | `42501` → mensaje | se ve |

**Cero brechas críticas** (sin test, sin manejo y silenciosa): las dos silenciosas tienen sonda o cuadre.

## NOT in scope

- **Producto en investigación** (D7): lo manda el sponsor.
- **Farmacia Ambulatoria** (D7): no tiene pacientes asignados.
- **El tilde «entrega medicación»** (D5).
- **Lo gastado como motor de la compra** (D8).
- **Demora por medicamento o por estudio** (D6).
- **Arrastrar el sobrante de un retiro de varios meses** (D30): aviso, no cuenta.
- **`low_stock_threshold` / `STOCK_BAJO = 5`**: sigue su TODO P2.
- **En `TODOS.md` (P3):**
  - sobrante en otro estudio y pacientes por entrar;
  - restos de lote que el armado no usa;
  - imprimir o descargar la lista de compras.

## Paralelización

| Paso | Módulos | Depende de |
|---|---|---|
| Modelo + tests + tipos | `src/views/pharma/reportes/` | — |
| Migración `0125` | `supabase/` | la forma del JSON del modelo (D29) |
| Hook + card + formulario + pedidos | `src/data/pharma/`, `src/views/pharma/reportes/` | modelo; `0125` aplicada |
| Excepción por paciente | `src/views/pharma/`, `src/data/pharma/` | card |

Implementación secuencial: D29 fija el orden y los pasos comparten `reportes/`.

## Tareas de implementación

- [ ] **T1 (P1, humano: ~1 h / CC: ~10 min)**: sonda de sólo lectura en prod (sin uso, dos
  presentaciones).
  - Sale de: D21, D22. Verifica: número informado al Director.
- [ ] **T2 (P1, humano: ~1,5 días / CC: ~1 h)**: `reposicionModel.ts` + tests + tipos del JSON.
  - Sale de: D10, D14-D17, D20-D24, D26, D30, D31. Verifica: `npm run build`.
- [ ] **T3 (P1, humano: ~1,5 días / CC: ~1 h)**: migración `0125` (columnas, `farmacia_ajustes`,
  `reposicion_pedidos`, cuatro funciones).
  - Sale de: D11, D12, D20, D25, D32. Verifica: sondas sin sesión; dollar-quotes pares.
- [x] **T4 (P1)**: mock de la card en `docs/` + `/plan-design-review` (2026-09-14, D33-D43).
  - Sale de: D13, D28 y la regla de mocks.
- [ ] **T5 (P1, humano: ~2,5 días / CC: ~1,5 h)**: hook, card, formulario, demora y pedidos; montaje
  fuera de los cortes.
  - Sale de: D13, D20, D28. Verifica: build + QA logueado + carga real + cuadre.
- [ ] **T6 (P2, humano: ~3 h / CC: ~20 min)**: excepción por paciente, oculta con `habilitacion_id`.
  - Sale de: D2, D27. Verifica: build + test + QA.
- [ ] **T7 (P2)**: `0125` en `supabase/README.md` al aplicarse.
- [ ] **T8 (P3)**: actualizar «adherencia real» en `TODOS.md`: el «previsto» ya existe.

## Cómo se leyó el pedido (para no repetir el error)

La primera lectura fue «cantidad por visita que entrega + promedio de lo gastado». El Director la corrigió
dos veces con casos concretos:

- **D5:** los pacientes con visitas cada tres meses vienen igual todos los meses a una VNP de entrega. Por
  eso la unidad es el mes, y el tilde del cronograma no sirve.
- **D8:** «si el mes pasado no vino nadie no vas a comprar 15 menos». Por eso la compra es por pacientes y
  no por historial.

Las dos correcciones salieron de **mostrar la cuenta con números**, no de preguntar en abstracto.

## Revisión de diseño (`/plan-design-review`, 2026-09-14)

**Mock:** `docs/design_handoff_reposicion/` (17 artboards + `canvas.json`), generado por
`node docs/design_handoff_reposicion/generar-artboards.mjs docs/design_handoff_reposicion` con los valores
literales de `tokens.css`, `reportes/estilos.ts`, `ReportesView` y `PatientMedicationsCard`. Lienzo
publicado: https://claude.ai/artifact/4f5QK82NU7QnUDksZeeDKv. **Se implementa copiando la geometría del
mock**; los datos son inventados.

Puntaje de diseño: **3/10 → 9/10**.

> **Corrección del Director (14/09, después de la primera revisión):** *«siento que se ha complejizado mucho
> más de lo que es. Yo necesito sacar con un botón cuál es el pedido mensual que tengo que hacer para el mes
> siguiente. […] eso de que me muestre sólo 2 y el resto en el ver todo no me gusta. Me lo imagino de que me
> muestre o todos simples, o sólo el número con la posibilidad de desplegar. Y que haya un botón que sea ver
> pedido. Y que ahí se pueda organizar por estudio o por medicamento o por cantidad.»*
> La forma B (D35-D42) queda **reemplazada** por D44-D48. La cuenta (D1-D32) no cambia.

### Decisiones (no re-discutir)

- **D33 · El mock es de artboards HTML en el repo**, como la Tanda 3.
- **D34 · Se revisaron las siete dimensiones.**
- ~~D35-D42 · Forma B (card por estudio, franja «sin cargar», «Ver todo el estudio», cards separadas).~~
  **Reemplazadas por D44.** Quedan como registro en la página «Versiones anteriores» del lienzo.
- **D37 sigue vigente en lo esencial:** la card **no la mueve ningún filtro** y siempre cuenta todos los
  estudios (corrige D13).
- **D43 · Textos:** «Compras para octubre»; «envases» completo, nunca «env.».
- **D44 · La card plegada muestra sólo el número.** «**18** envases · para comprar: 4 medicamentos en 2
  estudios · Pedí antes del 11/09 · 1 sin cargar», con **«Ver pedido»** en el encabezado y
  «Ver todos los medicamentos» para desplegar.
- **D45 · Desplegada, muestra TODOS los medicamentos en renglones simples**: medicamento · presentación,
  estudio, «Para octubre» (N envases / Alcanza / Sin cargar + «Cargar» / No se compra / N en camino). Sin
  esconder nada. Orden: por estudio y, adentro, por medicamento. Un ícono ámbar chico junto al nombre si
  hay un aviso. **Al abrir un renglón** aparecen la cuenta, los avisos y «Cambiar cómo se repone»; «Cargar»
  abre ahí el formulario.
- **D46 · «Ver pedido» es una ventana con sólo lo que hay que comprar**, que se ordena **por estudio**
  (agrupado, con total por estudio), **por medicamento** (suma el mismo medicamento entre estudios, con el
  reparto debajo: «ASM-2301: 6 · ASM-2410: 2») o **por cantidad** (renglones de medicamento y estudio, de
  mayor a menor). Si falta cargar algo, lo dice al pie: «Falta cargar Montelukast (EPOC-118): no está en
  el pedido».
- **D47 · En «Ver pedido»: «Imprimir» y «Ya lo pedí».** «Ya lo pedí» pide confirmación con la fecha y marca
  **todo el pedido** en camino de una vez (reemplaza el «Anotar pedido» por renglón de D20: los pedidos se
  siguen neteando solos contra las recepciones). Después, la card dice «0 envases para comprar · 18 en
  camino, pedidos el 05/09 · Deshacer».
- **D48 · Ventana angosta:** la card plegada es una sola fila que se parte en dos (número arriba, texto
  abajo); la lista desplegada pasa a dos líneas por renglón. Sigue visible por debajo de 1024px (D42 en lo
  esencial).

### La card

```
Compras para octubre ─────────────── A hoy, 05/09   [⏱ Demora de compra: 20 días]   [🛒 Ver pedido]
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│ 18 envases   para comprar: 4 medicamentos en 2 estudios            Ver todos los medicamentos ⌄ │  ← plegada
│              📅 Pedí antes del 11/09 · 1 sin cargar                                           │
├───────────────────────────────────────────────────────────────────────────────────────────────┤
│ MEDICAMENTO                                   ESTUDIO             PARA OCTUBRE                  │  ← desplegada
│ Seretide 250/50 · Aerosol (IDM) ⚠             ASM-2301                         6 envases  ⌄     │
│ Salbutamol 100 mcg · Aerosol (IDM)            ASM-2301                         2 envases  ⌄     │
│ Budesonida 200 mcg · Inhalador                ASM-2301                         ✓ Alcanza  ⌄     │
│ Montelukast 10 mg · Comprimido oral           EPOC-118               Sin cargar [Cargar]  ⌄     │
│ Tiotropio 18 mcg · Cápsula                    EPOC-118                     No se compra   ⌄     │
└───────────────────────────────────────────────────────────────────────────────────────────────┘

[Ver pedido] → Pedido para octubre · 18 envases · 4 medicamentos · pedí antes del 11/09
               Ordenar: (Por estudio) (Por medicamento) (Por cantidad)
               …renglones…
               ⚠ Falta cargar Montelukast 10 mg (EPOC-118): no está en el pedido.
               [Cerrar]                                       [🖨 Imprimir] [🚚 Ya lo pedí]
```

**Lo que se lee primero:** el número de envases. **Segundo:** la fecha límite. **Tercero:** lo pendiente
(«1 sin cargar»).

### Estados

| Parte | Qué se ve |
|---|---|
| Cargando | Card «Calculando las compras…»; el informe del período sigue por su lado |
| Error | «No se pudieron calcular las compras» + «Reintentar» |
| Primer día | «Falta cargar cómo se repone cada medicamento · 0 de 14 cargados» + «Empezar a cargar» (despliega la lista y abre el primer «Cargar»); «Ver pedido» deshabilitado |
| Sin demora | «Cargá la demora de compra para saber hasta cuándo pedir» en lugar de la fecha; el número se calcula igual |
| Ya es tarde | En ámbar: «Ya es tarde para octubre: lo que pidas hoy llega el 04/10 · para noviembre, antes del 12/10» |
| Después de «Ya lo pedí» | «0 envases para comprar · 18 en camino, pedidos el 05/09 · Deshacer»; los renglones dicen «6 en camino» |
| Todo cubierto | «✓ Octubre está cubierto · para noviembre, pedí antes del 12/10», sin número |
| Sin medicamentos de base | «No hay medicación de estudios para reponer» |
| Carga / pedido fallan | Texto en tinte peligro bajo los botones; `42501` → «No tenés permiso para cambiar esto» |
| Farmacia `viewer` | Ve la card y el pedido; sin «Cargar», «Cambiar», demora ni «Ya lo pedí» (sí «Imprimir») |

### Recorrido de Farmacia

| Paso | Hace | Lo sostiene |
|---|---|---|
| 1 | Entra a Estadísticas | El número del mes y la fecha límite, en una fila |
| 2 | Toca «Ver pedido» | Sólo lo que hay que comprar |
| 3 | Lo ordena como le sirve para pedir | Por estudio, por medicamento (sumado) o por cantidad |
| 4 | Imprime y pide | «Imprimir» |
| 5 | Toca «Ya lo pedí» | La card pasa a «18 en camino»; no se pide dos veces |
| 1ª vez | Ve «falta cargar» | «Empezar a cargar» lleva renglón por renglón |

### Responsive y accesibilidad

- Base 1185px (notebook de referencia); por debajo de 1024px, D48.
- Teclado: «Ver todos los medicamentos» y cada renglón son `button` con `aria-expanded`; los chips de
  «Ordenar» y de modo son `radiogroup`; Escape cierra la ventana y el formulario y devuelve el foco a quien
  los abrió; al confirmar «Ya lo pedí» el foco vuelve a «Ver pedido».
- Lectores: la card es una `section` con `aria-labelledby`; el total recalculado se anuncia una vez por
  `role="status"`.
- Color nunca solo: «Alcanza», «Sin cargar», «en camino» y el aviso llevan texto; el ícono ámbar del
  renglón tiene `aria-label` con el aviso.
- Tema oscuro: tintes por tokens `--spira-acc-deep-*`, nunca hex concatenado sobre `var(--…)`.

### Lo que ya existe (y el mock reusa)

`reportes/estilos.ts` (`card`, `sectionHead`, `th`/`td`), `ReportesView` (`Aviso`, `chip`/`chipActivo`:
**moverlos a `estilos.ts`**), `buttons.ts`, `Modal` (Ver pedido, «Ya lo pedí», demora), `DateField`,
`EmptyState` (cargando/error), `Icon`, `impresion.tsx` + `HojaImpresa` (la hoja de «Imprimir» del pedido),
`PatientMedicationsCard` (excepción por paciente).

### NOT in scope (diseño)

- **Descargar el pedido en CSV/Excel:** el Director eligió sólo imprimir; queda en `TODOS.md`.
- **Filtro propio de la card:** D37.
- **Anotar un pedido renglón por renglón:** D47 lo reemplaza por «Ya lo pedí» para todo el pedido.

### Tareas de implementación (diseño)

- [ ] **T9 (P1, humano: ~2 h / CC: ~10 min)**: mover `Aviso`, `chip` y `chipActivo` a `estilos.ts`.
- [ ] **T10 (P1, humano: ~1 día / CC: ~45 min)**: la card (plegada, desplegada, renglón abierto, carga en
  línea, estados). Archivo: `ComprasDelMes.tsx`. Verifica: QA contra el lienzo a 1185px y a 900px.
- [ ] **T11 (P1, humano: ~1 día / CC: ~45 min)**: «Ver pedido» con los tres órdenes, «Imprimir» (sobre
  `HojaImpresa`) y «Ya lo pedí» con confirmación y «Deshacer». Las tres agrupaciones son reglas puras en
  `reposicionModel.ts`, con tests (la suma por medicamento falla en silencio).
- [ ] **T12 (P2, humano: ~3 h / CC: ~20 min)**: teclado y lectores según la lista de arriba.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found (claude) | 15 hallazgos de la voz externa, 15/15 resueltos con el Director (D20-D32 + 3 TODOs) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 25 hallazgos, 0 brechas críticas |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (FULL) | puntaje 3/10 → 9/10, 16 decisiones (D33-D48; D44 simplificó a pedido del Director y reemplaza D35-D42), mock en `docs/design_handoff_reposicion/` |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** la revisión de ingeniería y la voz externa coincidieron en el SECURITY DEFINER y en contar por pacientes. Tensiones resueltas: compra en camino (D20) y habilitados sin uso (D22). La revisión de diseño corrigió una decisión de ingeniería: D13 → D37 (la card no respeta el filtro de estudio).
- **VERDICT:** ENG + DESIGN CLEARED — listo para implementar en el orden de D29 (T1 sonda → T2 modelo → T3 migración → T5/T10/T11 card y «Ver pedido» → T6 excepción).

NO UNRESOLVED DECISIONS
