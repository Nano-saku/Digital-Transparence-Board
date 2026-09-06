import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  UploadCloud,
  Loader2,
  FileText,
  Eye,
  EyeOff,
  RefreshCcw,
  FolderOpen,
} from "lucide-react";
import SectionLoader from "@/components/SectionLoader";
import SectionEmptyState from "@/components/SectionEmptyState";
import SectionLayout from "@/components/common/SectionLayout";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { studentRequirementFilesService } from "@/services/db";
import type { StudentRequirementFile, UserRole } from "@/types";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";

interface RequirementFilesManagementSectionProps {
  onBack: () => void;
  role: UserRole;
  userId?: string;
}

/** Formats a byte count into a human-readable file size (e.g. "1.4 MB"). */
function formatFileSize(bytes?: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

type ModalMode =
  | { type: "create" }
  | { type: "edit"; file: StudentRequirementFile };

export default function RequirementFilesManagementSection({
  onBack,
  role,
  userId = "",
}: RequirementFilesManagementSectionProps) {
  const [files, setFiles] = useState<StudentRequirementFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Upload modal state
  const [modal, setModal] = useState<ModalMode | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [publish, setPublish] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Replace-file modal state
  const [replaceTarget, setReplaceTarget] = useState<StudentRequirementFile | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<StudentRequirementFile | null>(null);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const data = await studentRequirementFilesService.getAll();
      setFiles(data);
    } catch (error) {
      console.error("Error loading requirement files:", error);
      toast.error("Failed to load requirement files");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  // Only the Admin may manage requirement files.
  if (role !== "admin") {
    return (
      <SectionLayout title="Student Requirement Files" onBack={onBack}>
        <SectionEmptyState
          message="You do not have permission to manage requirement files."
          icon={EyeOff}
          card
        />
      </SectionLayout>
    );
  }

  const openCreate = () => {
    setTitle("");
    setDescription("");
    setPublish(true);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setModal({ type: "create" });
  };

  const openEdit = (file: StudentRequirementFile) => {
    setTitle(file.title);
    setDescription(file.description ?? "");
    setPublish(file.isPublished);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setModal({ type: "edit", file });
  };

  const handleFilePick = (e: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] ?? null);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Please provide a title for the requirement file.");
      return;
    }
    if (modal?.type === "create" && !selectedFile) {
      toast.error("Please choose a file to upload.");
      return;
    }
    setSaving(true);
    try {
      if (modal?.type === "create" && selectedFile) {
        const created = await studentRequirementFilesService.create({
          title: title.trim(),
          description: description.trim() || undefined,
          file: selectedFile,
          fileName: selectedFile.name,
          isPublished: publish,
          createdBy: userId,
        });
        setFiles((prev) => [created, ...prev]);
        toast.success("Requirement file uploaded successfully.");
      } else if (modal?.type === "edit" && modal.file) {
        const updated = await studentRequirementFilesService.update(modal.file.id, {
          title: title.trim(),
          description: description.trim() || undefined,
          isPublished: publish,
        });
        setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
        toast.success("Requirement file updated.");
      }
      setModal(null);
    } catch (error) {
      console.error("Error saving requirement file:", error);
      toast.error("Failed to save the requirement file. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleReplacePick = (e: ChangeEvent<HTMLInputElement>) => {
    setReplaceFile(e.target.files?.[0] ?? null);
  };

  const handleReplaceFile = async () => {
    if (!replaceTarget || !replaceFile) return;
    setSaving(true);
    try {
      const updated = await studentRequirementFilesService.replaceFile(
        replaceTarget.id,
        replaceFile,
        replaceFile.name,
      );
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      toast.success("File replaced successfully.");
      setReplaceTarget(null);
      setReplaceFile(null);
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    } catch (error) {
      console.error("Error replacing file:", error);
      toast.error("Failed to replace the file. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (file: StudentRequirementFile) => {
    try {
      const updated = await studentRequirementFilesService.update(file.id, {
        isPublished: !file.isPublished,
      });
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      toast.success(
        updated.isPublished
          ? `"${updated.title}" is now published and visible to students.`
          : `"${updated.title}" is now hidden from students.`,
      );
    } catch (error) {
      console.error("Error toggling publish state:", error);
      toast.error("Failed to update publish state. Please try again.");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await studentRequirementFilesService.delete(deleteTarget.id);
      setFiles((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      toast.success("Requirement file deleted.");
      setDeleteTarget(null);
    } catch (error) {
      console.error("Error deleting requirement file:", error);
      toast.error("Failed to delete the requirement file. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionLayout
      title="Student Requirement Files"
      subtitle="Upload and manage the documents students need (Admin only)"
      onBack={onBack}
      gradientClass="gradient-bg-orange"
      headerActions={
        <button onClick={openCreate} className="btn-primary px-4 py-2.5 flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" />
          Upload File
        </button>
      }
    >
      {loading ? (
        <SectionLoader />
      ) : files.length === 0 ? (
        <SectionEmptyState
          message="No requirement files uploaded yet. Click “Upload File” to add the first one."
          icon={FolderOpen}
          card
        />
      ) : (
        <div className="glass-card p-5 lg:p-6">
          <div className="overflow-x-auto">
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Description</th>
                  <th>File</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id}>
                    <td className="font-medium text-dark">{file.title}</td>
                    <td className="text-text-secondary text-sm max-w-xs">
                      {file.description || "—"}
                    </td>
                    <td className="text-text-secondary text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-red" />
                        {file.fileName}
                        <span className="text-xs text-text-secondary/70">
                          ({formatFileSize(file.fileSize)})
                        </span>
                      </span>
                    </td>
                    <td>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                          file.isPublished
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-text-secondary"
                        }`}
                      >
                        {file.isPublished ? (
                          <>
                            <Eye className="w-3.5 h-3.5" /> Published
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5" /> Hidden
                          </>
                        )}
                      </span>
                    </td>
                    <td className="text-text-secondary text-sm whitespace-nowrap">
                      {formatDate(file.updatedAt)}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">

                        <a
                          href={file.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg text-royal-blue hover:bg-white/60"
                          title="Open file"
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => openEdit(file)}
                          className="p-2 rounded-lg text-royal-blue hover:bg-white/60"
                          title="Edit title / description / publish state"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setReplaceTarget(file);
                            setReplaceFile(null);
                            if (replaceInputRef.current) replaceInputRef.current.value = "";
                          }}
                          className="p-2 rounded-lg text-amber-600 hover:bg-white/60"
                          title="Replace the file contents"
                        >
                          <RefreshCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleTogglePublish(file)}
                          className="p-2 rounded-lg text-text-secondary hover:bg-white/60"
                          title={file.isPublished ? "Unpublish (hide from students)" : "Publish (show to students)"}
                        >
                          {file.isPublished ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(file)}
                          className="p-2 rounded-lg text-red hover:bg-red/10"
                          title="Delete requirement file"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload / Edit Modal */}
      <Dialog open={!!modal} onOpenChange={(o) => !o && !saving && setModal(null)}>
        <DialogContent className="glass-card-strong max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-xl text-dark">
              {modal?.type === "create" ? "Upload Requirement File" : "Edit Requirement File"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-dark mb-1.5">Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Enrollment Requirements Checklist"
                className="w-full glass-input px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Optional short summary of this document"
                className="w-full glass-input px-3 py-2.5 text-sm resize-none"
              />
            </div>


            {modal?.type === "create" && (
              <div>
                <label className="block text-sm font-medium text-dark mb-1.5">File *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={handleFilePick}
                  className="block w-full text-sm text-text-secondary file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-royal-blue file:text-white file:text-sm file:cursor-pointer"
                />
                {selectedFile && (
                  <p className="text-xs text-green-700 mt-1.5">
                    Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
              </div>
            )}

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={publish}
                onChange={(e) => setPublish(e.target.checked)}
                className="w-4 h-4 accent-royal-blue"
              />
              <span className="text-sm text-dark">
                Publish immediately (visible to students in Records)
              </span>
            </label>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => !saving && setModal(null)}
                className="flex-1 glass-button px-4 py-2.5 text-sm"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 btn-primary px-4 py-2.5 flex items-center justify-center gap-2 text-sm disabled:opacity-70"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {modal?.type === "create" ? "Uploading..." : "Saving..."}
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    {modal?.type === "create" ? "Upload" : "Save"}
                  </>
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Replace File Modal */}
      <Dialog open={!!replaceTarget} onOpenChange={(o) => !o && !saving && setReplaceTarget(null)}>
        <DialogContent className="glass-card-strong max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-xl text-dark">
              Replace File
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-text-secondary">
              Replace the file for <span className="font-medium text-dark">{replaceTarget?.title}</span>.
              The current file will be removed and the new one becomes active.
            </p>
            <input
              ref={replaceInputRef}
              type="file"
              accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.txt"
              onChange={handleReplacePick}
              className="block w-full text-sm text-text-secondary file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-royal-blue file:text-white file:text-sm file:cursor-pointer"
            />
            {replaceFile && (
              <p className="text-xs text-green-700">Selected: {replaceFile.name}</p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => !saving && setReplaceTarget(null)}
                className="flex-1 glass-button px-4 py-2.5 text-sm"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleReplaceFile}
                disabled={saving || !replaceFile}
                className="flex-1 btn-primary px-4 py-2.5 flex items-center justify-center gap-2 text-sm disabled:opacity-70"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Replacing...
                  </>
                ) : (
                  <>
                    <RefreshCcw className="w-4 h-4" /> Replace
                  </>
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Requirement File"
        description={`Are you sure you want to delete "${deleteTarget?.title}"? The file will be permanently removed.`}
        warningText="This action cannot be undone."
        confirmLabel="Delete File"
        loading={saving}
      />
    </SectionLayout>
  );
}

