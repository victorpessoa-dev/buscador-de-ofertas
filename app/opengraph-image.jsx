import { ImageResponse } from "next/og"
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site-metadata"

export const alt = `${SITE_NAME} - Encontre ofertas da Shopee e do Mercado Livre`
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = "image/png"

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background:
            "linear-gradient(135deg, #ee4d2d 0%, #f97316 55%, #ffe600 100%)",
          color: "white",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          padding: "70px",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "flex-start",
            background: "rgba(17, 24, 39, 0.88)",
            border: "2px solid rgba(255,255,255,0.2)",
            borderRadius: "36px",
            display: "flex",
            flexDirection: "column",
            padding: "64px",
            width: "100%",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              fontSize: 30,
              fontWeight: 700,
              gap: 18,
            }}
          >
            <div
              style={{
                alignItems: "center",
                background: "#ee4d2d",
                borderRadius: 18,
                display: "flex",
                fontSize: 42,
                height: 72,
                justifyContent: "center",
                width: 72,
              }}
            >
              ↗
            </div>
            {SITE_NAME}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 800,
              letterSpacing: "-2px",
              marginTop: 40,
            }}
          >
            Buscador de Ofertas
          </div>
          <div
            style={{
              color: "#d1d5db",
              display: "flex",
              fontSize: 30,
              lineHeight: 1.4,
              marginTop: 24,
            }}
          >
            {SITE_DESCRIPTION}
          </div>
        </div>
      </div>
    ),
    size,
  )
}
