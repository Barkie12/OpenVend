import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { requireAdminSession } from "@/lib/session";
import { getShop } from "@/lib/shop";

export const dynamic = "force-dynamic";

interface AdminDashboardLayoutProps {
  children: ReactNode;
}

export default async function AdminDashboardLayout({ children }: AdminDashboardLayoutProps) {
  const adminSession = await requireAdminSession();
  const shop = await getShop();
  if (!shop) {
    redirect("/setup");
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <AdminSidebar shopName={shop.name} userEmail={adminSession.user.email} />
      <main className="flex-1 overflow-auto p-6 lg:p-8">{children}</main>
    </div>
  );
}
