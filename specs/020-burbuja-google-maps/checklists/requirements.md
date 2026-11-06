# Specification Quality Checklist: Navegar con Google Maps y la burbuja de ARES

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-01
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- "Google Maps", "Android" y el permiso "Mostrar sobre otras apps" son el dominio de la feature
  (lo que ve el conductor), no detalles de implementación.
- Decisiones del dueño (2026-11-01): navegación entre paradas en Google Maps; fuera el kit y la
  navegación propia de ARES; burbuja con todos los botones; ARES no vuelve sola; la burbuja va
  ligada al pedido abierto (se achica, no se quita) y siempre tiene "Navegar".
- Con eso ARES no lee nada de Google Maps: sin "Acceso a notificaciones" y sin el riesgo de
  depender de su aviso.
- Por defecto, sin preguntar: al llegar, la burbuja sigue con la parada hasta cerrarla; cerrar
  una parada en ARES con la burbuja en curso manda Google Maps a la siguiente.
