"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { login } from "@/app/login/actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#12110f] px-5 py-3 text-sm font-semibold text-white transition duration-300 hover:bg-[#1d1b18] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Ingresando..." : "Ingresar"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(login, undefined);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium text-[#12110f]">
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35"
          placeholder="tu@empresa.com"
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium text-[#12110f]">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="min-h-12 w-full rounded-2xl border border-[#12110f]/12 bg-white px-4 py-3 text-sm text-[#12110f] outline-none transition focus:border-[#12110f]/35"
          placeholder="Tu contraseña"
          required
        />
      </div>

      {state?.error ? (
        <p className="rounded-2xl border border-[#c66b5c]/22 bg-[#fff1ee] px-4 py-3 text-sm text-[#8a2d1f]">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
