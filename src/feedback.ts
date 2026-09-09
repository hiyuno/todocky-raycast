import { Toast, showToast } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import { TodockyError } from "./todocky";

/** Todocky registers no URL scheme, so it is brought forward by bundle id. */
export async function openTodocky(): Promise<void> {
  await runAppleScript('tell application id "com.yuno.todocky" to activate');
}

/**
 * Turns a thrown error into a toast that says what to do about it. Every failure
 * mode of the local MCP server has a concrete fix on the user's own Mac, so each
 * one gets the sentence and the action that leads there.
 */
export async function reportError(error: unknown, fallbackTitle: string): Promise<void> {
  const openInTodocky = {
    title: "Open Todocky",
    onAction: (toast: Toast) => {
      openTodocky();
      toast.hide();
    },
  };

  if (error instanceof TodockyError) {
    switch (error.kind) {
      case "unreachable":
        await showToast({
          style: Toast.Style.Failure,
          title: "Todocky isn’t listening",
          message: "Open Todocky and turn on Settings → MCP Server.",
          primaryAction: openInTodocky,
        });
        return;
      case "denied":
        await showToast({
          style: Toast.Style.Failure,
          title: "Access denied in Todocky",
          message: error.message,
          primaryAction: openInTodocky,
        });
        return;
      default:
        await showToast({ style: Toast.Style.Failure, title: fallbackTitle, message: error.message });
        return;
    }
  }

  await showToast({
    style: Toast.Style.Failure,
    title: fallbackTitle,
    message: error instanceof Error ? error.message : String(error),
  });
}
