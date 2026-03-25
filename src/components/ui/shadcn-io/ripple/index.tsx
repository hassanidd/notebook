import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef, CSSProperties } from "react";
import React from "react";

interface RippleProps extends ComponentPropsWithoutRef<"div"> {
  mainCircleSize?: number;
  mainCircleOpacity?: number;
  numCircles?: number;
}

export const Ripple = React.memo(function Ripple({
  mainCircleSize = 512,
  mainCircleOpacity = 0.4,
  numCircles = 4,
  className,
  ...props
}: RippleProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 mask-[linear-gradient(to_bottom,white,transparent)] select-none",
        className,
      )}
      {...props}
    >
      {Array.from({ length: numCircles }, (_, i) => {
        const size = mainCircleSize + i * 128;
        const opacity = mainCircleOpacity - i * 0.03;

        return (
          <div
            key={i}
            className={cn(
              `animate-ripple bg-primary/30 border-foreground/20 absolute rounded-full border shadow-xl`,
            )}
            style={
              {
                "--i": i,
                width: `${size}px`,
                height: `${size}px`,
                opacity,
                // animationDelay,
                // borderStyle,
                // borderWidth: "1px",
                // borderColor: `var(--foreground)`,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%) scale(1)",
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
});

Ripple.displayName = "Ripple";

export type { RippleProps };
