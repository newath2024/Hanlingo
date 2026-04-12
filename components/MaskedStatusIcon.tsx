import type { CSSProperties } from "react";

type MaskedStatusIconProps = {
  path: string;
  size?: number | string;
  color?: string;
  className?: string;
  label?: string;
};

function resolveDimension(size: number | string | undefined) {
  if (typeof size === "number") {
    return `${size}px`;
  }

  return size ?? "1rem";
}

export default function MaskedStatusIcon({
  path,
  size,
  color = "currentColor",
  className = "",
  label,
}: MaskedStatusIconProps) {
  const dimension = resolveDimension(size);
  const style = {
    width: dimension,
    height: dimension,
    color,
    backgroundColor: "currentColor",
    WebkitMaskImage: `url("${path}")`,
    maskImage: `url("${path}")`,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskSize: "contain",
    maskSize: "contain",
  } satisfies CSSProperties;

  return (
    <span
      className={`inline-block shrink-0 ${className}`}
      style={style}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    />
  );
}
