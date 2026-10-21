"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      language?: string;
      theme?: "auto" | "light" | "dark";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type TurnstileWidgetProps = {
  siteKey: string;
  locale: string;
  label: string;
  onToken: (token: string | null) => void;
};

/**
 * Cloudflare Turnstile, rendered explicitly so it follows the page language and theme.
 * The token is verified on the server by Better Auth's captcha plugin.
 */
export function TurnstileWidget({ siteKey, locale, label, onToken }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    const api = window.turnstile;
    const container = containerRef.current;
    if (!scriptReady || !api || !container) return;

    const widgetId = api.render(container, {
      sitekey: siteKey,
      action: "sign-up",
      language: locale,
      theme: "auto",
      callback: (token) => onToken(token),
      "expired-callback": () => onToken(null),
      "error-callback": () => onToken(null),
    });
    return () => api.remove(widgetId);
  }, [scriptReady, siteKey, locale, onToken]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} role="group" aria-label={label} className="min-h-[65px]" />
    </>
  );
}
