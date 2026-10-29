import {
  MapPin,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  RotateCcw,
  RefreshCw,
} from "lucide-react";
import { formatDistancia } from "@/lib/comun/format";
import { cn } from "@/lib/comun/utils";
import type { PasoNavegacion } from "@/lib/geo/mapbox/navegacion";

// Antes acá vivía la traducción a mano del vocabulario de maniobras: treinta
// líneas armando "Gira a la izquierda en tal calle" a partir del tipo y el
// modificador que devolvía OSRM. Ya no hace falta — Mapbox entrega la frase
// escrita en español (paso.instruccion), con los nombres de calle acentuados
// como corresponde. Lo único que queda es elegir la flecha.
//
// Devuelve el elemento ya armado y no el componente: asignar un componente a
// una variable dentro del render hace que React lo trate como uno nuevo en cada
// dibujado.
function iconoManiobra(paso: PasoNavegacion) {
  const clase = "h-7 w-7 shrink-0 text-[#ffb48a]";

  if (paso.tipo === "arrive") return <MapPin className={clase} />;
  if (paso.tipo === "depart") return <ArrowUp className={clase} />;
  if (paso.tipo === "roundabout" || paso.tipo === "rotary") {
    return <RefreshCw className={clase} />;
  }

  switch (paso.modificador) {
    case "left":
    case "sharp left":
      return <CornerUpLeft className={clase} />;
    case "right":
    case "sharp right":
      return <CornerUpRight className={clase} />;
    case "slight left":
      return <ArrowUpLeft className={clase} />;
    case "slight right":
      return <ArrowUpRight className={clase} />;
    case "uturn":
      return <RotateCcw className={clase} />;
    default:
      return <ArrowUp className={clase} />;
  }
}

/** La caja del carril de arriba del mapa. Vive acá y se exporta porque hay dos
 *  cosas que la usan y tienen que verse como la MISMA pieza: el cartel de
 *  navegación y, cuando no hay maniobra, el resumen del día solo. Si cada
 *  uno se dibujara su propia caja, el cartel cambiaría de fondo o de sombra al
 *  aparecer y desaparecer la navegación. */
export const CAJA_CARRIL = "flex items-center gap-2.5 rounded-2xl bg-card px-3.5 py-2 shadow-card";
/** El cartel de la maniobra: tinta oscura, para leerse sobre cualquier mapa.
 *  Los colores del resumen (verde, rojo) se aclaran para el fondo oscuro. */
const CAJA_NAVEGACION =
  "flex items-center gap-3 rounded-[22px] bg-foreground px-4 py-2.5 text-background shadow-[0_8px_24px_rgba(34,26,21,0.3)] [&_.text-ok]:text-[#8fdcb4] [&_.text-danger]:text-[#ffa497]";

// Cartel de navegación (tipo Waze), arriba del mapa: próxima maniobra hacia
// la parada activa + distancia. Ver useNavegacion para cuándo se refresca.
export function InstruccionNavegacion({
  paso,
  siguiente,
  metros,
  daLaVuelta = false,
  resumen,
}: {
  paso: PasoNavegacion;
  /** La maniobra que viene al terminar `paso`. De ahí sale la FLECHA: la
   *  maniobra de `paso` se ejecutó al empezarlo, así que dibujar esa mostraba
   *  el giro ya hecho — yendo derecho hacia un giro a la derecha, la flecha
   *  decía "siga derecho". El texto ya era el correcto (`paso.banner` nombra
   *  hacia dónde se entra), así que flecha y texto se contradecían. */
  siguiente: PasoNavegacion | null;
  /** Metros hasta la maniobra recalculados con el GPS (ver useNavegacion): se
   *  prefiere antes que paso.distanciaM, que se queda vieja entre consultas. */
  metros: number | null;
  /** La ruta arranca hacia atrás: antes que la distancia, la vuelta. */
  daLaVuelta?: boolean;
  /** Cómo va el día, a la derecha y dentro del mismo cartel (ver
   *  CAJA_CARRIL). Va acá adentro y no como pastilla aparte porque arriba del
   *  mapa hay una sola franja legible manejando, y dos cajas flotando en ella
   *  se leen como dos cosas que compiten. Es lo único que se le permite
   *  compartir el cartel a la maniobra: dos cifras, sin texto. */
  resumen?: React.ReactNode;
}) {
  const distancia = metros ?? paso.distanciaM;
  const maniobra = siguiente ?? paso;
  // En una rotonda la flecha no alcanza: "toma la 2.ª salida" es lo que hay que
  // leer de un vistazo (spec 017, N12).
  const salida = maniobra.salida != null ? `${maniobra.salida}.ª salida` : null;

  return (
    <div className={cn(CAJA_NAVEGACION, "min-w-0 flex-1")}>
      {daLaVuelta ? <RotateCcw className="h-7 w-7 shrink-0 text-[#ffb48a]" /> : iconoManiobra(maniobra)}
      <div className="min-w-0 flex-1">
        {/* Manejando se lee primero CUÁNTO falta y después hacia dónde: la
            distancia va grande arriba y la calle debajo (spec 017, N12). El
            banner de Mapbox es el texto corto (la calle a la que se entra) y
            la instrucción es la frase completa. */}
        {daLaVuelta ? (
          <p className="text-[22px] font-extrabold leading-tight tracking-tight">Da la vuelta</p>
        ) : distancia > 0 ? (
          <p className="font-mono text-[24px] font-semibold leading-tight tracking-tight">{formatDistancia(distancia)}</p>
        ) : null}
        <p className="truncate text-sm font-semibold leading-tight opacity-85">
          {salida ? `${salida} · ` : ""}
          {paso.banner ?? paso.instruccion}
        </p>
      </div>
      {/* El divisor solo existe si hay algo a los dos lados. Es lo que evita que
          el resumen se lea como parte de la instrucción — sin la línea, el "8/14"
          queda pegado al nombre de la calle. */}
      {resumen ? (
        <>
          <span className="h-8 w-px shrink-0 bg-background/20" />
          {resumen}
        </>
      ) : null}
    </div>
  );
}
