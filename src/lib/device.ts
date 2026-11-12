/** These read `window`, so they return false during the static render. */

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Phones, tablets and small machines: the 3D scene uses a lower pixel ratio. */
export const isLowPower = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4);
