import { normalizeStudentName } from "../../lib/utils";
import type { Student } from "../../types";
import { defineTable, findStudentRows, opt, readOnly, sb } from "./core";

const students = defineTable<Student>({
  name: "students",
  entity: "student",
  columns: {
    studentId: "student_id",
    name: "name",
    program: "program",
    yearLevel: "year_level",
    section: "section",
    profilePhotoUrl: readOnly(opt("profile_photo_url")),
    accountUserId: readOnly(opt("account_user_id")),
  },
  order: [["name"]],
  memoize: true,
});

// Applied before both the payload and the optimistic local record.
const withNormalizedName = <T extends Partial<Student>>(record: T): T =>
  record.name === undefined ? record : { ...record, name: normalizeStudentName(record.name) };

type ImportFailure = { index: number; studentId: string; name: string; error: string };

export const studentsService = {
  getAll: (): Promise<Student[]> => students.getAll(),

  async getByStudentId(studentId: string): Promise<Student | null> {
    return (await students.getAll()).find((student) => student.studentId === studentId) ?? null;
  },

  async getByName(name: string): Promise<Student | null> {
    const search = name.toLowerCase();
    return (await students.getAll()).find((student) => student.name.toLowerCase().includes(search)) ?? null;
  },

  create(student: Omit<Student, "id">): Promise<Student> {
    const record = withNormalizedName(student);
    const { studentId, name, program, yearLevel, section } = record;
    return students.create(record, `Created student ${name} (${studentId}).`, {
      studentId,
      name,
      program,
      yearLevel,
      section,
    });
  },

  update: (id: string, record: Partial<Student>): Promise<Student> =>
    students.update(id, withNormalizedName(record)),

  delete: (id: string): Promise<void> => students.delete(id),

  /** Creates one by one; per-row failures (e.g. duplicates) are reported instead of aborting. */
  async createMany(list: Omit<Student, "id">[]): Promise<{ created: Student[]; failed: ImportFailure[] }> {
    const created: Student[] = [];
    const failed: ImportFailure[] = [];
    for (const [index, student] of list.entries()) {
      try {
        created.push(await studentsService.create(student));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failed.push({ index, studentId: student.studentId, name: student.name, error: message });
      }
    }
    return { created, failed };
  },

  async search(query: string): Promise<Student[]> {
    return (await findStudentRows(query)).map(students.fromRow);
  },
};

const PROFILE_PHOTO_BUCKET = "profile-photos";
const PROFILE_PHOTO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const profilePhotoService = {
  maxBytes: 5 * 1024 * 1024,
  supportedTypes: new Set(Object.keys(PROFILE_PHOTO_EXTENSIONS)),

  async upload(studentId: string, file: File): Promise<string> {
    if (!profilePhotoService.supportedTypes.has(file.type)) {
      throw new Error("Please choose a JPG, PNG, or WebP image.");
    }
    if (file.size > profilePhotoService.maxBytes) {
      throw new Error("Profile photos must be 5 MB or smaller.");
    }

    // Uploaded to a fresh immutable path before the student row changes, so
    // the current photo survives a failed upload or RPC.
    const path = `${studentId}/profile/${crypto.randomUUID()}.${PROFILE_PHOTO_EXTENSIONS[file.type]}`;
    const storage = sb().storage.from(PROFILE_PHOTO_BUCKET);
    const { error: uploadError } = await storage.upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: "3600",
    });
    if (uploadError) throw new Error(`Profile photo upload failed: ${uploadError.message}`);

    const versionedUrl = `${storage.getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    const { data, error } = await sb().rpc("set_student_profile_photo", {
      target_student_id: studentId,
      next_profile_photo_url: versionedUrl,
    });
    if (error) throw new Error(`Photo uploaded but was not saved to the student record: ${error.message}`);

    students.invalidate();
    if (data !== versionedUrl) throw new Error("Profile photo update was not confirmed by the database.");
    return versionedUrl;
  },
};
