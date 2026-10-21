/** Placeholder with the form's footprint while search params stream in. */
export function FormSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-4">
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-9 rounded-lg bg-muted" />
        </div>
      ))}
      <div className="h-9 rounded-lg bg-muted" />
    </div>
  );
}
