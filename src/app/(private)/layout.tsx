
export const instant = false;

import type { ReactNode } from "react";
import PrivateAppShell from "@/components/PrivateAppShell";

export default function PrivateLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <PrivateAppShell>{children}</PrivateAppShell>;
}
