import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Institut Assahaba — Gestion d'Institut",
  description: "Plateforme de gestion pour instituts de langue arabe, écoles coraniques et centres de soutien scolaire",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full">
      <body className="h-full bg-gray-50 antialiased">
        {children}
      </body>
    </html>
  )
}
