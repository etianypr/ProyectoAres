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
  const clase = "h-5 w-5 shrink-0 text-brand";

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

// Cartel de navegación (tipo Waze), arriba del mapa: próxima maniobra hacia
// la parada activa + distancia. Ver useNavegacion para cuándo se refresca.
export function InstruccionNavegacion({
  paso,
  siguiente,
  metros,
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
  /** Cómo va el día, a la derecha y dentro del mismo cartel (ver
   *  CAJA_CARRIL). Va acá adentro y no como pastilla aparte porque arriba del
   *  mapa hay una sola franja legible manejando, y dos cajas flotando en ella
   *  se leen como dos cosas que compiten. Es lo único que se le permite
   *  compartir el cartel a la maniobra: dos cifras, sin texto. */
  resumen?: React.ReactNode;
}) {
  const distancia = metros ?? paso.distanciaM;

  return (
    <div className={cn(CAJA_CARRIL, "min-w-0 flex-1")}>
      {iconoManiobra(siguiente ?? paso)}
      <div className="min-w-0 flex-1">
        {/* El banner de Mapbox es el texto corto (la calle a la que se entra) y
            la instrucción es la frase completa. Se muestra el corto arriba,
            grande, que es lo que se lee de un vistazo manejando. */}
        <p className="truncate text-sm font-semibold leading-tight">
          {paso.banner ?? paso.instruccion}
        </p>
        {distancia > 0 ? (
          <p className="text-xs tabular-nums text-muted">{formatDistancia(distancia)}</p>
        ) : null}
      </div>
      {/* El divisor solo existe si hay algo a los dos lados. Es lo que evita que
          el resumen se lea como parte de la instrucción — sin la línea, el "8/14"
          queda pegado al nombre de la calle. */}
      {resumen ? (
        <>
          <span className="h-8 w-px shrink-0 bg-divider" />
          {resumen}
        </>
      ) : null}
    </div>
  );
}
