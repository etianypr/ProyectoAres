"use client";

// Botón de armar/rehacer la ruta del conductor. Reemplazó a
// components/encomiendas/generar-ruta-boton.tsx, que llamaba a una server action
// (la oficina también podía generar la ruta; ya no, porque la ruta vive en el
// teléfono). Misma interfaz, pero el cálculo corre acá, así que funciona sin
// señal salvo por las consultas de dirección y trazado.
//
// Lo que arma NO se guarda: se entrega como propuesta (ver calcularRutaLocal) y
// la pantalla la muestra dibujada en el mapa para que el conductor la acepte. Antes
// se guardaba de una y la ruta le cambiaba abajo de los pies.

import { useState } from "react";
import { AlertTriangle, RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DireccionInput } from "@/components/direccion/direccion-input";
import { cn } from "@/lib/comun/utils";
import { fuenteUbicacion } from "@/lib/encomiendas/local/gps-simulado";
import { BuscandoRuta, esperarDibujo } from "./buscando-ruta";
import { BOTON_PRINCIPAL } from "./parada-activa";
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
  { valor: "empresa", corto: "Central", largo: "la central de carga" },
  { valor: "gps", corto: "Mi ubicación", largo: "mi ubicación" },
  { valor: "direccion", corto: "Otra", largo: "otra dirección" },
];

export function GenerarRutaLocal({
  fecha,
  direccionEmpresa,
  regenerar = false,
  conProblema = 0,
  onResolver,
  onPropuesta,
}: {
  fecha: string;
  /** Punto de partida por defecto. Es un dato de la empresa, así que lo baja la
   *  página desde la base y lo pasa acá. */
  direccionEmpresa: string | null;
  regenerar?: boolean;
  /** Pedidos con ⚠ sin resolver: antes de armar se pregunta (dueño, 2026-11-09:
   *  un solo «Armar la ruta» y una confirmación, en vez de dos botones). */
  conProblema?: number;
  /** «Resolver primero» en esa confirmación: abre el primer pedido con ⚠. */
  onResolver?: () => void;
  onPropuesta: (propuesta: PropuestaRuta) => void;
}) {
  // Desde DONDE arranca la ruta. Por defecto, desde la central de carga de
  // Starken, donde se cargan los paquetes (el dueño, terreno 2026-10-28). Sin
  // dirección de la empresa configurada, desde donde está parado el conductor.
  const [opcion, setOpcion] = useState<Opcion>(direccionEmpresa ? "empresa" : "gps");
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
  const [preguntando, setPreguntando] = useState(false);
  const [obteniendoUbicacion, setObteniendoUbicacion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function disparar(puntoInicio: PuntoInicio) {
    setError(null);
    setArmando(true);
    try {
      await esperarDibujo();
      // Partiendo de otro lado, la ruta termina igual en la central (terreno
      // 2026-10-29: repasar lo pendiente y volver).
      const fin = puntoInicio.tipo === "empresa" ? undefined : ({ tipo: "empresa", direccion: direccionEmpresa } as const);
      onPropuesta(await calcularRutaLocal(fecha, puntoInicio, fin));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo armar la ruta.");
    } finally {
      setArmando(false);
    }
  }

  // Acá había una generación automática al abrir la pantalla sin ruta, que
  // armaba siempre desde la dirección de la empresa. Se fue: una ruta que se
  // calcula sola no puede pedir permiso de GPS sin que nadie lo haya pedido (si
  // se elige "Mi ubicación"), y el conductor la arma cuando sale. El botón de
  // armar está a la vista en la cabecera de la hoja, que es un toque — salvo
  // mientras se carga un pedido, que ahí la cabecera pasa a ser el contador de
  // pendientes (ver cabecera-sin-parada.tsx).

  function onClick() {
    setError(null);
    if (conProblema > 0 && !preguntando) {
      setPreguntando(true);
      return;
    }
    setPreguntando(false);

    if (opcion === "gps") {
      const fuente = fuenteUbicacion();
      if (!fuente) {
        setError("Este dispositivo no puede obtener tu ubicación.");
        return;
      }
      setObteniendoUbicacion(true);
      fuente.getCurrentPosition(
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

  // Con ⚠ sin resolver: en el mismo lugar del botón, donde está el dedo (y sin una
  // ventana encima que el «atrás» de Android no sabría cerrar).
  if (preguntando) {
    return (
      <div className="space-y-2 rounded-2xl bg-warn-bg p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-warn">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {conProblema === 1 ? "1 pedido en precaución" : `${conProblema} pedidos en precaución`}
        </p>
        <button type="button" onClick={onClick} className={BOTON_PRINCIPAL}>
          Armar igual
        </button>
        <button
          type="button"
          onClick={() => {
            setPreguntando(false);
            onResolver?.();
          }}
          className="flex h-11 w-full items-center justify-center text-sm font-semibold text-brand"
        >
          Resolver primero
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {armando ? <BuscandoRuta /> : null}
      <Button onClick={onClick} disabled={ocupado} className="w-full justify-center">
        <RefreshCw className={cn("h-4 w-4", ocupado && "animate-spin")} />
        {obteniendoUbicacion
          ? "Obteniendo ubicación…"
          : armando
            ? "Armando la ruta…"
            : regenerar
              ? "Rehacer la ruta"
              : "Armar la ruta"}
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
                    ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                    : "text-muted",
                )}
              >
                {o.corto}
              </button>
            ))}
          </div>
          {opcion === "direccion" ? (
            <DireccionInput
              etiqueta="Dirección de partida"
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
