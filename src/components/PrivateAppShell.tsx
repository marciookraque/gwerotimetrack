
"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import ProtectedLayout from "@/components/ProtectedLayout";
import GweroTimeTrackApp from "@/components/GweroTimeTrackApp";
import { auth } from "@/lib/firebase";

const APP_PATHS = ["/dashboard", "/tasks", "/reports"];

export default function PrivateAppShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const isProfile = pathname === "/profile";
  const isAppPath = APP_PATHS.includes(pathname);

  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    setMenuOpen(false);

    if (!isAppPath) return;

    try {
      localStorage.setItem("gwerotimetrack-last-private-path", pathname);
    } catch {
      // A navegação continua a funcionar sem armazenamento local.
    }
  }, [pathname, isAppPath]);

  async function logout() {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error("Erro ao terminar sessão:", error);
      setLoggingOut(false);
    }
  }

  return (
    <ProtectedLayout>
      <div className="gwero-application-root">
        <div
          className={isProfile ? "hidden" : ""}
          aria-hidden={isProfile}
        >
          <GweroTimeTrackApp />
        </div>

        {isAppPath && (
          <div className="gwero-user-menu fixed right-4 top-3 z-50 sm:right-6">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex max-w-[260px] items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2.5 text-sm text-slate-200 shadow-lg transition hover:border-cyan-500 hover:text-cyan-300"
            >
              <span aria-hidden="true">👤</span>
              <span className="max-w-[160px] truncate">
                {user?.displayName || user?.email || "A minha conta"}
              </span>
              <span aria-hidden="true" className="text-xs">
                {menuOpen ? "▲" : "▼"}
              </span>
            </button>

            {menuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Fechar menu"
                  className="fixed inset-0 z-[-1] cursor-default"
                  onClick={() => setMenuOpen(false)}
                />

                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl"
                >
                  <div className="border-b border-slate-800 px-3 py-3">
                    <p className="text-xs text-slate-500">
                      Sessão iniciada como
                    </p>
                    <p className="mt-1 truncate text-sm font-medium text-slate-200">
                      {user?.email}
                    </p>
                  </div>

                  <Link
                    href="/profile"
                    role="menuitem"
                    className="mt-1 flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-slate-800 hover:text-cyan-300"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span>⚙️</span>
                    <span>Editar perfil</span>
                  </Link>

                  <button
                    type="button"
                    role="menuitem"
                    disabled={loggingOut}
                    onClick={logout}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-rose-300 hover:bg-rose-950/40 disabled:opacity-50"
                  >
                    <span>↪️</span>
                    <span>
                      {loggingOut ? "A terminar sessão..." : "Terminar sessão"}
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Children stays rendered for every route segment. */}
        <div
          className={isProfile ? "" : "hidden"}
          aria-hidden={!isProfile}
        >
          {children}
        </div>
      </div>

      <style jsx global>{`
        .gwero-application-root > div:first-child header > div > div:last-child {
          display: none !important;
        }

        @media (max-width: 500px) {
          .gwero-user-menu {
            right: 0.75rem;
            top: 0.5rem;
          }

          .gwero-user-menu > button {
            max-width: 190px;
            padding: 0.5rem 0.6rem;
            font-size: 0.75rem;
          }
        }
      `}</style>
    </ProtectedLayout>
  );
}
