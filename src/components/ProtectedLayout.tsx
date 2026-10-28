
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

const SESSION_TIMEOUT = 30 * 60 * 1000;
const WARNING_TIME = 28 * 60 * 1000;
const AUTH_CHECK_LIMIT = 8000;

type Status = "checking" | "authenticated" | "unauthenticated";

export default function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [userId, setUserId] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  // Avoid leaving the protected page stuck on the loading screen.
  useEffect(() => {
    let resolved = false;

    const fallback = window.setTimeout(() => {
      if (resolved) return;

      console.error(
        "Firebase Authentication demorou demasiado a verificar a sessão."
      );

      const currentUser = auth.currentUser;

      if (currentUser) {
        resolved = true;
        setUserId(currentUser.uid);
        setStatus("authenticated");
      } else {
        setStatus("unauthenticated");
        router.replace("/login?reason=session-check");
      }
    }, AUTH_CHECK_LIMIT);

    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        resolved = true;
        window.clearTimeout(fallback);

        if (user) {
          setUserId(user.uid);
          setStatus("authenticated");
        } else {
          setUserId(null);
          setStatus("unauthenticated");
          setShowWarning(false);
          router.replace("/login");
        }
      },
      (error) => {
        resolved = true;
        window.clearTimeout(fallback);
        console.error("Erro ao verificar a sessão:", error);
        setUserId(null);
        setStatus("unauthenticated");
        router.replace("/login?reason=session-check");
      }
    );

    return () => {
      window.clearTimeout(fallback);
      unsubscribe();
    };
  }, [router]);

  // Automatic logout after 30 minutes without user activity.
  useEffect(() => {
    if (status !== "authenticated" || !userId) return;

    const key = `gwerotimetrack-last-activity-${userId}`;
    let lastActivity = Date.now();
    let loggingOut = false;

    function persistActivity() {
      try {
        localStorage.setItem(key, String(lastActivity));
      } catch {
        // Continue using the in-memory timestamp.
      }
    }

    persistActivity();

    function recordActivity() {
      if (loggingOut) return;

      const now = Date.now();

      // Limit storage writes during frequent mouse movement.
      if (now - lastActivity >= 3000) {
        lastActivity = now;
        persistActivity();
      } else {
        lastActivity = now;
      }

      setShowWarning(false);
    }

    function checkInactivity() {
      if (loggingOut) return;

      let latestActivity = lastActivity;

      try {
        const stored = Number(localStorage.getItem(key));

        if (Number.isFinite(stored) && stored > latestActivity) {
          latestActivity = stored;
        }
      } catch {
        // Fall back to in-memory activity.
      }

      const inactiveFor = Date.now() - latestActivity;

      if (inactiveFor >= SESSION_TIMEOUT) {
        loggingOut = true;
        setShowWarning(false);

        void signOut(auth).finally(() => {
          router.replace("/login?reason=timeout");
        });

        return;
      }

      setShowWarning(inactiveFor >= WARNING_TIME);
    }

    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "mousemove",
      "scroll",
      "touchstart",
    ];

    events.forEach((event) => {
      window.addEventListener(event, recordActivity, { passive: true });
    });

    const interval = window.setInterval(checkInactivity, 1000);

    return () => {
      window.clearInterval(interval);
      events.forEach((event) => {
        window.removeEventListener(event, recordActivity);
      });
    };
  }, [status, userId, router]);

  function continueSession() {
    if (!userId) return;

    // Reset the activity timestamp explicitly.
    const now = Date.now();

    try {
      localStorage.setItem(
        `gwerotimetrack-last-activity-${userId}`,
        String(now)
      );
    } catch {
      // In-memory activity remains available.
    }

    setShowWarning(false);
  }

  if (status !== "authenticated") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="text-center">
          <p className="text-3xl font-bold text-cyan-400">
            ⚡ GweroTimeTrack
          </p>

          <p className="mt-4 text-sm text-slate-400">
            {status === "checking"
              ? "A verificar a tua sessão..."
              : "A redireccionar para o login..."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <>
      {children}

      {showWarning && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="session-warning-title"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 px-5 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border border-amber-700/60 bg-slate-900 p-6 shadow-2xl">
            <div className="text-3xl">⏳</div>

            <h2
              id="session-warning-title"
              className="mt-3 text-xl font-bold"
            >
              A tua sessão vai expirar
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-400">
              Por segurança, a sessão termina após 30 minutos de inactividade.
              Faltam aproximadamente 2 minutos. Continua a sessão para
              permanecer ligado.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={continueSession}
                className="flex-1 rounded-lg bg-cyan-500 px-4 py-3 font-bold text-slate-950 hover:bg-cyan-400"
              >
                Continuar sessão
              </button>

              <button
                onClick={() => {
                  void signOut(auth).finally(() => {
                    router.replace("/login");
                  });
                }}
                className="rounded-lg border border-slate-700 px-4 py-3 text-sm hover:bg-slate-800"
              >
                Terminar sessão
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
