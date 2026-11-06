"use client";

// La estampilla de mapa que dice DÓNDE quedó un punto.
//
// Aparece debajo del campo de dirección en cuanto hay coordenadas (ver
// direccion-input.tsx) y como miniatura al lado de cada opción cuando la
// dirección salió ambigua (ver pedido-form-local.tsx). En los dos casos existe
// por lo mismo: leer "Los Aromos 120, Arica" no distingue la casa del valle de
// Azapa; verla en el mapa, sí.
//
// Es una IMAGEN, no un mapa:
//   · un segundo mapa vivo es otro contexto WebGL y otras decenas de teselas, en
//     un teléfono barato que ya está corriendo el de navegación;
//   · dentro de la hoja deslizable, un mapa que se arrastra y hace zoom le roba
//     los gestos al formulario que lo contiene;
//   · un preview no se explora: se mira y se sigue.
// Desde la spec 019 la imagen es una foto del mismo mapa del conductor
// (OpenFreeMap "Liberty"), dibujada una vez y destruida: ver
// estampilla-mapa.ts. Antes era una imagen de Mapbox, que se cobra.
//
// Los tres estados se dibujan DENTRO de la misma caja de alto fijo, para que la
// vista previa no empuje el botón de guardar cuando termina de cargar:
//
//   cargando  el hueco reservado, con el pin latiendo.
//   listo     la foto, con el pin en el centro.
//   falla     sin señal para el mapa. Se dice, no se deja el hueco vacío: si
//             no, el conductor espera una vista previa que no va a llegar.

import { useEffect, useState } from "react";
// "Map" se renombra: suelto, tapa el Map de JavaScript dentro de este archivo.
import { ImageOff, Map as IconoMapa, MapPin, MapPinOff } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { claveEstampilla, fotoDelMapa } from "./estampilla-mapa";

/** Alto por defecto de la tira: con 176 la cuadra se reconoce y abajo todavía
 *  entran las notas y el botón de guardar sin hacer scroll. */
const ALTO = 176;

/** El ancho medido se redondea a múltiplos de esto antes de dibujar: un teléfono
 *  que gira, una barra de scroll que aparece o un renglón que ensancha el campo
 *  dos píxeles no tienen que dibujar otra foto de la MISMA esquina (las fotos se
 *  guardan por esquina y tamaño, ver estampilla-mapa.ts). */
const PASO_ANCHO = 32;

/** Debajo de este alto el aviso de falla no cabe: queda solo el icono. Es el
 *  caso de las miniaturas de la lista de dudas, de 96 px. */
const ALTO_MINIMO_PARA_TEXTO = 112;

/** Las clases de la caja. Las comparten la estampilla y el hueco de abajo, para
 *  que el hueco mida EXACTAMENTE lo mismo que lo que va a aparecer en su lugar:
 *  esa es toda la razón de que el hueco exista. */
const CAJA = "relative overflow-hidden rounded-xl border border-separator bg-background";

/** Las del renglón de abajo, por lo mismo. */
const PIE = "mt-1 text-[11px] leading-tight";

type Estado = "cargando" | "listo" | "falla";

export function MapaPunto({
  lat,
  lng,
  /** Para el texto alternativo: la dirección que representa este punto. */
  etiqueta,
  alto = ALTO,
  /** Ancho de la foto. Sin esto se mide la caja y se dibuja lo que de verdad
   *  mide en pantalla, que es lo que evita el recorte. */
  ancho,
  zoom,
  /** Renglón chico debajo de la imagen. Sirve para decir qué se está mirando
   *  ("así ubica el punto la ruta"), que es lo que convierte la estampilla en
   *  una comprobación y no en un adorno. */
  pie,
  className,
}: {
  lat: number;
  lng: number;
  etiqueta?: string;
  alto?: number;
  ancho?: number;
  zoom?: number;
  pie?: string;
  className?: string;
}) {
  // Cuánto mide la caja de verdad. Se mide en vez de suponerse porque el mismo
  // componente vive en el teléfono (unos 340 px) y en el panel de escritorio.
  //
  // La caja se guarda en el ESTADO y no en una ref: así, si el punto deja de ser
  // dibujable y vuelve —unas coordenadas que se limpian y se vuelven a poner—, el
  // observador se engancha de nuevo. Con una ref y un efecto de montaje quedaba
  // muerto y la estampilla no se medía nunca más.
  const [caja, setCaja] = useState<HTMLDivElement | null>(null);
  const [anchoMedido, setAnchoMedido] = useState<number | null>(null);

  useEffect(() => {
    if (!caja) return;
    const medir = () => {
      const px = caja.clientWidth;
      if (px > 0) setAnchoMedido(Math.ceil(px / PASO_ANCHO) * PASO_ANCHO);
    };
    const observador = new ResizeObserver(medir);
    observador.observe(caja);
    medir();
    return () => observador.disconnect();
  }, [caja]);

  // Con un ancho pedido a mano (las miniaturas de la lista de dudas) no se mide
  // nada. Sin él se espera la medición antes de dibujar: con el ancho de
  // arranque serían DOS fotos de la misma esquina.
  const anchoPedido = ancho ?? anchoMedido;
  const clave = anchoPedido == null ? null : claveEstampilla({ lat, lng, ancho: anchoPedido, alto, zoom });

  // El estado se guarda junto A LA CLAVE que lo produjo y se DERIVA de ahí: sin
  // eso hacía falta un efecto que lo limpiara al cambiar de dirección, y hasta
  // que corriera, la caja mostraba el "sin señal" de la anterior.
  const [carga, setCarga] = useState<{ clave: string | null; estado: Estado; foto?: string }>({
    clave: null,
    estado: "cargando",
  });
  const estado: Estado = carga.clave === clave ? carga.estado : "cargando";

  useEffect(() => {
    if (clave == null || anchoPedido == null) return;
    let vigente = true;
    fotoDelMapa({ lat, lng, ancho: anchoPedido, alto, zoom })
      .then((foto) => vigente && setCarga({ clave, estado: "listo", foto }))
      .catch(() => vigente && setCarga({ clave, estado: "falla" }));
    return () => {
      vigente = false;
    };
  }, [clave, lat, lng, anchoPedido, alto, zoom]);

  const conTexto = alto >= ALTO_MINIMO_PARA_TEXTO;

  return (
    <figure className={cn("min-w-0", className)}>
      <div ref={setCaja} className={CAJA} style={{ height: alto }}>
        {estado === "listo" && carga.foto ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- foto dibujada en el teléfono */}
            <img
              src={carga.foto}
              alt={etiqueta ? `Mapa con el punto de ${etiqueta}` : "Mapa con el punto de la dirección"}
              className="animate-fade-in h-full w-full object-cover"
            />
            {/* El punto está en el centro de la foto: la punta del pin cae ahí. */}
            <MapPin
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-full fill-brand text-card drop-shadow"
              strokeWidth={1.75}
            />
            {/* La atribución es obligatoria por licencia (OpenFreeMap y OpenStreetMap). */}
            <span className="pointer-events-none absolute bottom-0 right-0 rounded-tl-md bg-card/80 px-1 text-[9px] leading-tight text-muted">
              © OpenStreetMap · OpenFreeMap
            </span>
          </>
        ) : null}

        {estado === "cargando" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <MapPin className="h-5 w-5 animate-pulse text-muted" />
          </div>
        ) : null}

        {estado === "falla" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center">
            <ImageOff className="h-4 w-4 shrink-0 text-muted" />
            {conTexto ? (
              <p className="text-[11px] leading-tight text-muted">
                Sin señal para dibujar el mapa. La ubicación no se pierde: se guarda igual.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {pie ? <figcaption className={cn(PIE, "text-muted")}>{pie}</figcaption> : null}
    </figure>
  );
}

/** El HUECO del mapa: la misma caja, del mismo tamaño, para cuando todavía no
 *  hay punto que dibujar.
 *
 *  Existe para que la vista previa no aparezca de golpe. Sin esto, elegir una
 *  dirección metía doscientos píxeles nuevos en el medio del formulario y todo lo
 *  de abajo —las notas, el botón de guardar— se corría de lugar justo cuando el
 *  conductor iba a apretarlo. Con el hueco puesto desde el principio, la imagen
 *  aparece DENTRO de un espacio que ya estaba ahí y nada se mueve.
 *
 *  Y aprovecha para decir qué falta, que es lo que dejó de hacer falta escribir
 *  debajo del campo:
 *
 *    neutro  todavía no se eligió ninguna dirección.
 *    aviso   se dio una por buena a mano y no se pudo ubicar. Eso no es "falta
 *            algo", es una advertencia: ese pedido no entra en ninguna ruta. Acá
 *            se ve del tamaño que merece, en lugar de un renglón de once píxeles.
 */
export function MapaPuntoVacio({
  pie,
  tono = "neutro",
  alto = ALTO,
  className,
}: {
  pie: string;
  tono?: "neutro" | "aviso";
  alto?: number;
  className?: string;
}) {
  const esAviso = tono === "aviso";
  const Icono = esAviso ? MapPinOff : IconoMapa;

  return (
    <figure className={cn("min-w-0", className)}>
      <div className={cn(CAJA, "flex items-center justify-center")} style={{ height: alto }}>
        {/* Trazo fino y apagado: es un lugar reservado, no algo que haya que
            mirar. Compitiendo con el campo de arriba sería peor que el salto que
            vino a arreglar. */}
        <Icono
          className={cn("h-8 w-8", esAviso ? "text-warn" : "text-muted opacity-40")}
          strokeWidth={1.5}
        />
      </div>
      <figcaption className={cn(PIE, esAviso ? "text-warn" : "text-muted")}>{pie}</figcaption>
    </figure>
  );
}
