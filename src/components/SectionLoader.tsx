import { Loader2 } from "lucide-react";

interface SectionLoaderProps {
  message?: string;
}

/** Full-width loading card shown by data sections while records are fetched. */
export default function SectionLoader({ message = "Loading..." }: SectionLoaderProps) {
  return (
    <div className="glass-card p-12 text-center">
      <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-metallic-blue" />
      <p className="text-text-secondary">{message}</p>
    </div>
  );
}