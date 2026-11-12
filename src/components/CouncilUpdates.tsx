import { useEffect, useState } from "react";
import { ArrowUpRight, ExternalLink, Facebook, Megaphone } from "lucide-react";
import { notificationsService, type AppNotification } from "@/services/notificationsService";
import { FACEBOOK_PAGE_URL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import Reveal from "@/components/motion/Reveal";

const SHOWN = 4;

/**
 * Latest council announcements (the public broadcasts officers send from the
 * app — always available, live) next to a link card for the council's
 * Facebook page. Facebook's embedded timeline is not used: whether it renders
 * depends on each visitor's browser privacy settings, and it fails silently.
 */
export default function CouncilUpdates() {
  const [items, setItems] = useState<AppNotification[] | null>(null);

  useEffect(() => {
    let live = true;
    notificationsService
      .getPublicBroadcasts(SHOWN)
      .then((rows) => live && setItems(rows))
      .catch((error) => {
        console.error("Failed to load announcements:", error);
        if (live) setItems([]);
      });
    const unsubscribe = notificationsService.subscribePublicBroadcasts((n) =>
      setItems((prev) => (prev?.some((i) => i.id === n.id) ? prev : [n, ...(prev ?? [])].slice(0, SHOWN))),
    );
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  return (
    <section className="bg-page px-4 pb-20 sm:px-6 lg:pb-28">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <Reveal stagger className="text-center lg:text-left">
          <span className="eyebrow">
            <Megaphone className="h-3.5 w-3.5" /> Council updates
          </span>
          <h2 className="mt-4 text-3xl font-extrabold sm:text-5xl">Latest from the council</h2>
          <p className="mx-auto mt-4 max-w-md text-muted lg:mx-0">
            Announcements posted here the moment officers send them. Photos, event coverage and daily posts live on our Facebook page.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
            <a href={FACEBOOK_PAGE_URL} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-lg">
              <Facebook className="h-4 w-4" /> Follow the council
              <span className="btn-orb">
                <ExternalLink className="h-3.5 w-3.5" />
              </span>
            </a>
          </div>
        </Reveal>

        <Reveal className="card overflow-hidden p-0">
          <a href={FACEBOOK_PAGE_URL} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-4 border-b border-line px-6 py-5 hover:bg-surface-2/60">
            <img src="/lsc-logo.jpg" alt="" className="h-12 w-12 rounded-full object-cover ring-4 ring-brand-500/10" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-ink">DSSC – Local Student Council of Santa Cruz</p>
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <Facebook className="h-3.5 w-3.5 text-brand-500" /> facebook.com/dsscsclsc
              </p>
            </div>
            <ArrowUpRight className="h-5 w-5 shrink-0 text-muted group-hover:text-brand-500" />
          </a>
          {items === null ? (
            <div className="space-y-5 p-6" aria-hidden>
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="space-y-2">
                  <div className="skeleton h-3.5 w-2/3" />
                  <div className="skeleton h-3 w-11/12" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted">No announcements yet — follow our Facebook page for the latest posts.</p>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((n) => (
                <li key={n.id} className="px-6 py-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="font-semibold text-ink">{n.title}</p>
                    <time className="shrink-0 text-xs text-muted" dateTime={n.createdAt}>{formatDate(n.createdAt)}</time>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Reveal>
      </div>
    </section>
  );
}
