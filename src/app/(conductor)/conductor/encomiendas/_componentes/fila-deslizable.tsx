"use client";

// ----------------------------------------------------------------------------
// Una fila de lista que se desliza hacia la izquierda para eliminarla
// ----------------------------------------------------------------------------
//
// El gesto de las listas de reproducción: se arrastra la fila hacia la izquierda
// y aparece el rojo abajo. Soltando a medio camino la fila se queda abierta con
// el botón esperando el toque; soltando pasada la mitad de su ancho, se va sola.
//
// Los dos caminos existen a propósito y no son lo mismo:
//
//  - ABRIR Y TOCAR es el camino normal. La palabra "Eliminar" queda a la vista y
//    lo que decide es un toque, no un arrastre. Es lo que hace que esto sea
//    usable manejando: el gesto no puede terminar en un borrado sin que hubiera
//    algo que leer.
//  - EL ARRASTRE LARGO es el atajo, para el que ya lo sabe. Pide más de la mitad
//    del ancho de la fila, así que no se llega ahí desplazando la lista.
//
// La resistencia que aparece después de que el panel se abrió (ver
// desplazamiento) es lo que avisa, con el dedo todavía apoyado, que se entró en
// la zona donde soltar borra.
//
// Nada de esto es definitivo: eliminar deja un aviso con "Deshacer" a la vista
// (ver PedidoEliminado en el almacén). Es lo que permite que el atajo exista sin
// que un roce cueste una dirección escrita a mano.

import { useCallback, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { ANCHO_ACCION, alSoltar, decidirEje, desplazamiento, type EjeGesto } from "@/lib/comun/deslizar";

/** Cuánto tarda la fila en irse y en cerrarse el hueco que deja. Corto: es una
 *  confirmación, no una animación. */
const MS_SALIDA = 200;

/** Qué está haciendo la fila. */
type Fase = "quieta" | "arrastrando";

export function FilaDeslizable({
  children,
  onEliminar,
  etiqueta,
  separador = false,
  className,
  habilitado = true,
}: {
  children: React.ReactNode;
  /** Se llama UNA vez, cuando la fila ya salió de la pantalla. Lo que sigue
   *  —eliminar de verdad y ofrecer deshacerlo— es de quien la dibuja. */
  onEliminar: () => void;
  /** Qué se elimina. Va al aria-label del botón: "Eliminar" solo, repetido en
   *  cada fila, no le dice nada a un lector de pantalla. */
  etiqueta: string;
  /** Dibuja la línea que la separa de la fila de arriba. */
  separador?: boolean;
  /** Clases de la capa que se mueve. Tiene que traer su propio fondo OPACO: es
   *  lo único que tapa el rojo de atrás mientras la fila está en su lugar. */
  className?: string;
  /** false deja la fila quieta, sin gesto ni botón. */
  habilitado?: boolean;
}) {
  const [x, setX] = useState(0);
  const [fase, setFase] = useState<Fase>("quieta");
  // Abierta = quieta en ANCHO_ACCION, mostrando el botón. Es estado propio y no
  // "x === ANCHO_ACCION" porque de x manda el dedo mientras se arrastra.
  const [abierta, setAbierta] = useState(false);
  // Medidas tomadas justo antes de irse: el ancho dice hasta dónde deslizarla y
  // el alto, desde qué número cerrar el hueco. Van a estado y no se leen del
  // nodo al dibujar, que devolvería lo de la pasada anterior.
  const [salida, setSalida] = useState<{ alto: number; ancho: number } | null>(null);
  // El hueco ya empezó a cerrarse. Es un segundo estado y no el mismo porque el
  // navegador no interpola desde un alto "auto": hay que dibujar una vez con el
  // alto medido y recién en el cuadro siguiente pedirle cero. Puesto todo junto,
  // la fila desaparece de golpe y la lista salta.
  const [colapsado, setColapsado] = useState(false);

  const contenedorRef = useRef<HTMLDivElement>(null);
  // El mismo valor que `x`, en un ref. Al soltar hay que decidir con lo ÚLTIMO
  // que hizo el dedo, y en un envión rápido el movimiento y el soltar caen en la
  // misma pasada de React: el `x` que ve el manejador es todavía el anterior, y
  // un arrastre largo se quedaría en "abrir" en vez de eliminar.
  const xRef = useRef(0);
  const inicioRef = useRef({ x: 0, y: 0 });
  const desdeRef = useRef(0);
  const ejeRef = useRef<EjeGesto>("sin-decidir");
  const activoRef = useRef(false);
  // Hubo arrastre horizontal en este gesto: el click que el navegador dispara
  // al soltar no es un toque en la fila y no tiene que hacer nada.
  const arrastroRef = useRef(false);

  const mover = useCallback((px: number) => {
    xRef.current = px;
    setX(px);
  }, []);

  const cerrar = useCallback(() => {
    setAbierta(false);
    mover(0);
  }, [mover]);

  const eliminar = useCallback(() => {
    const el = contenedorRef.current;
    if (!el || salida) return;
    setSalida({ alto: el.offsetHeight, ancho: el.offsetWidth });
    xRef.current = 0;
    setAbierta(false);
    setFase("quieta");
    requestAnimationFrame(() => requestAnimationFrame(() => setColapsado(true)));
    // Por temporizador y no por transitionend: la fila se va con dos
    // transiciones a la vez (la traslación y el alto) y el evento de la que
    // termine primero cortaría la otra a mitad de camino. Con la app en segundo
    // plano el navegador tampoco garantiza el evento, y la fila quedaría colgada
    // sin que nadie la elimine.
    window.setTimeout(onEliminar, MS_SALIDA);
  }, [onEliminar, salida]);

  function onPointerDown(e: React.PointerEvent) {
    if (!habilitado || salida) return;
    // Solo el gesto de un dedo o del ratón: con dos dedos el navegador está
    // haciendo zoom y esta fila no tiene nada que decir.
    if (!e.isPrimary) return;
    activoRef.current = true;
    arrastroRef.current = false;
    ejeRef.current = "sin-decidir";
    inicioRef.current = { x: e.clientX, y: e.clientY };
    desdeRef.current = abierta ? ANCHO_ACCION : 0;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!activoRef.current) return;
    const dx = e.clientX - inicioRef.current.x;
    const dy = e.clientY - inicioRef.current.y;

    if (ejeRef.current === "sin-decidir") {
      const eje = decidirEje(dx, dy);
      if (eje === "sin-decidir") return;
      if (eje === "vertical") {
        // La lista se lleva el gesto, y se suelta del todo: volver a tomarlo a
        // mitad de un desplazamiento es lo que hace que en otras apps estas
        // filas se abran solas mientras uno recorre la lista.
        activoRef.current = false;
        return;
      }
      ejeRef.current = "horizontal";
      arrastroRef.current = true;
      setFase("arrastrando");
      // Recién acá se captura el puntero. Antes no: hasta que se decide el eje,
      // el navegador tiene que poder quedarse con el gesto para desplazar la
      // lista (de eso se encarga touch-action: pan-y, más abajo).
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    mover(desplazamiento(dx, desdeRef.current));
  }

  function onPointerUp() {
    if (!activoRef.current) return;
    activoRef.current = false;
    if (ejeRef.current !== "horizontal") return;

    setFase("quieta");
    const decision = alSoltar(xRef.current, contenedorRef.current?.offsetWidth ?? 0);
    if (decision === "eliminar") {
      eliminar();
    } else if (decision === "abrir") {
      setAbierta(true);
      mover(ANCHO_ACCION);
    } else {
      cerrar();
    }
  }

  function onPointerCancel() {
    if (!activoRef.current) return;
    activoRef.current = false;
    setFase("quieta");
    mover(abierta ? ANCHO_ACCION : 0);
  }

  // En captura y no en el hijo: lo que hay adentro es un botón que abre el
  // formulario del pedido, y ni el click con que termina un arrastre ni el toque
  // que cierra una fila abierta tienen que llegar hasta él.
  function onClickCapture(e: React.MouseEvent) {
    if (arrastroRef.current) {
      arrastroRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (abierta) {
      e.preventDefault();
      e.stopPropagation();
      cerrar();
    }
  }

  return (
    <li
      className={cn("relative overflow-hidden", separador && "border-t border-divider")}
      style={
        salida
          ? {
              height: colapsado ? 0 : salida.alto,
              opacity: colapsado ? 0 : 1,
              transition: `height ${MS_SALIDA}ms ease-out, opacity ${MS_SALIDA}ms ease-out`,
            }
          : undefined
      }
    >
      {/* El rojo de atrás. Está siempre montado y no solo mientras la fila está
          corrida: montarlo al empezar el gesto lo haría aparecer un cuadro tarde
          — justo el cuadro en el que el dedo espera verlo. */}
      <div className="absolute inset-y-0 right-0 flex" aria-hidden={!abierta}>
        <button
          type="button"
          // Fuera del recorrido del teclado con la fila cerrada: es una acción
          // que todavía no se pidió.
          tabIndex={abierta ? 0 : -1}
          onClick={(e) => {
            e.stopPropagation();
            eliminar();
          }}
          className="flex flex-col items-center justify-center gap-0.5 bg-danger px-3 text-[11px] font-semibold text-white"
          style={{ width: ANCHO_ACCION }}
          aria-label={`Eliminar ${etiqueta}`}
        >
          <Trash2 className="h-4 w-4" />
          Eliminar
        </button>
      </div>

      <div
        ref={contenedorRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
        style={{
          transform: `translateX(${-(salida ? salida.ancho : x)}px)`,
          transition: fase === "arrastrando" ? "none" : `transform ${MS_SALIDA}ms ease-out`,
          // pan-y y no "none": el navegador se queda con el desplazamiento
          // vertical de la lista —el gesto que el conductor hace todo el día— y a
          // esta fila le llega solo lo horizontal.
          touchAction: habilitado ? "pan-y" : "auto",
        }}
        className={cn("relative", className)}
      >
        {children}
      </div>
    </li>
  );
}
