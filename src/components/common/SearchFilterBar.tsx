import { Search, X, type LucideIcon } from "lucide-react";

/**
 * Reusable search bar with optional clear button, matching the glass-input
 * pattern used across all management sections.
 *
 * @example
 * ```tsx
 * <SearchFilterBar
 *   value={searchTerm}
 *   onChange={setSearchTerm}
 *   placeholder="Search students by name or ID..."
 * />
 * ```
 */
interface SearchFilterBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Optional icon to display inside the search bar (default: Search). */
  icon?: LucideIcon;
  /** Additional classes on the wrapper div. */
  className?: string;
}

export default function SearchFilterBar({
  value,
  onChange,
  placeholder = "Search...",
  icon: Icon = Search,
  className = "",
}: SearchFilterBarProps) {
  return (
    <div className={`relative ${className}`}>
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="glass-input pl-10 pr-10 py-2.5 text-sm w-full"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-dark transition-colors"
          title="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
