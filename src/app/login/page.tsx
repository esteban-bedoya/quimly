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
          className="grid w-full overflow-hidden rounded-[2rem] border border-white/60 bg-white/70 shadow-[0_24px_80px_rgba(18,17,15,0.12)] backdrop-blur-xl lg:grid-cols-[0.9fr_1.1fr]"
        >
          <section className="flex flex-col gap-8 bg-[#12110f] px-6 py-8 text-white transition-[gap,padding] duration-500 ease-out sm:px-8 sm:py-10 lg:min-h-[42rem] lg:gap-7 lg:pb-12 lg:pt-9">
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

              <p className="w-fit rounded-full border border-white/12 px-3 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.24em] text-[#7ad9dd] lg:px-3.5 lg:py-1.5 lg:text-[0.74rem]">
                Acceso
              </p>
            </div>

            <div className="flex items-center lg:flex-1 lg:pb-24">
              <div className="space-y-4">
                <h1 className="max-w-md text-3xl font-semibold tracking-[-0.04em] sm:text-4xl lg:text-[2.375rem]">
                  Tu operación sanitaria, siempre lista.
                </h1>

                <p className="max-w-lg text-sm leading-7 text-white/74 sm:text-base lg:leading-8">
                  Organiza tus registros y soportes para cumplir sin complicaciones.
                </p>
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
