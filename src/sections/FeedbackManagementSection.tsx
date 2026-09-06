import { useEffect, useState } from "react";
import {
  MessageCircle,
  AlertTriangle,
  Lightbulb,
  Trash2,
  EyeOff,
  User,
  CheckCircle,
  Clock,
  Wrench,
  Inbox,
  Loader2,
} from "lucide-react";
import type { FeedbackItem, UserRole } from "@/types";
import { feedbackService } from "@/services/db";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import SectionLoader from "@/components/SectionLoader";
import SectionEmptyState from "@/components/SectionEmptyState";
import SectionLayout from "@/components/common/SectionLayout";
import ConfirmDialog from "@/components/common/ConfirmDialog";

interface FeedbackManagementSectionProps {
  onBack: () => void;
  role: UserRole | null;
}

type FeedbackFilter = "all" | FeedbackItem["type"];

const FILTERS: {
  value: FeedbackFilter;
  label: string;
  icon: typeof MessageCircle;
}[] = [
  { value: "all", label: "All", icon: Inbox },
  { value: "inquiry", label: "Inquiries", icon: MessageCircle },
  { value: "complaint", label: "Complaints", icon: AlertTriangle },
  { value: "suggestion", label: "Suggestions", icon: Lightbulb },
];

const TYPE_META: Record<
  FeedbackItem["type"],
  { label: string; icon: typeof MessageCircle; color: string }
> = {
  inquiry: {
    label: "Inquiry",
    icon: MessageCircle,
    color: "bg-blue-100 text-blue-600",
  },
  complaint: {
    label: "Complaint",
    icon: AlertTriangle,
    color: "bg-red/10 text-red-500",
  },
  suggestion: {
    label: "Suggestion",
    icon: Lightbulb,
    color: "bg-yellow-100 text-yellow-600",
  },
};

const STATUS_META: Record<
  FeedbackItem["status"],
  { label: string; color: string }
> = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-600" },
  "in-progress": { label: "In Progress", color: "bg-blue-100 text-blue-600" },
  resolved: { label: "Resolved", color: "bg-green-100 text-green-600" },
};

export default function FeedbackManagementSection({
  onBack,
  role,
}: FeedbackManagementSectionProps) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [filter, setFilter] = useState<FeedbackFilter>("all");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [feedbackToDelete, setFeedbackToDelete] = useState<FeedbackItem | null>(null);

  const isAdmin = role === "admin";

  const loadFeedback = async () => {
    try {
      setLoading(true);
      setItems(await feedbackService.getAll());
    } catch (error) {
      console.error("Error loading feedback:", error);
      toast.error("Failed to load feedback");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeedback();
  }, []);

  const handleStatusChange = async (
    id: string,
    status: FeedbackItem["status"],
  ) => {
    try {
      setUpdatingId(id);
      await feedbackService.updateStatus(id, status);
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status } : item)),
      );
      toast.success(`Marked as ${STATUS_META[status].label.toLowerCase()}`);
    } catch (error) {
      console.error("Error updating feedback:", error);
      toast.error("Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  };

  const openDeleteConfirm = (item: FeedbackItem) => {
    setFeedbackToDelete(item);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!feedbackToDelete) return;
    try {
      await feedbackService.delete(feedbackToDelete.id);
      setItems((prev) => prev.filter((i) => i.id !== feedbackToDelete.id));
      toast.success("Feedback deleted");
    } catch (error) {
      console.error("Error deleting feedback:", error);
      toast.error("Failed to delete feedback");
    } finally {
      setShowDeleteConfirm(false);
      setFeedbackToDelete(null);
    }
  };

  const filtered =
    filter === "all" ? items : items.filter((item) => item.type === filter);

  return (
    <>
    <SectionLayout
      title="Feedback Inbox"
      subtitle="All complaints, inquiries, and suggestions from students"
      onBack={onBack}
      gradientClass="gradient-bg-warm"
    >

        {/* Filter tabs */}
        <div className="glass-card p-1.5 mb-6 inline-flex flex-wrap gap-1 rounded-xl">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            const count =
              f.value === "all"
                ? items.length
                : items.filter((i) => i.type === f.value).length;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  filter === f.value ? "" : "text-text-secondary"
                }`}
              >
                <Icon className="w-4 h-4" />
                {f.label}
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    filter === f.value ? "bg-white/20" : "bg-red/15"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Loading */}
        {loading && <SectionLoader message="Loading feedback..." />}

        {/* List */}
        {!loading && (
          <div className="space-y-4">
            {filtered.length === 0 && (
              <SectionEmptyState
                message="No feedback found"
                icon={Inbox}
                card
              />
            )}

            {filtered.map((item) => (
              <FeedbackCard
                key={item.id}
                item={item}
                isAdmin={isAdmin}
                updating={updatingId === item.id}
                onStatusChange={handleStatusChange}
                onDelete={openDeleteConfirm}
              />
            ))}
          </div>
        )}
    </SectionLayout>

    <ConfirmDialog
      open={showDeleteConfirm}
      onClose={() => {
        setShowDeleteConfirm(false);
        setFeedbackToDelete(null);
      }}
      onConfirm={confirmDelete}
      title="Delete Feedback"
      description="Are you sure you want to delete this feedback? This cannot be undone."
      confirmLabel="Delete Feedback"
    />
  </>);
}
// ------------------------------------------------------------------
// Feedback card
// ------------------------------------------------------------------
interface FeedbackCardProps {
  item: FeedbackItem;
  isAdmin: boolean;
  updating: boolean;
  onStatusChange: (id: string, status: FeedbackItem["status"]) => void;
  onDelete: (item: FeedbackItem) => void;
}

function FeedbackCard({
  item,
  isAdmin,
  updating,
  onStatusChange,
  onDelete,
}: FeedbackCardProps) {
  const TypeIcon = TYPE_META[item.type].icon;
  const typeColor = TYPE_META[item.type].color;
  const statusColor = STATUS_META[item.status].color;

  return (
    <div className="glass-card p-5 lg:p-6 h-fit">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 lg:h-fit">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${typeColor}`}
            >
              <TypeIcon className="w-3.5 h-3.5" />
              {TYPE_META[item.type].label}
            </span>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColor}`}
            >
              {STATUS_META[item.status].label}
            </span>
            <span className="text-xs text-text-secondary">
              {formatDate(item.submittedAt)}
            </span>
            {/* Actions */}
            <div className="ml-auto flex flex-wrap items-center justify-start gap-2 flex-shrink-0">
              {isAdmin ? (
                <>
                  <button
                    onClick={() => onStatusChange(item.id, "pending")}
                    title="Mark pending"
                    className={`p-2 rounded-lg ${
                      item.status === "pending"
                        ? "text-yellow-600"
                        : "text-text-secondary"
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onStatusChange(item.id, "in-progress")}
                    title="Mark in progress"
                    className={`p-2 rounded-lg ${
                      item.status === "in-progress"
                        ? "text-blue-600"
                        : "text-text-secondary"
                    }`}
                  >
                    <Wrench className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onStatusChange(item.id, "resolved")}
                    title="Mark resolved"
                    className={`p-2 rounded-lg ${
                      item.status === "resolved"
                        ? "text-green-600"
                        : "text-text-secondary"
                    }`}
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>
                  {updating && (
                    <Loader2 className="w-4 h-4 animate-spin text-text-secondary" />
                  )}
                  <button
                    onClick={() => onDelete(item)}
                    title="Delete"
                    className="p-2 rounded-lg hover:bg-red-500/10 text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <span className="text-xs text-text-secondary">
                  Status controlled by the Administrator
                </span>
              )}
            </div>
          </div>

          {item.title && (
            <h3 className="font-display font-semibold text-lg text-dark mb-1">
              {item.title}
            </h3>
          )}
          <p className="text-sm text-text-secondary mb-3">{item.message}</p>

          <div className="flex items-center gap-4 text-xs text-text-secondary">
            {item.isAnonymous ? (
              <span className="flex items-center gap-1">
                <EyeOff className="w-3.5 h-3.5" /> Anonymous
              </span>
            ) : (
              <>
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />{" "}
                  {item.studentName || "Unknown"}
                </span>
                {item.studentId && <span>{item.studentId}</span>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
