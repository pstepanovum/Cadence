import { Banner } from "@/components/ui";
import type { EngineReadiness } from "@/hooks/useEngineReadiness";
import { useServerStatus } from "@/hooks/useServerStatus";

/**
 * "Cadence can't reach the server", with the one button that fixes it. Shows
 * nothing while the server answers or while the first check is still running,
 * so it never flashes at launch.
 */
export function ServerBanner({ message }: { message?: string }) {
  const server = useServerStatus();
  if (server.reachable || server.checking) return null;
  return (
    <Banner
      tone="error"
      message={message ?? server.message ?? "Cadence can't reach the server."}
      actionLabel={server.actionLabel ?? undefined}
      onAction={server.actionLabel ? server.action : undefined}
    />
  );
}

/**
 * Why recording (or the coach) is not available yet: the engine is warming up,
 * or cannot be reached. Shows nothing once it is ready.
 */
export function ReadinessBanner({ readiness }: { readiness: EngineReadiness }) {
  if (readiness.ready) return null;
  if (readiness.checking) {
    return <Banner tone="info" message="Checking the engine…" />;
  }
  return (
    <Banner
      tone={readiness.offline ? "error" : "warning"}
      message={readiness.message ?? "Getting ready. This can take a minute on a cold start."}
      actionLabel={readiness.offline ? "Try again" : undefined}
      onAction={readiness.offline ? readiness.refresh : undefined}
    />
  );
}
