
"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

type AuthMode = "login" | "register" | "forgot-password";

type Props = {
  mode: AuthMode;
};

// Validação básica do formato do e-mail:
// nome@dominio.com, nome@dominio.ao, etc.
const EMAIL_PATTERN =
  /^[^\s@.]+(?:\.[^\s@.]+)*@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i;

const SPECIAL_CHARACTERS = '^$*.[]{}()?"!@#%&/\\,><\':;|_~';

const PASSWORD_REQUIREMENTS = [
  {
    label: "Pelo menos 10 caracteres",
    check: (value: string) => value.length >= 10,
  },
  {
    label: "Uma letra maiúscula (A–Z)",
    check: (value: string) => /[A-Z]/.test(value),
  },
  {
    label: "Uma letra minúscula (a–z)",
    check: (value: string) => /[a-z]/.test(value),
  },
  {
    label: "Pelo menos um número (0–9)",
    check: (value: string) => /\d/.test(value),
  },
  {
    label: "Um carácter especial",
    check: (value: string) =>
      [...value].some((character) =>
        SPECIAL_CHARACTERS.includes(character)
      ),
  },
];

function getErrorMessage(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";

  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : "";

  switch (code) {
    case "auth/email-already-in-use":
      return "Este e-mail já tem uma conta. Experimenta iniciar sessão.";

    case "auth/invalid-email":
      return "O endereço de e-mail não é válido.";

    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return "A palavra-passe não cumpre os requisitos de segurança do Firebase.";

    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "E-mail ou palavra-passe incorrectos.";

    case "auth/too-many-requests":
      return "Demasiadas tentativas. Aguarda um pouco e tenta novamente.";

    case "auth/network-request-failed":
      return "Falha de ligação. Verifica a tua ligação à Internet.";

    case "auth/operation-not-allowed":
      return "O método E-mail/senha não está activo no Firebase.";

    case "auth/admin-restricted-operation":
      return "O Firebase não permite a criação pública de contas neste projecto.";

    case "auth/unauthorized-domain":
      return "O domínio desta aplicação não está autorizado no Firebase Authentication.";

    case "auth/invalid-api-key":
      return "A chave API do Firebase está incorrecta. Verifica o ficheiro .env.local.";

    default:
      if (process.env.NODE_ENV !== "production") {
        return `Erro Firebase (${code || "sem código"}): ${
          message || "Sem detalhes fornecidos."
        }`;
      }

      return "Não foi possível concluir a operação. Tenta novamente.";
  }
}

export default function AuthForm({ mode }: Props) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const isLogin = mode === "login";
  const isRegister = mode === "register";
  const isForgot = mode === "forgot-password";

  const trimmedEmail = email.trim();
  const emailValid = EMAIL_PATTERN.test(trimmedEmail);

  const passwordChecks = PASSWORD_REQUIREMENTS.map((requirement) => ({
    label: requirement.label,
    valid: requirement.check(password),
  }));

  const passwordValid = passwordChecks.every((item) => item.valid);
  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword;
  const nameValid = name.trim().length >= 2;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    // Validar o e-mail em todos os formulários.
    if (!emailValid) {
      setError(
        "Introduz um e-mail válido, com @, domínio e ponto. Exemplo: nome@dominio.com."
      );
      return;
    }

    if (isRegister) {
      if (!nameValid) {
        setError("Introduz o teu nome completo.");
        return;
      }

      if (!passwordValid) {
        setError("A palavra-passe ainda não cumpre todos os requisitos.");
        return;
      }

      if (!passwordsMatch) {
        setError("As palavras-passe não coincidem.");
        return;
      }
    }

    setBusy(true);

    try {
      if (isRegister) {
        const credential = await createUserWithEmailAndPassword(
          auth,
          trimmedEmail,
          password
        );

        try {
          await updateProfile(credential.user, {
            displayName: name.trim().replace(/\s+/g, " "),
          });
        } catch (profileError) {
          console.error(
            "A conta foi criada, mas não foi possível actualizar o perfil:",
            profileError
          );
        }

        router.replace("/dashboard");
      } else if (isLogin) {
        await signInWithEmailAndPassword(
          auth,
          trimmedEmail,
          password
        );

        router.replace("/dashboard");
      } else {
        await sendPasswordResetEmail(auth, trimmedEmail);

        setSuccess(
          "Se existir uma conta com este e-mail, receberás instruções para redefinir a palavra-passe."
        );
      }
    } catch (err) {
      console.error("Erro de autenticação GweroTimeTrack:", err);
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const title = isLogin
    ? "Bem-vindo de volta"
    : isRegister
      ? "Criar conta"
      : "Recuperar palavra-passe";

  const description = isLogin
    ? "Inicia sessão para aceder às tuas tarefas e relatórios."
    : isRegister
      ? "Cria a tua conta pessoal no GweroTimeTrack."
      : "Introduz o teu e-mail para receber instruções de recuperação.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
        <Link href="/login" className="block text-center">
          <h1 className="text-3xl font-bold text-cyan-400">
            ⚡ GweroTimeTrack
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            O teu tempo. Os teus objectivos.
          </p>
        </Link>

        <div className="mt-8">
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {description}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {isRegister && (
            <div>
              <label
                htmlFor="auth-name"
                className="mb-2 block text-sm text-slate-300"
              >
                Nome completo
              </label>

              <input
                id="auth-name"
                type="text"
                autoComplete="name"
                required
                minLength={2}
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="O teu nome completo"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-400"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="auth-email"
              className="mb-2 block text-sm text-slate-300"
            >
              E-mail
            </label>

            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nome@dominio.com"
              aria-invalid={email.length > 0 && !emailValid}
              className={`w-full rounded-lg border bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-400 ${
                email.length > 0 && !emailValid
                  ? "border-rose-500"
                  : "border-slate-700"
              }`}
            />

            {email.length > 0 && (
              <p
                className={`mt-2 text-xs ${
                  emailValid ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {emailValid
                  ? "✓ Formato do e-mail válido."
                  : "Introduz um formato válido, por exemplo nome@dominio.com."}
              </p>
            )}
          </div>

          {!isForgot && (
            <div>
              <label
                htmlFor="auth-password"
                className="mb-2 block text-sm text-slate-300"
              >
                Palavra-passe
              </label>

              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    isRegister ? "new-password" : "current-password"
                  }
                  required
                  minLength={isRegister ? 10 : 1}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={
                    isRegister
                      ? "Cria uma palavra-passe segura"
                      : "A tua palavra-passe"
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 pr-20 outline-none transition focus:border-cyan-400"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-3 text-xs text-cyan-400 hover:text-cyan-300"
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>

              {isRegister && (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <p className="mb-3 text-xs font-semibold text-slate-300">
                    🔐 Requisitos de segurança
                  </p>

                  <ul className="space-y-2">
                    {passwordChecks.map((item) => (
                      <li
                        key={item.label}
                        className={`flex items-start gap-2 text-xs ${
                          item.valid ? "text-emerald-400" : "text-slate-400"
                        }`}
                      >
                        <span aria-hidden="true">
                          {item.valid ? "✓" : "○"}
                        </span>
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {isRegister && (
            <div>
              <label
                htmlFor="auth-confirm-password"
                className="mb-2 block text-sm text-slate-300"
              >
                Confirmar palavra-passe
              </label>

              <div className="relative">
                <input
                  id="auth-confirm-password"
                  type={showConfirmation ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={10}
                  maxLength={128}
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                  placeholder="Escreve novamente a palavra-passe"
                  aria-invalid={
                    confirmPassword.length > 0 && !passwordsMatch
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 pr-20 outline-none transition focus:border-cyan-400"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowConfirmation((value) => !value)
                  }
                  className="absolute inset-y-0 right-3 text-xs text-cyan-400 hover:text-cyan-300"
                >
                  {showConfirmation ? "Ocultar" : "Mostrar"}
                </button>
              </div>

              {confirmPassword.length > 0 && (
                <p
                  className={`mt-2 text-xs ${
                    passwordsMatch ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {passwordsMatch
                    ? "✓ As palavras-passe coincidem."
                    : "✕ As palavras-passe não coincidem."}
                </p>
              )}
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="break-words rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-300"
            >
              {error}
            </p>
          )}

          {success && (
            <p
              role="status"
              className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300"
            >
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={
              busy ||
              !emailValid ||
              (isRegister &&
                (!nameValid || !passwordValid || !passwordsMatch))
            }
            className="w-full rounded-lg bg-cyan-500 px-4 py-3 font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy
              ? "A processar..."
              : isLogin
                ? "🔐 Iniciar sessão"
                : isRegister
                  ? "✨ Criar conta"
                  : "📧 Enviar instruções"}
          </button>
        </form>

        <div className="mt-6 space-y-3 text-center text-sm">
          {isLogin && (
            <>
              <Link
                href="/forgot-password"
                className="block text-cyan-400 hover:text-cyan-300"
              >
                Esqueci-me da palavra-passe
              </Link>

              <p className="text-slate-400">
                Ainda não tens conta?{" "}
                <Link
                  href="/register"
                  className="font-semibold text-cyan-400 hover:text-cyan-300"
                >
                  Criar conta
                </Link>
              </p>
            </>
          )}

          {isRegister && (
            <p className="text-slate-400">
              Já tens uma conta?{" "}
              <Link
                href="/login"
                className="font-semibold text-cyan-400 hover:text-cyan-300"
              >
                Iniciar sessão
              </Link>
            </p>
          )}

          {isForgot && (
            <Link
              href="/login"
              className="inline-block font-semibold text-cyan-400 hover:text-cyan-300"
            >
              ← Voltar ao login
            </Link>
          )}
        </div>

        <p className="mt-7 text-center text-xs text-slate-600">
          🔒 A tua conta protege o acesso aos teus dados.
        </p>
      </div>
    </main>
  );
}
