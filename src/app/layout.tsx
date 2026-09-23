import type { Metadata, Viewport } from "next";
import { Space_Mono, VT323, Press_Start_2P } from "next/font/google";
import "./globals.css";

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const vt323 = VT323({
  variable: "--font-vt323",
  subsets: ["latin"],
  weight: ["400"],
});

const pressStart = Press_Start_2P({
  variable: "--font-press-start",
  subsets: ["latin"],
  weight: ["400"],
});

import { GlobalBackground } from "@/components/ui/GlobalBackground";
import { AppLayoutWrapper } from "@/components/ui/AppLayoutWrapper";
import { RoomTransitionProvider } from "@/components/ui/RoomTransition";
import { ServiceWorkerRegister } from "@/components/ui/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "The Shore",
  description: "Collaborative Music Room App",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "The Shore",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#F1EAD9",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceMono.variable} ${vt323.variable} ${pressStart.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col relative overflow-hidden">
        <GlobalBackground />
        <ServiceWorkerRegister />
        <RoomTransitionProvider>
          <AppLayoutWrapper>
            {children}
          </AppLayoutWrapper>
        </RoomTransitionProvider>
      </body>
    </html>
  );
}
