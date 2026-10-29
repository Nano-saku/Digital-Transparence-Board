import { useRef, useState } from "react";
import { ImageUp, LoaderCircle, User } from "lucide-react";
import { profilePhotoService } from "@/services/db";
import { toast } from "sonner";

interface ProfilePhotoUploaderProps {
  studentId: string;
  photoUrl?: string;
  name: string;
  editable?: boolean;
  sizeClassName?: string;
  onUploaded?: (photoUrl: string) => void;
}

export default function ProfilePhotoUploader({
  studentId,
  photoUrl,
  name,
  editable = true,
  sizeClassName = "h-24 w-24",
  onUploaded,
}: ProfilePhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      setUploading(true);
      const url = await profilePhotoService.upload(studentId, file);
      onUploaded?.(url);
      toast.success("Profile photo updated successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Photo upload failed.";
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {editable ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleChange}
            className="sr-only"
            disabled={uploading}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            aria-label={photoUrl ? `Replace ${name}'s profile photo` : `Upload ${name}'s profile photo`}
            title={photoUrl ? "Click to replace profile photo" : "Click to upload profile photo"}
            className={`${sizeClassName} group relative shrink-0 overflow-hidden rounded-full bg-red/10 ring-1 ring-black/5 transition hover:ring-2 hover:ring-primary-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-wait`}
          >
            {photoUrl ? (
              <img src={photoUrl} alt={`${name}'s profile`} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <User className="h-1/2 w-1/2 text-red" aria-hidden="true" />
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              {uploading ? (
                <LoaderCircle className="h-6 w-6 animate-spin text-white" aria-hidden="true" />
              ) : (
                <ImageUp className="h-6 w-6 text-white" aria-hidden="true" />
              )}
            </span>
          </button>
        </>
      ) : (
        <div className={`${sizeClassName} shrink-0 overflow-hidden rounded-full bg-red/10 ring-1 ring-black/5`}>
          {photoUrl ? (
            <img src={photoUrl} alt={`${name}'s profile`} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <User className="h-1/2 w-1/2 text-red" aria-hidden="true" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}