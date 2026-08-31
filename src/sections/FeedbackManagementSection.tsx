import { useEffect, useRef, useState } from "react";
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
import { useSectionEntrance } from "@/hooks/useSectionEntrance";
import SectionLoader from "@/components/SectionLoader";
import SectionEmptyState from "@/components/SectionEmptyState";
import SectionBackButton from "@/components/SectionBackButton";

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
  const sectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [filter, setFilter] = useState<FeedbackFilter>("all");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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

  useSectionEntrance(sectionRef, [
    {
      ref: contentRef,
      from: { y: "6vh", opacity: 0 },
      to: { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" },
    },
  ]);

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

  const handleDelete = async (item: FeedbackItem) => {
    if (!window.confirm("Delete this feedback? This cannot be undone.")) return;
    try {
      await feedbackService.delete(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success("Feedback deleted");
    } catch (error) {
      console.error("Error deleting feedback:", error);
      toast.error("Failed to delete feedback");
    }
  };

  const filtered =
    filter === "all" ? items : items.filter((item) => item.type === filter);

  return (
    <section
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-warm relative overflow-hidden py-20 lg:py-24"
    >
      <div
        ref={contentRef}
        className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12"
      >
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <SectionBackButton onClick={onBack} />
            <div>
              <h1 className="font-display font-bold text-2xl lg:text-3xl text-dark">
                Feedback Inbox
              </h1>
              <p className="text-text-secondary text-sm">
                All complaints, inquiries, and suggestions from students
              </p>
            </div>
          </div>
        </div>

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
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
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
