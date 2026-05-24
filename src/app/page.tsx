import { DemoForm } from "@/components/landing/demo-form";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { Outcomes } from "@/components/landing/outcomes";
import { ProblemComparison } from "@/components/landing/problem-comparison";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <ProblemComparison />
        <Outcomes />
        <DemoForm />
      </main>
      <Footer />
    </>
  );
}
