import { NextResponse } from "next/server";
import { searchOffers } from "@/lib/offer-search-server";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getClientKey(request) {
  const directIp =
    request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip");
  const forwardedFor = request.headers.get("x-forwarded-for");
  return directIp || forwardedFor?.split(",")[0]?.trim() || "local";
}

function json(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(body, { ...init, headers });
}

function readNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function readFilters(body) {
  const marketplace = ["mercadolivre", "shopee", "ambos"].includes(body.marketplace)
    ? body.marketplace
    : "ambos";

  return {
    marketplace,
    minPrice: readNumber(body.minPrice),
    maxPrice: readNumber(body.maxPrice),
    minDiscount: readNumber(body.minDiscount),
    minRating: readNumber(body.minRating),
    minSales: readNumber(body.minSales) || 150,
    freeShipping: Boolean(body.freeShipping),
  };
}

export async function POST(request) {
  try {
    const rateLimit = consumeRateLimit(getClientKey(request));
    if (!rateLimit.allowed) {
      return json(
        { error: "Muitas tentativas. Aguarde alguns segundos." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    if (typeof body.query !== "string") {
      return json({ error: "Digite o nome do produto ou cole um link." }, { status: 400 });
    }

    const result = await searchOffers(body.query, readFilters(body));
    return json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Nao foi possivel buscar ofertas.";
    const status = message.includes("Playwright") ? 500 : 400;
    return json({ error: message }, { status });
  }
}
