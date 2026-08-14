// Transición de entrada entre páginas: template.tsx se vuelve a montar en
// cada navegación (a diferencia del layout), así que la animación corre al
// cambiar de sección. Sutil: fundido + leve subida, 350ms.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page">{children}</div>;
}
