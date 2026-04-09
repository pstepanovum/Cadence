// FILE: src/components/learn/TheoryLesson.tsx
"use client";

import { ArrowLeft, ArrowRight, Volume } from "griddy-icons";
import { TheoryNarrationButton } from "@/components/learn/TheoryNarrationButton";
import type { Lesson } from "@/lib/learn";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

interface TheoryLessonProps {
  lesson: Lesson;
  moduleSlug: string;
  nextLessonSlug: string | null;
}

export function TheoryLesson({
  lesson,
  moduleSlug,
  nextLessonSlug,
}: TheoryLessonProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="bg-white">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="eyebrow text-sm text-sage-green">Theory lesson</p>
              <CardTitle className="text-3xl sm:text-4xl">{lesson.title}</CardTitle>
              <p className="max-w-3xl text-sm leading-7 text-iron-grey">
                Learn the sound first, then move into guided takes once the cue is
                clear enough to repeat out loud.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
                <p className="eyebrow text-xs text-sage-green">Lesson type</p>
                <p className="mt-2 text-xl font-semibold text-hunter-green">Theory</p>
              </div>
              <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
                <p className="eyebrow text-xs text-sage-green">Next step</p>
                <p className="mt-2 text-xl font-semibold text-hunter-green">
                  Guided practice
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="bg-hunter-green text-bright-snow">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
                <Volume size={18} color="currentColor" />
              </span>
              <div className="space-y-1">
                <p className="eyebrow text-xs text-yellow-green/84">Audio support</p>
                <h3 className="text-2xl font-semibold text-bright-snow">
                  Hear the full explanation aloud.
                </h3>
              </div>
            </div>

            <p className="text-sm leading-7 text-bright-snow/76">
              Use the narration button to listen through the whole lesson before
              you start speaking. It is the same voice route used across the rest
              of the module flow.
            </p>

            <TheoryNarrationButton
              title={lesson.title}
              theoryHtml={lesson.theory_html}
            />
          </div>
        </Card>
      </div>

      <Card className="bg-bright-snow">
        {lesson.theory_html ? (
          <div
            className="prose prose-sm max-w-none text-iron-grey [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-hunter-green [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-hunter-green [&_strong]:text-hunter-green [&_ul]:space-y-2 [&_li]:leading-7 [&_p]:leading-7"
            dangerouslySetInnerHTML={{ __html: lesson.theory_html }}
          />
        ) : (
          <p className="text-sm leading-7 text-iron-grey">
            No theory content is available for this lesson yet.
          </p>
        )}
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="ghost" href={`/learn/${moduleSlug}`} className="flex-1">
          <ArrowLeft size={16} color="currentColor" />
          Module overview
        </Button>
        {nextLessonSlug ? (
          <Button variant="primary" href={`/learn/${moduleSlug}/${nextLessonSlug}`} className="flex-1">
            Start Practice
            <ArrowRight size={16} color="currentColor" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
