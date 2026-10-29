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
    titulo: "Direcciones sin ubicar",
    pasos: [
      "Toca el pedido para corregir la dirección.",
      "«Corregir con IA»: confirma cada una mirando el mapa.",
    ],
  },
  {
    titulo: "Armar la ruta",
    pasos: [
      "«Generar ruta del día» → elige una alternativa → «Usar esta ruta».",
      "Un pedido que no va: 🗑 en la lista de la ruta propuesta («Deshacer» lo devuelve).",
      "Después «Escanear los paquetes»: cada etiqueta dice su parada.",
      "Pedido que llega tarde: «Sumar a la ruta».",
      "Repasar lo que falta desde donde estás: Rehacer la ruta → Desde: Mi ubicación → «Regenerar ruta». Termina en la central.",
      "Toca un número del mapa para ver su dirección. El reloj es el tiempo manejando, sin las entregas.",
    ],
  },
  {
    titulo: "En cada parada",
    pasos: [
      "Llamar → Contestó / No contestó → «Pedido finalizado».",
      "«No se pudo»: Dejar como pendiente (se reintenta más tarde) o No entregado (se tacha por hoy).",
      "«Deshacer» aparece arriba unos segundos.",
    ],
  },
  {
    titulo: "Mapa y voz",
    pasos: ["🔊 activa o silencia la voz. ⌖ vuelve a seguirte."],
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
      "Al terminar, revisa los no entregados y confirma: se borran los datos de los clientes del teléfono.",
      "Sin señal todo queda guardado y se envía solo.",
      "Para probar sin enviar nada: Menú → Diagnóstico → Modo prueba (con GPS simulado en la central).",
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
