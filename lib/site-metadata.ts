import type { Metadata } from "next"

export const SITE_NAME = "Link de Afiliado"
export const SITE_DESCRIPTION =
  "Gere links de afiliado da Shopee e do Mercado Livre."

export function getSiteUrl() {
  const configuredUrl = process.env.APP_URL || "http://localhost:3000"

  try {
    const url = new URL(configuredUrl)
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Protocolo inválido.")
    }
    return new URL(url.origin)
  } catch {
    return new URL("http://localhost:3000")
  }
}

type OfferMetadata = {
  title?: string | null
  description?: string | null
  image?: string | null
  platformLabel?: string | null
  canonicalPath?: string
}

export function createOfferMetadata({
  title,
  description,
  image,
  platformLabel,
  canonicalPath,
}: OfferMetadata): Metadata {
  const offerTitle = title || `Oferta no ${platformLabel || "marketplace"}`
  const offerDescription =
    description ||
    `Confira esta oferta selecionada no ${platformLabel || "marketplace"}.`
  const images = image
    ? [
        {
          url: image,
          alt: offerTitle,
        },
      ]
    : ["/opengraph-image"]

  return {
    title: offerTitle,
    description: offerDescription,
    alternates: canonicalPath ? { canonical: canonicalPath } : undefined,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
      },
    },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: SITE_NAME,
      title: offerTitle,
      description: offerDescription,
      url: canonicalPath,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: offerTitle,
      description: offerDescription,
      images: image ? [image] : ["/opengraph-image"],
    },
  }
}
