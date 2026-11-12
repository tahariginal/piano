import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

/** Headings and body copy. */
const space = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});

/** Labels, readouts, and the key numbers printed on the 3D piano. */
const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex",
  display: "swap",
});

const title = "Piano — Taha Koulal";
const description =
  "An interactive 3D grand piano with real Yamaha C5 recordings. Play with the number keys, follow guided lessons, practise melodies and record a take.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title,
  description,
  authors: [{ name: "Taha Koulal", url: "https://tkoulal.tech" }],
  openGraph: { title, description, type: "website" },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0c0c0b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${space.variable} ${plex.variable}`}>
      {/* Extensions (password managers, colour pickers) add attributes to body before hydration. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
