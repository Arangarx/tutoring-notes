import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import {
  knownIssuesIntro,
  knownIssuesItems,
  recentlyImprovedIntro,
  recentlyImprovedItems,
  roadmapIntro,
  roadmapItems,
} from "@/lib/known-issues-roadmap-content";

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="m-0 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function KnownIssuesRoadmapView() {
  return (
    <div className="space-y-6" data-testid="known-issues-roadmap">
      <AdminSectionCard
        title="Recently improved"
        description={recentlyImprovedIntro}
        data-testid="known-issues-recently-improved"
      >
        <BulletList items={recentlyImprovedItems} />
      </AdminSectionCard>

      <AdminSectionCard
        title="Known issues we're still working on"
        description={knownIssuesIntro}
        data-testid="known-issues-open"
      >
        <ul
          className="m-0 list-disc space-y-3 pl-5 text-sm leading-relaxed text-foreground"
          data-testid="known-issues-list"
        >
          {knownIssuesItems.map(({ title, body }) => (
            <li key={title}>
              <strong className="font-semibold text-foreground">{title}:</strong> {body}
            </li>
          ))}
        </ul>
      </AdminSectionCard>

      <AdminSectionCard
        title="Roadmap / coming soon"
        description={roadmapIntro}
        data-testid="known-issues-roadmap-section"
      >
        <ul className="m-0 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
          {roadmapItems.map((parts) => {
            const key = parts.map((part) => part.text).join("");
            return (
              <li key={key}>
                {parts.map((part, index) =>
                  part.emphasis ? (
                    <strong key={`${key}-${index}`} className="font-semibold text-foreground">
                      {part.text}
                    </strong>
                  ) : (
                    <span key={`${key}-${index}`}>{part.text}</span>
                  )
                )}
              </li>
            );
          })}
        </ul>
      </AdminSectionCard>
    </div>
  );
}
