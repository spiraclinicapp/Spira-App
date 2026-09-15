-- Spira · Cronograma de la prueba real — 2 · APLICAR
-- ============================================================================
-- GENERADO por supabase/scripts/cronograma-prueba-real/generar.mjs desde
-- cronograma-procedimientos-y-dias.xlsx (hoja «Resumen unificado por visita»). No editar a mano:
-- cambiar el generador y volver a generar.
--
-- Protocolos: ACT18301, LTS17231, CKJX839D12302, 222714.
-- ============================================================================

-- ANTES: correr 1-sonda.sql y leerla.
--
-- QUÉ HACE, por cada uno de los cuatro protocolos:
--   1. Asegura los 11 procedimientos en el catálogo global. Si ya hay uno con el mismo nombre
--      —sin importar tildes ni mayúsculas— lo reusa y le deja la grafía pedida.
--   2. Deja esos 11 —y sólo esos— como «Procedimientos del estudio». Los viejos se borran CON
--      sus reportes y el estado de esos reportes (decisión del Director, 2026-09-14).
--   3. Pisa el cronograma: cada visita del Excel actualiza la que ya tiene su mismo código (así las
--      visitas de pacientes que cuelgan de ella siguen enganchadas) o se crea. Visita, semana/día,
--      ventana, etapa y la marca de IP quedan como dice el Excel. «Entrega medicación» (base) no se toca.
--   4. Las visitas viejas que no están en el Excel se borran si no tienen visitas de pacientes. Las que
--      sí tienen NO se borran (regla dura: nunca se borran datos de pacientes): pasan al final como
--      manuales, para que no se generen en las randomizaciones nuevas. Aparecen en el resultado.
--   5. Reemplaza los procedimientos de cada visita por los del Excel.
--
-- NO TOCA pacientes, inscripciones ni visitas de pacientes. Las visitas YA generadas no cambian de
-- fecha: si hiciera falta recalcularlas, es el botón de sincronizar del cronograma en la app.
--
-- ATÓMICO: todo va en un único bloque `do`, así que o entra entero o no entra nada (en el editor
-- de Supabase las sentencias sueltas NO comparten transacción). IDEMPOTENTE: correrlo dos veces
-- deja lo mismo.
--
-- EL CRONOGRAMA QUE CARGA (código · nombre · rol · modo · día · IP · procedimientos ← Excel):
-- ACT18301
--   V1   Screening                   screening     libre      ref -59 a -28        6 proc.  ← Selección
--   V2   Inclusión (Parte A)         comun         libre      ref -28              4 proc.  ← V2 (Parte A - inclusión)
--   V3   Randomización               randomizacion libre      ref 0            IP  10 proc.  ← V3 (Inicio Parte B / Aleatorización)
--   V4   W2                          comun         automatica día 14 ±3            5 proc.  ← V4
--   V5   W4                          comun         automatica día 28 ±3        IP  8 proc.  ← V5
--   V6   W8                          comun         automatica día 56 ±3        IP  8 proc.  ← V6
--   V7   W12                         comun         automatica día 84 ±3        IP  5 proc.  ← V7
--   V8   W16                         comun         automatica día 112 ±3       IP  8 proc.  ← V8
--   V9   W20                         comun         automatica día 140 ±3       IP  5 proc.  ← V9
--   V10  W24                         comun         automatica día 168 ±3       IP  9 proc.  ← V10
--   V11  W28                         comun         automatica día 196 ±3       IP  5 proc.  ← V11
--   V12  W32                         comun         automatica día 224 ±3       IP  8 proc.  ← V12
--   V13  W36                         comun         automatica día 252 ±3       IP  5 proc.  ← V13
--   V14  W40                         comun         automatica día 280 ±3       IP  8 proc.  ← V14
--   V15  W44                         comun         automatica día 308 ±3       IP  5 proc.  ← V15
--   V16  W48                         comun         automatica día 336 ±3       IP  5 proc.  ← V16
--   V17  W52                         comun         automatica día 364 ±3           10 proc.  ← V17 (EOT)
--   V18  W56                         comun         automatica día 392 ±3           8 proc.  ← V18 (EOS)
--   ETD  Discontinuación anticipada  comun         libre      ref 0                9 proc.  ← ETD (Discontinuación anticipada)
--
-- LTS17231
--   V1   Randomización               randomizacion libre      ref 0            IP  9 proc.  ← V1
--   V2   W4                          comun         automatica día 28 ±3        IP  1 proc.  ← V2
--   V3   W8                          comun         automatica día 56 ±3        IP  1 proc.  ← V3
--   V4   W12                         comun         automatica día 84 ±3        IP  7 proc.  ← V4
--   V5   W16                         comun         automatica día 112 ±3       IP  1 proc.  ← V5
--   V6   W20                         comun         automatica día 140 ±3       IP  1 proc.  ← V6
--   V7   W24                         comun         automatica día 168 ±3       IP  7 proc.  ← V7
--   V8   W28                         comun         automatica día 196 ±3       IP  1 proc.  ← V8
--   V9   W32                         comun         automatica día 224 ±3       IP  1 proc.  ← V9
--   V10  W36                         comun         automatica día 252 ±3       IP  5 proc.  ← V10
--   V11  W40                         comun         automatica día 280 ±3       IP  1 proc.  ← V11
--   V12  W44                         comun         automatica día 308 ±3       IP  1 proc.  ← V12
--   V13  W48                         comun         automatica día 336 ±3       IP  8 proc.  ← V13
--   V14  W52                         comun         automatica día 364 ±3       IP  1 proc.  ← V14
--   V15  W56                         comun         automatica día 392 ±3       IP  1 proc.  ← V15
--   V16  W60                         comun         automatica día 420 ±3       IP  4 proc.  ← V16
--   V17  W64                         comun         automatica día 448 ±3       IP  1 proc.  ← V17
--   V18  W68                         comun         automatica día 476 ±3       IP  1 proc.  ← V18
--   V19  W72                         comun         automatica día 504 ±3       IP  6 proc.  ← V19
--   V20  W76                         comun         automatica día 532 ±3       IP  1 proc.  ← V20
--   V21  W80                         comun         automatica día 560 ±3       IP  1 proc.  ← V21
--   V22  W84                         comun         automatica día 588 ±3       IP  4 proc.  ← V22
--   V23  W88                         comun         automatica día 616 ±3       IP  1 proc.  ← V23
--   V24  W92                         comun         automatica día 644 ±3       IP  1 proc.  ← V24
--   V25  W96                         comun         automatica día 672 ±3           8 proc.  ← V25 (EOT/ETD)
--   V26  W100                        comun         automatica día 700 ±3           4 proc.  ← V26 (EOS/ESD)
--
-- CKJX839D12302
--   V0   Screening                   screening     libre      ref -14 a -1         2 proc.  ← Selección
--   V1   Randomización               randomizacion libre      ref 0            IP  2 proc.  ← V1 (Período basal)
--   V2   W13                         comun         automatica día 90 ±3        IP  2 proc.  ← V2
--   V3   W39                         comun         automatica día 270 ±3       IP  2 proc.  ← V3
--   V4   W64                         comun         automatica día 450 ±3       IP  2 proc.  ← V4
--   V5   W90                         comun         automatica día 630 ±3       IP  2 proc.  ← V5
--   V6   W116                        comun         automatica día 810 ±3       IP  2 proc.  ← V6
--   V7   W141                        comun         automatica día 990 ±3       IP  2 proc.  ← V7
--   V8   W167                        comun         automatica día 1170 ±3      IP  2 proc.  ← V8
--   V9   W193                        comun         automatica día 1350 ±3      IP  2 proc.  ← V9
--   V10  W219                        comun         automatica día 1530 ±3      IP  2 proc.  ← V10
--   V11  W244                        comun         automatica día 1710 ±3      IP  2 proc.  ← V11
--   V12  W270                        comun         automatica día 1890 ±3      IP  2 proc.  ← V12
--   V13  W296                        comun         automatica día 2070 ±3      IP  2 proc.  ← V13
--   V14  W321                        comun         automatica día 2250 ±3      IP  2 proc.  ← V14
--   FdE  Fin del estudio             comun         libre      ref 0                2 proc.  ← FdE (Fin del estudio)
--
-- 222714
--   V0   Screening                   screening     libre      ref -14 a -1         1 proc.  ← V0 (Selección)
--   V1   Selección / Preinclusión    comun         libre      ref -14 a -1         3 proc.  ← Visita 1 (Selección/Preinclusión)
--   V2   Randomización               randomizacion libre      ref 0            IP  7 proc.  ← V2 (Aleatorización)
--   V3   W4                          comun         automatica día 27 ±3            4 proc.  ← V3
--   V4   W8                          comun         automatica día 55 ±3            2 proc.  ← V4
--   V5   W12                         comun         automatica día 83 ±3            4 proc.  ← V5
--   V6   W16                         comun         automatica día 111 ±3           1 proc.  ← V6
--   V7   W20                         comun         automatica día 139 ±3           1 proc.  ← V7
--   V8   W24                         comun         automatica día 167 ±3           1 proc.  ← V8
--   V9   W26                         comun         automatica día 181 ±3       IP  6 proc.  ← V9
--   V10  W28                         comun         automatica día 195 ±3           2 proc.  ← V10
--   V11  W32                         comun         automatica día 223 ±3           2 proc.  ← V11
--   V12  W36                         comun         automatica día 251 ±3           1 proc.  ← V12
--   V13  W40                         comun         automatica día 279 ±3           3 proc.  ← V13
--   V14  W44                         comun         automatica día 307 ±3           1 proc.  ← V14
--   V15  W48                         comun         automatica día 335 ±3           4 proc.  ← V15
--   V16  W52                         comun         automatica día 363 ±3       IP  7 proc.  ← V16
--   V17  W56                         comun         automatica día 391 ±3           0 proc.  ← V17
--   V18  W60                         comun         automatica día 419 ±3           0 proc.  ← V18
--   V19  W64                         comun         automatica día 447 ±3           0 proc.  ← V19
--   V20  W68                         comun         automatica día 475 ±3           0 proc.  ← V20
--   V21  W72                         comun         automatica día 503 ±3           0 proc.  ← V21
--   V22  W78                         comun         automatica día 545 ±3           0 proc.  ← V22
--   V23  W82                         comun         automatica día 573 ±3           0 proc.  ← V23
--   V24  W86                         comun         automatica día 601 ±3           0 proc.  ← V24
--   V25  W90                         comun         automatica día 629 ±3           0 proc.  ← V25
--   V26  W94                         comun         automatica día 657 ±3           0 proc.  ← V26
--   V27  W98                         comun         automatica día 685 ±3           0 proc.  ← V27
--   V28  W104                        comun         automatica día 727 ±3           0 proc.  ← V28
--   WS   Retiro del estudio          comun         libre      ref 0                2 proc.  ← WS (Retiro del estudio)
--
-- RESULTADO ESPERADO (la consulta del final tiene que dar esto):
--   ACT18301       19 visitas · 131 procedimientos asignados · 11 del estudio · IP en V3, V5, V6, V7, V8, V9, V10, V11, V12, V13, V14, V15, V16
--   LTS17231       26 visitas ·  78 procedimientos asignados · 11 del estudio · IP en V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11, V12, V13, V14, V15, V16, V17, V18, V19, V20, V21, V22, V23, V24
--   CKJX839D12302  16 visitas ·  32 procedimientos asignados · 11 del estudio · IP en V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11, V12, V13, V14
--   222714         30 visitas ·  52 procedimientos asignados · 11 del estudio · IP en V2, V9, V16
--   quedaron_fuera vacío, salvo lo que la sonda haya mostrado en «quedan fuera y NO se borran».

do $cron$
declare
  v_datos jsonb := '[{"codigo":"ACT18301","visitas":[{"code":"V1","nombre":"Screening","role":"screening","date_mode":"libre","offset_days":-59,"window_minus":0,"window_plus":31,"dispenses_ip":false,"procedimientos":["Laboratorio","IVRS y Administración del IMP","ECG de 12 derivaciones","Espirometría (Pre)","Espirometría (Post)","FeNO"],"orden":0},{"code":"V2","nombre":"Inclusión (Parte A)","role":"comun","date_mode":"libre","offset_days":-28,"window_minus":0,"window_plus":0,"dispenses_ip":false,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Oscilometría (Pre)"],"orden":1},{"code":"V3","nombre":"Randomización","role":"randomizacion","date_mode":"libre","offset_days":0,"window_minus":0,"window_plus":0,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Cuestionario de HCRU","ECG de 12 derivaciones","Espirometría (Pre)","Espirometría (Post)","FeNO","Oscilometría (Pre)","Oscilometría (Post)"],"orden":2},{"code":"V4","nombre":"W2","role":"comun","date_mode":"automatica","offset_days":14,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":["Cuestionarios","Laboratorio","Espirometría (Pre)","FeNO","Oscilometría (Pre)"],"orden":3},{"code":"V5","nombre":"W4","role":"comun","date_mode":"automatica","offset_days":28,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Espirometría (Pre)","Espirometría (Post)","FeNO","Oscilometría (Pre)","Oscilometría (Post)"],"orden":4},{"code":"V6","nombre":"W8","role":"comun","date_mode":"automatica","offset_days":56,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Espirometría (Pre)","Espirometría (Post)","FeNO","Oscilometría (Pre)","Oscilometría (Post)"],"orden":5},{"code":"V7","nombre":"W12","role":"comun","date_mode":"automatica","offset_days":84,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Espirometría (Pre)","FeNO"],"orden":6},{"code":"V8","nombre":"W16","role":"comun","date_mode":"automatica","offset_days":112,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Espirometría (Pre)","Espirometría (Post)","FeNO","Oscilometría (Pre)","Oscilometría (Post)"],"orden":7},{"code":"V9","nombre":"W20","role":"comun","date_mode":"automatica","offset_days":140,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Espirometría (Pre)","FeNO"],"orden":8},{"code":"V10","nombre":"W24","role":"comun","date_mode":"automatica","offset_days":168,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Cuestionario de HCRU","Espirometría (Pre)","Espirometría (Post)","FeNO","Oscilometría (Pre)","Oscilometría (Post)"],"orden":9},{"code":"V11","nombre":"W28","role":"comun","date_mode":"automatica","offset_days":196,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Espirometría (Pre)","FeNO"],"orden":10},{"code":"V12","nombre":"W32","role":"comun","date_mode":"automatica","offset_days":224,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Espirometría (Pre)","Espirometría (Post)","FeNO","Oscilometría (Pre)","Oscilometría (Post)"],"orden":11},{"code":"V13","nombre":"W36","role":"comun","date_mode":"automatica","offset_days":252,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Espirometría (Pre)","FeNO"],"orden":12},{"code":"V14","nombre":"W40","role":"comun","date_mode":"automatica","offset_days":280,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Espirometría (Pre)","Espirometría (Post)","FeNO","Oscilometría (Pre)","Oscilometría (Post)"],"orden":13},{"code":"V15","nombre":"W44","role":"comun","date_mode":"automatica","offset_days":308,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Espirometría (Pre)","FeNO"],"orden":14},{"code":"V16","nombre":"W48","role":"comun","date_mode":"automatica","offset_days":336,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Espirometría (Pre)","FeNO"],"orden":15},{"code":"V17","nombre":"W52","role":"comun","date_mode":"automatica","offset_days":364,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Cuestionario de HCRU","ECG de 12 derivaciones","Espirometría (Pre)","Espirometría (Post)","FeNO","Oscilometría (Pre)","Oscilometría (Post)"],"orden":16},{"code":"V18","nombre":"W56","role":"comun","date_mode":"automatica","offset_days":392,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Espirometría (Pre)","Espirometría (Post)","FeNO","Oscilometría (Pre)","Oscilometría (Post)"],"orden":17},{"code":"ETD","nombre":"Discontinuación anticipada","role":"comun","date_mode":"libre","offset_days":0,"window_minus":0,"window_plus":0,"dispenses_ip":false,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","ECG de 12 derivaciones","Espirometría (Pre)","Espirometría (Post)","FeNO","Oscilometría (Pre)","Oscilometría (Post)"],"orden":18}]},{"codigo":"LTS17231","visitas":[{"code":"V1","nombre":"Randomización","role":"randomizacion","date_mode":"libre","offset_days":0,"window_minus":0,"window_plus":0,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","ECG de 12 derivaciones","Espirometría (Pre)","Espirometría (Post)","FeNO","Oscilometría (Pre)","Examen físico completo"],"orden":0},{"code":"V2","nombre":"W4","role":"comun","date_mode":"automatica","offset_days":28,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["IVRS y Administración del IMP"],"orden":1},{"code":"V3","nombre":"W8","role":"comun","date_mode":"automatica","offset_days":56,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["IVRS y Administración del IMP"],"orden":2},{"code":"V4","nombre":"W12","role":"comun","date_mode":"automatica","offset_days":84,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Espirometría (Pre)","Espirometría (Post)","FeNO","Oscilometría (Pre)"],"orden":3},{"code":"V5","nombre":"W16","role":"comun","date_mode":"automatica","offset_days":112,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["IVRS y Administración del IMP"],"orden":4},{"code":"V6","nombre":"W20","role":"comun","date_mode":"automatica","offset_days":140,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["IVRS y Administración del IMP"],"orden":5},{"code":"V7","nombre":"W24","role":"comun","date_mode":"automatica","offset_days":168,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Espirometría (Pre)","Espirometría (Post)","FeNO","Oscilometría (Pre)"],"orden":6},{"code":"V8","nombre":"W28","role":"comun","date_mode":"automatica","offset_days":196,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["IVRS y Administración del IMP"],"orden":7},{"code":"V9","nombre":"W32","role":"comun","date_mode":"automatica","offset_days":224,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["IVRS y Administración del IMP"],"orden":8},{"code":"V10","nombre":"W36","role":"comun","date_mode":"automatica","offset_days":252,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","IVRS y Administración del IMP","Espirometría (Pre)","Espirometría (Post)","FeNO"],"orden":9},{"code":"V11","nombre":"W40","role":"comun","date_mode":"automatica","offset_days":280,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["IVRS y Administración del IMP"],"orden":10},{"code":"V12","nombre":"W44","role":"comun","date_mode":"automatica","offset_days":308,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["IVRS y Administración del IMP"],"orden":11},{"code":"V13","nombre":"W48","role":"comun","date_mode":"automatica","offset_days":336,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","ECG de 12 derivaciones","Espirometría (Pre)","Espirometría (Post)","FeNO","Oscilometría (Pre)"],"orden":12},{"code":"V14","nombre":"W52","role":"comun","date_mode":"automatica","offset_days":364,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["IVRS y Administración del IMP"],"orden":13},{"code":"V15","nombre":"W56","role":"comun","date_mode":"automatica","offset_days":392,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["IVRS y Administración del IMP"],"orden":14},{"code":"V16","nombre":"W60","role":"comun","date_mode":"automatica","offset_days":420,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["IVRS y Administración del IMP","Espirometría (Pre)","Espirometría (Post)","FeNO"],"orden":15},{"code":"V17","nombre":"W64","role":"comun","date_mode":"automatica","offset_days":448,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["IVRS y Administración del IMP"],"orden":16},{"code":"V18","nombre":"W68","role":"comun","date_mode":"automatica","offset_days":476,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["IVRS y Administración del IMP"],"orden":17},{"code":"V19","nombre":"W72","role":"comun","date_mode":"automatica","offset_days":504,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Espirometría (Pre)","Espirometría (Post)","FeNO"],"orden":18},{"code":"V20","nombre":"W76","role":"comun","date_mode":"automatica","offset_days":532,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["IVRS y Administración del IMP"],"orden":19},{"code":"V21","nombre":"W80","role":"comun","date_mode":"automatica","offset_days":560,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["IVRS y Administración del IMP"],"orden":20},{"code":"V22","nombre":"W84","role":"comun","date_mode":"automatica","offset_days":588,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["IVRS y Administración del IMP","Espirometría (Pre)","Espirometría (Post)","FeNO"],"orden":21},{"code":"V23","nombre":"W88","role":"comun","date_mode":"automatica","offset_days":616,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["IVRS y Administración del IMP"],"orden":22},{"code":"V24","nombre":"W92","role":"comun","date_mode":"automatica","offset_days":644,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["IVRS y Administración del IMP"],"orden":23},{"code":"V25","nombre":"W96","role":"comun","date_mode":"automatica","offset_days":672,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","ECG de 12 derivaciones","Espirometría (Pre)","Espirometría (Post)","FeNO","Examen físico completo"],"orden":24},{"code":"V26","nombre":"W100","role":"comun","date_mode":"automatica","offset_days":700,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":["ECG de 12 derivaciones","Espirometría (Pre)","Espirometría (Post)","Examen físico completo"],"orden":25}]},{"codigo":"CKJX839D12302","visitas":[{"code":"V0","nombre":"Screening","role":"screening","date_mode":"libre","offset_days":-14,"window_minus":0,"window_plus":13,"dispenses_ip":false,"procedimientos":["Laboratorio","IVRS y Administración del IMP"],"orden":0},{"code":"V1","nombre":"Randomización","role":"randomizacion","date_mode":"libre","offset_days":0,"window_minus":0,"window_plus":0,"dispenses_ip":true,"procedimientos":["Laboratorio","IVRS y Administración del IMP"],"orden":1},{"code":"V2","nombre":"W13","role":"comun","date_mode":"automatica","offset_days":90,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Laboratorio","IVRS y Administración del IMP"],"orden":2},{"code":"V3","nombre":"W39","role":"comun","date_mode":"automatica","offset_days":270,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Laboratorio","IVRS y Administración del IMP"],"orden":3},{"code":"V4","nombre":"W64","role":"comun","date_mode":"automatica","offset_days":450,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Laboratorio","IVRS y Administración del IMP"],"orden":4},{"code":"V5","nombre":"W90","role":"comun","date_mode":"automatica","offset_days":630,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Laboratorio","IVRS y Administración del IMP"],"orden":5},{"code":"V6","nombre":"W116","role":"comun","date_mode":"automatica","offset_days":810,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Laboratorio","IVRS y Administración del IMP"],"orden":6},{"code":"V7","nombre":"W141","role":"comun","date_mode":"automatica","offset_days":990,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Laboratorio","IVRS y Administración del IMP"],"orden":7},{"code":"V8","nombre":"W167","role":"comun","date_mode":"automatica","offset_days":1170,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Laboratorio","IVRS y Administración del IMP"],"orden":8},{"code":"V9","nombre":"W193","role":"comun","date_mode":"automatica","offset_days":1350,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Laboratorio","IVRS y Administración del IMP"],"orden":9},{"code":"V10","nombre":"W219","role":"comun","date_mode":"automatica","offset_days":1530,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Laboratorio","IVRS y Administración del IMP"],"orden":10},{"code":"V11","nombre":"W244","role":"comun","date_mode":"automatica","offset_days":1710,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Laboratorio","IVRS y Administración del IMP"],"orden":11},{"code":"V12","nombre":"W270","role":"comun","date_mode":"automatica","offset_days":1890,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Laboratorio","IVRS y Administración del IMP"],"orden":12},{"code":"V13","nombre":"W296","role":"comun","date_mode":"automatica","offset_days":2070,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Laboratorio","IVRS y Administración del IMP"],"orden":13},{"code":"V14","nombre":"W321","role":"comun","date_mode":"automatica","offset_days":2250,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Laboratorio","IVRS y Administración del IMP"],"orden":14},{"code":"FdE","nombre":"Fin del estudio","role":"comun","date_mode":"libre","offset_days":0,"window_minus":0,"window_plus":0,"dispenses_ip":false,"procedimientos":["Laboratorio","IVRS y Administración del IMP"],"orden":15}]},{"codigo":"222714","visitas":[{"code":"V0","nombre":"Screening","role":"screening","date_mode":"libre","offset_days":-14,"window_minus":0,"window_plus":13,"dispenses_ip":false,"procedimientos":["Laboratorio"],"orden":0},{"code":"V1","nombre":"Selección / Preinclusión","role":"comun","date_mode":"libre","offset_days":-14,"window_minus":0,"window_plus":13,"dispenses_ip":false,"procedimientos":["Laboratorio","Cuestionario de HCRU","ECG de 12 derivaciones"],"orden":1},{"code":"V2","nombre":"Randomización","role":"randomizacion","date_mode":"libre","offset_days":0,"window_minus":0,"window_plus":0,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Cuestionario de HCRU","ECG de 12 derivaciones","Espirometría (Pre)","Espirometría (Post)"],"orden":2},{"code":"V3","nombre":"W4","role":"comun","date_mode":"automatica","offset_days":27,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":["Cuestionarios","Laboratorio","Cuestionario de HCRU","Espirometría (Pre)"],"orden":3},{"code":"V4","nombre":"W8","role":"comun","date_mode":"automatica","offset_days":55,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":["Laboratorio","Cuestionario de HCRU"],"orden":4},{"code":"V5","nombre":"W12","role":"comun","date_mode":"automatica","offset_days":83,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":["Cuestionarios","Laboratorio","Cuestionario de HCRU","Espirometría (Pre)"],"orden":5},{"code":"V6","nombre":"W16","role":"comun","date_mode":"automatica","offset_days":111,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":["Cuestionario de HCRU"],"orden":6},{"code":"V7","nombre":"W20","role":"comun","date_mode":"automatica","offset_days":139,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":["Cuestionario de HCRU"],"orden":7},{"code":"V8","nombre":"W24","role":"comun","date_mode":"automatica","offset_days":167,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":["Cuestionario de HCRU"],"orden":8},{"code":"V9","nombre":"W26","role":"comun","date_mode":"automatica","offset_days":181,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Cuestionario de HCRU","ECG de 12 derivaciones","Espirometría (Pre)"],"orden":9},{"code":"V10","nombre":"W28","role":"comun","date_mode":"automatica","offset_days":195,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":["Laboratorio","Cuestionario de HCRU"],"orden":10},{"code":"V11","nombre":"W32","role":"comun","date_mode":"automatica","offset_days":223,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":["Laboratorio","Cuestionario de HCRU"],"orden":11},{"code":"V12","nombre":"W36","role":"comun","date_mode":"automatica","offset_days":251,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":["Cuestionario de HCRU"],"orden":12},{"code":"V13","nombre":"W40","role":"comun","date_mode":"automatica","offset_days":279,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":["Cuestionarios","Laboratorio","Cuestionario de HCRU"],"orden":13},{"code":"V14","nombre":"W44","role":"comun","date_mode":"automatica","offset_days":307,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":["Cuestionario de HCRU"],"orden":14},{"code":"V15","nombre":"W48","role":"comun","date_mode":"automatica","offset_days":335,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":["Cuestionarios","Laboratorio","Cuestionario de HCRU","ECG de 12 derivaciones"],"orden":15},{"code":"V16","nombre":"W52","role":"comun","date_mode":"automatica","offset_days":363,"window_minus":3,"window_plus":3,"dispenses_ip":true,"procedimientos":["Cuestionarios","Laboratorio","IVRS y Administración del IMP","Cuestionario de HCRU","ECG de 12 derivaciones","Espirometría (Pre)","Espirometría (Post)"],"orden":16},{"code":"V17","nombre":"W56","role":"comun","date_mode":"automatica","offset_days":391,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":[],"orden":17},{"code":"V18","nombre":"W60","role":"comun","date_mode":"automatica","offset_days":419,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":[],"orden":18},{"code":"V19","nombre":"W64","role":"comun","date_mode":"automatica","offset_days":447,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":[],"orden":19},{"code":"V20","nombre":"W68","role":"comun","date_mode":"automatica","offset_days":475,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":[],"orden":20},{"code":"V21","nombre":"W72","role":"comun","date_mode":"automatica","offset_days":503,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":[],"orden":21},{"code":"V22","nombre":"W78","role":"comun","date_mode":"automatica","offset_days":545,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":[],"orden":22},{"code":"V23","nombre":"W82","role":"comun","date_mode":"automatica","offset_days":573,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":[],"orden":23},{"code":"V24","nombre":"W86","role":"comun","date_mode":"automatica","offset_days":601,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":[],"orden":24},{"code":"V25","nombre":"W90","role":"comun","date_mode":"automatica","offset_days":629,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":[],"orden":25},{"code":"V26","nombre":"W94","role":"comun","date_mode":"automatica","offset_days":657,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":[],"orden":26},{"code":"V27","nombre":"W98","role":"comun","date_mode":"automatica","offset_days":685,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":[],"orden":27},{"code":"V28","nombre":"W104","role":"comun","date_mode":"automatica","offset_days":727,"window_minus":3,"window_plus":3,"dispenses_ip":false,"procedimientos":[],"orden":28},{"code":"WS","nombre":"Retiro del estudio","role":"comun","date_mode":"libre","offset_days":0,"window_minus":0,"window_plus":0,"dispenses_ip":false,"procedimientos":["Espirometría (Pre)","Espirometría (Post)"],"orden":29}]}]'::jsonb;
  v_procs jsonb := '[{"nombre":"Cuestionarios","categoria":"Cuestionarios"},{"nombre":"Laboratorio","categoria":"Laboratorio"},{"nombre":"IVRS y Administración del IMP","categoria":"Medicación"},{"nombre":"Cuestionario de HCRU","categoria":"Cuestionarios"},{"nombre":"ECG de 12 derivaciones","categoria":"Cardio-respiratorio"},{"nombre":"Espirometría (Pre)","categoria":"Cardio-respiratorio"},{"nombre":"Espirometría (Post)","categoria":"Cardio-respiratorio"},{"nombre":"FeNO","categoria":"Cardio-respiratorio"},{"nombre":"Oscilometría (Pre)","categoria":"Cardio-respiratorio"},{"nombre":"Oscilometría (Post)","categoria":"Cardio-respiratorio"},{"nombre":"Examen físico completo","categoria":"Evaluación clínica"}]'::jsonb;
  v_by        uuid;
  v_faltan    text;
  v_mapa      jsonb := '{}'::jsonb;
  v_ids       uuid[] := '{}';
  v_pid       uuid;
  v_x         record;
  v_p         record;
  v_v         record;
  v_proto_id  uuid;
  v_def_id    uuid;
  v_keep      uuid[];
  v_want      uuid[];
  v_n         int;
begin
  -- 0 · Autor de las filas nuevas. El editor corre como postgres, sin auth.uid(), y created_by es
  --     NOT NULL: se resuelve a un usuario real con el mismo criterio que las migraciones (0061, 0089).
  --     El audit_log igual registra db_role = postgres, que es la verdad.
  select u.id into v_by
  from public.users u
  join public.user_module_roles r on r.user_id = u.id
  where r.module = 'gerencia'
  order by u.created_at limit 1;
  if v_by is null then
    select u.id into v_by from public.users u order by u.created_at limit 1;
  end if;
  if v_by is null then
    raise exception 'No hay usuarios en la base: no tengo a quién atribuir los procedimientos nuevos.';
  end if;

  -- 1 · Los cuatro protocolos tienen que existir. Si falta uno se frena ACÁ, antes de escribir nada.
  select string_agg(x.codigo, ', ') into v_faltan
  from jsonb_to_recordset(v_datos) as x(codigo text)
  where not exists (select 1 from public.protocols p where p.code = x.codigo);
  if v_faltan is not null then
    raise exception 'No encontré estos protocolos en Spira: %. No se cambió nada (ver la sonda).', v_faltan;
  end if;

  -- 2 · Catálogo global. Si el nombre ya existe (más de una vez, incluso), se reusa el más viejo.
  for v_x in select * from jsonb_to_recordset(v_procs) as x(nombre text, categoria text) loop
    select p.id into v_pid
    from public.procedures p
    where lower(translate(btrim(p.name), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu')) = lower(translate(btrim(v_x.nombre), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu'))
    order by p.created_at, p.id
    limit 1;
    if v_pid is null then
      insert into public.procedures (name, category, requires_dispensation, created_by)
      values (v_x.nombre, v_x.categoria, false, v_by)
      returning id into v_pid;
    else
      -- Reusado: queda con la grafía pedida («LABORATORIO» → «Laboratorio»). Sólo cambia tildes y
      -- mayúsculas —es la misma clave—, así que no le cambia el significado a otro protocolo que lo use.
      -- La categoría se completa si no tenía; si tenía una, se respeta. El where evita escribir (y
      -- dejar una fila en audit_log) cuando ya está bien, para que correrlo dos veces no deje rastro.
      update public.procedures p
         set name     = v_x.nombre,
             category = coalesce(p.category, v_x.categoria)
       where p.id = v_pid
         and (p.name is distinct from v_x.nombre or p.category is null);
    end if;
    v_mapa := v_mapa || jsonb_build_object(v_x.nombre, v_pid);
    v_ids  := v_ids || v_pid;
  end loop;

  -- 3 · Protocolo por protocolo.
  for v_p in select * from jsonb_to_recordset(v_datos) as x(codigo text, visitas jsonb) loop
    select p.id into v_proto_id from public.protocols p where p.code = v_p.codigo;

    -- 3a · Procedimientos del estudio: los once adentro…
    insert into public.protocol_procedures (protocol_id, procedure_id, created_by)
    select v_proto_id, t.pid, v_by
    from unnest(v_ids) as t(pid)
    on conflict (protocol_id, procedure_id) do nothing;

    -- 3b · Las visitas del Excel. Cada escritura compara antes de escribir: correrlo dos veces no
    --      tiene que dejar cientos de filas idénticas en audit_log, que es la traza regulatoria.
    v_keep := '{}';
    for v_v in
      select * from jsonb_to_recordset(v_p.visitas) as y(
        code text, nombre text, role text, date_mode text, offset_days int,
        window_minus int, window_plus int, dispenses_ip boolean, procedimientos jsonb, orden int)
      order by y.orden
    loop
      -- Mismo código = misma visita. Si hubiera dos con el mismo código, se usa la primera del
      -- cronograma y la otra cae en 3c como sobrante.
      v_def_id := null;
      select vd.id into v_def_id
      from public.visit_definitions vd
      where vd.protocol_id = v_proto_id
        and upper(btrim(vd.code)) = upper(v_v.code)
        and vd.id <> all (v_keep)
      order by vd.sort_order, vd.created_at
      limit 1;

      if v_def_id is null then
        insert into public.visit_definitions
          (protocol_id, code, name, visit_type, date_mode, role, offset_days, window_minus, window_plus, sort_order, dispenses_ip)
        values
          (v_proto_id, v_v.code, v_v.nombre, 'presencial', v_v.date_mode, v_v.role, v_v.offset_days,
           v_v.window_minus, v_v.window_plus, v_v.orden, v_v.dispenses_ip)
        returning id into v_def_id;
      else
        update public.visit_definitions vd
           set code         = v_v.code,
               name         = v_v.nombre,
               visit_type   = 'presencial',
               date_mode    = v_v.date_mode,
               role         = v_v.role,
               offset_days  = v_v.offset_days,
               window_minus = v_v.window_minus,
               window_plus  = v_v.window_plus,
               sort_order   = v_v.orden,
               dispenses_ip = v_v.dispenses_ip
         where vd.id = v_def_id
           and (vd.code, vd.name, vd.visit_type, vd.date_mode, vd.role, vd.offset_days,
                vd.window_minus, vd.window_plus, vd.sort_order, vd.dispenses_ip)
               is distinct from
               (v_v.code, v_v.nombre, 'presencial', v_v.date_mode, v_v.role, v_v.offset_days,
                v_v.window_minus, v_v.window_plus, v_v.orden, v_v.dispenses_ip);
      end if;
      v_keep := v_keep || v_def_id;

      -- Procedimientos de la visita: fuera los que no van (y cualquier fila con protocol_id
      -- desalineado de su visita), adentro los que faltan, y el orden sólo si cambió.
      select coalesce(array_agg((v_mapa ->> t.nombre)::uuid), '{}') into v_want
      from jsonb_array_elements_text(v_v.procedimientos) as t(nombre);

      delete from public.protocol_activities pa
      where pa.visit_def_id = v_def_id
        and (pa.procedure_id <> all (v_want) or pa.protocol_id <> v_proto_id);

      insert into public.protocol_activities as pa (protocol_id, visit_def_id, procedure_id, suggested_order)
      select v_proto_id, v_def_id, (v_mapa ->> t.nombre)::uuid, t.ord::int
      from jsonb_array_elements_text(v_v.procedimientos) with ordinality as t(nombre, ord)
      on conflict (visit_def_id, procedure_id) do update
        set suggested_order = excluded.suggested_order
        where pa.suggested_order is distinct from excluded.suggested_order;

      select count(*) into v_n from public.protocol_activities pa where pa.visit_def_id = v_def_id;
      if v_n <> jsonb_array_length(v_v.procedimientos) then
        raise exception '% %: la visita quedó con % procedimientos y tenían que ser %.', v_p.codigo, v_v.code, v_n, jsonb_array_length(v_v.procedimientos);
      end if;
    end loop;

    -- 3c · Visitas viejas que no están en el Excel. Primero se vacían de procedimientos (incluida
    --      cualquier fila con este protocol_id colgada de una visita ajena). Sin visitas de pacientes → se borran. Con
    --      visitas de pacientes → quedan, al final y como manuales: una automática seguiría
    --      generándose en cada randomización nueva, y un screening/randomización seguiría
    --      disparando su alerta al cerrar.
    delete from public.protocol_activities pa
    where (pa.protocol_id = v_proto_id
           or pa.visit_def_id in (select vd.id from public.visit_definitions vd where vd.protocol_id = v_proto_id))
      and pa.visit_def_id <> all (v_keep);

    delete from public.visit_definitions vd
    where vd.protocol_id = v_proto_id
      and vd.id <> all (v_keep)
      and not exists (select 1 from public.patient_visits pv where pv.visit_def_id = vd.id);

    update public.visit_definitions vd
       set date_mode  = 'libre',
           role       = 'comun',
           sort_order = 1000 + vd.sort_order
     where vd.protocol_id = v_proto_id
       and vd.id <> all (v_keep)
       and vd.sort_order < 1000;

    -- 3d · Procedimientos viejos fuera del estudio. Recién ahora: ninguna visita los tiene ya (3b, 3c).
    --      El borrado arrastra en cascada report_definitions → report_status → report_status_history
    --      y alert_dismissals (decisión del Director).
    delete from public.protocol_procedures pp
    where pp.protocol_id = v_proto_id
      and pp.procedure_id <> all (v_ids);
  end loop;
end
$cron$;

-- Control. Comparalo con el RESULTADO ESPERADO de arriba.
select p.code as protocolo,
       (select count(*) from public.visit_definitions vd where vd.protocol_id = p.id and vd.sort_order < 1000) as visitas,
       (select count(*) from public.protocol_activities pa where pa.protocol_id = p.id) as procedimientos_asignados,
       (select count(*) from public.protocol_procedures pp where pp.protocol_id = p.id) as procedimientos_del_estudio,
       (select string_agg(vd.code, ', ' order by vd.sort_order) from public.visit_definitions vd
         where vd.protocol_id = p.id and vd.dispenses_ip and vd.sort_order < 1000) as visitas_con_ip,
       (select string_agg(vd.code || ' ' || vd.name, ' · ' order by vd.sort_order) from public.visit_definitions vd
         where vd.protocol_id = p.id and vd.sort_order < 1000) as cronograma,
       coalesce((select string_agg(coalesce(vd.code, '(sin código)'), ', ' order by vd.sort_order) from public.visit_definitions vd
                  where vd.protocol_id = p.id and vd.sort_order >= 1000), '') as quedaron_fuera
from public.protocols p
where p.code in ('ACT18301', 'LTS17231', 'CKJX839D12302', '222714')
order by p.code;
