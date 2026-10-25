"use client";

// Campo de dirección que OFRECE direcciones mientras se escribe, como el de
// cualquier app que pide una dirección. Sirve para dos cosas a la vez:
//
//   1. Saber ahí mismo que la dirección existe. Antes el conductor escribía
//      "Chacabuco 1234", guardaba, y recién al armar la ruta aparecía el cartel
//      "sin ubicar" — con el paquete ya en la camioneta.
//   2. Guardar las coordenadas EXACTAS de la puerta que eligió, en vez de las
//      que adivine el geocodificador después con el texto suelto.
//
// Elegir una sugerencia no es obligatorio: si el conductor escribe a mano y guarda,
// todo sigue funcionando como antes (se geocodifica el texto al guardar). Sin
// señal o sin token de Mapbox simplemente no aparecen sugerencias.
//
// ----------------------------------------------------------------------------
// CADA RENGLÓN DICE CUÁNTO CONFIAR EN ÉL
//
// La lista no es solo un menú de opciones: es la única oportunidad de ver que
// una coincidencia es mala ANTES de salir con el paquete. Por eso cada renglón
// muestra de dónde salió, si el número coincide y qué precisión tiene:
//
//   sin número   es la calle, no la puerta: la parada queda a mitad de cuadra.
//   otro número  el proveedor encontró la calle pero NO ese número, y devolvió
//                otro. Es el caso más peligroso de todos, porque el renglón se
//                ve perfectamente normal: dice la calle correcta y un número.
//   poco preciso el resultado es un barrio o una ciudad, no un domicilio.
//   OSM/Mapbox   de qué proveedor salió. Sirve para comprobar que una corrección
//                hecha en OpenStreetMap ya está llegando a la app (Mapbox tarda
//                lo suyo en incorporarlas, ver lib/geo/geocoding).
//
// Ninguna de esas marcas bloquea nada. El conductor conoce Arica mejor que los dos
// proveedores juntos; lo que no puede es no enterarse.
//
// ----------------------------------------------------------------------------
// EL NÚMERO SE BUSCA EN LA CALLE, AUNQUE EL NOMBRE VENGA A MEDIAS
//
// En la boleta dice "Linderos 3536" y la calle se llama "Avenida Linderos
// Poniente". Los proveedores contestan la calle sin número y el 3536 se pierde.
// Por eso hay una TERCERA búsqueda, después de las otras dos: si lo que se
// escribió aparece entero —palabra por palabra— en el nombre de una calle,
// el número se va a buscar ahí (ver completarNumeroEnCalles en lib/geo/geocoding).
//
// Lo que cambia en la lista: la puerta encontrada aparece arriba con su nombre
// completo, y las calles que NO tienen ese número desaparecen. Si el número
// existe en dos calles que se llaman igual (Linderos Poniente y Linderos
// Oriente son dos avenidas), salen las dos y elige el conductor.
//
// ----------------------------------------------------------------------------
// Y UNA VEZ ELEGIDA, SE VE EN EL MAPA
//
// Con la dirección ya elegida aparece debajo una estampilla del mapa con el
// punto (ver mapa-punto.tsx). Es el último control antes de guardar, y el único
// que no se puede hacer leyendo: dos direcciones distintas pueden escribirse
// casi igual, pero se ven en esquinas distintas. Un texto correcto con el punto
// puesto a tres cuadras se ve — y ahí mismo se corrige.
//
// El mapa aparece SOLO cuando hay coordenadas. Una dirección que el conductor dio
// por buena a mano no tiene punto, y no se le dibuja ninguno: inventarle un mapa
// a lo que nadie pudo ubicar sería exactamente la mentira que el aviso de "sin
// ubicar" está tratando de evitar.
//
// Pero el ESPACIO se puede reservar desde el principio (prop reservarMapa): un
// hueco del mismo tamaño, con su icono, que dice qué falta. Así la imagen no
// aparece de golpe corriendo de lugar el botón de guardar, y de paso ese hueco
// dice lo que antes había que escribir debajo del campo — "así queda ubicada en
// el mapa" antes, "ubicada en el mapa" después—, que con el mapa a la vista era
// repetir en palabras lo que ya se estaba viendo.

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, MapPin, SearchX } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { inputClass } from "@/components/ui/input";
import { MapaPunto, MapaPuntoVacio } from "./mapa-punto";
import {
  aplicarPuertas,
  combinarSugerencias,
  completarNumeroEnCalles,
  NOMBRE_FUENTE,
  sugerirDirecciones,
  sugerirEnOsm,
  type PuertasEnCalles,
  type SugerenciaDireccion,
} from "@/lib/geo/geocoding";
import type { Coordenada } from "@/lib/geo/coordenada";

// Lo que se espera desde la última tecla antes de consultar. Escribiendo una
// dirección entera, esto son unas pocas consultas en vez de una por letra.
const MS_ESPERA_TECLEO = 300;

// A OpenStreetMap se le pregunta con más pausa: no completa palabras a medias
// (escribir "chacab" no le devuelve nada), así que solo aporta cuando el conductor
// terminó de escribir, y su política de uso pide no consultarlo seguido.
const MS_ESPERA_OSM = 800;

// Y el número colgado se busca al final, cuando el conductor ya paró de escribir:
// cada intento son una o dos consultas más (ver completarNumeroEnCalles), y
// tecleando "3536" dígito a dígito serían cuatro intentos por un solo número.
// Con esta espera, escribir seguido no cuesta nada.
const MS_ESPERA_NUMERO = 500;

const MIN_CARACTERES = 3;

// El clic en una sugerencia llega DESPUÉS del blur del campo. Si la lista se
// cerrara en el blur, el toque caería en el vacío y no elegiría nada.
const MS_CIERRE_TRAS_BLUR = 150;

/** Las marcas que le corresponden a una sugerencia, de la más grave a la menos.
 *
 *  Se calculan acá y no dentro del JSX para que el orden sea explícito: si un
 *  resultado tiene dos problemas, el conductor tiene que leer primero el que lo
 *  manda a otra cuadra. */
function marcasDe(s: SugerenciaDireccion): { texto: string; grave: boolean }[] {
  const marcas: { texto: string; grave: boolean }[] = [];

  // El más peligroso primero: el renglón se ve normal —calle correcta, un número
  // ahí puesto— y sin embargo ese número no existe en esa calle.
  if (s.coincideNumero === false) marcas.push({ texto: "otro número", grave: true });
  if (s.soloCalle) marcas.push({ texto: "sin número", grave: false });
  if (s.confianza === "baja") marcas.push({ texto: "poco preciso", grave: false });

  return marcas;
}

export function DireccionInput({
  value,
  onChange,
  onSeleccionar,
  /** Se muestra cuando el texto actual corresponde a una sugerencia elegida:
   *  es la señal de "esta dirección está confirmada en el mapa". */
  confirmada = false,
  /** Si se pasa, cuando ninguna búsqueda encuentra la dirección aparece la
   *  opción de darla por buena tal como está escrita.
   *
   *  Existe para que quedarse con el texto a mano sea una DECISIÓN y no lo que
   *  pasa por defecto cuando nadie eligió nada. La diferencia importa: un pedido
   *  que nadie confirmó tiene que llegar advertido a la ruta. */
  onConfirmarManual,
  /** Coordenadas que el PADRE ya conoce para el texto que hay escrito ahora: un
   *  pedido que se está editando, o el candidato que se eligió de la lista de
   *  dudas. El campo no puede saberlas por su cuenta —nadie eligió nada en esta
   *  pantalla— y sin esto la vista previa no aparecería al abrir un pedido
   *  guardado.
   *
   *  El padre es el responsable de pasar null cuando el texto ya no corresponde
   *  a esas coordenadas; si no, se dibujaría el punto de la dirección anterior. */
  punto,
  /** Reserva el espacio del mapa aunque todavía no haya punto (ver
   *  MapaPuntoVacio). Con esto, elegir una dirección no empuja hacia abajo lo
   *  que viene después del campo: la imagen aparece dentro de un hueco que ya
   *  estaba ahí.
   *
   *  Va por prop y no siempre porque no en todas las pantallas sobra ese espacio:
   *  en el panel de la empresa el campo vive en una rejilla de dos columnas, y en
   *  el punto de partida de la ruta, dentro de la cabecera de la hoja. */
  reservarMapa = false,
  id,
  name,
  placeholder = "Calle y número",
  disabled,
  className,
}: {
  value: string;
  onChange: (texto: string) => void;
  /** El elegido trae lat/lng: guardarlas evita geocodificar de nuevo y apunta
   *  la ruta a la puerta que el conductor vio en la lista. */
  onSeleccionar?: (sugerencia: SugerenciaDireccion) => void;
  confirmada?: boolean;
  onConfirmarManual?: (texto: string) => void;
  punto?: Coordenada | null;
  reservarMapa?: boolean;
  id?: string;
  /** Para formularios que se envían con FormData (ver empresa-form). */
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [sugerencias, setSugerencias] = useState<SugerenciaDireccion[]>([]);
  // Las de OpenStreetMap llegan medio segundo después que las de Mapbox, así que
  // se guardan junto AL TEXTO que las pidió: mientras el conductor sigue
  // escribiendo, las de la palabra anterior no se muestran debajo de las nuevas.
  const [extras, setExtras] = useState<{ para: string; items: SugerenciaDireccion[] }>({
    para: "",
    items: [],
  });
  // Lo que salió de buscar el número escrito en las calles que se llaman como lo
  // escrito ("Linderos 3536" → "Avenida Linderos Poniente 3536"). Guardado con
  // SU texto, igual que las de OSM: llega el último de los tres y no puede
  // aparecer debajo de una dirección que ya no es la que se está escribiendo.
  const [puertas, setPuertas] = useState<{ para: string; res: PuertasEnCalles }>({
    para: "",
    res: { puertas: [], sinEseNumero: [] },
  });
  const [buscando, setBuscando] = useState(false);
  // Texto de la última consulta que YA respondió. Sin esto, "no encontramos esa
  // dirección" aparecía en el medio segundo entre la tecla y la consulta, cuando
  // todavía no se había buscado nada.
  const [consultado, setConsultado] = useState<string | null>(null);
  const [abierta, setAbierta] = useState(false);
  const [resaltada, setResaltada] = useState(-1);
  // La última sugerencia elegida en ESTA pantalla: mientras el campo diga
  // exactamente su texto, no hay nada que sugerir (ya eligió) y no se gasta una
  // consulta. Se guarda con su punto —no solo el texto— porque es lo que dibuja
  // la vista previa sin que el padre tenga que enterarse de nada.
  //
  // "punto: null" es el caso de la dirección que el conductor dio por buena a mano:
  // eligió, pero no hay coordenadas que mostrar.
  const [elegido, setElegido] = useState<{ texto: string; punto: Coordenada | null } | null>(
    null,
  );
  const textoElegido = elegido?.texto ?? null;
  const cierreRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);

  const consulta = value.trim();
  const buscable = consulta.length >= MIN_CARACTERES && consulta !== textoElegido;

  // Nada que buscar (campo cerrado, texto corto, o ya eligió una): la lista
  // guardada no se borra, simplemente no se muestra. Eso deja lo que se ve
  // derivado del estado en vez de andar limpiándolo desde los efectos.
  const deOsm = extras.para === consulta ? extras.items : [];
  const base = combinarSugerencias(sugerencias, deOsm);
  const dePuertas = puertas.para === consulta ? puertas.res : null;
  // Las puertas encontradas van arriba y, si alguna apareció, las calles que no
  // tienen ese número salen de la lista (ver aplicarPuertas).
  const lista = abierta && buscable ? (dePuertas ? aplicarPuertas(base, dePuertas) : base) : [];

  useEffect(() => {
    if (!abierta || !buscable) return;

    const control = new AbortController();
    const espera = setTimeout(() => {
      setBuscando(true);
      void sugerirDirecciones(consulta, control.signal).then((res) => {
        // La consulta quedó vieja: el conductor siguió escribiendo y ya hay otra en
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

  // Tercera etapa: el número que quedó colgando de un nombre de calle a medias.
  // Escribir "Linderos 3536" devuelve la CALLE sin número —la calle se llama
  // "Avenida Linderos Poniente"— y el 3536 se pierde; esto lo va a buscar ahí.
  //
  // Depende de lo que trajeron las otras dos y por eso va después de las dos: el
  // nombre oficial de la calle lo suele tener OpenStreetMap y el número de casa
  // solo lo tiene Mapbox (ver la cabecera de lib/geo/geocoding), así que no puede
  // vivir adentro de ninguna de las dos búsquedas.
  //
  // La lista se rearma DENTRO del efecto y no se toma la de arriba: la de arriba
  // es un array nuevo en cada dibujado, y como dependencia haría que esto se
  // dispare para siempre.
  useEffect(() => {
    if (!abierta || !buscable) return;
    const candidatos = combinarSugerencias(
      sugerencias,
      extras.para === consulta ? extras.items : [],
    );
    if (candidatos.length === 0) return;

    const control = new AbortController();
    const espera = setTimeout(() => {
      void completarNumeroEnCalles(consulta, candidatos, control.signal).then((res) => {
        if (control.signal.aborted) return;
        // Sin nada que agregar ni nada que sacar, no se toca el estado: un
        // setState acá volvería a disparar este mismo efecto.
        if (res.puertas.length === 0 && res.sinEseNumero.length === 0) return;
        setPuertas({ para: consulta, res });
        setResaltada(-1);
      });
    }, MS_ESPERA_NUMERO);

    return () => {
      clearTimeout(espera);
      control.abort();
    };
  }, [consulta, buscable, abierta, sugerencias, extras]);

  useEffect(() => () => {
    if (cierreRef.current) clearTimeout(cierreRef.current);
  }, []);

  // El formulario del conductor vive dentro de una hoja que se desplaza, así que el
  // campo puede quedar en la mitad de abajo y la lista dibujarse fuera de lo que
  // se ve — parecería que no hay sugerencias. "nearest" no mueve nada si ya está
  // a la vista.
  useEffect(() => {
    if (lista.length === 0) return;
    listaRef.current?.scrollIntoView({ block: "nearest" });
  }, [lista.length]);

  function elegir(s: SugerenciaDireccion) {
    setElegido({ texto: s.direccion, punto: { lat: s.lat, lng: s.lng } });
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
  // (el conductor eligió una, o salió del campo), "buscando" se queda en true y no
  // hay respuesta que lo baje.
  const buscandoAhora = buscando && abierta && buscable;
  const sinResultados = buscable && !buscandoAhora && consultado === consulta && lista.length === 0;
  const mostrarLista = abierta && (lista.length > 0 || buscandoAhora || sinResultados);

  // El punto que se dibuja debajo. Lo que se eligió ACÁ manda sobre lo que trae
  // el padre: es lo más nuevo de los dos, y su "punto: null" (la dirección dada
  // por buena a mano) tiene que poder tapar unas coordenadas viejas.
  const puntoPreview: Coordenada | null =
    elegido && elegido.texto === consulta ? elegido.punto : consulta ? punto ?? null : null;

  // La dirección que el conductor dio por buena a mano sabiendo que no se pudo
  // ubicar. No es "todavía no eligió": eligió, y lo que eligió no tiene punto.
  const sinUbicarAMano = elegido != null && elegido.texto === consulta && elegido.punto === null;

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

        {/* La lista cuelga del contenedor DEL CAMPO y no del componente entero:
            su "top-full" tiene que caer justo debajo del input. Colgada del de
            afuera, la vista previa que ahora se dibuja abajo la empujaba lejos
            del campo, con un hueco de mapa en el medio. */}
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
                      {/* De qué proveedor salió, SIEMPRE y no solo en OSM: saber
                          que una dirección la resolvió Mapbox y la otra
                          OpenStreetMap es lo que explica por qué una trae número y
                          la otra no. El nombre sale de NOMBRE_FUENTE y no de un
                          ternario acá: el `else` etiquetaba como "Mapbox" todo lo
                          que no fuera OSM. */}
                      <span className="shrink-0 rounded bg-background px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {NOMBRE_FUENTE[s.fuente]}
                      </span>
                    </span>
                  </span>
                  {/* Las marcas de calidad. Van a la derecha, donde el pulgar no
                      las tapa al recorrer la lista. */}
                  {marcasDe(s).map((m) => (
                    <span
                      key={m.texto}
                      className={cn(
                        "mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        m.grave ? "bg-danger-bg text-danger" : "bg-warn-bg text-warn",
                      )}
                    >
                      {m.texto}
                    </span>
                  ))}
                </button>
              </li>
            ))}
  
            {buscandoAhora && lista.length === 0 ? (
              <li className="px-3 py-2.5 text-xs text-muted">Buscando direcciones…</li>
            ) : null}
  
            {sinResultados ? (
              <li>
                <p className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted">
                  <SearchX className="h-3.5 w-3.5 shrink-0" />
                  No encontramos esa dirección.
                </p>
                {onConfirmarManual ? (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onConfirmarManual(consulta);
                      setElegido({ texto: consulta, punto: null });
                      setAbierta(false);
                      inputRef.current?.blur();
                    }}
                    className="flex w-full items-start gap-2 border-t border-separator px-3 py-2.5 text-left transition-colors active:bg-background"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium leading-tight">
                        Usar &laquo;{consulta}&raquo; tal como está
                      </span>
                      {/* Antes decía "hay que marcar el punto a mano" y ese
                          flujo no existía en ninguna parte: era una promesa que
                          la pantalla no podía cumplir. Ahora hay dos caminos y
                          los dos están a un toque, así que se nombran. */}
                      <span className="block text-xs text-muted">
                        Queda sin ubicar. Para ubicarla: &laquo;Estoy en la puerta&raquo;, o pega
                        su Plus Code acá.
                      </span>
                    </span>
                  </button>
                ) : (
                  <p className="px-3 pb-2.5 text-xs text-muted">
                    Puedes guardarla igual y corregirla después.
                  </p>
                )}
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      {/* Dónde quedó el punto. Con el mapa dibujado el conductor no tiene que
          confiar en que el texto es el correcto: lo ve.

          Y cuando no hay punto, el hueco del mismo tamaño si se pidió
          reservarlo. Los dos renglones de abajo dicen lo que antes se escribía
          debajo del campo —"así queda ubicada en el mapa", "ubicada en el
          mapa"—: con la imagen a la vista eso era repetir en palabras lo que ya
          se veía, y sin ella era un cartel suelto que se leía peor que un hueco
          con su icono. */}
      {puntoPreview ? (
        <MapaPunto
          lat={puntoPreview.lat}
          lng={puntoPreview.lng}
          etiqueta={consulta}
          className="mt-2"
          // Sirve para las tres pantallas que usan este campo, y en dos de
          // ellas la dirección es de donde SALE la ruta, no a donde llega: por
          // eso dice "el punto" y no "la parada".
          pie="Ese es el punto que va a usar la ruta. Si no es esa esquina, corrige la dirección."
        />
      ) : reservarMapa ? (
        <MapaPuntoVacio
          className="mt-2"
          tono={sinUbicarAMano ? "aviso" : "neutro"}
          pie={
            sinUbicarAMano
              ? "Sin ubicar en el mapa: no entra en la ruta hasta que corrijas la dirección."
              : "Elige una dirección de la lista y vas a ver acá en qué esquina queda."
          }
        />
      ) : null}
    </div>
  );
}
