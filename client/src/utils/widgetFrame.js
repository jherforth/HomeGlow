/**
 * The theme's frame decoration, drawn as a ::after layer over a widget frame's
 * edge. It takes no space and no pointer events, so a decorated frame keeps
 * the same content box and the selection border stays usable. Classic sets
 * both tokens to none, which draws nothing.
 */
export const frameDecoration = {
  content: '""',
  position: 'absolute',
  inset: 0,
  borderRadius: 'inherit',
  border: 'var(--hg-frame-decoration-border)',
  borderImage: 'var(--hg-frame-decoration-image)',
  pointerEvents: 'none',
  zIndex: 999,
};
