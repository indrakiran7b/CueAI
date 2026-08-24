import type { Metadata } from "next";
import { Outfit, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { DesktopTitleBar } from "@/components/desktop/title-bar";
import { DesktopBridge } from "@/components/desktop/desktop-bridge";
import "./globals.css";

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
        <ThemeProvider>
          <AuthSessionProvider>
            <AuthProvider>
              {/* Electron chrome for all routes (landing + app shell). No-op in browser. */}
              <DesktopTitleBar />
              <DesktopBridge />
              {children}
            </AuthProvider>
          </AuthSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
