import { NextResponse } from "next/server"
import { convertAffiliateLink } from "@/lib/affiliate-server"
import { createRedirectToken } from "@/lib/redirect-token"
import { consumeRateLimit } from "@/lib/rate-limit"

export const runtime = "nodejs"

function getClientKey(request: Request) {
  const directIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip")
  const forwardedFor = request.headers.get("x-forwarded-for")

  return directIp || forwardedFor?.split(",")[0]?.trim() || "local"
}

function json(
  body: unknown,
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers)
  headers.set("Cache-Control", "no-store")

  return NextResponse.json(body, {
    ...init,
    headers,
  })
}

function getBaseUrl(request: Request) {
  if (process.env.NODE_ENV !== "production") {
    return new URL(request.url).origin
  }

  const configured = process.env.APP_URL
  if (!configured) return new URL(request.url).origin

  const url = new URL(configured)
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("APP_URL precisa usar http:// ou https://.")
  }

  return url.origin
}

function getErrorStatus(message: string) {
  const clientErrors = [
    "Cole um link",
    "O link informado",
    "Use um link iniciado",
    "Link não reconhecido",
    "O link redirecionou",
    "O link possui redirecionamentos",
  ]

  return clientErrors.some((prefix) => message.startsWith(prefix)) ? 400 : 500
}

export async function POST(request: Request) {
  try {
    const rateLimit = consumeRateLimit(getClientKey(request))
    if (!rateLimit.allowed) {
      return json(
        { error: "Muitas tentativas. Aguarde alguns segundos." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfter),
          },
        },
      )
    }

    const body = (await request.json()) as { url?: unknown }

    if (typeof body.url !== "string" || body.url.length > 4_096) {
      return json({ error: "Informe um link válido." }, { status: 400 })
    }

    const result = await convertAffiliateLink(body.url)
    const token = createRedirectToken({
      url: result.affiliateUrl,
      title: result.product?.title,
      description: result.product?.description,
      image: result.product?.image,
      platformLabel: result.platformLabel,
    })
    const baseUrl = getBaseUrl(request)
    const redirectUrl = new URL("/go", baseUrl)
    redirectUrl.searchParams.set("token", token)
    const redirectUrlString = redirectUrl.toString()

    return json({
      ...result,
      redirectUrl: redirectUrlString,
      shortUrl: redirectUrlString,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível gerar o link."

    return json(
      { error: message },
      { status: getErrorStatus(message) },
    )
  }
}
