import { useEffect, useState } from 'react';
import { Download, Loader2, QrCode } from 'lucide-react';
import type { Student } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { downloadStudentAttendancePass, studentAttendancePassSvg } from '@/lib/qr';

interface StudentQrModalProps {
  student: Student | null;
  onClose: () => void;
}

/**
 * Preview + download dialog for a student's official attendance pass. The QR
 * encodes Student ID, Name, Program, Year, and Section; the preview renders the
 * exact generated pass SVG (including the justified privacy notice at the
 * bottom) so the on-screen viewing always matches the downloaded PNG/SVG.
 */
export default function StudentQrModal({ student, onClose }: StudentQrModalProps) {
  const [passSrc, setPassSrc] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!student) return;
    let alive = true;
    setPassSrc(null);
    studentAttendancePassSvg(student)
      .then((svg) => {
        if (alive) setPassSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch((error) => {
        console.error('Error generating attendance pass:', error);
        if (alive) toast.error('Failed to generate the Attendance Pass');
      });
    return () => {
      alive = false;
    };
  }, [student]);

  const handleDownloadPng = async () => {
    if (!student || !passSrc) return;
    try {
      setDownloading(true);
      toast.success(await downloadStudentAttendancePass(student, 'png'));
    } catch (error) {
      console.error('Error downloading attendance pass:', error);
      toast.error('Failed to download the Attendance Pass');
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadSvg = async () => {
    if (!student) return;
    try {
      setDownloading(true);
      toast.success(await downloadStudentAttendancePass(student, 'svg'));
    } catch (error) {
      console.error('Error downloading attendance pass:', error);
      toast.error('Failed to download the Attendance Pass');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={!!student} onOpenChange={onClose}>
      <DialogContent className="glass-card-strong max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl p-4 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:p-6 [&>[data-slot=scroll-area]]:min-h-0">
        <DialogHeader className="pr-8">
          <DialogTitle className="flex items-center gap-2 font-display text-xl font-bold text-dark">
            <QrCode className="h-5 w-5 shrink-0 text-[var(--dssc-royal-blue)]" />
            Student QR Attendance Pass
          </DialogTitle>
        </DialogHeader>

        {student && (
          <div className="mt-3 space-y-4 pb-4 sm:mt-4 sm:space-y-5">
            {/* Exact generated pass preview — 850:440 aspect ratio */}
            <article className="relative w-full overflow-hidden rounded-xl border border-[var(--dssc-border)] bg-white shadow-card" style={{ aspectRatio: '850 / 440' }}>
              {passSrc ? (
                <img
                  src={passSrc}
                  alt={`Student QR Attendance Pass for ${student.name}`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-text-secondary" />
                </div>
              )}
            </article>

            <p className="px-1 text-center text-xs leading-5 text-text-secondary">
              Scan this QR code at LSC events to record attendance. The pass carries the
              required data privacy notice at the bottom. Download the complete pass as PNG or SVG.
            </p>

            <div className="sticky bottom-0 z-10 -mx-1 border-t border-[var(--dssc-border)] bg-[var(--dssc-off-white)] px-1 pb-1 pt-3 shadow-[0_-8px_16px_rgba(244,246,252,0.95)]">
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleDownloadPng}
                  disabled={downloading || !passSrc}
                  className="min-h-11 flex-1 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Download Pass PNG
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSvg}
                  disabled={downloading}
                  className="min-h-11 flex-1 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Download Pass SVG
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}