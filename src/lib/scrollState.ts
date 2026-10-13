/**
 * Tiny module-level scroll state. SmoothScroll publishes the current scroll velocity (px per frame, signed)
 * here every frame; any component (for example a canvas backdrop) can read it without React re-renders.
 */
let velocity = 0;

export const setScrollVelocity = (v: number): void => {
  velocity = v;
};
export const getScrollVelocity = (): number => velocity;
