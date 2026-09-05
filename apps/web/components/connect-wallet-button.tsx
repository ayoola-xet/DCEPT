"use client";

import { SiweMessage } from "siwe";
import { useState } from "react";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

declare global {
  interface Window { ethereum?: EthereumProvider; }
}

export function ConnectWalletButton() {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  async function connect() {
    if (!window.ethereum) {
      setError("Install a wallet extension that supports Ethereum for Cloud sign-in.");
      setState("error");
      return;
    }
    setState("loading");
    setError("");
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      const chainId = await window.ethereum.request({ method: "eth_chainId" }) as string;
      const nonceResponse = await fetch("/api/auth/nonce", { method: "POST" });
      if (!nonceResponse.ok) throw new Error("Could not prepare Cloud sign-in.");
      const { nonce } = await nonceResponse.json() as { nonce: string };
      const message = new SiweMessage({
        domain: window.location.host,
        address: accounts[0],
        statement: "Sign in to DCEPT Cloud.",
        uri: window.location.origin,
        version: "1",
        chainId: Number.parseInt(chainId, 16),
        nonce,
      }).prepareMessage();
      const signature = await window.ethereum.request({ method: "personal_sign", params: [message, accounts[0]] }) as string;
      const verified = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      if (!verified.ok) throw new Error("The wallet signature was not accepted.");
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cloud sign-in failed.");
      setState("error");
    }
  }

  return (
    <span className="wallet-control">
      <button className="wallet-button" type="button" onClick={connect} disabled={state === "loading"}>
        {state === "loading" ? "Connecting…" : "Sign in"}
      </button>
      {state === "error" && <span className="wallet-error" role="alert">{error}</span>}
    </span>
  );
}
