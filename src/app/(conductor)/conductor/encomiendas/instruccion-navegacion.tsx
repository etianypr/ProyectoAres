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
import { formatDistancia } from "@/lib/format";
import type { PasoNavegacion } from "@/lib/rutas";

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

// Cartel de navegación (tipo Waze), arriba del mapa: próxima maniobra hacia
// la parada activa + distancia. Ver useNavegacion para cuándo se refresca.
export function InstruccionNavegacion({
  paso,
  siguiente,
  metros,
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
}) {
  const distancia = metros ?? paso.distanciaM;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl bg-card px-3.5 py-2 shadow-card">
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
    </div>
  );
}
