import { useCallback, useEffect, useState } from 'react';
import { edgeFadeMask } from '../utils/edgeFade.js';

/**
 * Fades the edges of a horizontal scroller while there is more to scroll to
 * (utils/edgeFade.js). Returns `[ref, sx]`: put `ref` on the scrolling element
 * and spread `sx` into its sx.
 *
 * A callback ref, because the scroller may mount after the first render (a
 * widget shows "Loading" first). The mask is checked after every render too,
 * so a column added or hidden updates it without its own observer; setting
 * the same string again doesn't re-render.
 */
export function useEdgeFade() {
  const [node, setNode] = useState(null);
  const [mask, setMask] = useState('none');

  useEffect(() => {
    if (!node) return undefined;
    const update = () => setMask(edgeFadeMask(node));
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(node);
    return () => {
      node.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [node]);

  useEffect(() => {
    if (node) setMask(edgeFadeMask(node));
  });

  const ref = useCallback((element) => setNode(element), []);
  return [ref, { maskImage: mask, WebkitMaskImage: mask }];
}
