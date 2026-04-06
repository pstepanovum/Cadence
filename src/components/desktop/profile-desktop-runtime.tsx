"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  FileText,
  FolderOpen,
  Microphone,
  Speaker,
} from "griddy-icons";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { useCoachVoice } from "@/hooks/useCoachVoice";
import { cn } from "@/lib/utils";

const INITIAL_STATE: DesktopSetupState = {
  phase: "checking",
  currentStep: "Checking your desktop runtime.",
  percent: 0,
  aiEngineReady: false,
  coachEngineReady: false,
  transcriberReady: false,
  ttsReady: false,
  modelsReady: false,
  error: null,
  logsPath: null,
  installStrategy: "docker-beta",
  isPackaged: false,
  runtimeDetails: null,
};

function formatDate(value: string | null): string {
  if (!value) {
    return "Not ready yet";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return parsed.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPhase(phase: DesktopSetupState["phase"]): string {
  switch (phase) {
    case "ready":
      return "Ready";
    case "verifying":
      return "Warming up";
    case "installing":
    case "starting-services":
      return "Preparing";
    case "error":
      return "Needs attention";
    case "idle":
      return "Not started";
    default:
      return "Checking";
  }
}

function StatusPill({
  label,
  ready,
}: {
  label: string;
  ready: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap",
        ready
          ? "bg-yellow-green text-hunter-green"
          : "bg-vanilla-cream text-iron-grey",
      )}
    >
      {label}
    </div>
  );
}

function InfoCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-3xl bg-vanilla-cream px-5 py-5">
      <p className="eyebrow text-xs text-sage-green">{label}</p>
      <p className="mt-3 text-lg font-semibold text-hunter-green">{value}</p>
      <p className="mt-2 text-sm leading-7 text-iron-grey">{detail}</p>
    </div>
  );
}

function baseName(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || normalized;
}

function RuntimeLocationRow({
  label,
  value,
  kind,
  isFile = false,
}: {
  label: string;
  value: string;
  kind: DesktopRuntimeLocation;
  isFile?: boolean;
}) {
  const Icon = isFile ? FileText : FolderOpen;

  async function handleOpen() {
    await window.cadenceDesktopSetup?.openLocation(kind);
  }

  return (
    <div className="flex items-center gap-4 rounded-[28px] bg-[#fbf4e4] px-4 py-4">
      <div
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
          isFile ? "bg-[#f0e0b8] text-hunter-green" : "bg-yellow-green text-hunter-green",
        )}
      >
        <Icon size={22} filled color="currentColor" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="eyebrow text-xs text-sage-green">{label}</p>
        <p className="mt-1 truncate text-base font-semibold text-hunter-green">
          {baseName(value)}
        </p>
        <p className="mt-1 break-all text-sm leading-6 text-iron-grey">{value}</p>
      </div>

      <Button variant="secondary" onClick={() => void handleOpen()}>
        Show
        <ArrowUpRight size={16} color="currentColor" />
      </Button>
    </div>
  );
}

function PathPane({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[32px] bg-[#f5ebd2] p-3">
      <div className="rounded-[26px] bg-[#efe1bd] px-4 py-3">
        <p className="eyebrow text-xs text-sage-green">{label}</p>
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function ModelCard({
  label,
  modelId,
  ready,
  device,
  detail,
  error,
}: {
  label: string;
  modelId: string;
  ready: boolean;
  device: string | null;
  detail: string;
  error: string | null;
}) {
  return (
    <div className="rounded-[28px] bg-hunter-green px-5 py-5 text-bright-snow">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-xs text-yellow-green/80">{label}</p>
          <p className="mt-3 text-lg font-semibold text-bright-snow">{modelId}</p>
        </div>
        <div
          className={cn(
            "rounded-full px-3 py-2 text-xs font-semibold whitespace-nowrap",
            ready
              ? "bg-yellow-green text-hunter-green"
              : "bg-white/12 text-bright-snow",
          )}
        >
          {ready ? "Ready" : "Starting"}
        </div>
      </div>

      <div className="mt-4 space-y-2 text-sm leading-6 text-bright-snow/80">
        <p>Device: {device ?? "Not reported yet"}</p>
        <p>{detail}</p>
        {error ? (
          <p className="rounded-2xl bg-white/10 px-3 py-3 text-bright-snow">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

export function ProfileDesktopRuntime() {
  const { instruct } = useCoachVoice();
  const [state, setState] = useState<DesktopSetupState>(INITIAL_STATE);
  const [hasResolved, setHasResolved] = useState(false);
  const hasDesktopBridge =
    typeof window !== "undefined" && Boolean(window.cadenceDesktopSetup);
  const canReadDesktop =
    hasDesktopBridge;
  const isLoading = !hasResolved;

  useEffect(() => {
    if (!canReadDesktop || !window.cadenceDesktopSetup) {
      return;
    }

    let active = true;

    const applyState = (nextState: DesktopSetupState | null) => {
      if (!active || !nextState) {
        return;
      }

      setState(nextState);
    };

    window.cadenceDesktopSetup
      .getState()
      .then((nextState) => {
        applyState(nextState);
      })
      .finally(() => {
        if (active) {
          setHasResolved(true);
        }
      });

    const unsubscribe = window.cadenceDesktopSetup.onProgress((nextState) => {
      applyState(nextState);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [canReadDesktop]);

  const runtime = state.runtimeDetails;

  return (
    <Card className="bg-white">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-sage-green/15 px-4 py-2 text-sage-green">
              <Microphone size={18} filled color="currentColor" />
              <span className="eyebrow text-sm">Desktop runtime</span>
            </div>
            <CardTitle>Cadence on this Mac</CardTitle>
            <CardDescription>
              Check whether desktop setup is finished, which local speech tools
              are ready, and where Cadence keeps its support files.
            </CardDescription>
          </div>

          <Button
            variant="ghost"
            onClick={() => void window.cadenceDesktopSetup?.openLogs()}
            disabled={!hasDesktopBridge}
          >
            View setup details
          </Button>
        </div>

        {isLoading ? (
          <div className="rounded-3xl bg-vanilla-cream px-5 py-5 text-sm leading-7 text-iron-grey">
            Loading your desktop runtime details…
          </div>
        ) : runtime ? (
          <>
            <div className="flex flex-wrap gap-3">
              <StatusPill label="Speech checks" ready={state.aiEngineReady} />
              <StatusPill label="Listening" ready={state.transcriberReady} />
              <StatusPill label="Coach voice" ready={state.ttsReady} />
              <StatusPill label="Coach replies" ready={state.coachEngineReady} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <InfoCard
                label="Desktop mode"
                value={runtime.isPackaged ? "Packaged app" : "Desktop dev mode"}
                detail={
                  runtime.isPackaged
                    ? "Cadence is running from the built desktop app bundle."
                    : "Cadence is running from your local workspace for development."
                }
              />
              <InfoCard
                label="Setup state"
                value={formatPhase(state.phase)}
                detail={state.currentStep ?? "Cadence is checking the local runtime."}
              />
              <InfoCard
                label="Install style"
                value="Automatic local setup"
                detail="Cadence prepares and starts its background speech and coaching tools for you."
              />
              <InfoCard
                label="Last ready"
                value={formatDate(runtime.lastReadyAt)}
                detail={
                  runtime.availability.huggingFaceTokenConfigured
                    ? "Extended model access is configured for this machine."
                    : "This Mac is currently using public model access only."
                }
              />
              <InfoCard
                label="Local performance"
                value={`${runtime.performance.cpuThreadsPerService} CPU threads`}
                detail={runtime.performance.note}
              />
            </div>

            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-sage-green/15 px-4 py-2 text-sage-green">
                <Activity size={18} filled color="currentColor" />
                <span className="eyebrow text-sm">Runtime files</span>
              </div>
              <PathPane label="Cadence Desktop storage">
                <RuntimeLocationRow
                  label="Desktop data folder"
                  value={runtime.setupRoot}
                  kind="setupRoot"
                />
                <RuntimeLocationRow
                  label="Runtime folder"
                  value={runtime.runtimeDir}
                  kind="runtimeDir"
                />
                <RuntimeLocationRow
                  label="Model cache"
                  value={runtime.huggingFaceDir}
                  kind="huggingFaceDir"
                />
                <RuntimeLocationRow
                  label="Setup log"
                  value={runtime.logsPath}
                  kind="logsPath"
                  isFile
                />
                <RuntimeLocationRow
                  label="Background runtime file"
                  value={runtime.composeFilePath}
                  kind="composeFilePath"
                  isFile
                />
              </PathPane>
            </div>

            <div className="rounded-3xl bg-vanilla-cream px-5 py-5">
              <div className="flex items-center gap-2 text-sage-green">
                <Speaker size={18} color="currentColor" />
                <p className="eyebrow text-sm">Current voice style</p>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-3xl bg-white px-4 py-4">
                  <p className="text-xs text-iron-grey">Your selected coach voice</p>
                  <p className="mt-2 text-base font-semibold text-hunter-green">
                    {instruct || "Default voice"}
                  </p>
                </div>
                <div className="rounded-3xl bg-white px-4 py-4">
                  <p className="text-xs text-iron-grey">Engine default voice</p>
                  <p className="mt-2 text-base font-semibold text-hunter-green">
                    {runtime.tts.instruct}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-sage-green/15 px-4 py-2 text-sage-green">
                <Activity size={18} filled color="currentColor" />
                <span className="eyebrow text-sm">Current models</span>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                <ModelCard
                  label="Speech checks"
                  modelId={runtime.aiEngine.modelId}
                  ready={runtime.aiEngine.ready}
                  device={runtime.aiEngine.device}
                  detail={`Endpoint: ${runtime.endpoints.aiEngine}`}
                  error={runtime.aiEngine.loadError}
                />
                <ModelCard
                  label="Listening"
                  modelId={runtime.transcriber.modelId}
                  ready={runtime.transcriber.ready}
                  device={runtime.transcriber.device}
                  detail="Turns recorded speech into text before coaching feedback."
                  error={runtime.transcriber.loadError}
                />
                <ModelCard
                  label="Coach voice"
                  modelId={runtime.tts.modelId}
                  ready={runtime.tts.ready}
                  device={runtime.tts.device}
                  detail={`Language: ${runtime.tts.language} · Cadence now cleans and retries unstable voice outputs automatically.`}
                  error={runtime.tts.loadError}
                />
                <ModelCard
                  label="Coach replies"
                  modelId={runtime.coach.modelId}
                  ready={runtime.coach.ready}
                  device={runtime.coach.device}
                  detail={`Provider: ${runtime.coach.provider}${runtime.coach.transformersVersion ? ` · Transformers ${runtime.coach.transformersVersion}` : ""}`}
                  error={runtime.coach.loadError}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-3xl bg-vanilla-cream px-5 py-5 text-sm leading-7 text-iron-grey">
            Cadence could not read the desktop runtime details just yet. Try
            opening the setup log if this Mac is still warming things up.
          </div>
        )}

        {state.error ? (
          <div className="rounded-3xl bg-blushed-brick px-4 py-3 text-sm text-bright-snow">
            {state.error}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
