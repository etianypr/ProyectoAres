"use client";

import { useEffect, useRef, useState } from "react";

const ALTURA_VH = 78; // alto total de la hoja abierta, en % del viewport

// Mientras no se haya podido medir la cabecera (primer dibujado, antes de que
// exista el elemento). Es un valor de arranque, no el que manda.
const ALTO_CABECERA_INICIAL = 96;

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

// ----------------------------------------------------------------------------
// La hoja deslizable
// ----------------------------------------------------------------------------
// Mapa a pantalla completa detrás; abajo esta hoja, que se arrastra entre dos
// posiciones: cerrada y abierta.
//
// La diferencia con la versión anterior está en la CABECERA. Antes, cerrada, la
// hoja mostraba un resumen de dos renglones y el botón de la parada quedaba
// adentro del contenido: para llamar o marcar una entrega había que arrastrar
// la hoja hacia arriba, manejando. Ahora la cabecera es contenido de verdad —la
// parada activa y su botón— y está SIEMPRE a la vista, abierta o cerrada.
//
// De ahí que el alto cerrado no sea un número fijo: se mide la cabecera, porque
// cambia según el paso (un botón, dos, o el aviso de ruta completa).
export function BottomSheet({
  cabecera,
  senalCerrar,
  onAlturaCerrada,
  children,
}: {
  /** Lo que se ve siempre, cerrada o abierta. Arrastra la hoja. */
  cabecera: React.ReactNode;
  /** Cuando este valor CAMBIA (y no es null), la hoja se cierra sola. Lo usa la
   *  pantalla cuando lo importante pasa a ser el mapa y no el contenido de la
   *  hoja — al aparecer la ruta propuesta, por ejemplo. */
  senalCerrar?: unknown;
  /** Cuánto ocupa la hoja cerrada. La pantalla lo usa para no dibujar nada
   *  suyo debajo (los botones flotantes del mapa). */
  onAlturaCerrada?: (px: number) => void;
  children: React.ReactNode;
}) {
  const [expandido, setExpandido] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [offsetArrastre, setOffsetArrastre] = useState(0);
  // Alto de la hoja calculado en JS (window.innerHeight), no con la unidad CSS
  // "dvh" — más seguro entre navegadores/versiones que la calculan distinto (o
  // no la soportan) según el dispositivo.
  const [altoVentana, setAltoVentana] = useState(0);
  const [altoCabecera, setAltoCabecera] = useState(ALTO_CABECERA_INICIAL);
  const cabeceraRef = useRef<HTMLDivElement>(null);
  const inicioY = useRef(0);
  const movioRef = useRef(false);
  const activoRef = useRef(false);

  useEffect(() => {
    function medir() {
      setAltoVentana(window.innerHeight);
    }
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("orientationchange", medir);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("orientationchange", medir);
    };
  }, []);

  // La cabecera cambia de alto sola: un botón, dos, el aviso de ruta completa,
  // una dirección que ocupa dos renglones. Se observa en vez de medirse una vez,
  // o la hoja cerrada dejaría el botón cortado justo cuando cambia de paso.
  useEffect(() => {
    const el = cabeceraRef.current;
    if (!el) return;
    const observador = new ResizeObserver(() => setAltoCabecera(el.offsetHeight));
    observador.observe(el);
    setAltoCabecera(el.offsetHeight);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    onAlturaCerrada?.(altoCabecera);
  }, [altoCabecera, onAlturaCerrada]);

  // Ajustado durante el render y no en un efecto: la hoja tiene que salir ya
  // cerrada en el mismo dibujado en que aparece la señal, sin un cuadro
  // intermedio con la hoja abierta tapando el mapa.
  const [senalAplicada, setSenalAplicada] = useState(senalCerrar);
  if (senalCerrar !== senalAplicada) {
    setSenalAplicada(senalCerrar);
    if (senalCerrar != null) setExpandido(false);
  }

  const altoSheet = Math.round(altoVentana * (ALTURA_VH / 100));
  const colapsadoTranslate = Math.max(altoSheet - altoCabecera, 0);

  function onPointerDown(e: React.PointerEvent) {
    activoRef.current = true;
    movioRef.current = false;
    inicioY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!activoRef.current) return;
    const delta = e.clientY - inicioY.current;
    if (Math.abs(delta) > 4) movioRef.current = true;
    if (!movioRef.current) return;
    setArrastrando(true);
    const base = expandido ? 0 : colapsadoTranslate;
    setOffsetArrastre(clamp(base + delta, 0, colapsadoTranslate));
  }

  function onPointerUp() {
    if (!activoRef.current) return;
    activoRef.current = false;
    if (movioRef.current) {
      setExpandido(offsetArrastre < colapsadoTranslate / 2);
    }
    // Sin arrastre real fue un toque, y un toque en la cabecera NO abre la
    // hoja: ahí adentro están los botones de la parada, y abrirla al soltar el
    // dedo taparía el mapa cada vez que el chofer marca una entrega. Para eso
    // está el tirador.
    setArrastrando(false);
    setOffsetArrastre(0);
  }

  const translateY = arrastrando ? offsetArrastre : expandido ? 0 : colapsadoTranslate;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.15)]"
      style={{
        height: altoSheet > 0 ? `${altoSheet}px` : `${ALTURA_VH}vh`,
        transform: `translateY(${translateY}px)`,
        transition: arrastrando ? "none" : "transform 0.25s ease-out",
      }}
    >
      <div ref={cabeceraRef} className="shrink-0">
        {/* El tirador es lo único que abre y cierra con un toque: es la zona sin
            contenido, así que tocarla no puede querer decir otra cosa. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => {
            if (!movioRef.current) setExpandido((v) => !v);
          }}
          className="flex cursor-grab justify-center px-4 pb-1 pt-2.5 active:cursor-grabbing"
          style={{ touchAction: "none" }}
          role="button"
          tabIndex={0}
          aria-label={expandido ? "Cerrar el panel" : "Abrir el panel"}
        >
          <div className="h-1.5 w-10 rounded-full bg-separator" />
        </div>
        <div className="px-4 pb-3">{cabecera}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-divider px-4 pb-8 pt-3">
        {children}
      </div>
    </div>
  );
}
