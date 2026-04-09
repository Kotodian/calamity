interface FatalErrorScreenProps {
  title: string;
  error: unknown;
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.stack || error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

export function FatalErrorScreen({ title, error }: FatalErrorScreenProps) {
  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-3xl rounded-2xl border border-red-500/30 bg-zinc-900/90 p-6 shadow-2xl shadow-red-950/20">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-red-300">
          Fatal Error
        </p>
        <h1 className="mb-4 text-2xl font-semibold">{title}</h1>
        <pre className="overflow-x-auto rounded-xl bg-black/40 p-4 text-xs leading-6 text-red-100 whitespace-pre-wrap break-words">
          {formatError(error)}
        </pre>
      </div>
    </div>
  );
}
