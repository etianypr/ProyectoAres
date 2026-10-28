// El logo de Dashund, la empresa que desarrolla ARES (2026-10-28): la cara de
// un perro salchicha de frente, minimalista. Es un activo de marca: los colores
// van fijos y no siguen el tema. El mismo dibujo está en public/dashund.svg
// (de ahí salen los íconos: scripts/generar-iconos.mjs).
//
// `animado`: las orejas se mecen apenas, como un perro que escucha. Va en la
// pantalla de carga; con "reducir movimiento" se quedan quietas.

const ESTILO_ANIMADO = `
.dashund-oreja{transform-box:fill-box;transform-origin:50% 8%;animation:dashund-mece 2.4s cubic-bezier(.45,0,.55,1) infinite}
.dashund-oreja-der{animation-delay:-1.2s}
@keyframes dashund-mece{0%,100%{transform:rotate(0)}50%{transform:rotate(5deg)}}
.dashund-oreja-izq{animation-name:dashund-mece-izq}
@keyframes dashund-mece-izq{0%,100%{transform:rotate(0)}50%{transform:rotate(-5deg)}}
@media (prefers-reduced-motion:reduce){.dashund-oreja{animation:none}}
`;

export function LogoDashund({
  className,
  titulo = "Dashund",
  animado = false,
}: {
  className?: string;
  /** Lo que lee el lector de pantalla; "" lo deja como decorado. */
  titulo?: string;
  animado?: boolean;
}) {
  return (
    <svg
      viewBox="40 36 120 136"
      className={className}
      role={titulo ? "img" : undefined}
      aria-label={titulo || undefined}
      aria-hidden={titulo ? undefined : true}
    >
      {animado ? <style>{ESTILO_ANIMADO}</style> : null}
      <path
        className={animado ? "dashund-oreja dashund-oreja-izq" : undefined}
        d="M76 60 C56 63 44 92 47 124 C49 141 62 146 70 133 C78 119 81 93 80 71 Z"
        fill="#9e3912"
      />
      <path
        className={animado ? "dashund-oreja dashund-oreja-der" : undefined}
        d="M124 60 C144 63 156 92 153 124 C151 141 138 146 130 133 C122 119 119 93 120 71 Z"
        fill="#9e3912"
      />
      <path
        d="M100 42 C121 42 133 57 133 79 C133 104 119 125 112 148 C109 159 105 167 100 167 C95 167 91 159 88 148 C81 125 67 104 67 79 C67 57 79 42 100 42 Z"
        fill="#d4531a"
      />
      <ellipse cx="88" cy="91" rx="4.2" ry="5.6" fill="#221a15" transform="rotate(-12 88 91)" />
      <ellipse cx="112" cy="91" rx="4.2" ry="5.6" fill="#221a15" transform="rotate(12 112 91)" />
      <path d="M93 156 C93 151 107 151 107 156 C107 162 103 166 100 166 C97 166 93 162 93 156 Z" fill="#221a15" />
    </svg>
  );
}
