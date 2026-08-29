import { useEffect, useState } from 'react';
import { QrCode, Download, Loader2 } from 'lucide-react';
import type { Student } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  downloadUrl,
  downloadStudentQrSvg,
  studentQrDataUrl,
  studentQrFileName,
} from '@/lib/qr';

interface StudentQrModalProps {
  student: Student | null;
  onClose: () => void;
}

/**
 * Preview + download dialog for a student's auto-generated attendance QR
 * code. The QR encodes Student ID, Name, Program, Year, and Section and can
 * be saved as PNG (raster) or SVG (vector).
 */
export default function StudentQrModal({ student, onClose }: StudentQrModalProps) {
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!student) return;
    let alive = true;
    setQrSrc(null);
    studentQrDataUrl(student, 480)
      .then((url) => {
        if (alive) setQrSrc(url);
      })
      .catch((error) => {
        console.error('Error generating QR code:', error);
        if (alive) toast.error('Failed to generate QR code');
      });
    return () => {
      alive = false;
    };
  }, [student]);

  const handleDownloadPng = () => {
    if (!student || !qrSrc) return;
    try {
      setDownloading(true);
      downloadUrl(qrSrc, studentQrFileName(student, 'png'));
      toast.success('QR code downloaded (PNG)');
    } catch (error) {
      console.error('Error downloading QR code:', error);
      toast.error('Failed to download QR code');
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadSvg = async () => {
    if (!student) return;
    try {
      setDownloading(true);
      const message = await downloadStudentQrSvg(student);
      toast.success(message);
    } catch (error) {
      console.error('Error downloading QR code:', error);
      toast.error('Failed to download QR code');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={!!student} onOpenChange={onClose}>
      <DialogContent className="glass-card-strong max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display font-bold text-xl text-dark flex items-center gap-2">
            <QrCode className="w-5 h-5 text-red" />
            Attendance QR Code
          </DialogTitle>
        </DialogHeader>

        {student && (
          <div className="mt-4 space-y-4">
            <div className="mx-auto w-56 h-56 rounded-xl bg-white p-3 flex items-center justify-center border border-white/60 shadow-card">
              {qrSrc ? (
                <img
                  src={qrSrc}
                  alt={`Attendance QR code for ${student.name}`}
                  className="w-full h-full"
                />
              ) : (
                <Loader2 className="w-8 h-8 animate-spin text-text-secondary" />
              )}
            </div>

            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-text-secondary">Student ID</span>
                <span className="font-medium text-dark text-right">{student.studentId}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-text-secondary">Name</span>
                <span className="font-medium text-dark text-right">{student.name}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-text-secondary">Program</span>
                <span className="font-medium text-dark text-right">{student.program}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-text-secondary">Year</span>
                <span className="font-medium text-dark text-right">{student.yearLevel}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-text-secondary">Section</span>
                <span className="font-medium text-dark text-right">{student.section}</span>
              </div>
            </div>

            <p className="text-xs text-text-secondary text-center">
              Scan this at events to mark attendance. Download as PNG or SVG.
            </p>

            <div className="flex gap-3">
              <button
onClick={handleDownloadPng}
                disabled={downloading || !qrSrc}
                className="flex-1 px-4 py-2.5 text-sm disabled:opacity-60"
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Download PNG
              </button>
              <button
onClick={handleDownloadSvg}
                disabled={downloading}
                className="flex-1 px-4 py-2.5 text-sm disabled:opacity-60"
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Download SVG
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}