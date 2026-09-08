import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
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
      <img
        src={file.fileUrl}
        alt={file.title}
        className="w-full rounded-lg object-contain"
      />
    );
  }

  if (kind === "pdf") {
    return (
      <iframe
        src={file.fileUrl}
        title={file.title}
        className="h-[55vh] w-full rounded-lg"
      />
    );
  }

  if (kind === "audio") {
    return (
      <div className="flex min-h-56 items-center justify-center p-6">
        <audio src={file.fileUrl} controls className="w-full" />
      </div>
    );
  }

  if (kind === "video") {
    return (
      <video
        src={file.fileUrl}
        controls
        className="max-h-[55vh] w-full rounded-lg bg-black"
      />
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
      <pre className="min-h-56 whitespace-pre-wrap break-words p-5 text-left font-mono text-sm text-dark">
        {text}
      </pre>
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
      <div className="overflow-auto">
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
    );
  }

  if (kind === "office") {
    return (
      <iframe
        src={officeViewerUrl(file.fileUrl)}
        title={`${file.title} document preview`}
        className="h-[55vh] w-full rounded-lg"
      />
    );
  }

  return (
    <PreviewMessage>
      Preview not supported for this file type. Use Download to save the file and open it with a compatible application.
    </PreviewMessage>
  );
}
