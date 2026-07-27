import AtlasHubShell from "@/components/hub/AtlasHubShell";
import { DM_Mono, Manrope } from "next/font/google";
import "./hub-theme.css";

const hubSans = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--hub-font-sans",
  display: "swap",
});

const hubMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--hub-font-mono",
  display: "swap",
});

const publicPaths = ["/hub/login", "/hub/alterar-senha", "/hub/select-organization", "/hub/convite"];

export default function AtlasHubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`hub-theme min-h-screen ${hubSans.variable} ${hubMono.variable}`}>
      <AtlasHubShell publicPaths={publicPaths}>{children}</AtlasHubShell>
    </div>
  );
}
