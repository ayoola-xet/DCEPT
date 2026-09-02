import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ConnectWalletButton } from "@/components/connect-wallet-button";

import "./styles.css";

export const metadata: Metadata = {
  title: "GlamProbe | Ethereum compatibility testing",
  description: "Compare Ethereum protocol targets before an upgrade reaches production.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <main className="shell">
          <header className="topbar">
            <a className="brand" href="/" aria-label="GlamProbe home">
              <span className="brand-mark" aria-hidden="true">G</span>
              <span>GlamProbe</span>
            </a>
            <nav aria-label="Primary navigation">
              <a href="/">Overview</a>
              <a href="/runs">Runs</a>
              <a href="/scenarios">Scenarios</a>
            </nav>
            <ConnectWalletButton />
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
