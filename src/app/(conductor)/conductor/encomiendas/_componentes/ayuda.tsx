"use client";

// Cómo se usa la app, en corto y en un solo lugar (terreno 2026-10-27: "no me
// gusta que tenga tanta información; dejaría un botón de ayuda"). Las pantallas
// muestran estados y datos; las instrucciones viven aquí.

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { PANTALLA } from "./superficies";
import { BOTON_ICONO } from "./botones";

const SECCIONES: { titulo: string; pasos: string[] }[] = [
  {
    titulo: "Cargar guía",
    pasos: [
      "«Foto»: el recuadro es la cámara y el botón redondo toma una foto de cada parte de la guía, con un leve traslape entre ellas → «Leer direcciones» (a la derecha del botón) las lee juntas. A la izquierda, «Galería» permite elegir fotos ya tomadas; con fotos, muestra la última y el total, y al tocarla se abren: ✕ quita una. A la derecha, sin fotos, «Pegar» recibe el texto copiado con Google Lens (otro texto pegado se agrega).",
      "«Nóminas físicas» (deslizando sobre el botón redondo, o tocándola): el botón redondo inicia el escaneo de la hoja en el mismo recuadro. Verde con ✓ es una OF leída y arriba aparece lo que falta confirmar; el botón redondo (un cuadrado) es «Terminar» y agrega lo leído, y «Descartar», a su derecha, descarta ese escaneo. Al escanear otra vez, lo ya leído sigue en verde y lo que faltaba confirmar se lee de nuevo.",
      "Abajo, el número grande son los bultos leídos contra el TOTAL BULTOS del pie de la boleta («47 de 52 bultos»; con ✓, se leyó todo). Una flecha ▲ o ▼ sobre la cámara apunta a la OF por confirmar más cercana, más arriba o más abajo en la nómina, con cuántos encargos hay hasta ella. Lo que falta confirmar y no se vuelve a ver en 5 minutos de escaneo deja de estar.",
      "Revisar: las líneas con ⚠ (sin OF, OF mal leída, sin destino o por confirmar) aparecen de a una; el botón del teléfono registra el número y «Llamar»; «Quitar» / «Confirmar»; «Siguiente» pasa a la otra. «Ver las n líneas» muestra todas: tocar una la abre para corregirla → «Crear n pedidos».",
      "Arriba, tocar «1 Fotos» permite agregar más fotos o texto, y «2 Revisar» vuelve a las líneas.",
      "Ubicando: «Detener ubicación» deja el resto sin ubicar. Al terminar, tocar un no ubicado abre su pedido; «Corregir dirección con IA» lo intenta de nuevo con conexión, y cada propuesta de la IA se confirma de a una. «Deshacer carga» borra lo recién creado; con la ruta ya optimizada, «Agregar n a la ruta». Después, «Borrar pedidos» (al final de la hoja) borra los que nadie tocó, para volver a cargar la guía; los que tienen etiqueta, ruta o resultado quedan.",
    ],
  },
  {
    titulo: "Pedidos con ⚠",
    pasos: [
      "«N por resolver» abre el primero; al guardarlo, pasa al siguiente. También se puede tocar el pedido en la lista.",
      "«Corregir dirección con IA»: las propuestas quedan guardadas aunque se cierre la app; confirma cada una revisando el mapa; si no corresponde, toca la dirección, elige otra de la lista y «Confirmar». El botón del teléfono abre el campo del teléfono y, con un número válido, «Llamar» (también en las líneas con ⚠ de la guía).",
      "Si no se resuelve: «Optimizar ruta» → «Optimizar ahora». Después, «Resolver advertencias» sigue disponible dentro de la hoja.",
      "Arriba del pedido va «⚠ N por resolver»: tocarlo abre sus ⚠. Una calle en varios lugares se elige entre sus opciones; «Mantener en ruta» (lejana, horario) y «Confirmar» (no figura en la guía) lo dan por revisado.",
      "Una calle en varios lugares («Pasaje 1»): si la guía nombra la población o una calle que la cruza, se ubica sola; si no, cada opción muestra su mapa, población, sector y las calles que la cruzan, solo las de la zona de la ruta (la que coincide con la guía va primero): «Elegir». Dos paradas antes, «Cambiar lugar» abre las opciones.",
      "Resolviendo: «Siguiente» pasa al próximo ⚠ sin guardar; con un teléfono ingresado, «Llamar». Del pedido solo la dirección (*) es obligatoria; el destinatario y el teléfono son opcionales.",
      "En ruta, dos paradas antes de un ⚠ aparece el aviso arriba de la parada, con «Llamar».",
    ],
  },
  {
    titulo: "Optimizar ruta",
    pasos: [
      "«Optimizar ruta» → elige una alternativa → «Usar esta ruta». Durante el cálculo, «Cancelar» (o atrás) vuelve sin ruta.",
      "En la propuesta, toca una fila para verla en el mapa; deslízala hacia abajo para ver el mapa entero. Para descartarla, ✕ dos veces.",
      "En un condominio la ruta llega a su entrada, y «Navegar» lleva a ella. El número de la parada queda en el edificio.",
      "Para excluir un pedido: 🗑 en la lista de la ruta propuesta («Deshacer» lo restituye).",
      "Una dirección lejos de las demás, o sin ubicar, aparece en la franja amarilla sobre «Usar esta ruta»: «Editar» abre el pedido y «Mantener» la deja en la ruta. Con direcciones corregidas, «Recalcular ruta» vuelve a optimizar.",
      "La misma ruta en sentido inverso (la última parada primero): «Invertir orden de ruta». Otro toque la deja como la propuso ARES.",
      "Cargar vehículo: «Escanear paquete» (el ícono de escanear de arriba aparece con la ruta optimizada) y pasa las etiquetas frente a la cámara: un tono por dato leído y otro cuando la etiqueta queda leída. «Iniciar ruta» muestra la primera parada (con paquetes sin escanear, toca de nuevo «Iniciar de todos modos»); lo no escaneado queda en «Sin escanear», con «Reanudar carga» hasta cerrar la primera parada.",
      "Si la cámara no responde: Diagnóstico → «Cargar vehículo con el escáner de Google» (una etiqueta por toque).",
      "Código dañado: ingresa la OF (✕ vuelve a la cámara); cada ingreso agrega un bulto, y «−1 bulto» quita el último. La misma etiqueta escaneada dos veces no se duplica.",
      "Pedido que llega tarde: «Agregar a la ruta».",
      "Reordenar lo pendiente desde la ubicación actual: «Recalcular ruta» (al pie de la hoja) → Desde: Mi ubicación → «Recalcular ruta». Termina en la central.",
      "Toca un número del mapa para ver su dirección. El reloj indica el tiempo de conducción, sin las entregas.",
    ],
  },
  {
    titulo: "En cada parada",
    pasos: [
      "«Pedido entregado» (verde) o «No se entrega» (rojo); el botón redondo del medio llama al cliente. Sin teléfono, el botón redondo escanea la etiqueta e «Ingresar teléfono» permite escribirlo.",
      "«No se entrega»: «Dejar como pendiente» (se reintenta más tarde), «Solicitó otro horario» (elige el bloque y la parada se mueve a ese horario) o «No entregado» (sin más intentos hoy).",
      "«Deshacer» aparece arriba unos segundos; si se cerraron dos seguidas, deshace las dos. También deshace «Dejar como pendiente», «Ahora» y «Solicitó otro horario».",
      "«2 paquetes aquí»: «Pedido entregado» pregunta «Los 2» o «Solo este».",
      "El botón redondo de escanear compara el paquete con la parada: si corresponde a otra, lo indica y el escáner sigue abierto.",
      "Al corregir la dirección de una parada, se mueve donde menos alarga la ruta («Se movió a la…»); si es la parada en curso, «Mantener orden» o «Reordenar parada». En «Paquete» se corrigen el POR PAGAR, los bultos y la descripción.",
      "«N cerca», al lado de ⌖: las paradas a menos de 300 m, marcadas en el mapa. Toca una para verla; «Ahora» la deja como la próxima.",
    ],
  },
  {
    titulo: "Navegar",
    pasos: [
      "Toca los km de la parada: Google Maps guía y encima queda la burbuja de ARES minimizada. Tócala para ver los botones de la parada.",
      "En la burbuja: «Navegar» vuelve a Google Maps, «Volver a ARES» abre ARES y «Achicar» la reduce a un círculo sobre la velocidad de Google Maps; tócalo para abrirla.",
      "La primera vez, permite a ARES «Mostrar sobre otras apps» (en vivo: «Ventanas flotantes»); si indica «Sin burbuja», «Conceder permiso» lo solicita de nuevo. Si la burbuja se cierra sola, en Batería permite a ARES el «Consumo alto en segundo plano».",
    ],
  },
  {
    titulo: "Mapa",
    pasos: ["⌖ vuelve a centrar el mapa en tu ubicación."],
  },
  {
    titulo: "Lista",
    pasos: [
      "Toca un pedido pendiente para corregir su OF, teléfono o dirección.",
      "Toca una parada ✓ o ✕ de «Ruta del día» para cambiarla a Entregado, No entregado o Pendiente (vuelve a la ruta donde menos la alarga). Disponible durante 11 horas después de cerrarla.",
      "Desliza un pedido a la izquierda y toca «Eliminar».",
      "Menú → Accesibilidad (ícono junto a «Cerrar sesión») → Llamadas: con «Altavoz» activado, la llamada se realiza en altavoz.",
      "Menú → «Buscar paquete por OF» con los últimos dígitos; toca la fila para abrir el pedido (también en «Faltan»).",
    ],
  },
  {
    titulo: "Cerrar día y sin conexión",
    pasos: [
      "Al terminar, revisa los no entregados y confirma: se borran del dispositivo los datos de los clientes. Con no entregados, «Confirmar y borrar datos» pide «Sí, ya están separados». Si se pospuso, «Cerrar día» lo vuelve a abrir (los segundos al lado son los del «Deshacer»).",
      "Si llega un pedido con la ruta completada: «Agregar a la ruta».",
      "Sin conexión todo queda guardado y se envía automáticamente. Un día anterior con «N sin enviar» en Menú → «Días de trabajo»: «Reintentar». Los días anteriores son solo de consulta.",
      "«Cerrar sesión» cierra la sesión y solo entonces borra los pedidos del dispositivo; sin conexión no se cierra ni se borra nada. Cuenta sin vincular o desactivada: la oficina la corrige en la ficha del conductor y después «Reintentar».",
      "«Actualización disponible»: «Descargar» instala la versión nueva; ✕ oculta el aviso hasta volver a abrir la app.",
      "Para probar sin enviar nada: Menú → Diagnóstico (ícono junto a «Cerrar sesión») → Modo prueba (con GPS simulado en la central; Google Maps sigue con la ubicación real).",
    ],
  },
];

export function Ayuda({ onCerrar }: { onCerrar: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={`capa-camara ${PANTALLA} z-ventana`}
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
          className={BOTON_ICONO}
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
