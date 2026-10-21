import { Footer } from "@/components/ui/Footer";
import { MobileIntro } from "@/components/ui/MobileIntro";
import { ShoreHero } from "@/components/ui/ShoreHero";
import { SmoothScroll } from "@/components/ui/SmoothScroll";
import { StickyHero } from "@/components/ui/StickyHero";

export default function Home() {
  return (
    <>
      <SmoothScroll />
      <ShoreHero />
      <div className="hidden md:block">
        <StickyHero />
      </div>
      <div className="md:hidden">
        <MobileIntro />
      </div>
      <Footer />
    </>
  );
}
