# Quickstart: validar número y referencia del paquete

## Automático

```bash
npm test     # paquete.test.mjs, fotos.test.mjs, idb-version.test.mjs y 3-almacen ampliado
npm run lint
npm run build
```

## En el teléfono (iPhone con la PWA instalada, por ngrok — ver README)

1. **Actualización desde v2**: con pedidos ya cargados en la versión anterior, abrir la
   versión nueva → los pedidos conservan todos sus datos y todavía no tienen número.
2. **Referencia**: cargar un pedido, elegir Bolsa · Grande · Gris con tres toques, nota
   "cinta roja", guardar. Tiempo extra ≤ 5 s (SC-002).
3. **Foto**: agregar una foto → miniatura en el formulario; cerrar y abrir la app → sigue.
4. **Numerar y cargar**: confirmar la ruta → se abre "Orden de carga" con los paquetes del
   último al primero y su número grande; escribir los números; marcar dos como cargados.
5. **Reoptimizar**: agregar un pedido y rehacer la ruta → los números ya escritos no
   cambian; el nuevo recibe N+1 con aviso de escribirlo; las marcas de carga siguen.
6. **Parada**: avanzar a la primera parada → "#N · Bolsa gris grande · cinta roja" en lo
   más grande de la tarjeta; tocar la miniatura → se amplía.
7. **Búsqueda**: buscar un número existente → muestra el pedido y su lugar en la ruta;
   buscar uno inexistente → lo dice.
8. **Sin conexión**: modo avión y repetir 2, 4 y 6.
9. **Fotos**: marcar como entregado un pedido con foto → su foto desaparece del teléfono.
10. **Medición en terreno** (SC-001, SC-003): durante un día real, anotar para 20
    paradas el tiempo desde que se detiene el vehículo hasta tener el paquete en la mano,
    y cuántos pedidos quedaron con referencia.

## Privacidad

Con las herramientas de desarrollo abiertas (pestaña Red), hacer el recorrido completo:
ninguna petición lleva número, referencia ni foto. El borrado al cerrar el día se valida en
la spec 007.
