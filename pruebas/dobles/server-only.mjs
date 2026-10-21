// "server-only" revienta a propósito si se lo importa fuera de un componente de
// servidor de Next: es la guarda que impide que un módulo con secretos llegue al
// navegador. Las pruebas corren en Node, donde esa condición no existe, así que
// acá es un módulo vacío.
export {};
