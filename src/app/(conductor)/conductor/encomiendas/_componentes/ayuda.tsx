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
      "Sacar foto a cada parte de la guía (que se superpongan un poco) → «Leer las fotos juntas».",
      "Revisa las líneas: ✏️ para corregir, 🗑 para quitar → «Crear pedidos».",
      "Sin foto: en Google Lens toca Texto → Copiar todo, y usa «Pegar el texto de Google Lens».",
    ],
  },
  {
    titulo: "Pedidos con ⚠",
    pasos: [
      "«Resolver los ⚠» abre el primero; al guardarlo, pasa al siguiente. También se toca el pedido en la lista.",
      "«Corregir con IA»: confirma cada una mirando el mapa.",
      "Si no se resuelve: «Armar la ruta igual». Después, «Resolver los ⚠» sigue adentro de la hoja.",
      "Arriba del pedido va su ⚠: una calle en varios lugares se elige entre sus opciones; «Va igual» (lejana, horario) y «Es así» (no estaba en la guía) lo dan por revisado.",
      "Recorriendo, dos paradas antes de un ⚠ aparece arriba de la parada, con «Llamar».",
    ],
  },
  {
    titulo: "Armar la ruta",
    pasos: [
      "«Armar la ruta» → elige una alternativa → «Usar esta ruta».",
      "Un pedido que no va: 🗑 en la lista de la ruta propuesta («Deshacer» lo devuelve).",
      "Cargar el auto: «Escanear paquete» con cada etiqueta (dice su parada). «Salir a repartir» muestra la primera parada; lo no escaneado queda en «Faltan».",
      "Código dañado: escribe la OF; cada vez que la escribes suma un bulto. La misma etiqueta escaneada dos veces no suma.",
      "Pedido que llega tarde: «Sumar a la ruta».",
      "Repasar lo que falta desde donde estás: «Rehacer la ruta» (al pie de la hoja) → Desde: Mi ubicación → «Rehacer la ruta». Termina en la central.",
      "Toca un número del mapa para ver su dirección. El reloj es el tiempo manejando, sin las entregas.",
    ],
  },
  {
    titulo: "En cada parada",
    pasos: [
      "«Pedido entregado» (verde) o «No se entrega» (rojo); el botón redondo del medio llama al cliente. Sin teléfono, el redondo escanea la etiqueta y «Teléfono a mano» lo deja escribir.",
      "«No se entrega»: Dejar como pendiente (se reintenta más tarde) o No entregado (se tacha por hoy).",
      "«Deshacer» aparece arriba unos segundos.",
    ],
  },
  {
    titulo: "Navegar",
    pasos: [
      "Toca los km de la parada: guía Google Maps y encima queda la burbuja de ARES achicada. Tócala para ver los botones de la parada.",
      "En la burbuja: «Navegar» vuelve a Google Maps, «Volver a ARES» trae ARES y «Achicar» la deja en un círculo sobre la velocidad de Google Maps; tócalo para abrirla.",
      "La primera vez, permite a ARES «Mostrar sobre otras apps» (en vivo: «Ventanas flotantes»). Si la burbuja se va sola, en Batería permite a ARES el «Consumo alto en segundo plano».",
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
      "Desliza un pedido a la izquierda para eliminarlo.",
      "Menú → «Buscar un paquete por su OF» con los últimos dígitos.",
    ],
  },
  {
    titulo: "Cerrar el día y sin señal",
    pasos: [
      "Al terminar, revisa los no entregados y confirma: se borran los datos de los clientes del teléfono. Si lo dejaste para después, «Cerrar el día» lo vuelve a abrir.",
      "Sin señal todo queda guardado y se envía solo.",
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
