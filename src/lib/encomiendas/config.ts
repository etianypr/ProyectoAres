// Constante simple, en un archivo SIN "use server": un módulo "use server"
// solo puede exportar funciones async (server actions) — exportar una
// constante desde ahí rompe el empaquetado (Turbopack) para todo el mundo
// que la importe, con un error confuso de "module has no exports".

// Pucarani reparte encomiendas de Starken como subcontratista: el valor real
// de cada envío lo sabe el sistema interno de Starken, no algo que se pueda
// ingresar por pedido. Se estima el ingreso como (entregas × un valor fijo) en
// vez de guardar un dato que nunca se va a tener.
//
// Ese valor YA NO VIVE ACÁ: se configura en la regla de pago
// (encomienda_reglas_pago.valor_pedido, migración 0029), porque con tipo_pago
// 'porcentaje' entra en la fórmula del sueldo del conductor y tiene que quedar
// congelado junto con la regla que se usó para liquidar.
//
// Esto queda solo como RESPALDO, para los días que no tienen ninguna regla
// vigente: ahí no hay de dónde sacar el valor y el panel igual necesita mostrar
// un ingreso estimado. Es el mismo 950 que estaba antes, así que nada cambia
// de número mientras no se configure otro.
export const VALOR_APROXIMADO_PEDIDO = 950;
