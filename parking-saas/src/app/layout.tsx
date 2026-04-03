import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import { PropertyProvider } from "@/contexts/property-context";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ParkingSystem",
  description: "Multi-tenant parking management system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <PropertyProvider>{children}</PropertyProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
