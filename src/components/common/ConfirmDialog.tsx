import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Reusable confirmation dialog used across every management section
 * for destructive actions (delete, clear, etc.).
 *
 * @example
 * ```tsx
 * <ConfirmDialog
 *   open={showDeleteConfirm}
 *   onClose={() => setShowDeleteConfirm(false)}
 *   onConfirm={handleDelete}
 *   title="Delete Event"
 *   description="Are you sure you want to delete this event?"
 *   warningText="This action cannot be undone."
 *   confirmLabel="Delete Event"
 *   loading={saving}
 * />
 * ```
 */
interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  warningText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  /** Render a custom description with JSX (overrides `description`). */
  children?: React.ReactNode;
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  warningText,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  loading = false,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-card-strong max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display font-bold text-xl text-dark">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {children ?? (
            <p className="text-sm text-text-secondary">{description}</p>
          )}
          {warningText && (
            <p className="text-xs text-text-secondary/80">{warningText}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 glass-button px-4 py-2.5"
              disabled={loading}
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 btn-primary px-4 py-2.5 flex items-center justify-center gap-2 !bg-red !border-none"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  {confirmLabel}
                </>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
