// ¿Hay que instalar una APK nueva? (spec 015, US5). Pura.
//
// Casi todos los cambios llegan solos (la APK carga la app publicada); solo un
// cambio en la parte nativa —un plugin, un permiso— exige instalar el archivo de
// nuevo. Para eso existe APK_VERSION_MINIMA en Vercel.

/** "1.2.3" → [1, 2, 3]; lo que no es número cuenta como 0. */
function partes(version: string): number[] {
  return version
    .trim()
    .split(".")
    .map((p) => Number.parseInt(p, 10) || 0);
}

/** true si `instalada` es menor que `minima` (versiones x.y.z). Sin alguna de las
 *  dos no hay nada que exigir: false. */
export function esMasVieja(instalada: string | null, minima: string | null | undefined): boolean {
  if (!instalada || !minima) return false;
  const a = partes(instalada);
  const b = partes(minima);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
