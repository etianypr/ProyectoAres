# Quickstart 022 · Recorrer los ⚠

Igual que el de la 027 (`specs/027-hoja-por-paso/quickstart.md`): 360 × 800, modo prueba, claves de
pago vacías y `next build` + `next start`. Armar la ruta usa ORS (se pregunta antes).

Para una calle en varios lugares sin gastar, hace falta una dirección que OSM tenga en dos sitios a
más de 300 m. Si no hay una a mano, se prueba con las pruebas automáticas
(`pedidos-con-problemas.test.mjs`) y aquí solo lo demás.

| Caso | Hacer | Debe verse |
|---|---|---|
| OF | Pegar una guía con una OF de 8 y otra de 10 dígitos | Ninguna lleva ⚠ (ni en las líneas, ni en el pedido, ni en la parada) |
| En duda | Una dirección que la búsqueda deja en duda pero con opciones | Entra con ⚠ «Calle en N lugares»; en el pedido, arriba, sus opciones con mapa y «Hoy va acá» en la primera. Elegir otra la mueve sin esperar búsqueda |
| Lejana | Armar con una parada lejos del resto → «Usar esta ruta» | La parada lleva ⚠ «Queda a X km del resto»; «Va igual» lo deja revisado y no vuelve al rehacer |
| Etiqueta | Escanear y completar con un texto de etiqueta de otra dirección; cerrar sin elegir | El pedido queda con ⚠ «La etiqueta dice otra dirección»; arriba: «Usar la de la etiqueta» / «Dejar la de la guía» |
| Fuera de guía | Escanear una OF que no está → «Agregarlo como pedido» → guardar | ⚠ «No estaba en la guía» con «Es así» |
| Bultos | Escanear el bulto 001 de un envío de 2 (código de 26 dígitos con `…001`, etiqueta «Bulto 001/002») | Sigue en «Faltan» con «Bultos 1 de 2» |
| Dos antes | Recorriendo, con un ⚠ (lejana o en duda) dos paradas más adelante | Arriba de la parada: «⚠ En 2 paradas: la N · …» con «Llamar» (o «Ver»); a una parada, «En la próxima parada» |
| Burbuja | En la APK, navegando con el mismo caso, abrir la burbuja | La misma línea en el aviso de la burbuja (sin «Deshacer») |
