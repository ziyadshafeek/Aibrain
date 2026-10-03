import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { PapersProvider } from "@/components/papers-provider";
import { BankProvider } from "@/components/study/bank-provider";
import appCss from "../styles.css?url";
import "katex/dist/katex.min.css";

const APP_NAME = "KUHS Papers & Study Notes";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Browse, search, read, and study Kerala University of Health Sciences MBBS previous-year papers with structured study notes, cross-linked answers and PDF exports.",
      },
      { name: "theme-color", content: "#0d1310" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@500&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="en" className="dark antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PapersProvider>
          <BankProvider>
            <Outlet />
          </BankProvider>
        </PapersProvider>
        <Scripts />
      </body>
    </html>
  ),
});
