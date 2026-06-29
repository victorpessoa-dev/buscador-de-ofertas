import Link from "next/link"
import { RedirectScreen } from "@/components/redirect-screen"
import { createOfferMetadata } from "@/lib/site-metadata"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const runtime = "nodejs"

function readPayload(searchParams) {
  const rawUrl = typeof searchParams.u === "string" ? searchParams.u : null
  if (!rawUrl) return null

  try {
    const url = new URL(rawUrl)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null

    return {
      url: url.toString(),
      platformLabel:
        typeof searchParams.p === "string" ? searchParams.p.slice(0, 80) : "Marketplace",
      title: typeof searchParams.t === "string" ? searchParams.t.slice(0, 180) : null,
      image: typeof searchParams.i === "string" ? searchParams.i : null,
    }
  } catch {
    return null
  }
}

function InvalidLink() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <div className="redirect-enter max-w-md rounded-2xl border bg-card p-8 text-center shadow-xl">
        <h1 className="text-xl font-semibold">Link inválido</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gere um novo link para continuar.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Voltar ao gerador
        </Link>
      </div>
    </main>
  )
}

export async function generateMetadata({ searchParams }) {
  const payload = readPayload(await searchParams)

  if (!payload) {
    return createOfferMetadata({
      title: "Link inválido",
      description: "Gere um novo link para continuar.",
    })
  }

  return createOfferMetadata(payload)
}

export default async function RedirectPage({ searchParams }) {
  const payload = readPayload(await searchParams)

  if (!payload) return <InvalidLink />

  return <RedirectScreen payload={payload} />
}
