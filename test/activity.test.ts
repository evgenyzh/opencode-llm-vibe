import { describe, expect, it } from "vitest"
import { ACTIVITY_SPEED, activitySpeed, nextActivity, type Activity } from "../src/activity.js"

describe("activitySpeed", () => {
  it("orders idle < waiting < thinking < writing < tool", () => {
    const order: Activity[] = ["idle", "waiting", "thinking", "writing", "tool"]
    for (let index = 1; index < order.length; index += 1) {
      expect(activitySpeed(order[index]!)).toBeGreaterThan(activitySpeed(order[index - 1]!))
    }
  })

  it("exposes every activity", () => {
    for (const activity of ["idle", "waiting", "thinking", "writing", "tool"] as const) {
      expect(ACTIVITY_SPEED[activity]).toBeGreaterThan(0)
    }
  })
})

describe("nextActivity", () => {
  it("moves through a normal turn", () => {
    let activity: Activity = "idle"
    activity = nextActivity(activity, "execution.started")
    expect(activity).toBe("waiting")
    activity = nextActivity(activity, "reasoning.started")
    expect(activity).toBe("thinking")
    activity = nextActivity(activity, "tool.started")
    expect(activity).toBe("tool")
    activity = nextActivity(activity, "tool.finished")
    expect(activity).toBe("waiting")
    activity = nextActivity(activity, "text.started")
    expect(activity).toBe("writing")
    activity = nextActivity(activity, "execution.succeeded")
    expect(activity).toBe("idle")
  })

  it("returns to waiting after streams end", () => {
    expect(nextActivity("thinking", "reasoning.ended")).toBe("waiting")
    expect(nextActivity("writing", "text.ended")).toBe("waiting")
    expect(nextActivity("tool", "tool.finished")).toBe("waiting")
  })

  it("handles retries, failures and interruption", () => {
    expect(nextActivity("waiting", "retry")).toBe("waiting")
    expect(nextActivity("thinking", "execution.failed")).toBe("idle")
    expect(nextActivity("tool", "execution.interrupted")).toBe("idle")
    expect(nextActivity("waiting", "step.failed")).toBe("idle")
  })

  it("keeps step end from resurrecting an idle session", () => {
    expect(nextActivity("idle", "step.ended")).toBe("idle")
    expect(nextActivity("writing", "step.ended")).toBe("writing")
  })
})
