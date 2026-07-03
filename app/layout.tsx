import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "BossChat",
  description: "Gerçek zamanlı mesajlaşma uygulaması",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// Boyanmadan önce görünüm tercihlerini uygula (FOUC engelle).
const themeInitScript = `(function(){
  try {
    var root = document.documentElement;
    var pref = localStorage.getItem("bosschat-theme") || "system";
    var sysDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = pref === "dark" ? "dark" : pref === "light" ? "light" : (sysDark ? "dark" : "light");
    var font = localStorage.getItem("bosschat-font") || "md";
    root.style.setProperty("--font-scale", font === "sm" ? "0.92" : font === "lg" ? "1.12" : "1");
    root.dataset.density = localStorage.getItem("bosschat-density") || "comfortable";
    root.dataset.wallpaper = localStorage.getItem("bosschat-wallpaper") || "default";
  } catch (e) {}
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="tr"
      className={`${hankenGrotesk.variable} ${bricolageGrotesque.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  );
}
