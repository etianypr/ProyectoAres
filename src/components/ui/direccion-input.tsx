"use client";

// Campo de dirección que OFRECE direcciones mientras se escribe, como el de
// cualquier app que pide una dirección. Sirve para dos cosas a la vez:
//
//   1. Saber ahí mismo que la dirección existe. Antes el chofer escribía
//      "Chacabuco 1234", guardaba, y recién al armar la ruta aparecía el cartel
//      "sin ubicar" — con el paquete ya en la camioneta.
//   2. Guardar las coordenadas EXACTAS de la puerta que eligió, en vez de las
//      que adivine el geocodificador después con el texto suelto.
//
// Elegir una sugerencia no es obligatorio: si el chofer escribe a mano y guarda,
// todo sigue funcionando como antes (se geocodifica el texto al guardar). Sin
// señal o sin token de Mapbox simplemente no aparecen sugerencias.

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, MapPin, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputClass } from "./input";
import {
  combinarSugerencias,
  sugerirDirecciones,
  sugerirEnOsm,
  type SugerenciaDireccion,
} from "@/lib/geocoding";

// Lo que se espera desde la última tecla antes de consultar. Escribiendo una
// dirección entera, esto son unas pocas consultas en vez de una por letra.
const MS_ESPERA_TECLEO = 300;

// A OpenStreetMap se le pregunta con más pausa: no completa palabras a medias
// (escribir "chacab" no le devuelve nada), así que solo aporta cuando el chofer
// terminó de escribir, y su política de uso pide no consultarlo seguido.
const MS_ESPERA_OSM = 800;

const MIN_CARACTERES = 3;

// El clic en una sugerencia llega DESPUÉS del blur del campo. Si la lista se
// cerrara en el blur, el toque caería en el vacío y no elegiría nada.
const MS_CIERRE_TRAS_BLUR = 150;

export function DireccionInput({
  value,
  onChange,
  onSeleccionar,
  /** Se muestra cuando el texto actual corresponde a una sugerencia elegida:
   *  es la señal de "esta dirección está confirmada en el mapa". */
  confirmada = false,
  id,
  name,
  placeholder = "Calle y número",
  disabled,
  className,
}: {
  value: string;
  onChange: (texto: string) => void;
  /** El elegido trae lat/lng: guardarlas evita geocodificar de nuevo y apunta
   *  la ruta a la puerta que el chofer vio en la lista. */
  onSeleccionar?: (sugerencia: SugerenciaDireccion) => void;
  confirmada?: boolean;
  id?: string;
  /** Para formularios que se envían con FormData (ver empresa-form). */
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [sugerencias, setSugerencias] = useState<SugerenciaDireccion[]>([]);
  // Las de OpenStreetMap llegan medio segundo después que las de Mapbox, así que
  // se guardan junto AL TEXTO que las pidió: mientras el chofer sigue
  // escribiendo, las de la palabra anterior no se muestran debajo de las nuevas.
  const [extras, setExtras] = useState<{ para: string; items: SugerenciaDireccion[] }>({
    para: "",
    items: [],
  });
  const [buscando, setBuscando] = useState(false);
  // Texto de la última consulta que YA respondió. Sin esto, "no encontramos esa
  // dirección" aparecía en el medio segundo entre la tecla y la consulta, cuando
  // todavía no se había buscado nada.
  const [consultado, setConsultado] = useState<string | null>(null);
  const [abierta, setAbierta] = useState(false);
  const [resaltada, setResaltada] = useState(-1);
  // Texto de la última sugerencia elegida: mientras el campo diga exactamente
  // eso, no hay nada que sugerir (ya eligió) y no se gasta una consulta.
  const [textoElegido, setTextoElegido] = useState<string | null>(null);
  const cierreRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);

  const consulta = value.trim();
  const buscable = consulta.length >= MIN_CARACTERES && consulta !== textoElegido;

  // Nada que buscar (campo cerrado, texto corto, o ya eligió una): la lista
  // guardada no se borra, simplemente no se muestra. Eso deja lo que se ve
  // derivado del estado en vez de andar limpiándolo desde los efectos.
  const deOsm = extras.para === consulta ? extras.items : [];
  const lista = abierta && buscable ? combinarSugerencias(sugerencias, deOsm) : [];

  useEffect(() => {
    if (!abierta || !buscable) return;

    const control = new AbortController();
    const espera = setTimeout(() => {
      setBuscando(true);
      void sugerirDirecciones(consulta, control.signal).then((res) => {
        // La consulta quedó vieja: el chofer siguió escribiendo y ya hay otra en
        // camino. Pisar la lista con esta respuesta la haría parpadear.
        if (control.signal.aborted) return;
        setSugerencias(res);
        setConsultado(consulta);
        setResaltada(-1);
        setBuscando(false);
      });
    }, MS_ESPERA_TECLEO);

    return () => {
      clearTimeout(espera);
      control.abort();
    };
  }, [consulta, buscable, abierta]);

  // OpenStreetMap, aparte y después: lo que traiga se agrega debajo de lo de
  // Mapbox. Va en su propio efecto para que la lista principal aparezca a los
  // 300 ms sin esperar al proveedor más lento.
  useEffect(() => {
    if (!abierta || !buscable) return;

    const control = new AbortController();
    const espera = setTimeout(() => {
      void sugerirEnOsm(consulta, control.signal).then((res) => {
        if (control.signal.aborted) return;
        setExtras({ para: consulta, items: res });
      });
    }, MS_ESPERA_OSM);

    return () => {
      clearTimeout(espera);
      control.abort();
    };
  }, [consulta, buscable, abierta]);

  useEffect(() => () => {
    if (cierreRef.current) clearTimeout(cierreRef.current);
  }, []);

  // El formulario del chofer vive dentro de una hoja que se desplaza, así que el
  // campo puede quedar en la mitad de abajo y la lista dibujarse fuera de lo que
  // se ve — parecería que no hay sugerencias. "nearest" no mueve nada si ya está
  // a la vista.
  useEffect(() => {
    if (lista.length === 0) return;
    listaRef.current?.scrollIntoView({ block: "nearest" });
  }, [lista.length]);

  function elegir(s: SugerenciaDireccion) {
    setTextoElegido(s.direccion);
    onChange(s.direccion);
    onSeleccionar?.(s);
    setAbierta(false);
    // Cierra el teclado del teléfono: ya no hay nada que escribir en el campo.
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (lista.length === 0) return;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = lista.length;
      // Empieza en -1 (nada resaltado): la primera flecha abajo lleva al primero
      // y la primera flecha arriba, al último.
      setResaltada((i) =>
        e.key === "ArrowDown" ? (i >= n - 1 ? 0 : i + 1) : i <= 0 ? n - 1 : i - 1,
      );
      return;
    }
    if (e.key === "Enter") {
      // Sin nada resaltado, Enter toma la primera: es lo que espera cualquiera
      // que escribió la dirección completa y ve su coincidencia arriba.
      const elegida = lista[resaltada] ?? lista[0];
      if (elegida) {
        e.preventDefault();
        elegir(elegida);
      }
      return;
    }
    if (e.key === "Escape") {
      setAbierta(false);
    }
  }

  // El spinner también se deriva: si la consulta se canceló a mitad de camino
  // (el chofer eligió una, o salió del campo), "buscando" se queda en true y no
  // hay respuesta que lo baje.
  const buscandoAhora = buscando && abierta && buscable;
  const sinResultados = buscable && !buscandoAhora && consultado === consulta && lista.length === 0;
  const mostrarLista = abierta && (lista.length > 0 || buscandoAhora || sinResultados);

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          name={name}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={mostrarLista}
          aria-autocomplete="list"
          aria-controls={id ? `${id}_sugerencias` : undefined}
          className={cn(inputClass, (confirmada || buscandoAhora) && "pr-9")}
          onChange={(e) => {
            onChange(e.target.value);
            setAbierta(true);
          }}
          onFocus={() => {
            if (cierreRef.current) clearTimeout(cierreRef.current);
            setAbierta(true);
          }}
          onBlur={() => {
            cierreRef.current = setTimeout(() => setAbierta(false), MS_CIERRE_TRAS_BLUR);
          }}
          onKeyDown={onKeyDown}
        />
        {buscandoAhora ? (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />
        ) : confirmada ? (
          <Check className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ok" />
        ) : null}
      </div>

      {mostrarLista ? (
        <ul
          ref={listaRef}
          id={id ? `${id}_sugerencias` : undefined}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto overflow-x-hidden rounded-xl border border-separator bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.14)]"
        >
          {lista.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === resaltada}>
              <button
                type="button"
                // El blur del campo llega antes que el clic: con el mouse esto
                // evita que el campo lo pierda; en el teléfono lo cubre la
                // espera de MS_CIERRE_TRAS_BLUR.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(s)}
                onMouseEnter={() => setResaltada(i)}
                className={cn(
                  "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors",
                  i === resaltada ? "bg-brand-soft" : "bg-white",
                )}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium leading-tight">
                    {s.direccion}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    {s.detalle ? <span className="min-w-0 truncate">{s.detalle}</span> : null}
                    {/* Marca de dónde salió: es lo que permite comprobar de un
                        vistazo que una corrección hecha en OpenStreetMap ya
                        está llegando a la app (ver lib/geocoding.ts). */}
                    {s.fuente === "osm" ? (
                      <span className="shrink-0 rounded bg-background px-1 text-[10px] font-semibold tracking-wide text-muted">
                        OSM
                      </span>
                    ) : null}
                  </span>
                </span>
                {/* Una calle sin número deja la parada a mitad de cuadra: mejor
                    decirlo en la lista que descubrirlo manejando. */}
                {s.soloCalle ? (
                  <span className="mt-0.5 shrink-0 rounded-full bg-warn-bg px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                    sin número
                  </span>
                ) : null}
              </button>
            </li>
          ))}

          {buscandoAhora && lista.length === 0 ? (
            <li className="px-3 py-2.5 text-xs text-muted">Buscando direcciones…</li>
          ) : null}

          {sinResultados ? (
            <li className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted">
              <SearchX className="h-3.5 w-3.5 shrink-0" />
              No encontramos esa dirección. Puedes guardarla igual y corregirla después.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
