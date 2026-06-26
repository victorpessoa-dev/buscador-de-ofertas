import { NextResponse } from "next/server";
import { convertAffiliateLink } from "@/lib/affiliate-server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { logAffiliateConversion } from "@/lib/affiliate-logger";
import { getSiteUrl } from "@/lib/site-metadata";
export const runtime = "nodejs";
function getClientKey(request) {
    const directIp = request.headers.get("cf-connecting-ip") ||
        request.headers.get("x-real-ip");
    const forwardedFor = request.headers.get("x-forwarded-for");
    return directIp || forwardedFor?.split(",")[0]?.trim() || "local";
}
function json(body, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("Cache-Control", "no-store");
    return NextResponse.json(body, {
        ...init,
        headers,
    });
}
function getBaseUrl(request) {
    if (process.env.NODE_ENV !== "production") {
        return new URL(request.url).origin;
    }
    return getSiteUrl().origin || new URL(request.url).origin;
}
function createLoadingUrl(request, result) {
    const url = new URL("/go", getBaseUrl(request));
    url.searchParams.set("u", result.affiliateUrl);
    url.searchParams.set("p", result.platformLabel);
    if (result.product?.title) {
        url.searchParams.set("t", result.product.title.slice(0, 180));
    }
    if (result.product?.image) {
        url.searchParams.set("i", result.product.image);
    }
    return url.toString();
}
function getErrorStatus(message) {
    const clientErrors = [
        "Cole um link",
        "O link informado",
        "Use um link iniciado",
        "Link não reconhecido",
        "O link redirecionou",
        "O link possui redirecionamentos",
    ];
    return clientErrors.some((prefix) => message.startsWith(prefix)) ? 400 : 500;
}
export async function POST(request) {
    try {
        const rateLimit = consumeRateLimit(getClientKey(request));
        if (!rateLimit.allowed) {
            logAffiliateConversion("warn", "Taxa de requisições excedida", {
                clientKey: getClientKey(request),
            });
            return json({ error: "Muitas tentativas. Aguarde alguns segundos." }, {
                status: 429,
                headers: {
                    "Retry-After": String(rateLimit.retryAfter),
                },
            });
        }
        const body = (await request.json());
        if (typeof body.url !== "string" || body.url.length > 4_096) {
            logAffiliateConversion("warn", "URL inválida recebida", {
                url: typeof body.url === "string" ? body.url.slice(0, 100) : typeof body.url,
            });
            return json({ error: "Informe um link válido." }, { status: 400 });
        }
        const result = await convertAffiliateLink(body.url);
        const loadingUrl = createLoadingUrl(request, result);
        logAffiliateConversion("info", "Conversão bem-sucedida", {
            platform: result.platform,
            method: result.method,
            hasAffiliate: !!result.affiliateUrl,
            redirectUrl: loadingUrl,
        });
        return json({
            ...result,
            redirectUrl: loadingUrl,
            shortUrl: loadingUrl,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível gerar o link.";
        logAffiliateConversion("error", "Erro na conversão", {
            error: message,
            timestamp: new Date().toISOString(),
        });
        return json({ error: message }, { status: getErrorStatus(message) });
    }
}
