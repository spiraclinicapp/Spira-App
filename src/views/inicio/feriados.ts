/**
 * Los feriados nacionales que el saludo de Inicio usa para avisar que se viene uno.
 *
 * SON DATOS A MANO, AÑO POR AÑO, y eso es a propósito: los inamovibles se podrían calcular, pero
 * los trasladables se corren por ley según el día en que caigan y los puentes salen por decreto
 * cada año. Calcularlos sería adivinar, y un "el lunes es feriado" que después no lo es es peor que
 * no avisar nada. La fuente es el calendario oficial del Gobierno nacional.
 *
 * CÓMO NO OLVIDARSE DEL AÑO QUE VIENE. `saludo.test.ts` falla apenas empieza un año que no está
 * cargado acá. Sin eso, el 1° de enero los avisos dejan de salir en silencio —nadie extraña un
 * aviso que no aparece— y el año entero pasa sin feriados. Cuando falle: agregá los del año nuevo
 * con el mismo formato y listo.
 *
 * LOS DÍAS NO LABORABLES NO VAN (23/3, 10/7 y 7/12 en 2026). Son optativos para el empleador: los
 * decide la Fundación, no la ley, y este archivo no sabe qué decidió. Si entraran, el saludo
 * anunciaría un "finde largo de cuatro días" que quizás no existe. Tampoco están los feriados
 * provinciales de Mendoza.
 *
 * `motivo` se escribe para leerse después de "por": "el lunes es feriado por {motivo}".
 */

export interface Feriado {
  /** `YYYY-MM-DD` */
  fecha: string
  motivo: string
}

export const FERIADOS: Feriado[] = [
  { fecha: '2026-01-01', motivo: 'Año Nuevo' },
  { fecha: '2026-02-16', motivo: 'Carnaval' },
  { fecha: '2026-02-17', motivo: 'Carnaval' },
  { fecha: '2026-03-24', motivo: 'el Día de la Memoria' },
  { fecha: '2026-04-02', motivo: 'Malvinas' },
  { fecha: '2026-04-03', motivo: 'Viernes Santo' },
  { fecha: '2026-05-01', motivo: 'el Día del Trabajador' },
  { fecha: '2026-05-25', motivo: 'el 25 de Mayo' },
  { fecha: '2026-06-15', motivo: 'el paso a la inmortalidad de Güemes' },
  { fecha: '2026-06-20', motivo: 'el Día de la Bandera' },
  { fecha: '2026-07-09', motivo: 'el Día de la Independencia' },
  { fecha: '2026-08-17', motivo: 'el paso a la inmortalidad de San Martín' },
  { fecha: '2026-10-12', motivo: 'el Día de la Diversidad Cultural' },
  { fecha: '2026-11-23', motivo: 'el Día de la Soberanía Nacional' },
  { fecha: '2026-12-08', motivo: 'la Inmaculada Concepción' },
  { fecha: '2026-12-25', motivo: 'Navidad' },

  /* 2027: los INAMOVIBLES, cargados el 2026-09-27 desde la lista que pasó el Director. FALTAN los cuatro
     trasladables —Güemes (17/6), San Martín (17/8), Diversidad Cultural (12/10) y Soberanía Nacional
     (20/11)—, que se corren según el día en que caen y salen en otra tabla del calendario oficial. Hasta
     que se carguen, esos cuatro no se avisan: el test del vencimiento no lo ve, porque 2027 ya figura. */
  { fecha: '2027-01-01', motivo: 'Año Nuevo' },
  { fecha: '2027-02-08', motivo: 'Carnaval' },
  { fecha: '2027-02-09', motivo: 'Carnaval' },
  { fecha: '2027-03-24', motivo: 'el Día de la Memoria' },
  { fecha: '2027-03-26', motivo: 'Viernes Santo' },
  { fecha: '2027-04-02', motivo: 'Malvinas' },
  { fecha: '2027-05-01', motivo: 'el Día del Trabajador' },
  { fecha: '2027-05-25', motivo: 'el 25 de Mayo' },
  { fecha: '2027-06-20', motivo: 'el Día de la Bandera' },
  { fecha: '2027-07-09', motivo: 'el Día de la Independencia' },
  { fecha: '2027-12-08', motivo: 'la Inmaculada Concepción' },
  { fecha: '2027-12-25', motivo: 'Navidad' },
]

/** El último año con feriados cargados. Lo vigila el test. */
export const ULTIMO_ANIO_CARGADO = Math.max(...FERIADOS.map((f) => Number(f.fecha.slice(0, 4))))
