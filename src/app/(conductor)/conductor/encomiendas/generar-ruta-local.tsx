"use client";

// Botón de armar/rehacer la ruta del chofer. Reemplazó a
// components/encomiendas/generar-ruta-boton.tsx, que llamaba a una server action
// (la oficina también podía generar la ruta; ya no, porque la ruta vive en el
// teléfono). Misma interfaz, pero el cálculo corre acá, así que funciona sin
// señal salvo por las consultas de dirección y trazado.
//
// Lo que arma NO se guarda: se entrega como propuesta (ver calcularRutaLocal) y
// la pantalla la muestra dibujada en el mapa para que el chofer la acepte. Antes
// se guardaba de una y la ruta le cambiaba abajo de los pies.

import { useState } from "react";
import { RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DireccionInput } from "@/components/ui/direccion-input";
import { cn } from "@/lib/utils";
import {
  calcularRutaLocal,
  type PropuestaRuta,
  type PuntoInicio,
} from "@/lib/encomiendas/local/generar-ruta";

type Opcion = "empresa" | "gps" | "direccion";

// El punto de partida es una decisión de vez en cuando, no de todos los días:
// por eso queda plegado detrás de una línea discreta y lo que se ve siempre es
// una sola acción clara.
const OPCIONES: { valor: Opcion; corto: string; largo: string }[] = [
  { valor: "gps", corto: "Mi ubicación", largo: "mi ubicación" },
  { valor: "empresa", corto: "Empresa", largo: "la dirección de la empresa" },
  { valor: "direccion", corto: "Otra", largo: "otra dirección" },
];

export function GenerarRutaLocal({
  fecha,
  direccionEmpresa,
  regenerar = false,
  onPropuesta,
}: {
  fecha: string;
  /** Punto de partida por defecto. Es un dato de la empresa, así que lo baja la
   *  página desde la base y lo pasa acá. */
  direccionEmpresa: string | null;
  regenerar?: boolean;
  onPropuesta: (propuesta: PropuestaRuta) => void;
}) {
  // Desde DONDE arranca la ruta. Por defecto, desde donde está parado el chofer:
  // la ruta se arma en el momento de salir, y salvo que se esté en el galpón, la
  // dirección de la empresa manda la primera parada al otro lado de la ciudad.
  // Antes el valor de arranque era "empresa" y había que acordarse de abrir el
  // desplegable para corregirlo en cada jornada.
  const [opcion, setOpcion] = useState<Opcion>("gps");
  const [mostrarOpciones, setMostrarOpciones] = useState(false);
  const [direccion, setDireccion] = useState("");
  // Coordenadas de la dirección elegida de la lista de sugerencias: con esto la
  // partida no hay que volver a ubicarla ni puede salir mal escrita.
  const [coordPartida, setCoordPartida] = useState<{
    texto: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [armando, setArmando] = useState(false);
  const [obteniendoUbicacion, setObteniendoUbicacion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function disparar(puntoInicio: PuntoInicio) {
    setError(null);
    setArmando(true);
    try {
      onPropuesta(await calcularRutaLocal(fecha, puntoInicio));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo armar la ruta.");
    } finally {
      setArmando(false);
    }
  }

  // Acá había una generación automática al abrir la pantalla sin ruta, que
  // armaba siempre desde la dirección de la empresa. Se fue: ahora el punto de
  // partida por defecto es la ubicación del chofer, y una ruta que se calcula
  // sola no puede pedir permiso de GPS sin que nadie lo haya pedido. El botón de
  // armar está a la vista en la cabecera de la hoja, que es un toque.

  function onClick() {
    setError(null);

    if (opcion === "gps") {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setError("Este dispositivo no puede obtener tu ubicación.");
        return;
      }
      setObteniendoUbicacion(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setObteniendoUbicacion(false);
          void disparar({ tipo: "gps", lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          setObteniendoUbicacion(false);
          setError(
            "No se pudo obtener tu ubicación. Revisa el permiso de ubicación del navegador.",
          );
        },
        { enableHighAccuracy: true, timeout: 10_000 },
      );
      return;
    }

    if (opcion === "direccion") {
      const texto = direccion.trim();
      if (!texto) {
        setError("Escribe la dirección de partida.");
        return;
      }
      const elegida = coordPartida?.texto === texto ? coordPartida : null;
      void disparar({ tipo: "direccion", direccion: texto, lat: elegida?.lat, lng: elegida?.lng });
      return;
    }

    void disparar({ tipo: "empresa", direccion: direccionEmpresa });
  }

  const ocupado = armando || obteniendoUbicacion;
  const elegida = OPCIONES.find((o) => o.valor === opcion)!;

  return (
    <div className="space-y-2">
      <Button onClick={onClick} disabled={ocupado} className="w-full justify-center">
        <RefreshCw className={cn("h-4 w-4", ocupado && "animate-spin")} />
        {obteniendoUbicacion
          ? "Obteniendo ubicación…"
          : armando
            ? "Armando la ruta…"
            : regenerar
              ? "Regenerar ruta"
              : "Generar ruta del día"}
      </Button>

      <button
        onClick={() => setMostrarOpciones((v) => !v)}
        className="flex w-full items-center justify-center gap-1 py-0.5 text-xs text-muted transition-colors hover:text-foreground"
      >
        Desde: {elegida.largo}
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", mostrarOpciones && "rotate-180")}
        />
      </button>

      {mostrarOpciones ? (
        <div className="animate-expand space-y-2">
          {/* Control segmentado en vez de una lista de radios: los toques son
              más grandes y se lee de un vistazo cuál está elegido. */}
          <div className="flex gap-1 rounded-full bg-[#ececef] p-1">
            {OPCIONES.map((o) => (
              <button
                key={o.valor}
                onClick={() => setOpcion(o.valor)}
                className={cn(
                  "flex-1 rounded-full px-2 py-1.5 text-xs font-medium transition-colors",
                  opcion === o.valor
                    ? "bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                    : "text-muted",
                )}
              >
                {o.corto}
              </button>
            ))}
          </div>
          {opcion === "direccion" ? (
            <DireccionInput
              value={direccion}
              onChange={setDireccion}
              onSeleccionar={(s) =>
                setCoordPartida({ texto: s.direccion, lat: s.lat, lng: s.lng })
              }
              confirmada={coordPartida?.texto === direccion.trim()}
            />
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>
      ) : null}
    </div>
  );
}
