import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Height-animating reveal (grid 0fr → 1fr) that resolves from a blur; content is inert while closed. */
export function Reveal({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  return (
    <div id={id} className={cn("grid transition-[grid-template-rows,opacity,filter] duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 blur-sm")}>
      <div className="min-h-0 overflow-hidden" inert={!open}>
        {children}
      </div>
    </div>
  );
}

interface DisclosureProps {
  title: ReactNode;
  /** Secondary line under the title (e.g. a count). */
  meta?: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

/** A glass panel whose details stay tucked away until asked for. */
export default function Disclosure({ title, meta, icon, defaultOpen = false, children, className }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={cn("card overflow-hidden p-0", className)}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        {icon && <span className="icon-tile h-9 w-9">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">{title}</span>
          {meta && <span className="block text-xs text-muted">{meta}</span>}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-[rotate] duration-500", open && "[rotate:180deg]")} />
      </button>
      <Reveal open={open} id={id}>
        {children}
      </Reveal>
    </div>
  );
}
