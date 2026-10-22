import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Providers from "./providers";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Paragliding Weather bias-correction",
  description: "Zero-Key Browser-ML Paragliding Weather Bias-Correction App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
        <footer className="w-full text-center py-4 text-sm text-gray-500 bg-gray-900 border-t border-gray-800 mt-auto">
          AI-generated content. May contain errors. Verify critical information.
        </footer>
      </body>
    </html>
  );
}
