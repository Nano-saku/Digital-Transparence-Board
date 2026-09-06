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

const PASS_WIDTH = 850;
const PASS_HEIGHT = 440;
const PASS_PNG_SCALE = 2;

/**
 * Privacy notice — rendered as centered text inside the blue left panel.
 * Each line is center-aligned (text-anchor="middle") without any
 * justify/stretch effect.
 */
const PASS_PRIVACY_LINES = [
  "Personal data on this pass is collected and processed",
  "in compliance with R.A. No. 10173 (Data Privacy Act of",
  "2012) and its Implementing Rules and Regulations. By",
  "using this pass, the student consents to the collection",
  "and processing of the information herein solely for",
  "official attendance monitoring and related academic",
  "purposes. For data access, correction, or erasure",
  "requests, contact the LSC Data Protection Officer or",
  "the institution\u2019s Privacy Office.",
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
    `<text x="138" y="${334 + i * 8}" font-family="Arial, Helvetica, sans-serif" font-size="4" fill="rgba(255,255,255,0.75)" text-anchor="middle">${xml(line)}</text>`
  ).join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${PASS_WIDTH}" height="${PASS_HEIGHT}" viewBox="0 0 ${PASS_WIDTH} ${PASS_HEIGHT}"
  role="img" aria-label="Student QR Attendance Pass for ${xml(student.name)}">
  <title>Student QR Attendance Pass — ${xml(student.name)}</title>
  <rect width="${PASS_WIDTH}" height="${PASS_HEIGHT}" rx="12" fill="#ffffff" stroke="#d0d5dd" stroke-width="1" />
  <rect x="0" y="0" width="${PASS_WIDTH}" height="4" rx="4" fill="#c99a31" />
  <rect x="0" y="${PASS_HEIGHT - 4}" width="${PASS_WIDTH}" height="4" rx="4" fill="#c99a31" />
  <rect x="14" y="8" width="248" height="424" rx="10" fill="#10256f" />
  <!-- QR code — clean left panel, no logo above -->
  <rect x="28" y="18" width="220" height="208" rx="8" fill="#ffffff" />
  <image href="${qrDataUri}" xlink:href="${qrDataUri}" x="38" y="28" width="200" height="188" preserveAspectRatio="xMidYMid meet" />
  <circle cx="138" cy="122" r="22" fill="#ffffff" stroke="#ffffff" stroke-width="4" />
  <clipPath id="qr-pass-seal"><circle cx="138" cy="122" r="18" /></clipPath>
  <image href="${lscLogo}" xlink:href="${lscLogo}" x="116" y="100" width="44" height="44" preserveAspectRatio="xMidYMid meet" clip-path="url(#qr-pass-seal)" />
  <text x="138" y="258" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="700" letter-spacing="2.5" fill="#ffffff" text-anchor="middle">SCAN FOR</text>
  <text x="138" y="272" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="700" letter-spacing="2.5" fill="#ffffff" text-anchor="middle">ATTENDANCE</text>
  <line x1="50" y1="278" x2="226" y2="278" stroke="rgba(255,255,255,0.30)" stroke-width="0.5" />
  <text x="138" y="291" font-family="Arial, Helvetica, sans-serif" font-size="5.5" font-weight="700" letter-spacing="1.5" fill="rgba(255,255,255,0.85)" text-anchor="middle">ISSUED BY THE LOCAL STUDENT COUNCIL</text>
  <text x="138" y="300" font-family="Arial, Helvetica, sans-serif" font-size="5.5" font-weight="700" letter-spacing="1.5" fill="rgba(255,255,255,0.85)" text-anchor="middle">(LSC) — DIGITAL TRANSPARENCY BOARD</text>
  <!-- ===== PRIVACY NOTICE — inside the blue section container ===== -->
  <line x1="44" y1="314" x2="232" y2="314" stroke="rgba(255,255,255,0.25)" stroke-width="0.5" />
  <text x="138" y="326" font-family="Arial, Helvetica, sans-serif" font-size="4.5" font-weight="700" letter-spacing="1.2" fill="#ffffff" text-anchor="middle">DATA PRIVACY NOTICE</text>
  ${privacyLinesSvg}
  <!-- ===== RIGHT WHITE PANEL ===== -->
  <image href="${lscLogo}" xlink:href="${lscLogo}" x="292" y="12" width="32" height="32" preserveAspectRatio="xMidYMid meet" />
  <text x="330" y="26" font-family="Arial, Helvetica, sans-serif" font-size="7.5" font-weight="700" letter-spacing="1.5" fill="#667085">LOCAL STUDENT COUNCIL</text>
  <text x="330" y="42" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" fill="#17213f">STUDENT QR ATTENDANCE PASS</text>
  <line x1="290" y1="56" x2="826" y2="56" stroke="#e5e7eb" stroke-width="1" />
  <text x="290" y="72" font-family="Arial, Helvetica, sans-serif" font-size="8" font-weight="700" letter-spacing="1" fill="#667085">STUDENT ID</text>
  <text x="290" y="90" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" fill="#17213f">${xml(student.studentId)}</text>
  <line x1="290" y1="96" x2="440" y2="96" stroke="#d0d5dd" stroke-width="1" />
  <text x="290" y="118" font-family="Arial, Helvetica, sans-serif" font-size="8" font-weight="700" letter-spacing="1" fill="#667085">NAME</text>
  <text x="290" y="136" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" fill="#17213f">${xml(student.name)}</text>
  <line x1="290" y1="142" x2="600" y2="142" stroke="#d0d5dd" stroke-width="1" />
  <text x="290" y="164" font-family="Arial, Helvetica, sans-serif" font-size="8" font-weight="700" letter-spacing="1" fill="#667085">PROGRAM</text>
  <text x="290" y="182" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" fill="#17213f">${xml(student.program)}</text>
  <line x1="290" y1="188" x2="600" y2="188" stroke="#d0d5dd" stroke-width="1" />
  <text x="290" y="210" font-family="Arial, Helvetica, sans-serif" font-size="8" font-weight="700" letter-spacing="1" fill="#667085">YEAR</text>
  <text x="290" y="228" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" fill="#17213f">${xml(student.yearLevel)}</text>
  <line x1="290" y1="234" x2="400" y2="234" stroke="#d0d5dd" stroke-width="1" />
  <text x="440" y="210" font-family="Arial, Helvetica, sans-serif" font-size="8" font-weight="700" letter-spacing="1" fill="#667085">SECTION</text>
  <text x="440" y="228" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" fill="#17213f">${xml(student.section)}</text>
  <line x1="440" y1="234" x2="540" y2="234" stroke="#d0d5dd" stroke-width="1" />
  <!-- Student photo — 1:1 square -->
  <rect x="734" y="62" width="82" height="82" rx="4" fill="#f2f4f7" stroke="#1b2e8c" stroke-width="1.5" />
  <circle cx="775" cy="88" r="12" fill="#98a2b3" />
  <path d="M 759 124 C 762 112, 788 112, 791 124 Z" fill="#98a2b3" />
  <text x="775" y="160" font-family="Arial, Helvetica, sans-serif" font-size="7" font-weight="700" fill="#1b2e8c" text-anchor="middle">STUDENT PHOTO</text>
  <line x1="290" y1="246" x2="826" y2="246" stroke="#e5e7eb" stroke-width="1" />
  <rect x="290" y="250" width="526" height="80" rx="6" fill="#f2f4f7" />
  <text x="302" y="272" font-family="Arial, Helvetica, sans-serif" font-size="8" font-weight="700" letter-spacing="1" fill="#1b2e8c">OFFICIAL USE</text>
  <text x="302" y="288" font-family="Arial, Helvetica, sans-serif" font-size="7.5" fill="#475467">This digital QR Attendance Pass is issued by the Local Student Council (LSC)</text>
  <text x="302" y="300" font-family="Arial, Helvetica, sans-serif" font-size="7.5" fill="#475467">for attendance verification and monitoring during official events.</text>
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