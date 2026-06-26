import "server-only";

export function validateAffiliateId(platform) {
  const shopeeId = process.env.SHOPEE_AFFILIATE_ID || "";
  const meliId = process.env.MELI_AFFILIATE_ID || "";

  if (platform === "shopee") {
    const isValid = shopeeId.length > 0 && !shopeeId.startsWith("SEU_ID");
    return {
      isValid,
      platform,
      id: shopeeId,
      configured: isValid,
      message: isValid ? "ID Shopee configurado." : "ID Shopee nao configurado.",
    };
  }

  if (platform === "mercadolivre") {
    const isValid = meliId.length > 0 && !meliId.startsWith("SEU_ID");
    return {
      isValid,
      platform,
      id: meliId,
      configured: isValid,
      message: isValid ? "ID Mercado Livre configurado." : "ID Mercado Livre nao configurado.",
    };
  }

  return {
    isValid: false,
    platform,
    id: "",
    configured: false,
    message: `Plataforma desconhecida: ${platform}`,
  };
}

export function hasAffiliateParams(url, platform) {
  try {
    const urlObj = new URL(url);
    if (platform === "shopee") {
      return (
        urlObj.searchParams.has("af_siteid") ||
        urlObj.searchParams.has("utm_campaign") ||
        urlObj.searchParams.has("utm_source")
      );
    }

    if (platform === "mercadolivre") {
      return urlObj.searchParams.has("matt_word") || urlObj.searchParams.has("tracking_id");
    }

    return false;
  } catch {
    return false;
  }
}

export function extractAffiliateId(url, platform) {
  try {
    const urlObj = new URL(url);
    if (platform === "shopee") {
      return urlObj.searchParams.get("af_siteid") || urlObj.searchParams.get("utm_campaign") || null;
    }

    if (platform === "mercadolivre") {
      return urlObj.searchParams.get("matt_word") || null;
    }

    return null;
  } catch {
    return null;
  }
}
