import type { ElementType, ReactNode } from "react";

type VisuallyHiddenProps = {
  children: ReactNode;
  as?: ElementType;
  className?: string;
};

/**
 * Renders content that is available to screen readers but not visible on screen.
 * Uses the standard clip-based technique so the content stays focusable/readable
 * without affecting layout (unlike `display: none` or `visibility: hidden`).
 */
export function VisuallyHidden({ children, as: Component = "span", className }: VisuallyHiddenProps) {
  return (
    <Component
      className={className}
      style={{
        position: "absolute",
        width: "1px",
        height: "1px",
        padding: 0,
        margin: "-1px",
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
        border: 0,
      }}
    >
      {children}
    </Component>
  );
}
