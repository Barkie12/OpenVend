"use client";

import {
  Ban,
  ExternalLink,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  TicketPercent,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { SignOutButton } from "./sign-out-button";

interface AdminNavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact: boolean;
}

const NAV_ITEMS: readonly AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/products", label: "Products", icon: Package, exact: false },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart, exact: false },
  { href: "/admin/coupons", label: "Coupons", icon: TicketPercent, exact: false },
  { href: "/admin/blacklist", label: "Blacklist", icon: Ban, exact: false },
  { href: "/admin/settings", label: "Settings", icon: Settings, exact: false },
];

interface AdminSidebarProps {
  shopName: string;
  userEmail: string;
}

export function AdminSidebar({ shopName, userEmail }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-card">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <span className="truncate font-semibold">{shopName}</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-2 border-t p-3">
        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <ExternalLink className="size-4" />
          View shop
        </Link>
        <div className="px-3">
          <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}
