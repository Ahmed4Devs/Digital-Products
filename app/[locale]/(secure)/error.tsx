"use client";

import { ErrorContent } from "@/components/errors/error-content";

export default function SecureError(props: { error: unknown; retry: () => void }) {
  return <ErrorContent {...props} />;
}
