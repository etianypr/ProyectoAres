import { redirect } from "next/navigation";

// La raíz del panel ES la gestión de encomiendas: es el único negocio de esta
// empresa, así que un dashboard aparte solo repetiría sus cifras con menos
// detalle y agregaría un clic para llegar a lo que se venía a ver.
//
// Se resuelve con un redirect en vez de mover la página a "/" para no reescribir
// los revalidatePath("/encomiendas") de las acciones ni los links de
// /encomiendas/dia: la ruta canónica sigue siendo /encomiendas.
export default function InicioPage() {
  redirect("/encomiendas");
}
