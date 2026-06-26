"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  ArrowUpRight,
  BadgePercent,
  X,
  LoaderCircle,
  Search,
  SlidersHorizontal,
  Star,
  Truck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PlatformLogo } from "@/components/platform-logo"
import { SafeImage } from "@/components/safe-image"

const initialFilters = {
  marketplace: "ambos",
  minPrice: "",
  maxPrice: "",
  minDiscount: "0",
  minRating: "0",
  freeShipping: false,
}

const STORAGE_KEY = "offer-search-state"
const DEFAULT_PAGE_SIZE = 20
const PAGE_SIZE_OPTIONS = [20, 40, 80]

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0)
}

function pluralizeOffers(count) {
  return count === 1 ? "1 oferta encontrada" : `${count} ofertas encontradas`
}

function marketplaceBadgeClass(marketplace) {
  if (marketplace === "mercadolivre") {
    return "bg-[#ffe600] text-slate-900 ring-yellow-300"
  }

  if (marketplace === "shopee") {
    return "bg-[#ee4d2d] text-white ring-orange-300"
  }

  return "bg-background text-foreground ring-border"
}

export function OfferSearch() {
  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState(initialFilters)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [isSearching, setIsSearching] = useState(false)
  const [convertingKey, setConvertingKey] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [sortBy, setSortBy] = useState("score-desc")
  const requestController = useRef(null)
  const restoredState = useRef(false)

  useEffect(() => {
    return () => requestController.current?.abort()
  }, [])

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null")
      if (saved && typeof saved === "object") {
        if (typeof saved.query === "string") setQuery(saved.query)
        if (saved.filters && typeof saved.filters === "object") {
          setFilters((current) => ({ ...current, ...saved.filters }))
        }
        if (saved.results && typeof saved.results === "object") setResults(saved.results)
        if (PAGE_SIZE_OPTIONS.includes(saved.pageSize)) setPageSize(saved.pageSize)
        if (Number.isFinite(saved.page)) setPage(saved.page)
        if (typeof saved.sortBy === "string") setSortBy(saved.sortBy)
      }
    } catch {
      sessionStorage.removeItem(STORAGE_KEY)
    } finally {
      restoredState.current = true
    }
  }, [])

  useEffect(() => {
    if (!restoredState.current) return
    const timeout = window.setTimeout(() => {
      try {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ query, filters, results, page, pageSize, sortBy })
        )
      } catch {
        // Estado temporario apenas para manter a tela ao voltar de uma compra.
      }
    }, 200)
    return () => window.clearTimeout(timeout)
  }, [query, filters, results, page, pageSize, sortBy])

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }))
    setPage(1)
  }

  function clearSearch() {
    setQuery("")
    setFilters(initialFilters)
    setResults(null)
    setError(null)
    setPage(1)
    setPageSize(DEFAULT_PAGE_SIZE)
    setSortBy("score-desc")
    sessionStorage.removeItem(STORAGE_KEY)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setIsSearching(true)
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller

    try {
      const response = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          ...filters,
          minPrice: Number(filters.minPrice) || 0,
          maxPrice: Number(filters.maxPrice) || 0,
          minDiscount: Number(filters.minDiscount) || 0,
          minRating: Number(filters.minRating) || 0,
        }),
        signal: controller.signal,
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel buscar ofertas.")
      }

      setResults(data)
      setPage(1)
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      setResults(null)
      setError(err instanceof Error ? err.message : "Nao foi possivel buscar ofertas.")
    } finally {
      if (requestController.current === controller) {
        requestController.current = null
        setIsSearching(false)
      }
    }
  }

  async function handleBuy(product) {
    const productKey = `${product.marketplace}-${product.linkOriginal || product.link}-${product.titulo}`
    const popup = window.open("about:blank", "_blank")
    if (!popup) {
      setError("Permita abrir uma nova aba para continuar para a loja.")
      return
    }
    setError(null)
    setConvertingKey(productKey)

    try {
      const response = await fetch("/api/affiliate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: product.linkOriginal || product.link }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel converter o link.")
      }

      popup.location.href = data.redirectUrl
    } catch (err) {
      popup?.close()
      setError(err instanceof Error ? err.message : "Nao foi possivel converter o link.")
    } finally {
      setConvertingKey(null)
    }
  }

  const products = results?.produtos ?? []
  const sortedProducts = useMemo(() => {
    const direction = sortBy.endsWith("-asc") ? 1 : -1
    const field = sortBy.replace(/-(asc|desc)$/, "")
    const readValue = (product) => {
      if (field === "price") return product.preco || 0
      if (field === "rating") return product.avaliacao || 0
      if (field === "discount") return product.desconto || 0
      return product.score || 0
    }

    return [...products].sort((a, b) => {
      const aValue = readValue(a)
      const bValue = readValue(b)
      if (field === "price") {
        if (!aValue && bValue) return 1
        if (aValue && !bValue) return -1
      }
      if (aValue === bValue) return (b.score || 0) - (a.score || 0)
      return (aValue - bValue) * direction
    })
  }, [products, sortBy])
  const totalResults = sortedProducts.length
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * pageSize
  const visibleProducts = sortedProducts.slice(startIndex, startIndex + pageSize)

  return (
    <div className="flex flex-col gap-5">
      <Card className="converter-card overflow-visible p-3 sm:p-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="offer-search">Produto ou link</Label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="input-wrap relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="offer-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Digite o nome do produto ou cole um link"
                  className="h-11 border-primary/15 bg-background/80 pl-9 pr-10 shadow-sm transition-all focus-visible:shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_12%,transparent)]"
                  autoComplete="off"
                  spellCheck={false}
                  required
                  disabled={isSearching}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button
                  type="submit"
                  className="generate-button h-11 gap-2 px-5 shadow-lg shadow-primary/20"
                  disabled={isSearching}
                >
                  {isSearching ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                  {isSearching ? "Buscando..." : "Buscar Ofertas"}
                </Button>
                <Button
                  type="button"
                  onClick={clearSearch}
                  className="h-11 gap-2 border border-rose-200 bg-rose-50 px-5 text-rose-700 shadow-sm hover:bg-rose-100"
                  disabled={isSearching}
                >
                  <X className="size-4" />
                  Limpar
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-2 rounded-lg border border-border/80 bg-background/55 p-2 sm:p-3 md:grid-cols-3 xl:grid-cols-6">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="inline-flex items-center gap-2 font-medium">
                <SlidersHorizontal className="size-4" />
                Marketplace
              </span>
              <select
                value={filters.marketplace}
                onChange={(event) => updateFilter("marketplace", event.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                disabled={isSearching}
              >
                <option value="ambos">Ambos</option>
                <option value="mercadolivre">Mercado Livre</option>
                <option value="shopee">Shopee</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="inline-flex items-center gap-2 font-medium">
                <BadgePercent className="size-4" />
                Desconto
              </span>
              <select
                value={filters.minDiscount}
                onChange={(event) => updateFilter("minDiscount", event.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                disabled={isSearching}
              >
                <option value="0">Qualquer desconto</option>
                <option value="10">Acima de 10%</option>
                <option value="20">Acima de 20%</option>
                <option value="30">Acima de 30%</option>
                <option value="50">Acima de 50%</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2 md:col-span-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">Preco minimo</span>
                <Input
                  type="number"
                  min="0"
                  value={filters.minPrice}
                  onChange={(event) => updateFilter("minPrice", event.target.value)}
                  placeholder="R$ 0"
                  className="h-10 bg-background"
                  disabled={isSearching}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">Preco maximo</span>
                <Input
                  type="number"
                  min="0"
                  value={filters.maxPrice}
                  onChange={(event) => updateFilter("maxPrice", event.target.value)}
                  placeholder="R$ 999"
                  className="h-10 bg-background"
                  disabled={isSearching}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="inline-flex items-center gap-2 font-medium">
                <Star className="size-4" />
                Avaliacao
              </span>
              <select
                value={filters.minRating}
                onChange={(event) => updateFilter("minRating", event.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                disabled={isSearching}
              >
                <option value="0">Qualquer nota</option>
                <option value="4">Acima de 4</option>
                <option value="4.5">Acima de 4.5</option>
              </select>
            </label>

            <label className="flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium md:mt-6">
              <input
                type="checkbox"
                checked={filters.freeShipping}
                onChange={(event) => updateFilter("freeShipping", event.target.checked)}
                className="size-4 accent-primary"
                disabled={isSearching}
              />
              <Truck className="size-4 text-muted-foreground" />
              Frete gratis
            </label>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </form>
      </Card>

      {results && (
        <section className="result-enter flex flex-col gap-3" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">
                {pluralizeOffers(totalResults)}
              </h2>
              <p className="text-sm text-muted-foreground">
                Busca por: {results.query}
                {results.cached ? " · cache" : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Ordenar
                <select
                  value={sortBy}
                  onChange={(event) => {
                    setSortBy(event.target.value)
                    setPage(1)
                  }}
                  className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="score-desc">Melhores ofertas</option>
                  <option value="price-asc">Menor preço</option>
                  <option value="price-desc">Maior preço</option>
                  <option value="rating-desc">Maior avaliação</option>
                  <option value="rating-asc">Menor avaliação</option>
                  <option value="discount-desc">Maior desconto</option>
                  <option value="discount-asc">Menor desconto</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Por pagina
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value))
                    setPage(1)
                  }}
                  className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {totalResults === 0 ? (
            <Card className="p-5 text-sm text-muted-foreground">
              Nenhuma oferta qualificada encontrada para os filtros selecionados.
            </Card>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visibleProducts.map((product) => {
                const productKey = `${product.marketplace}-${product.linkOriginal || product.link}-${product.titulo}`

                return (
                <Card
                  key={`${product.marketplace}-${product.link}-${product.titulo}`}
                  className="history-card grid gap-0 overflow-hidden p-0 sm:grid-cols-[140px_1fr] xl:grid-cols-1"
                >
                  <div className="relative min-h-40 bg-muted sm:min-h-full xl:min-h-44">
                    <div className="absolute inset-x-2 top-2 z-10 flex items-start justify-between gap-2">
                      <span
                        className={`rounded-md p-1 pr-2 text-xs shadow-md ring-1 ${marketplaceBadgeClass(product.marketplace)}`}
                      >
                        <PlatformLogo
                          platform={product.marketplace}
                          platformLabel={product.marketplaceLabel}
                          size="sm"
                          showLabel
                        />
                      </span>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="rounded-md bg-background/95 px-2 py-1 text-xs font-semibold text-muted-foreground shadow-md ring-1 ring-border backdrop-blur">
                          Score {product.score}
                        </span>
                        {product.confiavel && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-background/95 px-2 py-1 text-xs font-semibold text-emerald-700 shadow-md ring-1 ring-emerald-200 backdrop-blur">
                            <img src="/icon.svg" alt="" className="size-3.5 rounded-sm" />
                            Selo confiavel
                          </span>
                        )}
                      </div>
                    </div>
                    <SafeImage
                      src={product.imagem}
                      alt={product.titulo}
                      className="h-full min-h-40 w-full object-cover"
                      fallbackClassName="min-h-40"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-4 p-3">
                    <div className="flex min-w-0 flex-col gap-3">
                      <h3 className="line-clamp-2 font-semibold leading-snug">
                        {product.titulo}
                      </h3>
                    </div>

                    <div className="flex flex-1 flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        {product.precoOriginal > product.preco && (
                          <span className="text-sm text-muted-foreground line-through">
                            {formatCurrency(product.precoOriginal)}
                          </span>
                        )}
                        <strong className="text-2xl font-bold leading-none text-emerald-700">
                          {product.preco > 0 ? formatCurrency(product.preco) : "Ver preco na loja"}
                        </strong>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {product.desconto > 0 && (
                          <span className="rounded bg-orange-50 px-1.5 py-0.5 text-xs font-semibold text-orange-700 ring-1 ring-orange-200">
                            {product.desconto}% off
                          </span>
                        )}
                        {product.freteGratis && (
                          <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
                            <Truck className="size-3.5" />
                            Frete gratis
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        {product.avaliacao > 0 && (
                          <span className="rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-700 ring-1 ring-amber-100">
                            {product.avaliacao} estrelas
                          </span>
                        )}
                        {product.vendas > 0 && (
                          <span className="rounded-md bg-muted/60 px-2 py-1">
                            {Math.round(product.vendas)} vendas
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-auto">
                      <Button
                        type="button"
                        onClick={() => handleBuy(product)}
                        className="action-button h-10 w-full gap-2 px-4 shadow-md shadow-primary/15"
                        disabled={convertingKey === productKey}
                      >
                        {convertingKey === productKey ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <ArrowUpRight className="size-4" />
                        )}
                        {convertingKey === productKey ? "Carregando..." : "Comprar Agora"}
                      </Button>
                    </div>
                  </div>
                </Card>
                )
              })}
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/80 bg-background/60 p-3">
              <p className="text-sm text-muted-foreground">
                Pagina {currentPage} de {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 px-3"
                  disabled={currentPage === 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 px-3"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                >
                  Proxima
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
