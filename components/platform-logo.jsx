"use client"

import { useState } from "react"
import { ShoppingBag } from "lucide-react"

const PLATFORM_LOGOS = {
  shopee: {
    src: "/brands/shopee.svg",
    alt: "Shopee",
    frameClass: "bg-white",
    imageClass: "p-1.5",
  },
  mercadolivre: {
    src: "/brands/mercadolivre.png",
    alt: "Mercado Livre",
    frameClass: "bg-[#ffe600]",
    imageClass: "p-1",
  },
}

function resolvePlatform(platform, platformLabel) {
  if (platform === "shopee" || platform === "mercadolivre") return platform

  const normalizedLabel = platformLabel?.toLowerCase() || ""
  if (normalizedLabel.includes("shopee")) return "shopee"
  if (
    normalizedLabel.includes("mercado livre") ||
    normalizedLabel.includes("mercadolivre")
  ) {
    return "mercadolivre"
  }

  return null
}

export function PlatformLogo({
  platform,
  platformLabel,
  size = "md",
  showLabel = false,
}) {
  const [failed, setFailed] = useState(false)
  const key = resolvePlatform(platform, platformLabel)
  const logo = key ? PLATFORM_LOGOS[key] : null
  const sizeClass = size === "sm" ? "size-7 rounded-md" : "size-10 rounded-lg"
  const frameClass = logo?.frameClass || "bg-muted"

  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-black/10 ${sizeClass} ${frameClass}`}
      >
        {!logo || failed ? (
          <ShoppingBag className="size-1/2 text-foreground/60" />
        ) : (
          <img
            src={logo.src}
            alt={logo.alt}
            className={`h-full w-full object-contain ${logo.imageClass}`}
            onError={() => setFailed(true)}
          />
        )}
      </span>
      {showLabel && (
        <span className="text-sm font-medium">
          {platformLabel || logo?.alt || "Oferta"}
        </span>
      )}
    </span>
  )
}
