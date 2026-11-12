import { offlineSyncService } from "../../lib/offlineSync";
import type { StudentRequirementFile } from "../../types";
import {
  buildAudit,
  cachedQuery,
  defineTable,
  newId,
  nowIso,
  nullable,
  opt,
  orElse,
  required,
  sb,
  unwrap,
  DESC,
  type Row,
} from "./core";

const BUCKET = "student-requirements";
const ACCESS_TABLE = "student_requirement_file_access";

const files = defineTable<StudentRequirementFile>({
  name: "student_requirement_files",
  entity: "requirement_file",
  noun: "requirement file",
  label: "requirement file",
  columns: {
    title: "title",
    description: opt("description"),
    fileUrl: "file_url",
    fileName: orElse("file_name", ""),
    fileSize: nullable("file_size"),
    fileType: opt("file_type"),
    isPublished: orElse("is_published", false),
    restricted: orElse("restricted", false),
    createdBy: orElse("created_by", ""),
    createdAt: orElse("created_at", ""),
    updatedAt: orElse("updated_at", ""),
  },
  order: [["created_at", DESC]],
});

// Fixed before the mutation so an offline replay uploads to the same place.
const storagePath = (fileName: string) =>
  `requirements/${crypto.randomUUID()}.${fileName.split(".").pop()?.toLowerCase() || "pdf"}`;

async function upload(path: string, blob: Blob): Promise<string> {
  const storage = sb().storage.from(BUCKET);
  const { error } = await storage.upload(path, blob, { upsert: false, contentType: blob.type });
  if (error) throw new Error(error.message);
  return storage.getPublicUrl(path).data.publicUrl;
}

// Best effort: a leftover object in Storage must never fail the user's action.
async function removeStored(fileUrl: unknown): Promise<void> {
  const name = typeof fileUrl === "string" ? fileUrl.split("/requirements/")[1] : undefined;
  if (!name) return;
  try {
    await sb().storage.from(BUCKET).remove([`requirements/${name}`]);
  } catch (error) {
    console.warn("Could not remove requirement file from storage:", error);
  }
}

export const studentRequirementFilesService = {
  getAll: (): Promise<StudentRequirementFile[]> => files.getAll(),

  /**
   * Published files this student may see (open ones plus restricted ones
   * listing the student), resolved server-side by get_student_requirement_files
   * so a restricted file never reaches a client that shouldn't see it.
   */
  getVisibleForStudent: (studentId: string): Promise<StudentRequirementFile[]> =>
    cachedQuery(
      "student_requirement_files",
      () => files.list(sb().rpc("get_student_requirement_files", { p_student_id: studentId })),
      // Offline, access lists can't be checked: only open published files.
      (file) => file.isPublished && !file.restricted,
    ),

  /** IDs of students on a restricted file's access list. */
  async getAccessList(fileId: string): Promise<string[]> {
    const rows = await unwrap<{ student_id: string }[] | null>(
      sb().from(ACCESS_TABLE).select("student_id").eq("file_id", fileId),
    );
    return (rows ?? []).map((row) => row.student_id);
  },

  /**
   * Replaces a restricted file's access list, writing only the difference.
   * Online only: a multi-row change the single-record offline queue can't
   * represent (assignment happens in the Admin console).
   */
  async setAccessList(fileId: string, studentIds: string[]): Promise<void> {
    const current = await studentRequirementFilesService.getAccessList(fileId);
    const toRemove = current.filter((id) => !studentIds.includes(id));
    const toAdd = [...new Set(studentIds)].filter((id) => !current.includes(id));
    if (toRemove.length) {
      await unwrap(sb().from(ACCESS_TABLE).delete().eq("file_id", fileId).in("student_id", toRemove));
    }
    if (toAdd.length) {
      const now = nowIso();
      await unwrap(
        sb()
          .from(ACCESS_TABLE)
          .insert(toAdd.map((studentId) => ({ file_id: fileId, student_id: studentId, created_at: now }))),
      );
    }
  },

  async create(input: {
    title: string;
    description?: string;
    file: Blob;
    fileName: string;
    isPublished?: boolean;
    createdBy: string;
  }): Promise<StudentRequirementFile> {
    const path = storagePath(input.fileName);
    const id = newId();
    const now = nowIso();
    const local: StudentRequirementFile = {
      id,
      title: input.title,
      description: input.description,
      fileUrl: "",
      fileName: input.fileName,
      fileSize: input.file.size,
      fileType: input.file.type,
      isPublished: input.isPublished ?? false,
      restricted: false,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    // file_url is stamped after the upload (online here, offline on replay).
    const payload: Row = { ...files.toRow(local), description: input.description ?? "", file_url: "" };
    delete payload.restricted;

    const result = await offlineSyncService.mutation<StudentRequirementFile>({
      table: "student_requirement_files",
      kind: "create",
      recordId: id,
      payload,
      audit: await buildAudit(
        "REQUIREMENT_FILE_CREATED",
        "requirement_file",
        `Uploaded requirement file ${input.fileName}.`,
        id,
        { title: input.title, fileName: input.fileName },
      ),
      fileStorage: { bucket: BUCKET, path, blob: input.file },
      makeLocal: () => local,
      executeOnline: async () => {
        const fileUrl = await upload(path, input.file);
        return files.fromRow(
          await unwrap<Row>(
            sb().from("student_requirement_files").insert({ ...payload, id, file_url: fileUrl }).select().single(),
          ),
        );
      },
    });
    return required(result, "Failed to create requirement file");
  },

  update: (
    id: string,
    input: { title?: string; description?: string; isPublished?: boolean; restricted?: boolean },
  ): Promise<StudentRequirementFile> => files.update(id, { ...input, updatedAt: nowIso() }, input),

  async replaceFile(id: string, file: Blob, fileName: string): Promise<StudentRequirementFile> {
    const path = storagePath(fileName);
    const patch = { fileName, fileSize: file.size, fileType: file.type, updatedAt: nowIso() };
    const payload = { file_url: "", ...files.toRow(patch) }; // file_url stamped like create()

    const result = await offlineSyncService.mutation<StudentRequirementFile>({
      table: "student_requirement_files",
      kind: "update",
      recordId: id,
      payload,
      audit: await buildAudit(
        "REQUIREMENT_FILE_REPLACED",
        "requirement_file",
        `Replaced requirement file ${id} with ${fileName}.`,
        id,
        { fileName },
      ),
      fileStorage: { bucket: BUCKET, path, blob: file },
      makeLocal: (current) => ({ ...(current as StudentRequirementFile), ...patch, id, fileUrl: "" }),
      executeOnline: async () => {
        const current = await unwrap<{ file_url: unknown }>(
          sb().from("student_requirement_files").select("file_url").eq("id", id).single(),
        );
        const fileUrl = await upload(path, file);
        const row = await unwrap<Row>(
          sb()
            .from("student_requirement_files")
            .update({ ...payload, file_url: fileUrl })
            .eq("id", id)
            .select()
            .single(),
        );
        // Only drop the old object once the row points at the new one.
        await removeStored(current.file_url);
        return files.fromRow(row);
      },
    });
    return required(result, "Failed to replace requirement file");
  },

  async delete(id: string): Promise<void> {
    await offlineSyncService.mutation<void>({
      table: "student_requirement_files",
      kind: "delete",
      recordId: id,
      payload: {},
      audit: await buildAudit("REQUIREMENT_FILE_DELETED", "requirement_file", `Deleted requirement file ${id}.`, id),
      executeOnline: async () => {
        const { data: current } = await sb()
          .from("student_requirement_files")
          .select("file_url")
          .eq("id", id)
          .maybeSingle();
        await unwrap(sb().from("student_requirement_files").delete().eq("id", id));
        await removeStored(current?.file_url);
      },
    });
  },
};
