import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  AlertCircle,
  ChevronsDown,
  ChevronsUp,
  Loader2,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { readSheet } from "read-excel-file/browser";
import type { StudentRequirementFile } from "@/types";

interface FilePreviewProps {
  file: StudentRequirementFile;
}

type PreviewKind =
  | "image"
  | "pdf"
  | "text"
  | "audio"
  | "video"
  | "office"
  | "unsupported";

function fileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function getPreviewKind(file: StudentRequirementFile): PreviewKind {
  const extension = fileExtension(file.fileName);
  const fileType = file.fileType?.toLowerCase() ?? "";

  if (fileType.startsWith("image/") || /^(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(extension)) {
    return "image";
  }
  if (fileType === "application/pdf" || extension === "pdf") return "pdf";
  if (
    fileType.startsWith("audio/") ||
    /^(mp3|wav|ogg|oga|aac|m4a|flac)$/.test(extension)
  ) {
    return "audio";
  }
  if (
    fileType.startsWith("video/") ||
    /^(mp4|webm|ogv|mov|m4v|avi)$/.test(extension)
  ) {
    return "video";
  }
  if (
    fileType.startsWith("text/") ||
    /^(txt|csv|tsv|log|md)$/.test(extension)
  ) {
    return "text";
  }
  if (
    /^(doc|docx|xls|xlsx|ppt|pptx)$/.test(extension) ||
    fileType.includes("msword") ||
    fileType.includes("wordprocessingml") ||
    fileType.includes("ms-excel") ||
    fileType.includes("spreadsheetml") ||
    fileType.includes("ms-powerpoint") ||
    fileType.includes("presentationml")
  ) {
    return "office";
  }
  return "unsupported";
}

function officeViewerUrl(fileUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
}

function isSpreadsheet(file: StudentRequirementFile): boolean {
  return /^(xlsx)$/.test(fileExtension(file.fileName));
}

function PreviewMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-text-secondary">
      <AlertCircle className="h-8 w-8 text-royal-blue" />
      <p>{children}</p>
    </div>
  );
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

interface InteractivePreviewProps {
  children: ReactNode;
  /** Media controls must remain clickable while the document surface is draggable. */
  mediaControls?: boolean;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

function InteractivePreview({ children, mediaControls = false }: InteractivePreviewProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [compact, setCompact] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<DragState | null>(null);

  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const changeZoom = (amount: number) => {
    setZoom((current) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + amount));
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = dragState.current;
    if (!current || current.pointerId !== event.pointerId) return;
    setOffset({
      x: current.originX + event.clientX - current.startX,
      y: current.originY + event.clientY - current.startY,
    });
  };

  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragState.current?.pointerId === event.pointerId) {
      dragState.current = null;
      setDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    changeZoom(event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
  };

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--dssc-border)] bg-white/70 p-2">
        <div className="flex items-center gap-1.5" aria-label="Preview zoom controls">
          <button
            type="button"
            onClick={() => changeZoom(-ZOOM_STEP)}
            disabled={zoom <= MIN_ZOOM}
            className="glass-button h-8 w-8 justify-center p-0 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Zoom out"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="min-w-12 text-center text-xs font-semibold text-dark" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => changeZoom(ZOOM_STEP)}
            disabled={zoom >= MAX_ZOOM}
            className="glass-button h-8 w-8 justify-center p-0 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Zoom in"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={resetView}
            className="glass-button h-8 gap-1.5 px-2.5 text-xs"
            title="Fit the preview to the screen"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Fit to Screen</span>
            <span className="sm:hidden">Fit</span>
          </button>
          <button
            type="button"
            onClick={() => setCompact((current) => !current)}
            className="glass-button h-8 gap-1.5 px-2.5 text-xs"
            title={compact ? "Expand preview" : "Use compact preview"}
            aria-pressed={compact}
          >
            {compact ? (
              <ChevronsDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronsUp className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{compact ? "Expand" : "Compact"}</span>
            <span className="sm:hidden">{compact ? "Expand" : "Small"}</span>
          </button>
        </div>
      </div>

      <div
        className={`relative w-full overflow-hidden rounded-lg border border-[var(--dssc-border)] bg-slate-100/70 shadow-inner ${
          compact ? "h-[28vh] min-h-48 sm:h-[34vh]" : "h-[46vh] min-h-64 sm:h-[52vh]"
        } ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onWheel={handleWheel}
        style={{ touchAction: "none" }}
        role="application"
        aria-label="Interactive file preview. Drag to pan and use the controls to zoom."
      >
        <div
          className={`absolute inset-0 flex items-center justify-center p-3 sm:p-5 ${
            mediaControls ? "pointer-events-auto" : "pointer-events-none"
          }`}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
            transformOrigin: "center center",
            transition: dragging ? "none" : "transform 180ms ease-out",
          }}
        >
          {children}
        </div>
      </div>
      <p className="mt-1.5 text-center text-[11px] text-text-secondary">
        Drag to pan · Scroll or use + / − to zoom · Fit resets the view
      </p>
    </div>
  );
}

export default function FilePreview({ file }: FilePreviewProps) {
  const kind = useMemo(() => getPreviewKind(file), [file]);
  const [text, setText] = useState<string | null>(null);
  const [spreadsheet, setSpreadsheet] = useState<unknown[][] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (kind !== "text" && !(kind === "office" && isSpreadsheet(file))) {
      setText(null);
      setSpreadsheet(null);
      setError(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const loadFile = async () => {
      setLoading(true);
      setError(null);
      setText(null);
      setSpreadsheet(null);

      try {
        const response = await fetch(file.fileUrl);
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

        if (kind === "text") {
          const contents = await response.text();
          if (!cancelled) setText(contents);
        } else {
          const workbook = await readSheet(await response.blob());
          if (!cancelled) setSpreadsheet(workbook as unknown[][]);
        }
      } catch (loadError) {
        console.error("Error loading file preview:", loadError);
        if (!cancelled) {
          setError(
            kind === "text"
              ? "This text file could not be loaded for preview."
              : "This spreadsheet could not be loaded for preview.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadFile();
    return () => {
      cancelled = true;
    };
  }, [file, kind]);

  if (kind === "image") {
    return (
      <InteractivePreview>
        <img
          src={file.fileUrl}
          alt={file.title}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
      </InteractivePreview>
    );
  }

  if (kind === "pdf") {
    return (
      <InteractivePreview>
        <iframe
          src={file.fileUrl}
          title={file.title}
          className="h-full w-full rounded-lg"
        />
      </InteractivePreview>
    );
  }

  if (kind === "audio") {
    return (
      <InteractivePreview mediaControls>
        <div
          className="flex w-full max-w-xl items-center justify-center p-6"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <audio src={file.fileUrl} controls className="w-full" />
        </div>
      </InteractivePreview>
    );
  }

  if (kind === "video") {
    return (
      <InteractivePreview mediaControls>
        <video
          src={file.fileUrl}
          controls
          className="max-h-full max-w-full rounded-lg bg-black"
          onPointerDown={(event) => event.stopPropagation()}
        />
      </InteractivePreview>
    );
  }

  if (kind === "text") {
    if (loading) {
      return (
        <PreviewMessage>
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading text preview...
          </span>
        </PreviewMessage>
      );
    }
    if (error) return <PreviewMessage>{error}</PreviewMessage>;
    return (
      <InteractivePreview>
        <pre className="max-h-full max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-5 text-left font-mono text-sm text-dark shadow-sm">
          {text}
        </pre>
      </InteractivePreview>
    );
  }

  if (kind === "office" && isSpreadsheet(file)) {
    if (loading) {
      return (
        <PreviewMessage>
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading spreadsheet preview...
          </span>
        </PreviewMessage>
      );
    }
    if (error || !spreadsheet) {
      return <PreviewMessage>{error ?? "This spreadsheet could not be previewed."}</PreviewMessage>;
    }
    return (
      <InteractivePreview>
        <div className="max-h-full max-w-full overflow-auto rounded-lg bg-white shadow-sm">
          <table className="min-w-full border-collapse text-left text-sm">
            <tbody>
              {spreadsheet.map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex === 0 ? "bg-royal-blue/10 font-semibold" : ""}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="border border-black/10 px-3 py-2 align-top text-dark">
                      {cell === null || cell === undefined ? "" : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {spreadsheet.length === 0 && <PreviewMessage>This spreadsheet is empty.</PreviewMessage>}
        </div>
      </InteractivePreview>
    );
  }

  if (kind === "office") {
    return (
      <InteractivePreview>
        <iframe
          src={officeViewerUrl(file.fileUrl)}
          title={`${file.title} document preview`}
          className="h-full w-full rounded-lg"
        />
      </InteractivePreview>
    );
  }

  return (
    <InteractivePreview>
      <PreviewMessage>
        Preview not supported for this file type. Use Download to save the file and open it with a compatible application.
      </PreviewMessage>
    </InteractivePreview>
  );
}
