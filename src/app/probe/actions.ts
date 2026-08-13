"use server";

import { revalidatePath } from "next/cache";
import { lockProbe, probeEnabled, tokenMatches, unlockProbe } from "@/lib/probe";

export type UnlockState = { error: string | null };

export async function unlockAction(
  _prev: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  if (!probeEnabled()) {
    return { error: "PROBE_TOKEN is not set on this deployment" };
  }

  const token = formData.get("token");
  if (typeof token !== "string" || token.trim() === "") {
    return { error: "Enter the probe token" };
  }
  if (!tokenMatches(token.trim())) {
    return { error: "That token does not match PROBE_TOKEN" };
  }

  await unlockProbe();
  revalidatePath("/probe");
  return { error: null };
}

export async function lockAction(): Promise<void> {
  await lockProbe();
  revalidatePath("/probe");
}
