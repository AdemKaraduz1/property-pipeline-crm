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
      <aside className="fixed left-0 top-0 h-screen w-64 border-r border-slate-200 bg-white p-6">
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
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950"
          >
            <LayoutDashboard size={18} />
            Dashboard
          </Link>

          <Link
            href="/pipeline"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950"
          >
            <Building2 size={18} />
            Pipeline
          </Link>

          <Link
            href="/properties/new"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950"
          >
            <PlusCircle size={18} />
            Add Property
          </Link>

          <Link
            href="/map"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950"
          >
            <Map size={18} />
            Map
          </Link>
        </nav>

        <div className="absolute bottom-6 left-6 right-6">
          <LogoutButton />
        </div>
      </aside>

      <main className="ml-64 p-8">{children}</main>
    </div>
  );
}