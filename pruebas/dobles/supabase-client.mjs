// Doble de @/lib/supabase/client para las pruebas de la cola de envío.
export const espia = {
  llamadas: [],
  // Devuelve {error} — la forma que espera enviar.ts.
  responder: () => ({ error: null }),
  reset() {
    this.llamadas = [];
    this.responder = () => ({ error: null });
  },
};

export function createClient() {
  return {
    from(tabla) {
      return {
        async upsert(filas, opciones) {
          espia.llamadas.push({ tabla, filas, opciones });
          return espia.responder(filas, opciones);
        },
      };
    },
  };
}
