/** Re-mounts on every navigation inside /etched: reports readiness, then new page content fades in and rises 12px. */
import type { ReactNode } from "react";
import { PageFade } from "@/components/shared/PageCurtain";
import RouteReady from "@/components/shared/RouteReady";

export default function EtchedTemplate({ children }: { children: ReactNode }) {
  return (
    <>
      <RouteReady />
      <PageFade>{children}</PageFade>
    </>
  );
}
