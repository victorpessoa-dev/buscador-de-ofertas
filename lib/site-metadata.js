export const SITE_NAME = "Buscador de Ofertas";
export const SITE_DESCRIPTION = "Encontre as melhores ofertas da Shopee e do Mercado Livre.";
function normalizeSiteUrl(value) {
    if (!value)
        return null;
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
        const url = new URL(withProtocol);
        if (url.protocol !== "https:" && url.protocol !== "http:")
            return null;
        return new URL(url.origin);
    }
    catch {
        return null;
    }
}
export function getSiteUrl() {
    return (normalizeSiteUrl(process.env.APP_URL) ||
        normalizeSiteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
        normalizeSiteUrl(process.env.VERCEL_URL) ||
        new URL("http://localhost:3000"));
}
export function createOfferMetadata({ title, description, image, platformLabel, canonicalPath, }) {
    const offerTitle = title || `Oferta no ${platformLabel || "marketplace"}`;
    const offerDescription = description ||
        `Confira esta oferta selecionada no ${platformLabel || "marketplace"}.`;
    const images = image
        ? [
            {
                url: image,
                alt: offerTitle,
            },
        ]
        : ["/opengraph-image"];
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
    };
}
