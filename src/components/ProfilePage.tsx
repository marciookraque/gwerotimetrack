
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

const SPECIAL_CHARACTERS = '^$*.[]{}()?"!@#%&/\\,><\':;|_~';

const PASSWORD_REQUIREMENTS = [
  {
    label: "Pelo menos 10 caracteres",
    check: (value: string) => value.length >= 10,
  },
  {
    label: "Uma letra maiúscula",
    check: (value: string) => /[A-Z]/.test(value),
  },
  {
    label: "Uma letra minúscula",
    check: (value: string) => /[a-z]/.test(value),
  },
  {
    label: "Pelo menos um número",
    check: (value: string) => /\d/.test(value),
  },
  {
    label: "Um carácter especial aceite",
    check: (value: string) =>
      [...value].some((character) =>
        SPECIAL_CHARACTERS.includes(character)
      ),
  },
];

function getProfileError(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "A palavra-passe actual está incorrecta.";

    case "auth/requires-recent-login":
      return "Por segurança, inicia sessão novamente e tenta alterar a palavra-passe.";

    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return "A nova palavra-passe não cumpre a política de segurança do Firebase.";

    case "auth/too-many-requests":
      return "Demasiadas tentativas. Aguarda um pouco e tenta novamente.";

    case "auth/network-request-failed":
      return "Falha de ligação. Verifica a tua Internet.";

    default:
      return "Não foi possível concluir a operação. Tenta novamente.";
  }
}

export default function ProfilePage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [name, setName] = useState(auth.currentUser?.displayName ?? "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [nameMessage, setNameMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [nameError, setNameError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [returnTo, setReturnTo] = useState("/dashboard");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setName(currentUser?.displayName ?? "");

      if (!currentUser) {
        router.replace("/login");
      }
    });

    try {
      const savedPath = localStorage.getItem(
        "gwerotimetrack-last-private-path"
      );

      if (
        savedPath === "/dashboard" ||
        savedPath === "/tasks" ||
        savedPath === "/reports"
      ) {
        setReturnTo(savedPath);
      }
    } catch {
      // Use dashboard as the default return destination.
    }

    return () => unsubscribe();
  }, [router]);

  const requirements = PASSWORD_REQUIREMENTS.map((requirement) => ({
    label: requirement.label,
    valid: requirement.check(newPassword),
  }));

  const passwordValid = requirements.every((item) => item.valid);
  const passwordsMatch =
    confirmPassword.length > 0 && newPassword === confirmPassword;

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameError("");
    setNameMessage("");

    const cleanName = name.trim().replace(/\s+/g, " ");

    if (cleanName.length < 2) {
      setNameError("Introdu um nome com pelo menos 2 caracteres.");
      return;
    }

    if (cleanName.length > 100) {
      setNameError("O nome não pode ultrapassar 100 caracteres.");
      return;
    }

    if (!user) {
      setNameError("A sessão não está disponível. Inicia sessão novamente.");
      return;
    }

    setSavingName(true);

    try {
      await updateProfile(user, { displayName: cleanName });
      setName(cleanName);
      setNameMessage("✅ Nome actualizado com sucesso.");
    } catch (error) {
      console.error("Erro ao actualizar nome:", error);
      setNameError("Não foi possível actualizar o nome. Tenta novamente.");
    } finally {
      setSavingName(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setPasswordError("");
    setPasswordMessage("");

    if (!user || !user.email) {
      setPasswordError("Não foi possível identificar a conta autenticada.");
      return;
    }

    if (!currentPassword) {
      setPasswordError("Introduz a palavra-passe actual.");
      return;
    }

    if (!passwordValid) {
      setPasswordError("A nova palavra-passe não cumpre todos os requisitos.");
      return;
    }

    if (!passwordsMatch) {
      setPasswordError("As novas palavras-passe não coincidem.");
      return;
    }

    if (newPassword === currentPassword) {
      setPasswordError(
        "A nova palavra-passe tem de ser diferente da palavra-passe actual."
      );
      return;
    }

    setSavingPassword(true);

    try {
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      );

      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setPasswordMessage("✅ Palavra-passe alterada com sucesso.");
    } catch (error) {
      console.error("Erro ao alterar palavra-passe:", error);
      setPasswordError(getProfileError(error));
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium text-cyan-400">
              ⚡ GweroTimeTrack
            </p>
            <h1 className="mt-2 text-3xl font-bold">Editar perfil</h1>
            <p className="mt-2 text-sm text-slate-400">
              Gere o teu nome e a segurança da tua conta.
            </p>
          </div>

          <Link
            href={returnTo}
            className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold hover:border-cyan-500 hover:text-cyan-300"
          >
            ← Voltar à aplicação
          </Link>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-bold">👤 Informação pessoal</h2>
            <p className="mt-1 text-sm text-slate-400">
              Actualiza o nome apresentado na aplicação.
            </p>
          </div>

          <div className="mb-5 rounded-lg border border-slate-800 bg-slate-950 p-3">
            <p className="text-xs text-slate-500">E-mail da conta</p>
            <p className="mt-1 break-all text-sm">
              {user?.email ?? "A carregar..."}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              O e-mail não pode ser alterado nesta página.
            </p>
          </div>

          <form onSubmit={saveName} className="space-y-4">
            <div>
              <label
                htmlFor="profile-name"
                className="mb-2 block text-sm text-slate-300"
              >
                Nome completo
              </label>
              <input
                id="profile-name"
                type="text"
                autoComplete="name"
                minLength={2}
                maxLength={100}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="O teu nome completo"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
              />
            </div>

            {nameError && (
              <p role="alert" className="rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-300">
                {nameError}
              </p>
            )}

            {nameMessage && (
              <p role="status" className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300">
                {nameMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={savingName || !user}
              className="rounded-lg bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
            >
              {savingName ? "A guardar..." : "💾 Guardar nome"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-bold">🔐 Alterar palavra-passe</h2>
            <p className="mt-1 text-sm text-slate-400">
              Por segurança, confirma primeiro a palavra-passe actual.
            </p>
          </div>

          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <label
                htmlFor="current-password"
                className="mb-2 block text-sm text-slate-300"
              >
                Palavra-passe actual
              </label>
              <div className="relative">
                <input
                  id="current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 pr-20 outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((value) => !value)}
                  className="absolute inset-y-0 right-3 text-xs text-cyan-400"
                >
                  {showCurrentPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="new-password"
                className="mb-2 block text-sm text-slate-300"
              >
                Nova palavra-passe
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 pr-20 outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((value) => !value)}
                  className="absolute inset-y-0 right-3 text-xs text-cyan-400"
                >
                  {showNewPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>

              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
                <p className="mb-3 text-xs font-semibold text-slate-300">
                  Requisitos da nova palavra-passe
                </p>
                <ul className="space-y-2">
                  {requirements.map((item) => (
                    <li
                      key={item.label}
                      className={`flex gap-2 text-xs ${
                        item.valid ? "text-emerald-400" : "text-slate-400"
                      }`}
                    >
                      <span>{item.valid ? "✓" : "○"}</span>
                      <span>{item.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div>
              <label
                htmlFor="confirm-new-password"
                className="mb-2 block text-sm text-slate-300"
              >
                Confirmar nova palavra-passe
              </label>
              <div className="relative">
                <input
                  id="confirm-new-password"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 pr-20 outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  className="absolute inset-y-0 right-3 text-xs text-cyan-400"
                >
                  {showConfirmPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>

              {confirmPassword.length > 0 && (
                <p className={`mt-2 text-xs ${passwordsMatch ? "text-emerald-400" : "text-rose-400"}`}>
                  {passwordsMatch
                    ? "✓ As palavras-passe coincidem."
                    : "✕ As palavras-passe não coincidem."}
                </p>
              )}
            </div>

            {passwordError && (
              <p role="alert" className="break-words rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-300">
                {passwordError}
              </p>
            )}

            {passwordMessage && (
              <p role="status" className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300">
                {passwordMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={
                savingPassword ||
                !user ||
                !currentPassword ||
                !passwordValid ||
                !passwordsMatch
              }
              className="rounded-lg bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {savingPassword
                ? "A actualizar..."
                : "🔒 Actualizar palavra-passe"}
            </button>
          </form>
        </section>

        <p className="pb-4 text-center text-xs text-slate-600">
          🔒 As alterações são aplicadas à tua conta Firebase.
        </p>
      </div>
    </main>
  );
}
