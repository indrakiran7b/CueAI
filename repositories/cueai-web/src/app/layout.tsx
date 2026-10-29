import type { Metadata } from "next";
import { Outfit, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { PaletteSync } from "@/components/providers/palette-sync";
import { PALETTE_IDS, paletteStylesheet } from "@/lib/themes";
import { DesktopTitleBar } from "@/components/desktop/title-bar";
import { DesktopBridge } from "@/components/desktop/desktop-bridge";
import { DesktopAccessGuard } from "@/components/desktop/desktop-access-guard";
import "./globals.css";
import "./mac-desktop.css";
import "./win-desktop.css";
import "./product-shell.css";
import "@/components/mac/mac-glass.css";

const outfit = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const instrument = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CueAI — Your AI Copilot for Every Meeting",
    template: "%s · CueAI",
  },
  description:
    "Enterprise AI meeting copilot with live assistance, transcription, summaries, resume tailoring, and knowledge base.",
  icons: {
    icon: [{ url: "/brand/cueai-logo.png", type: "image/png" }],
    apple: [{ url: "/brand/cueai-logo.png", type: "image/png" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-scroll-behavior="smooth"
      className={`${outfit.variable} ${instrument.variable} ${jetbrains.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <style dangerouslySetInnerHTML={{ __html: paletteStylesheet() }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=document.documentElement;var q=new URLSearchParams(location.search).get("desktop");var w=window.cueDesktop;if(w&&w.isWindows){d.dataset.desktop="win"}else if(q==="mac"||q==="macos"||(w&&w.isMac)){d.dataset.desktop="mac";document.title="CueAI"}var t=localStorage.getItem("cueai-theme");if(t==="light"||t==="dark")d.dataset.theme=t;var p=localStorage.getItem("cueai-palette-last");if(${JSON.stringify(PALETTE_IDS)}.indexOf(p)>=0)d.dataset.palette=p}catch(e){}`,
          }}
        />
        <ThemeProvider>
          <AuthSessionProvider>
            <AuthProvider>
              <PaletteSync />
              <DesktopTitleBar />
              <DesktopBridge />
              <DesktopAccessGuard>{children}</DesktopAccessGuard>
            </AuthProvider>
          </AuthSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
