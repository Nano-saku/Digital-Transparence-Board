import { ArrowLeft } from "lucide-react";
interface SectionBackButtonProps {
  onClick: () => void;
  /** Show an inline text label next to the arrow (icon-only when omitted). */
  label?: string;
  className?: string;
}

/** Common back button used at the top of admin/record sections. */
export default function SectionBackButton({
  onClick,
  label,
  className = "",
}: SectionBackButtonProps) {
  if (!label) {
    return (
      <button onClick={onClick} className={`p-2.5 ${className}`.trim()} aria-label="Go back">
        <ArrowLeft className="w-5 h-5 text-royal-blue" />
      </button>
    );
  }
  return (
    <button onClick={onClick} className={`p-2.5 ${className}`.trim()}>
      <ArrowLeft className="w-5 h-5 text-royal-blue" />
      <span className="text-royal-blue">{label}</span>
    </button>
  );
}