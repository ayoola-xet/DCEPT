import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header";

import "./styles.css";

const bootDiagnosticScript = `
(function () {
  if (!String.prototype.replaceAll) {
    Object.defineProperty(String.prototype, "replaceAll", {
      configurable: true,
      writable: true,
      value: function (search, replacement) {
        if (search instanceof RegExp) {
          if (!search.global) throw new TypeError("replaceAll requires a global regular expression.");
          return this.replace(search, replacement);
        }
        return this.split(String(search)).join(replacement);
      }
    });
  }

  if (!Object.hasOwn) {
    Object.defineProperty(Object, "hasOwn", {
      configurable: true,
      writable: true,
      value: function (object, property) {
        return Object.prototype.hasOwnProperty.call(Object(object), property);
      }
    });
  }

  if (!Promise.withResolvers) {
    Promise.withResolvers = function () {
      var resolve;
      var reject;
      var promise = new Promise(function (resolvePromise, rejectPromise) {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      return { promise: promise, resolve: resolve, reject: reject };
    };
  }

  if (typeof AbortSignal !== "undefined" && !AbortSignal.timeout && typeof AbortController !== "undefined") {
    AbortSignal.timeout = function (milliseconds) {
      var controller = new AbortController();
      window.setTimeout(function () {
        controller.abort(new DOMException("The operation timed out.", "TimeoutError"));
      }, milliseconds);
      return controller.signal;
    };
  }

  var state = { errors: [] };
  window.__dceptBoot = state;

  function describe(value) {
    try {
      if (value && value.message) return String(value.message);
      return String(value || "Unknown startup error.");
    } catch (_) {
      return "Unknown startup error.";
    }
  }

  function record(message) {
    if (state.errors.length < 5) state.errors.push(message);
  }

  window.addEventListener("error", function (event) {
    var target = event.target;
    if (target && target !== window && target.tagName === "SCRIPT") {
      record("The browser could not load " + (target.src || "an application script") + ".");
      return;
    }
    if (event.message) record(describe(event.message));
  }, true);

  window.addEventListener("unhandledrejection", function (event) {
    record(describe(event.reason));
  });

  window.setTimeout(function () {
    if (document.documentElement.getAttribute("data-dcept-started") === "true") return;
    var reason = state.errors[0];
    if (!reason && typeof WebAssembly === "undefined") reason = "This browser does not support WebAssembly.";
    if (!reason && typeof BigInt === "undefined") reason = "This browser does not support BigInt.";
    if (!reason) reason = "React did not attach. " + navigator.userAgent;
    var loading = document.getElementById("dcept-startup-loading");
    var failure = document.getElementById("dcept-startup-failure");
    if (loading) {
      loading.hidden = true;
      loading.setAttribute("aria-busy", "false");
    }
    if (failure) {
      failure.hidden = false;
      failure.setAttribute("data-startup-error", reason);
    }
    if (window.console && window.console.error) window.console.error("DCEPT startup failed:", reason);
  }, 6000);
})();
`;

export const metadata: Metadata = {
  title: "DCEPT | Ethereum protocol transition testing",
  description: "Compare Ethereum behavior before and after a protocol transition.",
  icons: { icon: "/brand/dcept-mark.svg" },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <Script id="dcept-browser-bootstrap" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: bootDiagnosticScript }} />
      <body>
        <main className="shell">
          <AppHeader />
          {children}
        </main>
        <noscript>
          <section className="startup-screen">
            <div className="startup-shell">
              <div className="eyebrow">JavaScript required</div>
              <h1>Open DCEPT in a desktop browser.</h1>
              <p>This application needs JavaScript to run the local test engine.</p>
            </div>
          </section>
        </noscript>
      </body>
    </html>
  );
}
