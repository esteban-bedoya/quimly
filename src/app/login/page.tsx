import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";

import { LoginPanel } from "@/components/auth/login-form";
import { getCurrentUserContext } from "@/lib/auth/user-context";
import { QUIMLY_WHATSAPP_URL } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const currentUser = await getCurrentUserContext();

  if (currentUser) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#7ad9dd_0%,#f4efe7_38%,#efe6d8_100%)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
        <div
          data-login-shell
          className="grid w-full overflow-hidden rounded-[2rem] border border-white/60 bg-white/70 shadow-[0_24px_80px_rgba(18,17,15,0.12)] backdrop-blur-xl lg:grid-cols-[1.05fr_0.95fr]"
        >
          <section className="flex flex-col gap-8 bg-[#12110f] px-6 py-8 text-white transition-[gap,padding] duration-500 ease-out sm:px-8 sm:py-10 lg:min-h-[42rem] lg:justify-between lg:gap-7 lg:pb-12 lg:pt-9">
            <div data-login-left-header className="space-y-4 transition-transform duration-500 ease-out">
              <Link href="/" className="inline-flex w-fit transition duration-300 hover:scale-[1.04]">
                <Image
                  src="/logos/quimly_logoo.png"
                  alt="Quimly"
                  width={162}
                  height={40}
                  priority
                  className="h-9 w-auto sm:h-10"
                />
              </Link>

              <p className="w-fit rounded-full border border-white/12 px-3 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.24em] text-[#7ad9dd]">
                Acceso seguro
              </p>
            </div>

            <div className="space-y-4">
              <h1 className="max-w-md text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                Inicia sesión en la operación central de tu empresa.
              </h1>

              <p className="max-w-lg text-sm leading-7 text-white/74 sm:text-base">
                Quimly te ayuda con tu operación sanitaria.
              </p>
            </div>

            <div
              data-login-left-cards
              className="grid gap-3 text-sm text-white/78 transition-transform duration-500 ease-out sm:grid-cols-3"
            >
              <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                <p className="font-semibold text-white">Owner</p>
                <p className="mt-2 leading-6">Control total de la plataforma y configuración crítica.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                <p className="font-semibold text-white">Super admin</p>
                <p className="mt-2 leading-6">Operación interna y soporte sobre empresas asignadas.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                <p className="font-semibold text-white">Company admin</p>
                <p className="mt-2 leading-6">Gestión diaria de la empresa cliente y sus registros.</p>
              </div>
            </div>
          </section>

          <section className="px-6 py-8 sm:px-8 sm:py-10 lg:flex lg:items-center">
            <div className="mx-auto w-full max-w-md lg:max-w-[30rem]">
              <LoginPanel whatsappUrl={QUIMLY_WHATSAPP_URL} />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
