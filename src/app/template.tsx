/** Root template: reports the route as ready to the transition system (also covers "/"). */
import type { ReactNode } from "react";
import RouteReady from "@/components/shared/RouteReady";

export default function RootTemplate({ children }: { children: ReactNode }) {
  return (
    <>
      <RouteReady />
      {children}
    </>
  );
}
