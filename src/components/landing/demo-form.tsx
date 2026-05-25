import { requestDemo } from "@/app/actions";

const roles = [
  "Direccion / Gerencia",
  "Produccion",
  "Calidad",
  "Compras",
  "Inventario",
  "Finanzas",
  "Tecnologia",
];

const companyTypes = [
  "Manufactura quimica",
  "Distribucion",
  "Laboratorio",
  "Cosmetica",
  "Farmaceutica",
  "Alimentos e ingredientes",
  "Otro",
];

export function DemoForm() {
  return (
    <section id="demo" className="bg-[#12110f] px-5 py-24 text-white sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <p className="section-kicker rounded-full">
            CONSTRUIDO PARA CRECER
          </p>
          <h2 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
            Grandes operaciones eligen herramientas hechas para su realidad.
          </h2>
          <p className="mt-7 max-w-xl text-lg leading-8 text-white/62">
            El formulario queda conectado a una Server Action y el proyecto ya
            incluye un endpoint inicial para guardar leads en Supabase.
          </p>
        </div>

        <form action={requestDemo} className="rounded-lg border border-white/10 bg-white/[0.04] p-5 sm:p-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-white/70">
              Nombre
              <input
                required
                name="name"
                className="rounded-md border border-white/10 bg-white px-4 py-3 text-base text-[#12110f] outline-none transition placeholder:text-[#8d877b] focus:border-[#c9e265]"
                placeholder="Tu nombre"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-white/70">
              Email
              <input
                required
                name="email"
                type="email"
                className="rounded-md border border-white/10 bg-white px-4 py-3 text-base text-[#12110f] outline-none transition placeholder:text-[#8d877b] focus:border-[#c9e265]"
                placeholder="nombre@empresa.com"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-white/70">
              Rol
              <select
                required
                name="role"
                className="rounded-md border border-white/10 bg-white px-4 py-3 text-base text-[#12110f] outline-none transition focus:border-[#c9e265]"
                defaultValue=""
              >
                <option value="" disabled>
                  Selecciona uno
                </option>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium text-white/70">
              Tipo de empresa
              <select
                required
                name="companyType"
                className="rounded-md border border-white/10 bg-white px-4 py-3 text-base text-[#12110f] outline-none transition focus:border-[#c9e265]"
                defaultValue=""
              >
                <option value="" disabled>
                  Selecciona uno
                </option>
                {companyTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-4 grid gap-2 text-sm font-medium text-white/70">
            Mensaje
            <textarea
              name="message"
              rows={4}
              className="resize-none rounded-md border border-white/10 bg-white px-4 py-3 text-base text-[#12110f] outline-none transition placeholder:text-[#8d877b] focus:border-[#c9e265]"
              placeholder="Cuentanos que operacion quieres ordenar primero"
            />
          </label>

          <button
            type="submit"
            className="mt-5 w-full rounded-md bg-[#c9e265] px-6 py-4 text-sm font-bold text-[#12110f] transition hover:bg-[#dcf275]"
          >
            Solicitar demo
          </button>
        </form>
      </div>
    </section>
  );
}
