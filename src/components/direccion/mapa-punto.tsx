"use client";

// La estampilla de mapa que dice DÓNDE quedó un punto.
//
// Aparece debajo del campo de dirección en cuanto hay coordenadas (ver
// direccion-input.tsx) y como miniatura al lado de cada opción cuando la
// dirección salió ambigua (ver pedido-form-local.tsx). En los dos casos existe
// por lo mismo: leer "Los Aromos 120, Arica" no distingue la casa del valle de
// Azapa; verla en el mapa, sí.
//
// Es una imagen, no un mapa (el por qué está en lib/geo/mapbox/mapa-estatico.ts).
//
// Los tres estados se dibujan DENTRO de la misma caja de alto fijo, para que la
// vista previa no empuje el botón de guardar cuando termina de cargar:
//
//   cargando  el hueco reservado, con el pin latiendo.
//   listo     la imagen.
//   falla     sin señal o Mapbox caído. Se dice, no se deja el hueco vacío: si
//             no, el conductor espera una vista previa que no va a llegar.

import { useEffect, useState } from "react";
// "Map" se renombra: suelto, tapa el Map de JavaScript dentro de este archivo.
import { ImageOff, Map as IconoMapa, MapPin, MapPinOff } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { urlMapaEstatico } from "@/lib/geo/mapbox/mapa-estatico";

/** Alto por defecto de la tira.
 *
 *  Eran 128 y quedaban pocos: de esos 128 la atribución de Mapbox —que viene
 *  DIBUJADA en la imagen y por contrato no se puede sacar— se come unos veinte,
 *  así que de mapa quedaba una franja. Con 176 la cuadra se reconoce y abajo
 *  todavía entran las notas y el botón de guardar sin hacer scroll. */
const ALTO = 176;

/** Ancho que se le pide a Mapbox mientras no se haya podido medir la caja. Es un
 *  valor de arranque para el primer dibujado, no el que manda. */
const ANCHO_INICIAL = 360;

/** El ancho medido se redondea a múltiplos de esto antes de pedir la imagen.
 *
 *  No es maña: la URL es la clave de la caché del navegador y de la factura de
 *  Mapbox (ver lib/geo/mapbox/mapa-estatico.ts). Sin redondear, un teléfono que gira, una
 *  barra de scroll que aparece o un renglón que ensancha el campo dos píxeles
 *  serían una URL nueva y una petición nueva por la MISMA esquina. */
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
  /** Ancho a pedirle a Mapbox. Sin esto se mide la caja y se pide lo que de
   *  verdad mide en pantalla, que es lo que evita el recorte: pidiendo 480 fijo
   *  para una caja de 340, object-cover se comía un 15% por lado. */
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
  // componente vive en el teléfono (unos 340 px) y en el panel de escritorio, y
  // pedir un ancho que no es el de la caja termina en un recorte o en datos
  // móviles tirados.
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
  // nada. Sin él se espera la medición antes de pedir la imagen: dibujarla con
  // el ancho de arranque y cambiarla después serían DOS peticiones por la misma
  // esquina, y las peticiones se pagan.
  const anchoPedido = ancho ?? anchoMedido;

  // Retina siempre: esto se mira en un teléfono, y una estampilla borrosa no
  // sirve para reconocer una esquina. No cuesta peticiones, solo datos.
  const url =
    anchoPedido == null
      ? null
      : urlMapaEstatico({ lat, lng, ancho: anchoPedido, alto, zoom, retina: true });

  // El estado se guarda junto A LA URL que lo produjo —el mismo recurso que
  // usan las sugerencias de OpenStreetMap en direccion-input.tsx— y se DERIVA de
  // ahí. Sin eso hacía falta un efecto que lo limpiara al cambiar de dirección,
  // y hasta que corriera, la caja mostraba el "sin señal" de la anterior.
  const [carga, setCarga] = useState<{ url: string | null; estado: Estado }>({
    url,
    estado: "cargando",
  });
  const estado: Estado = carga.url === url ? carga.estado : "cargando";

  // ¿Hay algo que dibujar? Se prueba con el ancho de arranque, que no depende de
  // la medición: la caja tiene que EXISTIR para poder medirla, así que no se
  // puede esperar la URL definitiva para decidir si se dibuja la caja.
  //
  // Sin token de Mapbox no hay vista previa y no se dice nada acá: el que tiene
  // que enterarse es el administrador, y el mapa de navegación ya se lo dice con
  // todas las letras. Un cartel de configuración debajo del campo solo le
  // ocuparía pantalla al conductor, que no puede hacer nada al respecto.
  const sePuede = urlMapaEstatico({ lat, lng, ancho: ANCHO_INICIAL, alto, zoom, retina: true });
  if (!sePuede) return null;

  const conTexto = alto >= ALTO_MINIMO_PARA_TEXTO;

  return (
    <figure className={cn("min-w-0", className)}>
      <div ref={setCaja} className={CAJA} style={{ height: alto }}>
        {url && estado !== "falla" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={
              etiqueta
                ? `Mapa con el punto de ${etiqueta}`
                : "Mapa con el punto de la dirección"
            }
            loading="lazy"
            decoding="async"
            onLoad={() => setCarga({ url, estado: "listo" })}
            onError={() => setCarga({ url, estado: "falla" })}
            className={cn(
              "h-full w-full object-cover transition-opacity duration-200",
              estado === "listo" ? "opacity-100" : "opacity-0",
            )}
          />
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
