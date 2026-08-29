import { useState } from "react";
import {
  ExternalLink, Download, Receipt,
  FileImage, FileCode2, ChevronDown,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { downloadReceipt, isSvgUrl, type ReceiptFormat } from "@/lib/receipts";
interface ReceiptViewerProps {
  receiptUrl: string | null;
  onClose: () => void;
  title?: string;
}

/** Format options shown only for auto-generated (SVG) receipts. */
const EXPORT_FORMATS: { format: ReceiptFormat; label: string; icon: typeof FileImage }[] = [
  { format: "svg", label: "SVG (vector)", icon: FileCode2 },
  { format: "png", label: "PNG (image)", icon: FileImage },
  { format: "jpg", label: "JPG (image)", icon: FileImage },
];

/**
 * Shared receipt preview dialog. Shows the receipt full-size and offers
 * two reliable actions:
 *   1. "Open" – open the receipt in a new browser tab.
 *   2. "Download" – fetch the file and save it; auto-generated SVG
 *      receipts can be exported as SVG, PNG, or JPG.
 */
export default function ReceiptViewer({ receiptUrl, onClose, title = "Receipt" }: ReceiptViewerProps) {
  const [downloading, setDownloading] = useState(false);

  const openInNewTab = () => {
    if (!receiptUrl) return;
    window.open(receiptUrl, "_blank", "noopener,noreferrer");
  };

  const handleDownload = async (format: ReceiptFormat) => {
    if (!receiptUrl) return;
    try {
      setDownloading(true);
      const message = await downloadReceipt(receiptUrl, format);
      toast.success(message);
    } catch (error) {
      console.error("Error downloading receipt:", error);
      toast.error("Failed to download receipt. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const isGeneratedSvg = receiptUrl ? isSvgUrl(receiptUrl) : false;

  return (
    <Dialog open={!!receiptUrl} onOpenChange={onClose}>
      <DialogContent className="glass-card-strong max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display font-bold text-xl text-dark">
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {receiptUrl ? (
            <div className="space-y-4">
              <div className="max-h-[55vh] overflow-auto rounded-lg bg-white/30">
                <img
                  src={receiptUrl}
                  alt="Receipt"
                  className="w-full rounded-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/receipts/placeholder.svg";
                  }}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
onClick={openInNewTab}
                  className="flex-1 px-4 py-2.5 text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in new tab
                </button>

                {isGeneratedSvg ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      disabled={downloading}
                      asChild
                    >
                      <button
className="flex-1 px-4 py-2.5 text-sm disabled:opacity-70"
                      >
                        {downloading ? (
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <Download className="w-4 h-4" />
                            Download
                            <ChevronDown className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="glass-card-strong">
                      {EXPORT_FORMATS.map(({ format, label, icon: Icon }) => (
                        <DropdownMenuItem
                          key={format}
                          onClick={() => handleDownload(format)}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <Icon className="w-4 h-4" />
                          {label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <button
onClick={() => handleDownload("svg")}
                    disabled={downloading}
                    className="flex-1 px-4 py-2.5 text-sm disabled:opacity-70"
                  >
                    {downloading ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Download
                  </button>
                )}
              </div>

              {isGeneratedSvg && (
                <p className="text-xs text-text-secondary text-center">
                  Auto-generated receipt — export as SVG, PNG, or JPG.
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-text-secondary">
              <Receipt className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Receipt not available</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}