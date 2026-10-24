import { ResultSummary, type SummaryItem } from "@/components/practice/ResultSummary";
import { ActionRow, Button } from "@/components/ui";
import { roundVerdict } from "@/games/quiz";

export type { SummaryItem };

/** The end of every game round: the shared summary with a verdict and two ways out. */
export function RoundSummary({
  eyebrow = "Round complete",
  accuracy,
  subtitle,
  stats,
  items,
  isNewBest = false,
  onPlayAgain,
  onDone,
  playAgainLabel = "Play again",
  doneLabel = "Back to games",
}: {
  eyebrow?: string;
  /** 0-100; drives the ring and the headline. */
  accuracy: number;
  subtitle?: string;
  stats: { label: string; value: string }[];
  items?: SummaryItem[];
  isNewBest?: boolean;
  onPlayAgain: () => void;
  onDone: () => void;
  playAgainLabel?: string;
  doneLabel?: string;
}) {
  const verdict = roundVerdict(accuracy);
  return (
    <ResultSummary
      eyebrow={eyebrow}
      score={accuracy}
      ringLabel={`${accuracy}%`}
      title={verdict.title}
      subtitle={subtitle}
      stats={stats}
      items={items}
      badge={isNewBest ? "New best score" : undefined}
      celebrate={verdict.passed}>
      <ActionRow>
        <Button label={doneLabel} variant="tonal" onPress={onDone} />
        <Button label={playAgainLabel} onPress={onPlayAgain} />
      </ActionRow>
    </ResultSummary>
  );
}
