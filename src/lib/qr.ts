// ======================================================================
// Student QR codes — auto-generated for attendance tracking
// ======================================================================
// Every student gets a QR code that encodes their Student ID, Name,
// Program, Year, and Section as a small JSON payload. Staff scan these
// QR codes at events (see the Event Management attendance tab) to mark
// attendance; students can download their own QR from the Student
// Management table or from their public student-record page.
//
// Uses the battle-tested "qrcode" package (MIT) — fully client-side,
// no network calls or third-party services required.
// ======================================================================

import QRCode from "qrcode";
import type { Student } from "@/types";

export interface StudentQrPayload {
  /** Version marker so the scanner can reject old / foreign payloads. */
  version: 1;
  kind: "student";
  studentId: string;
  name: string;
  program: string;
  year: number;
  section: string;
}

/** Builds the JSON payload encoded inside a student's QR code. */
export function studentQrPayload(student: Student): StudentQrPayload {
  return {
    version: 1,
    kind: "student",
    studentId: student.studentId,
    name: student.name,
    program: student.program,
    year: student.yearLevel,
    section: student.section,
  };
}

/** The text encoded in the QR (JSON containing the 5 required fields). */
export function studentQrText(student: Student): string {
  return JSON.stringify(studentQrPayload(student));
}

/** Tries to parse raw scanner / pasted text back into a student payload. */
export function parseStudentQrText(text: string): StudentQrPayload | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const value = JSON.parse(trimmed);
    if (
      value &&
      value.version === 1 &&
      value.kind === "student" &&
      typeof value.studentId === "string" &&
      value.studentId &&
      typeof value.name === "string" &&
      value.name
    ) {
      return value as StudentQrPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/** Renders the QR code as a PNG data URL (white background, quiet zone 1). */
export async function studentQrDataUrl(student: Student, size = 512): Promise<string> {
  return QRCode.toDataURL(studentQrText(student), {
    width: size,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#1a202c", light: "#ffffff" },
  });
}

/** Downloads a QR code as SVG (vector, prints cleanly). */
export async function downloadStudentQrSvg(student: Student): Promise<string> {
  const svg = await QRCode.toString(studentQrText(student), {
    type: "svg",
    width: 1024,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#1a202c", light: "#ffffff" },
  });
  downloadUrl(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    studentQrFileName(student, "svg")
  );
  return "QR code downloaded (SVG)";
}

/** File name for a downloaded student QR, e.g. "student-qr-2021-00001.png". */
export function studentQrFileName(student: Student, ext: "png" | "svg"): string {
  const safeId = student.studentId.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `student-qr-${safeId}.${ext}`;
}

/** Triggers a browser download for the given href (data: or blob:). */
export function downloadUrl(href: string, fileName: string): void {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (href.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(href), 1000);
}