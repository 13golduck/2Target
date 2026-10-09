"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "KPI" },
  { href: "/checkup", label: "Check-up" },
  { href: "/idee", label: "Idee" },
  { href: "/piano", label: "Piano editoriale" },
];

export function Tabs({ base }: { base: string }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((t) => {
        const href = base + t.href;
        const active = t.href === "" ? path === base : path.startsWith(href);
        return (
          <Link
            key={t.href}
            href={href}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${active ? "border-gold font-semibold" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
