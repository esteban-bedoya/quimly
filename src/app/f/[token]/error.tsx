"use client";

export default function PublicOperationalFormError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen min-h-dvh place-items-center bg-[#12110F] px-5 text-white">
      <section className="grid w-full max-w-sm gap-5 rounded-lg bg-white p-6 text-[#111816]">
        <div className="grid gap-2">
          <p className="text-xs font-black uppercase tracking-widest text-[#66736f]">Formulario publico</p>
          <h1 className="text-2xl font-black leading-tight">No pudimos cargar este formulario.</h1>
          <p className="text-sm font-bold leading-6 text-[#51645f]">
            Puede ser una demora temporal del servidor o un QR que ya no esta activo.
          </p>
          {error.digest ? <p className="text-xs font-bold text-[#7b8c87]">Codigo: {error.digest}</p> : null}
        </div>
        <button
          type="button"
          onClick={reset}
          className="min-h-14 rounded-lg bg-[#111816] px-5 text-base font-black text-white transition active:scale-[0.98]"
        >
          Intentar de nuevo
        </button>
      </section>
    </main>
  );
}
