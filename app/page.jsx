import { Search } from "lucide-react"
import { OfferSearch } from "@/components/offer-search"
import { getSiteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site-metadata"

export default function Page() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: getSiteUrl().toString(),
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "pt-BR",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "BRL",
    },
  }

  return (
    <div className="site-shell min-h-svh overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <div className="site-glow site-glow-one" />
      <div className="site-glow site-glow-two" />

      <header className="site-header sticky top-0 z-20 border-b border-white/15 text-primary-foreground">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="brand-mark flex size-10 items-center justify-center rounded-xl bg-white/15 shadow-lg ring-1 ring-white/20">
            <img src="/icon.svg" alt="" className="size-8 rounded-lg" />
          </div>
          <div className="header-copy flex flex-col leading-tight">
            <span className="text-base font-bold tracking-tight">{SITE_NAME}</span>
            <span className="text-xs text-primary-foreground/80">
              Ofertas em poucos segundos
            </span>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl px-3 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section className="hero-enter flex flex-col gap-7">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Search className="size-3.5" />
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Buscador de Ofertas
              </h1>
            </div>
            <p className="max-w-2xl leading-relaxed text-muted-foreground">
              Encontre ofertas da Shopee e do Mercado Livre por nome ou link, com filtros,
              pontuacao automatica e botoes convertidos para afiliado.
            </p>
          </div>
          <OfferSearch />
        </section>
      </main>
    </div>
  )
}
