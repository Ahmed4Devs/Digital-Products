"use client";

import { ErrorContent } from "@/components/errors/error-content";

export default function StoreError(props: { error: unknown; retry: () => void }) {
  return <ErrorContent {...props} />;
}
