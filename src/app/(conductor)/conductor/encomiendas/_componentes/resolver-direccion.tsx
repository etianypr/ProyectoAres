"use client";

// La dirección quedó en duda (varias coincidencias, o solo la calle): acá se
// resuelve, y no se guarda nada hasta que el conductor decida (sale de
// pedido-form-local.tsx, spec 002 T041).

import { AlertTriangle, SearchX } from "lucide-react";
import { MapaPunto } from "@/components/direccion/mapa-punto";
import { NOMBRE_FUENTE, type SugerenciaDireccion } from "@/lib/geo/geocoding";

export type PorResolver = {
  candidatos: SugerenciaDireccion[];
  advertencia: string;
};

export function ResolverDireccion({
  porResolver,
  guardando,
  onElegir,
  onGuardarSinUbicar,
}: {
  porResolver: PorResolver;
  guardando: boolean;
  onElegir: (candidato: SugerenciaDireccion) => void;
  onGuardarSinUbicar: () => void;
}) {
  return (
    <div className="rounded-xl border border-warn/30 bg-warn-bg p-3">
          <p className="flex items-start gap-1.5 text-sm font-medium text-warn">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{porResolver.advertencia}</span>
          </p>
    
          {porResolver.candidatos.length > 0 ? (
            <ul className="mt-2 grid gap-1.5">
              {porResolver.candidatos.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={guardando}
                    onClick={() => onElegir(s)}
                    className="flex w-full items-center gap-2.5 rounded-lg bg-card px-2.5 py-2 text-left transition-colors active:bg-background disabled:opacity-60"
                  >
                    {/* La estampilla de cada opción. Es lo que hace elegible
                        una lista donde dos renglones dicen exactamente lo
                        mismo: "Los Aromos 120" de la ciudad y el del valle de
                        Azapa se leen igual y están a nueve kilómetros.
    
                        Cuesta una petición a Mapbox por opción, y solo cuando
                        la dirección salió dudosa. Al lado de salir con el
                        paquete hacia el valle equivocado, no es nada. */}
                    <MapaPunto
                      lat={s.lat}
                      lng={s.lng}
                      etiqueta={s.direccion}
                      // 96 px y no menos: por debajo de eso la atribución de
                      // Mapbox —que viene dibujada en la imagen y no se
                      // puede sacar— se come un tercio de la estampilla y no
                      // queda mapa que mirar.
                      alto={96}
                      ancho={96}
                      // Más lejos que la tira de abajo del campo: acá no hay
                      // que ver la esquina sino EN QUÉ PARTE DE LA CIUDAD cae
                      // cada opción, que es lo que las distingue.
                      zoom={13}
                      className="w-24 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium leading-tight">
                        {s.direccion}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {[s.detalle, NOMBRE_FUENTE[s.fuente]].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {s.soloCalle ? (
                      <span className="mt-0.5 shrink-0 rounded-full bg-warn-bg px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                        sin número
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-warn">
              <SearchX className="h-3.5 w-3.5 shrink-0" />
              Ningún proveedor de mapas la reconoció.
            </p>
          )}
    
          <button
            type="button"
            disabled={guardando}
            onClick={onGuardarSinUbicar}
            className="mt-2 w-full rounded-lg px-3 py-2 text-sm font-medium text-warn underline decoration-warn/40 underline-offset-2 disabled:opacity-60"
          >
            Guardar sin ubicar y corregir después
          </button>
        </div>
  );
}
