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
      <Card className="bg-white text-carbon-black">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="eyebrow text-sm text-slate-grey">Conversation module</p>
            <h1 className="text-3xl font-semibold text-carbon-black sm:text-4xl lg:text-5xl">
              {module.title}
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-iron-grey">
              {module.scenario}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[20px] bg-page px-4 py-4">
              <p className="eyebrow text-xs text-slate-grey">Level</p>
              <p className="mt-2 text-2xl font-semibold text-carbon-black">{module.level}</p>
            </div>
            <div className="rounded-[20px] bg-page px-4 py-4">
              <p className="eyebrow text-xs text-slate-grey">Pass mark</p>
              <p className="mt-2 text-2xl font-semibold text-carbon-black">{module.passScore}</p>
            </div>
            <div className="rounded-[20px] bg-page px-4 py-4">
              <p className="eyebrow text-xs text-slate-grey">Turns</p>
              <p className="mt-2 text-2xl font-semibold text-carbon-black">{module.turns.length}</p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="bg-white">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="eyebrow text-sm text-slate-grey">Progress</p>
            <WordQueue total={module.turns.length} current={turnIndex} />
          </div>

          <div className="rounded-[20px] bg-page px-4 py-4">
            <p className="eyebrow text-xs text-slate-grey">Track definition</p>
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
                className="rounded-full bg-page px-3 py-1 text-xs font-semibold text-carbon-black"
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
