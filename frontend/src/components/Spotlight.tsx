"use client";

import { type HTMLAttributes, useRef } from "react";

/** A surface whose border and fill light up under the cursor. */
export function Spotlight({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      {...rest}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
        el.style.setProperty("--spot", "1");
      }}
      onPointerLeave={() => ref.current?.style.setProperty("--spot", "0")}
      className={`spotlight ${className}`}
    >
      {children}
    </div>
  );
}
