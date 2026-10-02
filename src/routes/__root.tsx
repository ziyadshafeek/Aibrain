import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { PapersProvider } from "@/components/papers-provider";
import appCss from "../styles.css?url";

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
          "Browse, search, read, and study Kerala University of Health Sciences MBBS previous-year papers and structured study notes in one place.",
      },
      { name: "theme-color", content: "#245E52" },
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
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: `window.MathJax = { tex: { inlineMath: [['$','$'], ['\\(','\\)']], displayMath: [['$$','$$'], ['\\[','\\]']] }, svg: { fontCache: 'global' } };` }} />
        <script
          async
          src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"
          onLoad={() => window.dispatchEvent(new Event("mathjax-ready"))}
        />
      </head>
      <body>
        <PapersProvider>
          <Outlet />
        </PapersProvider>
        <Scripts />
      </body>
    </html>
  ),
});
