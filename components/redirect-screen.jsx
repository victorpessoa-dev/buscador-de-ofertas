"use client"

import { useEffect, useState } from "react"
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react"
import { PlatformLogo } from "@/components/platform-logo"
import { SafeImage } from "@/components/safe-image"

export function RedirectScreen({ payload }) {
  const [seconds, setSeconds] = useState(2)
  const [error, setError] = useState(false)

  useEffect(() => {
    const countdown = window.setInterval(() => {
      setSeconds((current) => Math.max(0, current - 1))
    }, 1000)
    const redirect = window.setTimeout(() => {
      try {
        window.location.replace(payload.url)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Redirect failed", err, payload.url)
        setError(true)
      }
    }, 2200)

    return () => {
      window.clearInterval(countdown)
      window.clearTimeout(redirect)
    }
  }, [payload.url])

  return (
    <main className="redirect-backdrop flex min-h-svh items-center justify-center overflow-hidden px-4 py-10">
      <div className="redirect-orb redirect-orb-one" />
      <div className="redirect-orb redirect-orb-two" />

      <section className="redirect-enter relative z-10 w-full max-w-md overflow-hidden rounded-3xl border bg-card/95 shadow-2xl backdrop-blur">
        {payload.image && (
          <div className="relative aspect-[16/9] overflow-hidden bg-muted">
            <SafeImage
              src={payload.image}
              alt={payload.title || ""}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
          </div>
        )}

        <div className="flex flex-col items-center gap-5 p-7 text-center">
          <div className="relative flex size-16 items-center justify-center rounded-full bg-primary/10">
            <span className="redirect-pulse absolute inset-0 rounded-full border border-primary/40" />
            <LoaderCircle className="size-8 animate-spin text-primary" />
          </div>

          <div>
            <div className="flex justify-center">
              <PlatformLogo
                platformLabel={payload.platformLabel}
                showLabel
              />
            </div>
            <h1 className="mt-2 text-balance text-xl font-semibold">
              {payload.title || "Preparando sua oferta"}
            </h1>
            <p
              aria-live="polite"
              className="mt-2 text-sm text-muted-foreground"
            >
              Você será redirecionado em {seconds} segundo{seconds === 1 ? "" : "s"}.
            </p>
          </div>

          <div className="redirect-progress h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary" />
          </div>

          {error ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Não foi possível redirecionar automaticamente. Você pode abrir o destino manualmente.
              </p>
              <a
                href={payload.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
                onClick={() => {
                  // eslint-disable-next-line no-console
                  console.log("Manual open click", payload.url)
                }}
              >
                Abrir destino
                <ArrowRight className="size-4" />
              </a>
            </div>
          ) : (
            <a
              href={payload.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
            >
              Ir agora
              <ArrowRight className="size-4" />
            </a>
          )}

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Destino verificado pelo gerador
          </p>
        </div>
      </section>
    </main>
  )
}
