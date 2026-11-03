/** Live activity inferred from session events; drives animation tempo. */

export type Activity = "idle" | "waiting" | "thinking" | "writing" | "tool"

export type ActivityEvent =
  | "execution.started"
  | "execution.succeeded"
  | "execution.failed"
  | "execution.interrupted"
  | "step.started"
  | "step.ended"
  | "step.failed"
  | "reasoning.started"
  | "reasoning.ended"
  | "text.started"
  | "text.ended"
  | "tool.started"
  | "tool.finished"
  | "retry"
  | "idle"

/** Multiplier for the field phase. Idle still drifts, but slowly. */
export const ACTIVITY_SPEED: Record<Activity, number> = {
  idle: 0.45,
  waiting: 0.8,
  thinking: 1.25,
  writing: 1.55,
  tool: 1.9,
}

export function activitySpeed(activity: Activity): number {
  return ACTIVITY_SPEED[activity] ?? 1
}

export function nextActivity(current: Activity, event: ActivityEvent): Activity {
  switch (event) {
    case "reasoning.started":
      return "thinking"
    case "text.started":
      return "writing"
    case "tool.started":
      return "tool"
    case "execution.started":
    case "step.started":
    case "reasoning.ended":
    case "text.ended":
    case "tool.finished":
    case "retry":
      return "waiting"
    case "execution.succeeded":
    case "execution.failed":
    case "execution.interrupted":
    case "step.failed":
    case "idle":
      return "idle"
    case "step.ended":
      return current
  }
}
