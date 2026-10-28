"use client";

// Campo de dirección que OFRECE direcciones mientras se escribe: así se sabe ahí
// mismo que existe, y se guardan las coordenadas de la puerta elegida en vez de
// las que adivine después el geocodificador. Elegir no es obligatorio: sin señal
// o sin token no aparecen sugerencias y se geocodifica el texto al guardar.
//
// - Cada renglón dice cuánto confiar en él: de qué proveedor salió y si es "otro
//   número" (el más peligroso: se ve normal y no es esa puerta), "sin número" o
//   "poco preciso" (ver lista-sugerencias.tsx). Ninguna marca bloquea nada.
// - El número se busca en la calle aunque el nombre venga a medias ("Linderos
//   3536" → "Avenida Linderos Poniente 3536", ver completarNumeroEnCalles).
// - Elegida, se ve en el mapa (mapa-punto.tsx), solo si hay coordenadas; el
//   espacio se puede reservar desde el principio (prop reservarMapa).

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { inputClass } from "@/components/ui/input";
import { MapaPunto, MapaPuntoVacio } from "./mapa-punto";
import { ListaSugerencias } from "./lista-sugerencias";
import { aplicarPuertas, combinarSugerencias, completarNumeroEnCalles, sugerirDirecciones, sugerirEnOsm, type PuertasEnCalles, type SugerenciaDireccion } from "@/lib/geo/geocoding";
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
          <ListaSugerencias
            listaRef={listaRef}
            id={id ? `${id}_sugerencias` : undefined}
            lista={lista}
            resaltada={resaltada}
            onResaltar={setResaltada}
            onElegir={elegir}
            buscando={buscandoAhora}
            sinResultados={sinResultados}
            consulta={consulta}
            onUsarTalCual={
              onConfirmarManual
                ? () => {
                    onConfirmarManual(consulta);
                    setElegido({ texto: consulta, punto: null });
                    setAbierta(false);
                    inputRef.current?.blur();
                  }
                : null
            }
          />
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
