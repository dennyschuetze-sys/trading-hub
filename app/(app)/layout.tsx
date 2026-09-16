import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { DesktopSidebar, SidebarProvider, SidebarToggle } from "@/components/layout/sidebar-state";
import { SIDEBAR_COOKIE } from "@/lib/navigation";
import { UI_SCALE_COOKIE, parseUiScale } from "@/lib/ui-scale";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getUser();
  if (!user) redirect("/login");
  const cookieStore = await cookies();
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed";
  const scale = parseUiScale(cookieStore.get(UI_SCALE_COOKIE)?.value);

  return (
    <SidebarProvider initialCollapsed={collapsed}>
      {/* Anzeigegröße aus den Einstellungen: skaliert alle rem-Maße */}
      {scale !== 100 && <style>{`html{font-size:${scale}%}`}</style>}
      <div className="flex min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-md focus:ring-2 focus:ring-ring"
        >
          Zum Inhalt springen
        </a>
        <DesktopSidebar>
          <SidebarNav />
        </DesktopSidebar>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
            <MobileNav />
            <SidebarToggle />
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <UserMenu email={user.email ?? ""} />
            </div>
          </header>
          <main id="main" tabIndex={-1} className="flex-1 p-4 outline-none md:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
