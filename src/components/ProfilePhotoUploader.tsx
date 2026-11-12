import { useRef, useState, type ChangeEvent } from "react";
import { ImageUp, Loader2, User } from "lucide-react";
import { toast } from "sonner";
import { profilePhotoService } from "@/services/db";
import { cn } from "@/lib/utils";

interface ProfilePhotoUploaderProps {
  studentId: string;
  photoUrl?: string;
  name: string;
  editable?: boolean;
  sizeClassName?: string;
  /** Extra classes for the avatar circle (e.g. a ring on the hero band). */
  className?: string;
  onUploaded?: (photoUrl: string) => void;
}

/** Round student avatar; when editable, clicking it uploads a replacement photo. */
export default function ProfilePhotoUploader({
  studentId,
  photoUrl,
  name,
  editable = true,
  sizeClassName = "h-24 w-24",
  className,
  onUploaded,
}: ProfilePhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // The freshly uploaded photo, valid only while the props it replaced are unchanged.
  const [uploaded, setUploaded] = useState<{ key: string; url: string } | null>(null);
  const key = `${studentId}|${photoUrl ?? ""}`;
  const shownUrl = uploaded?.key === key ? uploaded.url : photoUrl;

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const url = await profilePhotoService.upload(studentId, file);
      setUploaded({ key, url });
      onUploaded?.(url);
      toast.success("Profile photo updated successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Photo upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const avatar = shownUrl ? (
    <img src={shownUrl} alt={`${name}'s profile`} className="h-full w-full object-cover" />
  ) : (
    <span className="grid h-full w-full place-items-center">
      <User className="h-1/2 w-1/2" aria-hidden />
    </span>
  );
  const circle = cn(sizeClassName, "relative shrink-0 overflow-hidden rounded-full bg-brand-500/10 text-brand-500 ring-1 ring-line", className);

  if (!editable) return <div className={circle}>{avatar}</div>;

  return (
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
        aria-label={shownUrl ? `Replace ${name}'s profile photo` : `Upload ${name}'s profile photo`}
        title={shownUrl ? "Click to replace profile photo" : "Click to upload profile photo"}
        className={cn(circle, "group transition hover:ring-2 hover:ring-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-wait")}
      >
        {avatar}
        <span
          className={cn(
            "absolute inset-0 grid place-items-center bg-indigo-900/55 text-white transition-opacity",
            uploading ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
          )}
        >
          {uploading ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : <ImageUp className="h-6 w-6" aria-hidden />}
        </span>
      </button>
    </>
  );
}
