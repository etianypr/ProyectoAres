// Doble de @/lib/supabase/client para las pruebas de la cola de envío.
export const espia = {
  llamadas: [],
  // Devuelve {error} — la forma que espera enviar.ts.
  responder: () => ({ error: null }),
  // Las correcciones (spec 033, G5): delete por id → las filas borradas, y el
  // select por id que mira si el evento sigue en el servidor.
  borrar: (id) => ({ data: [{ id }], error: null }),
  consultar: () => ({ data: null, error: null }),
  reset() {
    this.llamadas = [];
    this.responder = () => ({ error: null });
    this.borrar = (id) => ({ data: [{ id }], error: null });
    this.consultar = () => ({ data: null, error: null });
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
        delete() {
          return {
            eq(_columna, id) {
              return {
                async select() {
                  espia.llamadas.push({ tabla, borrar: id });
                  return espia.borrar(id);
                },
              };
            },
          };
        },
        select() {
          return {
            eq(_columna, id) {
              return {
                async maybeSingle() {
                  espia.llamadas.push({ tabla, consultar: id });
                  return espia.consultar(id);
                },
              };
            },
          };
        },
      };
    },
  };
}
