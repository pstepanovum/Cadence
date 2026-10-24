// Drives the mouth map's parameters over time. The model is parametric, so a
// change of sound is an interpolation of ten numbers and a redraw: a
// Reanimated shared value runs `t` from 0 to 1 and each frame's value comes
// back to React, which recomputes the contour (about forty points, well inside
// a 60 fps frame). Diphthongs and affricates play their keyframes.
import { useCallback, useEffect, useState } from "react";
import { Easing, useAnimatedReaction, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { easeInOut, lerpParams, NEUTRAL_PARAMS, paramsAt, type Keyframe, type VocalTractParams } from "@/platform/vocal-tract";

export type MotionGoal = { params: VocalTractParams } | { trajectory: readonly Keyframe[] };

export function goalStart(goal: MotionGoal): VocalTractParams {
  return "params" in goal ? goal.params : goal.trajectory[0].params;
}

export function goalEnd(goal: MotionGoal): VocalTractParams {
  return "params" in goal ? goal.params : goal.trajectory[goal.trajectory.length - 1].params;
}

interface Motion {
  from: VocalTractParams;
  goal: MotionGoal | null;
  t: number;
  playKey: number;
  still: boolean;
}

/** The first part of a trajectory's run glides into its start; the rest plays it. */
const LEAD = 0.3;

function paramsOf(motion: Motion): VocalTractParams {
  const { from, goal, t } = motion;
  if (!goal) return from;
  if ("params" in goal) return lerpParams(from, goal.params, easeInOut(t));
  return t < LEAD ? lerpParams(from, goal.trajectory[0].params, easeInOut(t / LEAD)) : paramsAt(goal.trajectory, (t - LEAD) / (1 - LEAD));
}

/**
 * The parameters to draw now. A new `goal` glides from wherever the drawing is
 * to the goal (playing a trajectory); a new `playKey` replays it.
 */
export function useArticulationMotion(goal: MotionGoal | null, playKey: number, durationMs = 900): VocalTractParams {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(1);
  const still = reduceMotion || !goal;
  const [motion, setMotion] = useState<Motion>(() => ({ from: goal ? goalStart(goal) : NEUTRAL_PARAMS, goal, t: 1, playKey, still: true }));

  // A new goal (or a replay) starts from wherever the drawing is right now.
  if (motion.goal !== goal || motion.playKey !== playKey || motion.still !== still) {
    setMotion({ from: paramsOf(motion), goal, t: still ? 1 : 0, playKey, still });
  }

  const setT = useCallback((t: number) => setMotion((m) => (m.t === t ? m : { ...m, t })), []);

  useAnimatedReaction(
    () => progress.value,
    (value, previous) => {
      if (value !== previous) scheduleOnRN(setT, value);
    },
  );

  useEffect(() => {
    if (still) {
      progress.set(1);
      return;
    }
    progress.set(0);
    progress.set(withTiming(1, { duration: durationMs, easing: Easing.linear }));
  }, [goal, playKey, still, durationMs, progress]);

  return paramsOf(motion);
}
