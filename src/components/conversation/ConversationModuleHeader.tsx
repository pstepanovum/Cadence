// FILE: src/components/conversation/ConversationModuleHeader.tsx
import { Card } from "@/components/ui/card";
import { WordQueue } from "@/components/learn/WordQueue";
import type { ConversationModule } from "@/lib/conversation";

interface ConversationModuleHeaderProps {
  module: ConversationModule;
  turnIndex: number;
}

export function ConversationModuleHeader({ module, turnIndex }: ConversationModuleHeaderProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
      <Card className="bg-hunter-green text-bright-snow">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="eyebrow text-sm text-yellow-green/82">Conversation module</p>
            <h1 className="text-3xl font-semibold text-bright-snow sm:text-4xl lg:text-5xl">
              {module.title}
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-bright-snow/78">
              {module.scenario}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl bg-white/10 px-4 py-4">
              <p className="eyebrow text-xs text-yellow-green/82">Level</p>
              <p className="mt-2 text-2xl font-semibold text-bright-snow">{module.level}</p>
            </div>
            <div className="rounded-3xl bg-white/10 px-4 py-4">
              <p className="eyebrow text-xs text-yellow-green/82">Pass mark</p>
              <p className="mt-2 text-2xl font-semibold text-bright-snow">{module.passScore}</p>
            </div>
            <div className="rounded-3xl bg-white/10 px-4 py-4">
              <p className="eyebrow text-xs text-yellow-green/82">Turns</p>
              <p className="mt-2 text-2xl font-semibold text-bright-snow">{module.turns.length}</p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="bg-white">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="eyebrow text-sm text-sage-green">Progress</p>
            <WordQueue total={module.turns.length} current={turnIndex} />
          </div>

          <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
            <p className="eyebrow text-xs text-sage-green">Track definition</p>
            <p className="mt-2 text-sm leading-6 text-iron-grey">
              Sound modules isolate individual phonemes. Conversation modules
              check whether you can keep that accuracy inside a realistic spoken
              response.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {module.focus.map((item) => (
              <span
                key={item}
                className="rounded-full bg-vanilla-cream px-3 py-1 text-xs font-semibold text-hunter-green"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
