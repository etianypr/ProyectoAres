// El optimizador con horarios sin congelar la pantalla (spec 017, R5). Son unas
// décimas de segundo en el PC y un par de segundos en el teléfono, y de un tirón
// eso es la rueda de "Armando la ruta…" detenida. La búsqueda va por partes
// (buscarConHorarios cede entre jugada y jugada) y acá se le devuelve el turno a
// la pantalla cada MS_POR_TANDA. El resultado es el mismo que de un tirón: ceder
// no cambia qué jugadas se prueban.
//
// Se probó con un Web Worker: Turbopack (Next 16.4) publica el archivo del Worker
// como TypeScript sin compilar, así que no corría.
import { buscarConHorarios, type DiaConHorarios } from "./con-horarios";

/** Cuánto trabaja seguido antes de dejar pintar la pantalla (≈ dos cuadros). */
const MS_POR_TANDA = 30;

const cederTurno = () => new Promise<void>((listo) => setTimeout(listo, 0));

export async function optimizarSinCongelar(arranques: number[][], dia: DiaConHorarios): Promise<number[]> {
  const busqueda = buscarConHorarios(arranques, dia);
  let desde = performance.now();
  let paso = busqueda.next();
  while (!paso.done) {
    if (performance.now() - desde > MS_POR_TANDA) {
      await cederTurno();
      desde = performance.now();
    }
    paso = busqueda.next();
  }
  return paso.value;
}
