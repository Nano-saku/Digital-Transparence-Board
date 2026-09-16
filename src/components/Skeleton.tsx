import type { HTMLAttributes } from "react";

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

/** A layout-shaped placeholder used for every in-flight loading state. */
export default function Skeleton({ className = "", ...props }: SkeletonProps) {
  return <div aria-hidden="true" className={`skeleton ${className}`} {...props} />;
}