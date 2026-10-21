// Una operación del almacén a la vez.
//
// Casi todo lo del almacén es LEER, DECIDIR Y RECIÉN DESPUÉS ESCRIBIR, y
// entre esas tres cosas hay un await. La transacción de escribir() es atómica,
// pero la DECISIÓN se tomó afuera, con una foto que ya puede estar vieja.
//
// El caso que costaba plata: dos toques casi simultáneos en "Pedido finalizado"
// (un doble tap, o la pantalla táctil que reporta el toque dos veces). Las dos
// llamadas leen la parada, las dos la ven "pendiente", las dos pasan el guardia
// de marcarResultado y las dos encolan un evento con id distinto — así que la
// idempotencia del servidor tampoco las frena y la entrega se cuenta y se paga
// dos veces. Reproducido con tres llamadas en paralelo: tres eventos.
//
// La otra cara del mismo problema: fijarCoordenadas y marcarResultado escriben
// las dos el pedido entero, cada una sobre la foto que leyó antes, así que la
// última en guardar pisa a la otra. Según cuál llegue segunda se pierde el
// "entregado" (el paquete reaparece mañana como no entregado) o se pierden las
// coordenadas recién encontradas (el pedido queda "Sin ubicar" y se cae de la
// ruta). Medido contra el código anterior: se perdían las coordenadas.
//
// La fila serializa esas operaciones. No hace falta nada más fino: son
// escrituras de milisegundos disparadas por una sola pantalla, y el orden entre
// dos toques del chofer es justamente el que él hizo.
let fila: Promise<unknown> = Promise.resolve();

export function enFila<T>(trabajo: () => Promise<T>): Promise<T> {
  // then(trabajo, trabajo): que la anterior haya fallado no puede dejar la fila
  // trabada para el resto del día.
  const proximo = fila.then(trabajo, trabajo);
  // La fila espera el turno, no el resultado: sin este catch, una operación que
  // lanza deja un rechazo sin manejar colgado del encadenamiento.
  fila = proximo.catch(() => {});
  return proximo;
}
