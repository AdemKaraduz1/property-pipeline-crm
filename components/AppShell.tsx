import Link from "next/link";
import {
  Building2,
  LayoutDashboard,
  Map,
  PlusCircle,
  Home,
} from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop sidebar */}
      <aside className="hidden fixed left-0 top-0 h-screen w-64 border-r border-slate-200 bg-white p-6 md:block">
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2 text-slate-900">
            <Home className="h-6 w-6" />
            <h1 className="text-xl font-bold leading-tight">
              Property Pipeline CRM
            </h1>
          </div>
          <p className="text-sm text-slate-600">
            Real Estate Acquisition & Deal Analysis
          </p>
        </div>

        <nav className="space-y-2">
          <DesktopNavLink href="/dashboard" icon={<LayoutDashboard size={18} />} label="Dashboard" />
          <DesktopNavLink href="/pipeline" icon={<Building2 size={18} />} label="Pipeline" />
          <DesktopNavLink href="/properties/new" icon={<PlusCircle size={18} />} label="Add Property" />
          <DesktopNavLink href="/map" icon={<Map size={18} />} label="Map" />
        </nav>

        <div className="absolute bottom-6 left-6 right-6">
          <LogoutButton />
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Home className="h-5 w-5 text-slate-900" />
            <div>
              <h1 className="text-sm font-bold leading-tight text-slate-950">
                Property Pipeline CRM
              </h1>
              <p className="text-xs text-slate-500">Deal Analysis</p>
            </div>
          </div>

          <LogoutButton />
        </div>
      </header>

      {/* Page content */}
      <main className="p-4 pb-24 md:ml-64 md:p-8">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white px-2 py-2 md:hidden">
        <div className="grid grid-cols-4 gap-1">
          <MobileNavLink href="/dashboard" icon={<LayoutDashboard size={20} />} label="Home" />
          <MobileNavLink href="/pipeline" icon={<Building2 size={20} />} label="Pipeline" />
          <MobileNavLink href="/properties/new" icon={<PlusCircle size={20} />} label="Add" />
          <MobileNavLink href="/map" icon={<Map size={20} />} label="Map" />
        </div>
      </nav>
    </div>
  );
}

function DesktopNavLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950"
    >
      {icon}
      {label}
    </Link>
  );
}

function MobileNavLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950"
    >
      {icon}
      <span className="mt-1">{label}</span>
    </Link>
  );
}