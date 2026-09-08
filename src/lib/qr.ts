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

// The physical SVG dimensions are intentional: this pass is printed at
// exactly 12 cm × 6.5 cm in landscape orientation. The viewBox gives the
// layout enough room for readable type while preserving that physical ratio.
const PASS_WIDTH = 1200;
const PASS_HEIGHT = 650;
const PASS_PNG_SCALE = 2;

const PASS_PRIVACY_LINES = [
  "Personal data on this pass is collected and processed in compliance with R.A. No. 10173 (Data Privacy Act of 2012)",
  "and its Implementing Rules and Regulations. By using this pass, the student consents to the collection and processing",
  "of the information herein solely for official attendance monitoring and related academic purposes. For data access,",
  "correction, or erasure requests, contact the LSC Data Protection Officer or the institution's Privacy Office.",
];

let lscLogoDataUri: string | null = null;

const xml = (value: string | number): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** Embeds the official logo so downloaded passes remain self-contained. */
async function getLscLogoDataUri(): Promise<string> {
  if (lscLogoDataUri) return lscLogoDataUri;

  const response = await fetch("/lsc-logo.jpg");
  if (!response.ok) throw new Error(`Failed to load the LSC logo: ${response.status}`);

  const logoBlob = await response.blob();
  const reader = new FileReader();
  const dataUri = await new Promise<string>((resolve, reject) => {
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to encode the LSC logo."));
    reader.readAsDataURL(logoBlob);
  });
  lscLogoDataUri = dataUri;
  return dataUri;
}

function attendancePassFileName(student: Student, ext: "png" | "svg"): string {
  const safeId = student.studentId.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `student-attendance-pass-${safeId}.${ext}`;
}

/** Builds the formal, self-contained SVG used for both attendance-pass exports. */
export async function studentAttendancePassSvg(student: Student): Promise<string> {
  const [qrDataUri, lscLogo] = await Promise.all([
    // Rasterize the QR to a PNG data URI (not a nested SVG) before embedding it
    // in the pass. Browsers block nested `<image>` SVG data-URIs when an SVG is
    // rendered as an image (in `<img>`/canvas), which would otherwise leave the
    // QR blank and break the PNG export.
    QRCode.toDataURL(studentQrText(student), {
      type: "image/png",
      width: 380,
      margin: 1,
      errorCorrectionLevel: "H",
      color: { dark: "#1a202c", light: "#ffffff" },
    }),
    getLscLogoDataUri(),
  ]);

  const privacyLinesSvg = PASS_PRIVACY_LINES.map((line, i) =>
    `<text x="224" y="${591 + i * 13}" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="#ffffff">${xml(line)}</text>`
  ).join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="12cm" height="6.5cm" viewBox="0 0 ${PASS_WIDTH} ${PASS_HEIGHT}"
  role="img" aria-label="Student QR Attendance Pass for ${xml(student.name)}">
  <title>Student QR Attendance Pass — ${xml(student.name)}</title>
  <rect width="${PASS_WIDTH}" height="${PASS_HEIGHT}" rx="14" fill="#ffffff" stroke="#d0d5dd" stroke-width="2" />
  <!-- Gold rules are intentionally retained at both physical edges. -->
  <rect x="0" y="0" width="${PASS_WIDTH}" height="8" rx="5" fill="#c99a31" />
  <rect x="0" y="${PASS_HEIGHT - 8}" width="${PASS_WIDTH}" height="8" rx="5" fill="#c99a31" />

  <!-- ===== LEFT QR SECTION ===== -->
  <rect x="20" y="28" width="330" height="500" rx="16" fill="#10256f" />
  <rect x="40" y="48" width="290" height="290" rx="10" fill="#ffffff" />
  <image href="${qrDataUri}" xlink:href="${qrDataUri}" x="55" y="61" width="260" height="264" preserveAspectRatio="xMidYMid meet" />
  <circle cx="185" cy="193" r="31" fill="#ffffff" stroke="#ffffff" stroke-width="5" />
  <clipPath id="qr-pass-seal"><circle cx="185" cy="193" r="27" /></clipPath>
  <image href="${lscLogo}" xlink:href="${lscLogo}" x="158" y="166" width="54" height="54" preserveAspectRatio="xMidYMid meet" clip-path="url(#qr-pass-seal)" />
  <text x="185" y="389" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="700" letter-spacing="3" fill="#ffffff" text-anchor="middle">SCAN FOR</text>
  <text x="185" y="419" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="700" letter-spacing="3" fill="#ffffff" text-anchor="middle">ATTENDANCE</text>
  <line x1="52" y1="442" x2="318" y2="442" stroke="#ffffff" stroke-opacity="0.45" stroke-width="2" />
  <text x="185" y="471" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" letter-spacing="1.5" fill="#ffffff" text-anchor="middle">ISSUED BY THE LSC</text>
  <text x="185" y="493" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" letter-spacing="1.5" fill="#ffffff" text-anchor="middle">DIGITAL ATTENDANCE PASS</text>

  <!-- ===== RIGHT INFORMATION SECTION ===== -->
  <image href="${lscLogo}" xlink:href="${lscLogo}" x="380" y="35" width="52" height="52" preserveAspectRatio="xMidYMid meet" />
  <text x="450" y="57" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" letter-spacing="2.5" fill="#667085">LOCAL STUDENT COUNCIL</text>
  <text x="450" y="84" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" letter-spacing="1" fill="#17213f">STUDENT QR ATTENDANCE PASS</text>
  <line x1="375" y1="103" x2="1160" y2="103" stroke="#cbd5f0" stroke-width="2" />

  <text x="375" y="130" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" letter-spacing="1.5" fill="#667085">STUDENT ID</text>
  <text x="375" y="161" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="700" fill="#173b82">${xml(student.studentId)}</text>
  <line x1="375" y1="174" x2="930" y2="174" stroke="#cbd5f0" stroke-width="2" />
  <text x="375" y="201" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" letter-spacing="1.5" fill="#667085">NAME</text>
  <text x="375" y="233" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="700" fill="#173b82">${xml(student.name)}</text>
  <line x1="375" y1="246" x2="930" y2="246" stroke="#cbd5f0" stroke-width="2" />
  <text x="375" y="273" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" letter-spacing="1.5" fill="#667085">PROGRAM</text>
  <text x="375" y="305" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="700" fill="#173b82">${xml(student.program)}</text>
  <line x1="375" y1="318" x2="930" y2="318" stroke="#cbd5f0" stroke-width="2" />
  <text x="375" y="346" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" letter-spacing="1.5" fill="#667085">YEAR</text>
  <text x="375" y="378" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="700" fill="#173b82">${xml(student.yearLevel)}</text>
  <line x1="375" y1="391" x2="620" y2="391" stroke="#cbd5f0" stroke-width="2" />
  <text x="680" y="346" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" letter-spacing="1.5" fill="#667085">SECTION</text>
  <text x="680" y="378" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="700" fill="#173b82">${xml(student.section)}</text>
  <line x1="680" y1="391" x2="930" y2="391" stroke="#cbd5f0" stroke-width="2" />

  <!-- Empty 2×2 physical photo frame; the student photo is added after printing. -->
  <rect x="960" y="81" width="200" height="200" rx="8" fill="#f2f4f7" stroke="#173b82" stroke-width="3" />
  <text x="1060" y="309" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" letter-spacing="1" fill="#173b82" text-anchor="middle">STUDENT PHOTO</text>

  <!-- ===== OFFICIAL USE ===== -->
  <rect x="375" y="414" width="785" height="114" rx="12" fill="#edf3fb" />
  <text x="398" y="445" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700" letter-spacing="1.5" fill="#173b82">OFFICIAL USE</text>
  <text x="398" y="472" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#475467">This digital QR Attendance Pass is issued by the Local Student Council (LSC)</text>
  <text x="398" y="495" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#475467">for attendance verification and monitoring during official events.</text>

  <!-- ===== SEPARATE FULL-WIDTH DATA PRIVACY NOTICE ===== -->
  <rect x="20" y="540" width="1160" height="94" rx="14" fill="#102f7d" />
  <path d="M 54 564 L 78 554 L 102 564 L 99 594 C 96 605, 87 611, 78 615 C 69 611, 60 605, 57 594 Z" fill="none" stroke="#ffffff" stroke-width="3" />
  <rect x="70" y="577" width="16" height="14" rx="2" fill="#ffffff" />
  <path d="M 73 577 V 573 A 5 5 0 0 1 83 573 V 577" fill="none" stroke="#ffffff" stroke-width="3" />
  <line x1="125" y1="552" x2="125" y2="622" stroke="#ffffff" stroke-opacity="0.75" stroke-width="2" />
  <text x="155" y="565" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" letter-spacing="2" fill="#ffffff">DATA PRIVACY NOTICE</text>
  ${privacyLinesSvg}
</svg>`;
}

async function attendancePassPngBlob(svg: string): Promise<Blob> {
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to render the attendance pass image."));
      image.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = PASS_WIDTH * PASS_PNG_SCALE;
    canvas.height = PASS_HEIGHT * PASS_PNG_SCALE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not supported in this browser.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed."))), "image/png");
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/** Downloads the complete official student attendance pass in the requested format. */
export async function downloadStudentAttendancePass(student: Student, format: "png" | "svg"): Promise<string> {
  const svg = await studentAttendancePassSvg(student);
  if (format === "svg") {
    downloadUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, attendancePassFileName(student, "svg"));
    return "Student Attendance Pass downloaded (SVG)";
  }

  const png = await attendancePassPngBlob(svg);
  downloadUrl(URL.createObjectURL(png), attendancePassFileName(student, "png"));
  return "Student Attendance Pass downloaded (PNG)";
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