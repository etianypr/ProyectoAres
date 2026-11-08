// Los sonidos del escáner en vivo (spec 028). El dueño eligió «Marimba»
// (2026-11-08, https://claude.ai/artifact/UUubHvpkZGVhv1PmJKkPAb): un tic por
// cada dato que queda firme, cada uno más agudo (do6 · mi6 · sol6), el de pedido
// leído que llega a la octava (do7), y dos notas que bajan cuando la cámara se
// pausa por un ⚠. Sin racha: la descartó el dueño.
//
// Se arman con Web Audio en el teléfono: sin archivos, sin licencias, sin red, y
// suenan al instante. Van por el volumen multimedia. Si el navegador no tiene
// audio, no suena nada y el escáner sigue igual.

/** Notas en Hz (la4 = 440). */
export const NOTAS = { re5: 587.33, sol5: 783.99, do6: 1046.5, mi6: 1318.51, sol6: 1567.98, do7: 2093 } as const;

/** La nota de cada tic, de grave a agudo: siempre suben. */
export const NOTAS_TIC = [NOTAS.do6, NOTAS.mi6, NOTAS.sol6] as const;

let contexto: AudioContext | null = null;
let salida: GainNode | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Contexto = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Contexto) return null;
  if (!contexto) {
    contexto = new Contexto();
    const compresor = contexto.createDynamicsCompressor();
    compresor.threshold.value = -14;
    compresor.ratio.value = 4;
    salida = contexto.createGain();
    salida.gain.value = 0.7;
    salida.connect(compresor).connect(contexto.destination);
  }
  if (contexto.state === "suspended") void contexto.resume();
  return contexto;
}

/** Un golpe: ataque corto y caída exponencial. */
function golpe(c: AudioContext, t: number, frecuencia: number, volumen: number, caida: number) {
  const oscilador = c.createOscillator();
  const ganancia = c.createGain();
  oscilador.type = "sine";
  oscilador.frequency.value = frecuencia;
  ganancia.gain.setValueAtTime(0.0001, t);
  ganancia.gain.exponentialRampToValueAtTime(volumen, t + 0.004);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, t + 0.004 + caida);
  oscilador.connect(ganancia).connect(salida!);
  oscilador.start(t);
  oscilador.stop(t + caida + 0.06);
}

/** Una nota de marimba: la fundamental y su 4.º armónico (la madera). */
function nota(c: AudioContext, t: number, frecuencia: number, largo = 0.2, volumen = 0.32) {
  golpe(c, t, frecuencia, volumen, largo);
  golpe(c, t, frecuencia * 3.93, volumen * 0.22, largo * 0.35);
}

/** Prepara el audio. Conviene llamarlo al abrir el escáner (lo abre un toque). */
export function prepararSonidos(): void {
  audio();
}

/** El tic del dato número `n` (0, 1 o 2) que quedó firme. */
export function sonarTic(n: number): void {
  const c = audio();
  if (!c) return;
  nota(c, c.currentTime + 0.01, NOTAS_TIC[Math.max(0, Math.min(2, n))]);
}

/** Pedido leído: do–mi–sol rápido y llega al do de arriba. */
export function sonarLeida(): void {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.01;
  [NOTAS.do6, NOTAS.mi6, NOTAS.sol6].forEach((f, i) => nota(c, t + i * 0.055, f, 0.16, 0.26));
  nota(c, t + 0.17, NOTAS.do7, 0.55, 0.34);
  nota(c, t + 0.17, NOTAS.sol6, 0.45, 0.16);
}

/** La cámara se pausó por un ⚠: dos notas que bajan. */
export function sonarPausa(): void {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.01;
  nota(c, t, NOTAS.sol5, 0.22, 0.24);
  nota(c, t + 0.16, NOTAS.re5, 0.3, 0.22);
}
