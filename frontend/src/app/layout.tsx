import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Toaster } from "@/components/ui/toaster"
import { Footer } from "@/components/footer"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Lana | Image Generation Agent use x402 Protocol",
  description: "Image Generation Agent that supports multiple premium models. Powered by x402 pay-per-generation.",
  icons: {
    icon: '/icon.png',
  },
  openGraph: {
    title: "Lana | Image Generation Agent use x402 Protocol",
    description: "Image Generation Agent that supports multiple premium models. Powered by x402 pay-per-generation.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lana | Image Generation Agent use x402 Protocol",
    description: "Image Generation Agent that supports multiple premium models. Powered by x402 pay-per-generation.",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`font-sans antialiased relative min-h-screen`}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-blue-600/10 pointer-events-none" />
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-20 left-10 w-2 h-2 bg-blue-500/30 rounded-full float-animation"
            style={{ animationDelay: "0s" }}
          />
          <div
            className="absolute top-40 right-20 w-3 h-3 bg-blue-600/40 rounded-full float-animation"
            style={{ animationDelay: "2s" }}
          />
          <div
            className="absolute bottom-32 left-1/4 w-1 h-1 bg-blue-500/50 rounded-full float-animation"
            style={{ animationDelay: "4s" }}
          />
          <div
            className="absolute top-60 right-1/3 w-2 h-2 bg-blue-600/30 rounded-full float-animation"
            style={{ animationDelay: "1s" }}
          />
        </div>
        <div className="flex min-h-screen flex-col">
          <div className="flex-1">{children}</div>
          <Footer />
        </div>
        <Toaster />
      </body>
    </html>
  )
}
