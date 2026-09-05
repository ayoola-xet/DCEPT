"use client";

import { usePathname } from "next/navigation";

import { ConnectWalletButton } from "@/components/connect-wallet-button";

const navigation = [
  { href: "/", label: "Run" },
  { href: "/scenarios", label: "Probes" },
  { href: "/runs", label: "Cloud" },
] as const;

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="DCEPT home">
        <img src="/brand/dcept-mark.svg" alt="" width="30" height="30" />
        <span className="brand-name">DCEPT</span>
        <span className="brand-description">Ethereum transition testing</span>
      </a>
      <nav className="primary-nav" aria-label="Primary navigation">
        {navigation.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return <a href={item.href} aria-current={active ? "page" : undefined} key={item.href}>{item.label}</a>;
        })}
      </nav>
      <ConnectWalletButton />
    </header>
  );
}
