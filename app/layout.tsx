import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";
import { ConvexAuthNextjsServerProvider } from "@/lib/convexAuth";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Workout Tracker",
  description: "Progressive overload workout tracker for strength training.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={figtree.variable}>
      <body className="bg-background text-foreground font-sans antialiased">
        <ConvexAuthNextjsServerProvider>
          {children}
        </ConvexAuthNextjsServerProvider>
      </body>
    </html>
  );
}
