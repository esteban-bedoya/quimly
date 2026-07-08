import { CertificatesSection } from "@/components/landing/certificates-section";
import { EcosystemSection } from "@/components/landing/ecosystem-section";
import { FloatingAdvisoryButton } from "@/components/landing/floating-advisory-button";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { ProductsSection } from "@/components/landing/products-section";
import { TemporaryGreetingModal } from "@/components/landing/temporary-greeting-modal";

export default function Home() {
  return (
    <div data-home-shell>
      <Header />
      <FloatingAdvisoryButton />
      <TemporaryGreetingModal />
      <main>
        <Hero />
        <EcosystemSection />
        <ProductsSection />
        <CertificatesSection />
      </main>
      <Footer />
    </div>
  );
}
