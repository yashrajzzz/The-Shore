import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "The Shore",
  description: "Collaborative Music Room App",
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
        <AppLayoutWrapper>
          {children}
        </AppLayoutWrapper>
      </body>
    </html>
  );
}
