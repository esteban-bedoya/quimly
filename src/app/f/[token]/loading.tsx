export default function PublicOperationalFormLoading() {
  return (
    <main className="grid min-h-screen min-h-dvh place-items-center bg-[#12110F] px-5 text-white">
      <div className="grid w-full max-w-sm gap-4">
        <div className="h-3 w-28 rounded-full bg-white/15" />
        <div className="h-8 w-56 rounded-full bg-[#48c7d2]/50" />
        <div className="grid gap-3 rounded-lg bg-white p-5">
          <div className="h-5 w-4/5 rounded-full bg-neutral-200" />
          <div className="h-14 rounded-lg bg-neutral-100" />
          <div className="h-14 rounded-lg bg-neutral-100" />
          <div className="h-16 rounded-lg bg-neutral-950" />
        </div>
      </div>
    </main>
  );
}
