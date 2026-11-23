// El logo de Dashund, la empresa que desarrolla ARES (dueño, 2026-11-23: «Estela»):
// un perro salchicha corriendo de lado, con dos estelas de velocidad atrás y el lomo
// calado, de modo que el cuerpo y el cuello forman una «d». Es un activo de marca:
// un solo color, el naranja de Dashund, fijo y sin seguir el tema. El mismo dibujo
// está en public/dashund.svg (de ahí salen los íconos: scripts/generar-iconos.mjs).
// Las fuentes, las variantes y el paquete de marca viven fuera del repo (C:\dev\dashund\logo).
//
// Es ancho (2,44 : 1): dale una caja ancha, no cuadrada. Se lee hasta 16 px de ancho.
//
// `animado`: el lomo se estira y se encoge, como en los camiones, donde el perro se
// alarga a lo largo de la carrocería. Va en las pantallas de carga; con «reducir
// movimiento» se queda quieto.
import { useId } from "react";

const NARANJA = "#d4531a";

/** El perro entero, en una sola forma (el recorte de la «d» es un hueco del trazo). */
const MARCA =
  "M5.38 20.5H29.28C29.45 20.57 29.62 20.63 29.8 20.66L29.81 20.7H37.27L38.89 17.09C39.28 17.3 39.63 17.59 39.89 17.94L44.5 19.6C45.33 19.6 46 20.27 46 21.1C46 21.93 45.33 22.6 44.5 22.6L38.36 22.73L38.36 22.82C38.76 23.45 39 24.2 39 25C39 26.6 38.06 27.98 36.71 28.62L36.94 28.83C38.06 29.85 38.14 31.59 37.11 32.71C36.09 33.84 34.35 33.91 33.23 32.89L30.64 30.53C30.63 30.52 30.62 30.51 30.61 30.5H25.38C25.37 30.51 25.36 30.52 25.35 30.53L22.76 32.89C21.64 33.91 19.9 33.84 18.88 32.71C18.31 32.09 18.08 31.28 18.18 30.5H11.38C10.06 30.5 9 29.44 9 28.12C9 26.81 10.06 25.75 11.38 25.75H20V25.25H5.38C4.06 25.25 3 24.19 3 22.88C3 21.56 4.06 20.5 5.38 20.5ZM24.75 22.88C24.34 22.88 24 23.22 24 23.63V26.88C24 27.29 24.34 27.63 24.75 27.63H30.37C30.4 27.63 30.43 27.63 30.46 27.62C30.51 27.63 30.57 27.63 30.62 27.63C31.93 27.63 33 26.56 33 25.25C33 23.94 31.93 22.87 30.62 22.87C30.54 22.87 30.47 22.87 30.4 22.88Q30.38 22.88 30.37 22.88ZM38.5 16 36.75 19.9H30.5L30.5 19.88C30.42 19.89 30.33 19.9 30.25 19.9C29.34 19.9 28.6 19.16 28.6 18.25C28.6 17.42 29.21 16.74 30 16.62L30 16.6ZM40.6 19.25C40.6 18.92 40.33 18.65 40 18.65C39.67 18.65 39.4 18.92 39.4 19.25C39.4 19.58 39.67 19.85 40 19.85C40.33 19.85 40.6 19.58 40.6 19.25Z";

// Para animarlo, el mismo perro en tres piezas: atrás (estelas, anca y pata), el
// lomo (una franja que se estira) y adelante (pecho, pata, cabeza y oreja). El
// recorte va aparte, en una máscara, porque también se estira.
const ATRAS =
  "M5.38 20.5H23V25.79C23.9 25.63 24.86 25.92 25.52 26.65C26.55 27.77 26.47 29.51 25.35 30.53L22.76 32.89C21.64 33.91 19.9 33.84 18.88 32.71C18.31 32.09 18.08 31.28 18.18 30.5H11.38C10.06 30.5 9 29.44 9 28.12C9 26.81 10.06 25.75 11.38 25.75H20V25.25H5.38C4.06 25.25 3 24.19 3 22.88C3 21.56 4.06 20.5 5.38 20.5Z";
const ADELANTE =
  "M26.5 20.5H29.28C29.45 20.57 29.62 20.63 29.8 20.66L29.81 20.7H37.27L38.89 17.09C39.28 17.3 39.63 17.59 39.89 17.94L44.5 19.6C45.33 19.6 46 20.27 46 21.1C46 21.93 45.33 22.6 44.5 22.6L38.36 22.73L38.36 22.82C38.76 23.45 39 24.2 39 25C39 26.6 38.06 27.98 36.71 28.62L36.94 28.83C38.06 29.85 38.14 31.59 37.11 32.71C36.09 33.84 34.35 33.91 33.23 32.89L30.64 30.53C30.63 30.52 30.62 30.51 30.61 30.5H26.5V27.68C26.18 27.02 26 26.28 26 25.5C26 24.72 26.18 23.98 26.5 23.32ZM38.5 16 36.75 19.9H30.5L30.5 19.88C30.42 19.89 30.33 19.9 30.25 19.9C29.34 19.9 28.6 19.16 28.6 18.25C28.6 17.42 29.21 16.74 30 16.62L30 16.6ZM40.6 19.25C40.6 18.92 40.33 18.65 40 18.65C39.67 18.65 39.4 18.92 39.4 19.25C39.4 19.58 39.67 19.85 40 19.85C40.33 19.85 40.6 19.58 40.6 19.25Z";

// Al estirarse, atrás se corre 3 unidades a la izquierda y adelante 3 a la derecha;
// el lomo (5 de largo) y el recorte (7,125) crecen esas 6 desde su centro.
const ESTIRA = 3;
const ESTILO_ANIMADO = `
.dashund-atras,.dashund-adelante,.dashund-lomo,.dashund-recorte{animation:1.4s cubic-bezier(.45,0,.55,1) infinite alternate}
.dashund-atras{animation-name:dashund-atras}
.dashund-adelante{animation-name:dashund-adelante}
.dashund-lomo,.dashund-recorte{transform-box:fill-box;transform-origin:center}
.dashund-lomo{animation-name:dashund-lomo}
.dashund-recorte{animation-name:dashund-recorte}
@keyframes dashund-atras{to{transform:translateX(-${ESTIRA}px)}}
@keyframes dashund-adelante{to{transform:translateX(${ESTIRA}px)}}
@keyframes dashund-lomo{to{transform:scaleX(${(5 + 2 * ESTIRA) / 5})}}
@keyframes dashund-recorte{to{transform:scaleX(${(7.125 + 2 * ESTIRA) / 7.125})}}
@media (prefers-reduced-motion:reduce){.dashund-atras,.dashund-adelante,.dashund-lomo,.dashund-recorte{animation:none}}
`;

export function LogoDashund({
  className,
  titulo = "Dashund",
  animado = false,
}: {
  className?: string;
  /** Lo que lee el lector de pantalla; "" lo deja como decorado. */
  titulo?: string;
  animado?: boolean;
}) {
  const mascara = `dashund-recorte-${useId()}`;
  const a11y = {
    role: titulo ? "img" : undefined,
    "aria-label": titulo || undefined,
    "aria-hidden": titulo ? undefined : true,
  } as const;

  if (!animado) {
    return (
      <svg viewBox="3 16 43 17.61" className={className} {...a11y}>
        <path d={MARCA} fill={NARANJA} />
      </svg>
    );
  }

  // La caja deja lugar a cada lado para lo que se estira.
  return (
    <svg viewBox={`${3 - ESTIRA} 16 ${43 + 2 * ESTIRA} 17.61`} className={className} {...a11y}>
      <style>{ESTILO_ANIMADO}</style>
      <mask id={mascara} maskUnits="userSpaceOnUse" x={3 - ESTIRA} y="16" width={43 + 2 * ESTIRA} height="17.61">
        <rect x={3 - ESTIRA} y="16" width={43 + 2 * ESTIRA} height="17.61" fill="#fff" />
        <rect className="dashund-recorte" x="24" y="22.875" width="7.125" height="4.75" rx="0.75" fill="#000" />
        <circle className="dashund-adelante" cx="30.625" cy="25.25" r="2.375" fill="#000" />
      </mask>
      <g fill={NARANJA} mask={`url(#${mascara})`}>
        <path className="dashund-atras" d={ATRAS} />
        <rect className="dashund-lomo" x="22" y="20.5" width="5" height="10" />
        <path className="dashund-adelante" d={ADELANTE} />
      </g>
    </svg>
  );
}
