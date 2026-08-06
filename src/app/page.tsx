import { CertificatesSection } from "@/components/landing/certificates-section";
import { EcosystemSection } from "@/components/landing/ecosystem-section";
import { FloatingAdvisoryButton } from "@/components/landing/floating-advisory-button";
import { Footer } from "@/components/landing/footer";
import { FounderModal } from "@/components/landing/founder-modal";
import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { ProductsSection } from "@/components/landing/products-section";

export default function Home() {
  return (
    <div data-home-shell>
      <FounderModal />
      <Header />
      <FloatingAdvisoryButton />
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
