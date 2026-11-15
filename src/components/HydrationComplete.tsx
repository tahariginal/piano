"use client";

import { useEffect } from "react";

/** Stop the temporary extension-attribute cleanup after hydration. */
export default function HydrationComplete() {
  useEffect(() => {
    window.dispatchEvent(new Event("piano:hydrated"));
  }, []);
  return null;
}
