import type { Metadata, Viewport } from "next";
import { Auth0Provider } from "@auth0/nextjs-auth0";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0908",
};

export const metadata: Metadata = {
  title: {
    default: "Loose Ends | Find Everything You've Dropped",
    template: "%s | Loose Ends",
  },
  description:
    "AI agent that scans your Gmail, Calendar, GitHub, and Slack to find everything you've dropped.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Loose Ends | Find Everything You've Dropped",
    description:
      "AI agent that scans your Gmail, Calendar, GitHub, and Slack to find everything you've dropped.",
    type: "website",
    siteName: "Loose Ends",
  },
  twitter: {
    card: "summary_large_image",
    title: "Loose Ends | Find Everything You've Dropped",
    description:
      "AI agent that scans your Gmail, Calendar, GitHub, and Slack to find everything you've dropped.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-le-void text-le-text antialiased">
        <Auth0Provider>{children}</Auth0Provider>
      </body>
    </html>
  );
}
