"use client";

// Cómo se usa la app, en corto y en un solo lugar (terreno 2026-10-27: "no me
// gusta que tenga tanta información; dejaría un botón de ayuda"). Las pantallas
// muestran estados y datos; las instrucciones viven acá.

import { createPortal } from "react-dom";
import { X } from "lucide-react";

const SECCIONES: { titulo: string; pasos: string[] }[] = [
  {
    titulo: "Cargar la guía",
    pasos: [
      "Fotos: el botón de la cámara (o el recuadro) saca una foto de cada parte de la guía, que se superpongan un poco; ✕ en la miniatura la quita → «Scan físico» las lee juntas.",
      "«Otra forma»: «Galería» elige fotos ya sacadas; «Nómina» barre la hoja (✓ es una OF confirmada, «Terminar» suma, ✕ descarta); «Pegar texto» recibe el texto copiado con Google Lens (otro texto pegado se suma).",
      "Revisar: las líneas con ⚠ (sin OF, OF mal leída, sin destino o por confirmar) salen de a una; el botón del teléfono anota el número y «Llamar»; «Quitar» / «Confirmar»; «Siguiente» pasa a la otra. «Ver las n líneas» muestra todas: tocar una la abre para corregirla → «Crear n pedidos».",
      "Arriba, tocar «1 Fotos» vuelve a sumar fotos o texto, y «2 Revisar», a las líneas.",
      "Ubicando: «Dejar de ubicar» deja el resto sin ubicar. Al terminar, tocar un no ubicado abre su pedido; «Corregir con IA» vuelve a intentarlo con señal, y cada propuesta de la IA se confirma de a una. «Deshacer esta carga» borra lo recién creado; con la ruta ya armada, «Sumar n a la ruta».",
    ],
  },
  {
    titulo: "Pedidos con ⚠",
    pasos: [
      "«N por resolver» abre el primero; al guardarlo, pasa al siguiente. También se toca el pedido en la lista.",
      "«Corregir con IA»: confirma cada una mirando el mapa; si no es ahí, toca la dirección, elige otra de la lista y «Confirmar». El botón del teléfono abre «Teléfono · opcional» y, con un número válido, «Llamar» (también en las líneas con ⚠ de la guía).",
      "Si no se resuelve: «Armar la ruta» → «Armar igual». Después, «Resolver los ⚠» sigue adentro de la hoja.",
      "Arriba del pedido va su ⚠: una calle en varios lugares se elige entre sus opciones; «Va igual» (lejana, horario) y «Es así» (no estaba en la guía) lo dan por revisado.",
      "Resolviendo: «Siguiente» pasa al próximo ⚠ sin guardar; con un teléfono escrito, «Llamar». Sin dirección que sirva: «Marcar en el mapa» o «Aquí» (GPS).",
      "Recorriendo, dos paradas antes de un ⚠ aparece arriba de la parada, con «Llamar».",
    ],
  },
  {
    titulo: "Armar la ruta",
    pasos: [
      "«Armar la ruta» → elige una alternativa → «Usar esta ruta». Mientras busca, «Cancelar» (o atrás) vuelve sin ruta.",
      "En la propuesta, «Ver las N» muestra toda la lista; toca una fila para verla en el mapa. Para descartarla, ✕ dos veces.",
      "En un condominio la ruta llega a su entrada, y «Navegar» te lleva a ella. El número de la parada queda en el edificio.",
      "Un pedido que no va: 🗑 en la lista de la ruta propuesta («Deshacer» lo devuelve).",
      "La misma ruta al revés (la última parada primero): «Invertir orden de ruta». Otro toque la deja como la propuso ARES.",
      "Cargar el auto: «Escanear paquete» (el ícono de escanear de arriba aparece con la ruta armada) y pasa las etiquetas por la cámara: un tic por dato leído y otro sonido cuando queda leída. «Salir a repartir» muestra la primera parada (con paquetes sin escanear, toca otra vez «Salir igual»); lo no escaneado queda en «Sin escanear», con «Volver a cargar» hasta cerrar la primera parada.",
      "Si la cámara se traba: Diagnóstico → «Cargar el auto con el escáner de Google» (una etiqueta por toque).",
      "Código dañado: escribe la OF (✕ vuelve a la cámara); cada vez que la escribes suma un bulto, y «−1 bulto» quita el último de más. La misma etiqueta escaneada dos veces no suma.",
      "Pedido que llega tarde: «Sumar a la ruta».",
      "Repasar lo que falta desde donde estás: «Rehacer la ruta» (al pie de la hoja) → Desde: Mi ubicación → «Rehacer la ruta». Termina en la central.",
      "Toca un número del mapa para ver su dirección. El reloj es el tiempo manejando, sin las entregas.",
    ],
  },
  {
    titulo: "En cada parada",
    pasos: [
      "«Pedido entregado» (verde) o «No se entrega» (rojo); el botón redondo del medio llama al cliente. Sin teléfono, el redondo escanea la etiqueta y «Teléfono a mano» lo deja escribir.",
      "«No se entrega»: Dejar como pendiente (se reintenta más tarde), «Pidió otra hora» (elige el bloque y la parada se mueve a esa hora) o No entregado (se tacha por hoy).",
      "«Deshacer» aparece arriba unos segundos; si cerraste dos seguidas, deshace las dos. También deshace «Dejar como pendiente», «Ahora» y «Pidió otra hora».",
      "«2 paquetes aquí»: «Pedido entregado» pregunta «Los 2» o «Solo este».",
      "El botón redondo de escanear compara el paquete con la parada: si es de otra, lo dice y el escáner sigue abierto.",
      "Si corriges la dirección de una parada, se mueve donde menos alarga («Se movió a la…»); si es la que vas a hacer, «Seguir con esta» o «Moverla». En «Paquete» corriges el POR PAGAR, los bultos y la descripción.",
      "«N cerca», al lado de ⌖: las paradas a menos de 300 m, marcadas en el mapa. Toca una para verla; «Ahora» la deja como la próxima.",
    ],
  },
  {
    titulo: "Navegar",
    pasos: [
      "Toca los km de la parada: guía Google Maps y encima queda la burbuja de ARES achicada. Tócala para ver los botones de la parada.",
      "En la burbuja: «Navegar» vuelve a Google Maps, «Volver a ARES» trae ARES y «Achicar» la deja en un círculo sobre la velocidad de Google Maps; tócalo para abrirla.",
      "La primera vez, permite a ARES «Mostrar sobre otras apps» (en vivo: «Ventanas flotantes»); si dice «Sin burbuja», «Dar permiso» lo vuelve a pedir. Si la burbuja se va sola, en Batería permite a ARES el «Consumo alto en segundo plano».",
    ],
  },
  {
    titulo: "Mapa",
    pasos: ["⌖ vuelve a seguirte."],
  },
  {
    titulo: "Lista",
    pasos: [
      "Toca un pedido pendiente para corregir su OF, teléfono o dirección.",
      "Toca una parada ✓ o ✕ de «Ruta del día» para pasarla a Entregado, No entregado o Pendiente (vuelve a la ruta donde menos alarga). Se puede durante 11 horas después de cerrarla.",
      "Desliza un pedido a la izquierda y toca «Eliminar».",
      "Menú → «Buscar un paquete por su OF» con los últimos dígitos; toca la fila para abrir el pedido (también en «Faltan»).",
    ],
  },
  {
    titulo: "Cerrar el día y sin señal",
    pasos: [
      "Al terminar, revisa los no entregados y confirma: se borran los datos de los clientes del teléfono. Con no entregados, «Listo, borrar del teléfono» pide «Sí, ya los separé». Si lo dejaste para después, «Cerrar el día» lo vuelve a abrir (los segundos al lado son los del «Deshacer»).",
      "Si llega un pedido con la ruta completa: «Sumar a la ruta».",
      "Sin señal todo queda guardado y se envía solo. Un día anterior con «N sin enviar» en Menú → «Tus días»: «Reintentar».",
      "«Cerrar sesión» cierra la sesión y recién entonces borra los pedidos del teléfono; sin señal no se cierra ni se borra nada. Cuenta sin vincular o desactivada: el jefe la arregla en tu ficha y después «Reintentar».",
      "«Hay una actualización disponible»: «Bajar» instala la app nueva; ✕ lo esconde hasta que vuelvas a abrir la app.",
      "Para probar sin enviar nada: Menú → Diagnóstico → Modo prueba (con GPS simulado en la central; Google Maps sigue con tu ubicación real).",
    ],
  },
];

export function Ayuda({ onCerrar }: { onCerrar: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-[60] flex flex-col bg-background pt-[max(0.75rem,env(safe-area-inset-top))]"
      role="dialog"
      aria-modal="true"
      aria-label="Ayuda"
    >
      <div className="flex items-center gap-2 px-4 pb-3">
        <h2 className="min-w-0 flex-1 text-lg font-semibold">Ayuda</h2>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-card"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {SECCIONES.map((s) => (
          <section key={s.titulo} className="rounded-2xl bg-card p-3.5 shadow-soft">
            <h3 className="text-sm font-semibold">{s.titulo}</h3>
            <ul className="mt-1.5 space-y-1">
              {s.pasos.map((p) => (
                <li key={p} className="text-sm text-muted">
                  {p}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>,
    document.body,
  );
}
