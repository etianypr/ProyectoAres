// El orden del día por lo que cuesta en plata, no solo en km (spec 024; dueño,
// 2026-11-08): cada km cuesta $130 de bencina y cada hora al volante, $6.000.
// Con esos precios un segundo manejando vale lo mismo que ~12,8 m, así que un
// rodeo por la avenida que ahorra minutos le puede ganar a la calle más corta.
//
// La matriz que sale va en "metros equivalentes": se escala para que en promedio
// mida lo mismo que la de metros. Así lo que el orden cobra aparte, en metros
// (devolverse en un pasaje), sigue pesando lo mismo que antes.
// Los km, el tiempo y los avisos que se muestran siguen siendo los reales.
//
// El éxito por parada no entra acá (dueño, 2026-11-08: «como hoy»): los horarios
// van en su propia propuesta (estrategias.ts). Puro.

/** Bencina por km (dueño, 2026-11-08). */
export const PESOS_POR_KM = 130;
/** Una hora manejando (dueño, 2026-11-08). */
export const PESOS_POR_HORA = 6000;

/** Metros que vale un segundo al volante: ($6.000 / 3.600 s) / ($130 / 1.000 m). */
export const METROS_POR_SEGUNDO = PESOS_POR_HORA / 3600 / (PESOS_POR_KM / 1000);

/** Lo que cuesta en plata manejar `metros` en `segundos`. */
export function pesosDeManejar(metros: number, segundos: number): number {
  return (metros / 1000) * PESOS_POR_KM + (segundos / 3600) * PESOS_POR_HORA;
}

/**
 * La matriz para ORDENAR: metros más el tiempo, pasado a metros con
 * METROS_POR_SEGUNDO y escalado al promedio de los metros. Un par sin tiempo (no
 * llegó, o no tiene camino) se estima a la velocidad media de los que sí lo
 * trajeron. Sin ningún tiempo, devuelve los metros tal cual: el orden de antes.
 */
export function matrizDeCosto(metros: number[][], segundos: (number | null)[][] | null): number[][] {
  let metrosConTiempo = 0;
  let segundosConTiempo = 0;
  metros.forEach((fila, i) =>
    fila.forEach((m, j) => {
      const s = segundos?.[i]?.[j];
      if (i !== j && s != null && s > 0 && Number.isFinite(m)) {
        metrosConTiempo += m;
        segundosConTiempo += s;
      }
    }),
  );
  if (segundosConTiempo <= 0) return metros;
  const segundosPorMetro = segundosConTiempo / metrosConTiempo;

  let sumaMetros = 0;
  let sumaCosto = 0;
  const crudo = metros.map((fila, i) =>
    fila.map((m, j) => {
      if (i === j || !Number.isFinite(m)) return m;
      const c = m + METROS_POR_SEGUNDO * (segundos?.[i]?.[j] ?? m * segundosPorMetro);
      sumaMetros += m;
      sumaCosto += c;
      return c;
    }),
  );
  const escala = sumaCosto > 0 ? sumaMetros / sumaCosto : 1;
  return crudo.map((fila, i) => fila.map((c, j) => (i === j || !Number.isFinite(c) ? c : c * escala)));
}
