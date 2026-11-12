import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/** Contains a crash to the current page so the rest of the app keeps working. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Page crashed:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 pt-24 text-center">
        <span className="icon-tile h-14 w-14 text-danger">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h2 className="text-xl font-bold">Something went wrong on this page</h2>
        <p className="text-sm text-muted">The rest of the site still works. Reload to try again, or pick another page from the menu.</p>
        <button onClick={() => window.location.reload()} className="btn btn-primary">
          <RotateCcw className="h-4 w-4" /> Reload
        </button>
      </div>
    );
  }
}
