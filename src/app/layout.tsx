import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { Announcer } from "@/components/Announcer";
import { PreferenceSync } from "@/components/PreferenceSync";
import { PREFERENCES_BOOTSTRAP } from "@/lib/storage/bootstrap";

export const metadata: Metadata = {
  title: { default: "SYNAPSE", template: "%s · SYNAPSE" },
  description: "Hold the pattern. A minimal sequence-memory focus game.",
  applicationName: "SYNAPSE",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_BOOTSTRAP }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <PreferenceSync />
        {children}
        <Announcer />
      </body>
    </html>
  );
}
