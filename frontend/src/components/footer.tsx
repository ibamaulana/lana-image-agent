import Image from "next/image"
import Link from "next/link"
import { Copyright } from "lucide-react"

export function Footer() {
  return (
    <footer className="bg-background">
      <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Copyright className="h-4 w-4" />
              <span>2025 Lana Agent</span>
            </div>
            <Image src="/x402-logo.png" alt="x402" width={100} height={24} className="h-6 w-auto" />
          </div>
        </div>
      </div>
    </footer>
  )
}

