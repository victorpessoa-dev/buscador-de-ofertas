import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CACHE_TTL_MS = 1000 * 60 * 15;
const CACHE_VERSION = 20;
const MAX_PRODUCTS_PER_MARKETPLACE = 40;
const DEFAULT_MIN_SALES = 150;
const tempDir = join(tmpdir(), "affiliate-link-generator");
const tempFile = join(tempDir, "offer-search-cache.json");
const cache = {};
let tempCacheLoaded = false;

class MarketplaceSearchError extends Error {
  constructor(message, marketplace) {
    super(message);
    this.name = "MarketplaceSearchError";
    this.marketplace = marketplace;
  }
}

const MARKETPLACES = {
  mercadolivre: {
    label: "Mercado Livre",
    hosts: ["mercadolivre.com.br", "mercadolivre.com", "mercadolibre.com", "produto.ml"],
    searchUrl: (query) =>
      `https://lista.mercadolivre.com.br/${encodeURIComponent(query).replaceAll("%20", "-")}`,
  },
  shopee: {
    label: "Shopee",
    hosts: ["shopee.com.br", "shopee.com", "shope.ee"],
    searchUrl: (query) =>
      `https://shopee.com.br/search?keyword=${encodeURIComponent(query)}`,
  },
};

function normalizeQuery(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return stripHtml(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isHost(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function detectMarketplace(value) {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    for (const [marketplace, config] of Object.entries(MARKETPLACES)) {
      if (config.hosts.some((domain) => isHost(host, domain))) return marketplace;
    }
  } catch {
    return null;
  }

  return null;
}

function isMarketplaceProductUrl(value, marketplace) {
  if (!value || !marketplace) return false;

  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    const path = decodeURIComponent(url.pathname).toLowerCase();

    if (marketplace === "mercadolivre") {
      const isMercadoLivreHost = MARKETPLACES.mercadolivre.hosts.some((domain) => isHost(host, domain));
      if (!isMercadoLivreHost) return false;

      return (
        host.startsWith("produto.") ||
        host === "produto.ml" ||
        /\/p\/[^/]+/i.test(path) ||
        /\/mlb-?\d+/i.test(path) ||
        /-jm(?:\/|$)/i.test(path)
      );
    }

    if (marketplace === "shopee") {
      const isShopeeHost = MARKETPLACES.shopee.hosts.some((domain) => isHost(host, domain));
      if (!isShopeeHost) return false;

      return /-i\.\d+\.\d+/i.test(path) || /\/product\/\d+\/\d+/i.test(path);
    }
  } catch {
    return false;
  }

  return false;
}

function titleFromUrl(value) {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const ignored = new Set(["p", "product", "search", "lista"]);
    const parts = url.pathname
      .split("/")
      .filter(Boolean)
      .map((part) =>
        decodeURIComponent(part)
          .replace(/-i\.\d+\.\d+.*$/i, "")
          .replace(/^MLB-\d+-?/i, "")
          .replace(/\.\w+$/i, "")
      )
      .filter((part) => part && !ignored.has(part.toLowerCase()));
    return normalizeQuery(parts.at(-1)?.replace(/[-_]+/g, " ") || "");
  } catch {
    return "";
  }
}

function normalizeCacheKey(filters) {
  return JSON.stringify({
    version: CACHE_VERSION,
    query: normalizeQuery(filters.query).toLowerCase(),
    marketplace: filters.marketplace,
    minPrice: Number(filters.minPrice) || 0,
    maxPrice: Number(filters.maxPrice) || 0,
    minDiscount: Number(filters.minDiscount) || 0,
    minRating: Number(filters.minRating) || 0,
    minSales: Number(filters.minSales) || DEFAULT_MIN_SALES,
    freeShipping: Boolean(filters.freeShipping),
  });
}

function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;

  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDiscount(text) {
  const match = normalizeText(text).match(/^\s*(\d{1,2})\s*%\s*(?:off|desconto)\s*$/i);
  if (!match) return 0;
  const discount = Number(match[1]);
  return discount > 0 && discount <= 80 ? discount : 0;
}

function parsePriceCandidates(value) {
  if (Array.isArray(value)) {
    return value.map(parseNumber).filter((price) => price > 0);
  }

  return String(value || "")
    .split("|")
    .map(parseNumber)
    .filter((price) => price > 0);
}

function uniquePricesInOrder(candidates) {
  const seen = new Set();
  return candidates.filter((price) => {
    const key = price.toFixed(2);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectPricePair(candidates, explicitOriginalPrice, explicitDiscount) {
  const uniqueCandidates = uniquePricesInOrder(candidates).filter((price) => price > 0);

  if (!uniqueCandidates.length) return { price: 0, originalPrice: 0 };

  const highestCandidate = Math.max(...uniqueCandidates);
  const plausibleCandidates =
    highestCandidate > 0
      ? uniqueCandidates.filter((price) => price >= highestCandidate * 0.2)
      : uniqueCandidates;

  if (explicitOriginalPrice) {
    const currentCandidates = plausibleCandidates.filter(
      (candidate) =>
        Math.abs(candidate - explicitOriginalPrice) > 0.01 &&
        candidate < explicitOriginalPrice &&
        candidate >= explicitOriginalPrice * 0.2
    );

    if (explicitDiscount) {
      const firstCurrentPrice = currentCandidates[0];
      if (!firstCurrentPrice) {
        return { price: explicitOriginalPrice, originalPrice: 0 };
      }

      const realDiscount = Math.round(((explicitOriginalPrice - firstCurrentPrice) / explicitOriginalPrice) * 100);
      const discountMatchesBadge = Math.abs(realDiscount - explicitDiscount) <= 3;
      return {
        price: firstCurrentPrice,
        originalPrice: discountMatchesBadge ? explicitOriginalPrice : 0,
      };
    }

    const fallbackPrice =
      plausibleCandidates.find((price) => Math.abs(price - explicitOriginalPrice) > 0.01) ||
      explicitOriginalPrice;

    if (!currentCandidates.length) {
      return { price: fallbackPrice, originalPrice: 0 };
    }

    return {
      price: currentCandidates[0],
      originalPrice: explicitOriginalPrice,
    };
  }

  return { price: plausibleCandidates[0] || uniqueCandidates[0], originalPrice: 0 };
}

function parseSales(text) {
  const normalized = normalizeText(text);
  const match = normalized.match(
    /(\d+(?:[.,]\d+)?)\s*\+?\s*(mil|k)?\s*\+?\s*(vendid|comprad|sales)/i
  );
  if (!match) return 0;
  const amount = parseNumber(match[1]);
  return match[2] === "mil" || match[2] === "k" ? amount * 1000 : amount;
}

function parseRating(text) {
  const normalized = normalizeText(text).toLowerCase();
  const match =
    normalized.match(/([0-5](?:[.,]\d)?)\s*(?:estrela|estrelas|stars?)/i) ||
    normalized.match(/(?:avaliacao|avaliacoes|nota|rating)[^\d]{0,24}([0-5](?:[.,]\d)?)/i);
  if (!match) return 0;
  return Math.min(parseNumber(match[1]), 5);
}

function cleanMarketplaceTitle(title, marketplace) {
  const normalized = normalizeQuery(title)
    .replace(/\s*[|-]\s*(Mercado Livre|Shopee).*$/i, "")
    .replace(/\s*\|\s*comprar.*$/i, "")
    .trim();

  if (!normalized || normalized.length < 4) return "";
  if (marketplace === "mercadolivre") return normalized.replace(/^Mercado Livre\s*[-:]\s*/i, "");
  if (marketplace === "shopee") return normalized.replace(/^Shopee\s*[-:]\s*/i, "");
  return normalized;
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error("Playwright nao esta instalado. Execute npm install playwright para ativar a busca automatizada.");
  }
}

async function preparePage(page) {
  page.setDefaultTimeout(12_000);
  await page.route("**/*", (route) => {
    const resourceType = route.request().resourceType();
    if (["font", "image", "media", "stylesheet"].includes(resourceType)) {
      route.abort().catch(() => undefined);
      return;
    }
    route.continue().catch(() => undefined);
  });
}

async function settleSearchPage(page, selector) {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(700);

  for (let index = 0; index < 2; index += 1) {
    await page.mouse.wheel(0, 900).catch(() => undefined);
    await page.waitForTimeout(450);
  }

  await page.waitForSelector(selector, { timeout: 8_000 }).catch(() => undefined);
}

async function extractTitleFromProductLink(browser, input, marketplace) {
  if (!isMarketplaceProductUrl(input, marketplace)) return "";
  const targetUrl = /^https?:\/\//i.test(input) ? input : `https://${input}`;

  const page = await browser.newPage({
    locale: "pt-BR",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    extraHTTPHeaders: {
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
  });

  try {
    await preparePage(page);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(900);
    const title = await page
      .evaluate(() => {
        const read = (selector) => document.querySelector(selector)?.textContent?.trim() || "";
        const meta = (name) =>
          document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute("content") ||
          "";
        return (
          read("h1") ||
          meta("og:title") ||
          meta("twitter:title") ||
          document.title ||
          ""
        );
      })
      .catch(() => "");
    return cleanMarketplaceTitle(title, marketplace);
  } finally {
    await page.close().catch(() => undefined);
  }
}

function mapRenderedProduct(product, marketplace) {
  const priceCandidates = parsePriceCandidates(product.precoTexto);
  const explicitOriginalPrice = parseNumber(product.precoOriginalTexto);
  const explicitDiscount = parseDiscount(product.descontoTexto);
  const { price, originalPrice } = selectPricePair(
    priceCandidates,
    explicitOriginalPrice,
    explicitDiscount
  );

  const inferredDiscount =
    originalPrice > price && price > 0
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : 0;
  const hasReliableOriginalPrice =
    originalPrice > price &&
    inferredDiscount > 0 &&
    inferredDiscount <= 80 &&
    (!explicitDiscount || Math.abs(inferredDiscount - explicitDiscount) <= 3);
  const shouldShowDiscount =
    explicitDiscount > 0 && (!explicitOriginalPrice || hasReliableOriginalPrice);

  return {
    titulo: normalizeQuery(product.titulo || ""),
    preco: price,
    precoOriginal: hasReliableOriginalPrice ? originalPrice : 0,
    desconto: shouldShowDiscount ? explicitDiscount : 0,
    avaliacao: parseRating(product.avaliacaoTexto),
    vendas: parseSales(product.vendasTexto),
    freteGratis: Boolean(product.freteGratis),
    link: product.link || "",
    imagem: product.imagem || "",
    marketplace,
    marketplaceLabel: MARKETPLACES[marketplace].label,
  };
}

async function collectMercadoLivreWithPlaywright(page, query) {
  await page.goto(MARKETPLACES.mercadolivre.searchUrl(query), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await settleSearchPage(page, 'a[href*="/MLB-"], a[href*="/p/"], .poly-card, .ui-search-result');

  const blocked =
    /captcha|account-verification/i.test(page.url()) ||
    /seguridad|security|verifica/i.test(await page.title().catch(() => ""));

  if (blocked) {
    throw new MarketplaceSearchError(
      "Mercado Livre exibiu verificacao de seguranca e nao permitiu coletar ofertas nesta tentativa.",
      "mercadolivre"
    );
  }

  const rawProducts = await page.evaluate((limit) => {
    const clean = (value) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const readPrice = (card) => {
      const moneyText = (amount) => {
        const fraction =
          amount.querySelector(".andes-money-amount__fraction") ||
          amount.querySelector(".price-tag-fraction");
        const cents =
          amount.querySelector(".andes-money-amount__cents") ||
          amount.querySelector(".price-tag-cents");
        if (fraction) return `${fraction.textContent || ""}${cents ? `,${cents.textContent}` : ""}`;
        return amount.textContent || "";
      };
      const isSecondaryMoney = (amount) => {
        const context = clean(
          amount.closest("s, del, [aria-label*='Antes'], [class*='previous'], [class*='disabled']")?.textContent ||
            amount.closest("p, span, div")?.textContent ||
            ""
        );
        return (
          Boolean(amount.closest("s, del, [aria-label*='Antes'], [class*='previous'], [class*='disabled']")) ||
          /(?:^|\s)(?:em\s*)?\d{1,2}\s*x\s*(?:de\s*)?R\$/i.test(context) ||
          /\b(cupom|cashback)\b/i.test(context)
        );
      };
      const amounts = [
        ...card.querySelectorAll(".andes-money-amount, .price-tag, [class*='money-amount']"),
      ];
      const values = amounts
        .filter((amount) => !isSecondaryMoney(amount))
        .map(moneyText)
        .map(clean)
        .filter(Boolean);
      const uniqueValues = [...new Set(values)];
      if (uniqueValues.length) return uniqueValues.join("|");
      return readPrices(card.textContent || "");
    };
    const readOriginalPrice = (card) => {
      const previous = card.querySelector(
        ".andes-money-amount--previous, .price-tag__disabled, s .andes-money-amount, del .andes-money-amount, [aria-label*='Antes']"
      );
      if (!previous) return "";
      const fraction =
        previous.querySelector(".andes-money-amount__fraction") ||
        previous.querySelector(".price-tag-fraction");
      const cents =
        previous.querySelector(".andes-money-amount__cents") ||
        previous.querySelector(".price-tag-cents");
      if (fraction) return `${fraction.textContent || ""}${cents ? `,${cents.textContent}` : ""}`;
      return clean(previous.textContent);
    };
    const readDiscount = (card) => {
      const elements = [...card.querySelectorAll("span, p, div")];
      return (
        elements
          .map((element) => clean(element.textContent))
          .find((value) => /^\d{1,2}\s*%\s*(off|desconto)$/i.test(value)) || ""
      );
    };
    const readPrices = (text) =>
      [
        ...String(text || "")
          .replace(
            /(?:^|\s)(?:em\s*)?\d{1,2}\s*x\s*(?:de\s*)?R\$\s*[\d.]+(?:\s*,\s*\d{2})?(?:\s*(?:sem|com)\s+juros)?/gi,
            " "
          )
          .replace(/(?:cupom|cashback)[^R$]{0,40}R\$\s*[\d.]+(?:\s*,\s*\d{2})?/gi, " ")
          .replace(/R\$\s*[\d.]+(?:\s*,\s*\d{2})?[^R$]{0,40}(?:cupom|cashback)/gi, " ")
          .matchAll(/R\$\s*[\d.]+(?:\s*,\s*\d{2})?/g),
      ]
        .map((match) => match[0])
        .join("|");
    const imageFrom = (image) => {
      const srcset = image?.getAttribute("srcset") || image?.getAttribute("data-srcset") || "";
      const firstSrcset = srcset.split(",")[0]?.trim().split(/\s+/)[0] || "";
      return (
        image?.getAttribute("data-src") ||
        image?.getAttribute("data-original") ||
        image?.getAttribute("src") ||
        firstSrcset ||
        ""
      );
    };
    const cards = [
      ...document.querySelectorAll(
        ".poly-card, .ui-search-result__wrapper, .ui-search-result, li.ui-search-layout__item, .andes-card"
      ),
    ];
    const fallbackCards =
      cards.length > 0
        ? cards
        : [
            ...document.querySelectorAll(
              'a[href*="/MLB-"], a[href*="produto.mercadolivre"], a[href*="/p/"]'
            ),
          ].map((anchor) => anchor.closest("li, article, section, div") || anchor);

    return fallbackCards.slice(0, limit * 2).map((card) => {
      const titleElement =
        card.querySelector("a.poly-component__title") ||
        card.querySelector(".poly-component__title") ||
        card.querySelector(".poly-component__title-wrapper") ||
        card.querySelector(".ui-search-item__title") ||
        card.querySelector("h2, h3, a[title], a[aria-label]");
      const linkElement =
        card.matches?.("a[href]")
          ? card
          : card.querySelector('a[href*="/MLB-"], a[href*="produto.mercadolivre"], a[href*="/p/"], a[href]');
      const imageElement = card.querySelector("img");
      const text = card.textContent || "";

      return {
        titulo:
          clean(titleElement?.textContent) ||
          titleElement?.getAttribute("title") ||
          titleElement?.getAttribute("aria-label") ||
          "",
        precoTexto: readPrice(card),
        precoOriginalTexto: readOriginalPrice(card),
        descontoTexto: readDiscount(card),
        avaliacaoTexto: text,
        vendasTexto: text,
        freteGratis: /frete gratis/i.test(clean(text)),
        link: linkElement?.href || "",
        imagem: imageFrom(imageElement),
      };
    });
  }, MAX_PRODUCTS_PER_MARKETPLACE);

  const products = rawProducts.map((product) => mapRenderedProduct(product, "mercadolivre"));
  if (products.length) return products;
  throw new MarketplaceSearchError(
    "Mercado Livre carregou, mas nenhum card de produto valido foi encontrado.",
    "mercadolivre"
  );
}

async function collectShopeeWithPlaywright(page, query) {
  await page.goto(MARKETPLACES.shopee.searchUrl(query), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await settleSearchPage(page, 'a[href*="-i."], a[href*="/product/"], a[data-sqe="link"]');

  const blocked =
    /captcha|verify|challenge/i.test(page.url()) ||
    /captcha|verify|challenge/i.test(await page.title().catch(() => ""));

  if (blocked) {
    throw new MarketplaceSearchError(
      "Shopee bloqueou a automacao com verificacao de seguranca. Tente novamente em alguns minutos ou busque apenas no Mercado Livre.",
      "shopee"
    );
  }

  const rawProducts = await page.evaluate((limit) => {
    const clean = (value) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const imageFrom = (image) => {
      const srcset = image?.getAttribute("srcset") || image?.getAttribute("data-srcset") || "";
      const firstSrcset = srcset.split(",")[0]?.trim().split(/\s+/)[0] || "";
      return image?.getAttribute("src") || image?.getAttribute("data-src") || firstSrcset || "";
    };
    const readDiscount = (card) => {
      const elements = [...card.querySelectorAll("span, p, div")];
      return (
        elements
          .map((element) => clean(element.textContent))
          .find((value) => /^\d{1,2}\s*%\s*(off|desconto)$/i.test(value)) || ""
      );
    };
    const readPrices = (text) =>
      [
        ...String(text || "")
          .replace(
            /(?:^|\s)(?:em\s*)?\d{1,2}\s*x\s*(?:de\s*)?R\$\s*[\d.]+(?:\s*,\s*\d{2})?(?:\s*(?:sem|com)\s+juros)?/gi,
            " "
          )
          .replace(/(?:cupom|cashback)[^R$]{0,40}R\$\s*[\d.]+(?:\s*,\s*\d{2})?/gi, " ")
          .replace(/R\$\s*[\d.]+(?:\s*,\s*\d{2})?[^R$]{0,40}(?:cupom|cashback)/gi, " ")
          .matchAll(/R\$\s*[\d.]+(?:\s*,\s*\d{2})?/g),
      ]
        .map((match) => match[0])
        .join("|");
    const anchors = [
      ...document.querySelectorAll('a[href*="-i."], a[href*="/product/"], a[data-sqe="link"]'),
    ];
    const uniqueAnchors = [...new Map(anchors.map((anchor) => [anchor.href, anchor])).values()];

    return uniqueAnchors.slice(0, limit * 2).map((anchor) => {
      const card =
        anchor.closest('[data-sqe="item"], .shopee-search-item-result__item, li, article') ||
        anchor;
      const text = card.textContent || anchor.textContent || "";
      const imageElement = card.querySelector("img") || anchor.querySelector("img");
      const title =
        imageElement?.alt ||
        anchor.getAttribute("title") ||
        clean(text.replace(/R\$\s*[\d.,]+.*/s, ""));

      return {
        titulo: title,
        precoTexto: readPrices(text),
        precoOriginalTexto: "",
        descontoTexto: readDiscount(card),
        avaliacaoTexto: text,
        vendasTexto: text,
        freteGratis: /frete gratis/i.test(clean(text)),
        link: anchor.href,
        imagem: imageFrom(imageElement),
      };
    });
  }, MAX_PRODUCTS_PER_MARKETPLACE);

  const products = rawProducts.map((product) => mapRenderedProduct(product, "shopee"));
  if (products.length) return products;
  throw new MarketplaceSearchError(
    "Shopee carregou, mas nenhum card de produto valido foi encontrado.",
    "shopee"
  );
}

async function collectMarketplaceWithPlaywright(browser, marketplace, query) {
  const page = await browser.newPage({
    locale: "pt-BR",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    extraHTTPHeaders: {
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
  });

  try {
    await preparePage(page);
    const products =
      marketplace === "mercadolivre"
        ? await collectMercadoLivreWithPlaywright(page, query)
        : await collectShopeeWithPlaywright(page, query);

    return products.filter(
      (product) =>
        product.titulo &&
        product.preco > 0 &&
        isMarketplaceProductUrl(product.link, marketplace)
    ).slice(0, MAX_PRODUCTS_PER_MARKETPLACE);
  } finally {
    await page.close().catch(() => undefined);
  }
}

function dedupeProducts(products) {
  const seen = new Set();
  return products.filter((product) => {
    let cleanLink = product.link || "";
    try {
      const url = new URL(cleanLink);
      cleanLink = `${url.hostname}${url.pathname}`.toLowerCase();
    } catch {
      cleanLink = "";
    }
    const normalizedTitle = normalizeText(product.titulo).toLowerCase();
    const key = `${product.marketplace}:${cleanLink || normalizedTitle}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreProducts(products) {
  const prices = products.map((product) => product.preco).filter((price) => price > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;

  return products.map((product) => {
    const priceBonus =
      product.preco > 0 && maxPrice > minPrice
        ? ((maxPrice - product.preco) / (maxPrice - minPrice)) * 30
        : 0;
    const salesBonus = product.vendas > 0 ? Math.min(product.vendas / 100, 40) : 0;
    const score =
      priceBonus +
      product.desconto * 3 +
      product.avaliacao * 10 +
      salesBonus +
      (product.vendas >= DEFAULT_MIN_SALES ? 15 : 0) +
      (product.freteGratis ? 20 : 0);

    return {
      ...product,
      confiavel: product.vendas >= DEFAULT_MIN_SALES,
      score: Number(score.toFixed(2)),
    };
  });
}

function applyFilters(products, filters) {
  const minPrice = Number(filters.minPrice) || 0;
  const maxPrice = Number(filters.maxPrice) || 0;
  const minDiscount = Number(filters.minDiscount) || 0;
  const minRating = Number(filters.minRating) || 0;
  const minSales = Number(filters.minSales) || DEFAULT_MIN_SALES;
  const freeShipping = Boolean(filters.freeShipping);

  return products.filter((product) => {
    if (minPrice && (!product.preco || product.preco < minPrice)) return false;
    if (maxPrice && (!product.preco || product.preco > maxPrice)) return false;
    if (minDiscount && product.desconto < minDiscount) return false;
    if (minRating && product.avaliacao < minRating) return false;
    if (minSales && product.vendas > 0 && product.vendas < minSales) return false;
    if (freeShipping && !product.freteGratis) return false;
    return true;
  });
}

async function readTempCache() {
  if (tempCacheLoaded) return;
  try {
    const raw = await readFile(tempFile, "utf8");
    const data = JSON.parse(raw);
    if (data && typeof data === "object") Object.assign(cache, data);
  } catch {
    // Cache em JSON temporario e opcional.
  } finally {
    tempCacheLoaded = true;
  }
}

function pruneCache(now = Date.now()) {
  for (const [key, entry] of Object.entries(cache)) {
    if (!entry?.timestamp || now - entry.timestamp >= CACHE_TTL_MS) {
      delete cache[key];
    }
  }
}

async function writeTempCache() {
  pruneCache();
  await mkdir(tempDir, { recursive: true });
  await writeFile(tempFile, JSON.stringify(cache, null, 2), "utf8");
}

export async function searchOffers(input, filters) {
  await readTempCache();

  const normalizedInput = normalizeQuery(input);
  if (!normalizedInput) throw new Error("Digite o nome do produto ou cole um link.");
  if (normalizedInput.length > 500) throw new Error("A busca esta muito longa.");

  const selectedMarketplace = filters.marketplace || "ambos";
  const marketplaces =
    selectedMarketplace === "ambos"
      ? ["mercadolivre", "shopee"]
      : [selectedMarketplace].filter((marketplace) => MARKETPLACES[marketplace]);
  const cacheKey = normalizeCacheKey({ query: normalizedInput, ...filters });
  const now = Date.now();
  pruneCache(now);
  const cached = cache[cacheKey];

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return { ...cached, cached: true };
  }

  let browser = null;

  try {
    const linkedMarketplace = detectMarketplace(normalizedInput);
    let query = linkedMarketplace ? titleFromUrl(normalizedInput) || normalizedInput : normalizedInput;

    if (marketplaces.length === 0) {
      throw new Error("Selecione Mercado Livre, Shopee ou ambos.");
    }

    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage"],
    });

    if (linkedMarketplace) {
      query =
        (await extractTitleFromProductLink(browser, normalizedInput, linkedMarketplace).catch(() => "")) ||
        query;
    }

    const marketplaceResults = await Promise.all(
      marketplaces.map(async (marketplace) => {
        try {
          const products = await collectMarketplaceWithPlaywright(browser, marketplace, query);
          return { marketplace, products, error: null };
        } catch (error) {
          return { marketplace, products: [], error };
        }
      })
    );

    const products = dedupeProducts(marketplaceResults.flatMap((result) => result.products));
    const searchErrors = marketplaceResults.map((result) => result.error).filter(Boolean);
    if (products.length === 0 && searchErrors.length > 0) {
      const message =
        searchErrors.find((error) => error instanceof MarketplaceSearchError)?.message ||
        "Nao foi possivel coletar ofertas nos marketplaces selecionados.";
      throw new Error(message);
    }

    const rankedProducts = scoreProducts(applyFilters(products, filters)).sort(
      (a, b) => b.score - a.score
    );
    const returnedProducts = rankedProducts.slice(0, 40).map((product) => ({
      ...product,
      linkOriginal: product.link,
    }));
    const payload = {
      timestamp: now,
      query,
      produtos: returnedProducts,
    };

    cache[cacheKey] = payload;
    await writeTempCache().catch(() => undefined);

    return { ...payload, cached: false };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
