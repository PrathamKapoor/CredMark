"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/app/actions/auth";
import {
  LayoutDashboard,
  GraduationCap,
  Plus,
  Image,
  LogOut,
  Loader2,
} from "lucide-react";
import "./admin.css";

interface AdminLayoutProps {
  children: React.ReactNode;
  user: { email?: string } | null;
}

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/certificates", label: "Certificates", icon: GraduationCap },
  { href: "/admin/circulation", label: "Circulation", icon: GraduationCap },
  { href: "/admin/certificates/create", label: "Create", icon: Plus },
  { href: "/admin/templates", label: "Templates", icon: Image },
];

export default function AdminLayoutClient({
  children,
  user,
}: AdminLayoutProps) {
  const pathname = usePathname();
  const userInitial = user?.email?.charAt(0).toUpperCase() || "A";
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">
              <GraduationCap size={24} />
            </div>
            <span className="sidebar-logo-text">TrueMark</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const IconComponent = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${
                  pathname === item.href ? "active" : ""
                }`}
              >
                <span className="sidebar-link-icon">
                  <IconComponent size={20} />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{userInitial}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">Admin</div>
              <div className="sidebar-user-email">
                {user?.email || "admin@example.com"}
              </div>
            </div>
          </div>
          <form
            action={signOut}
            onSubmit={() => setSigningOut(true)}
            style={{ marginTop: "var(--space-md)" }}
          >
            <button
              type="submit"
              className="btn btn-danger w-full"
              disabled={signingOut}
            >
              {signingOut ? (
                <>
                  <Loader2 size={16} className="spinner-icon" /> Signing out...
                </>
              ) : (
                <>
                  <LogOut size={16} /> Sign Out
                </>
              )}
            </button>
          </form>
        </div>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
}
