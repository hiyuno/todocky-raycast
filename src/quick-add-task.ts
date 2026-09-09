import { LaunchProps, LocalStorage, Toast, showToast } from "@raycast/api";
import { LAST_PROJECT_KEY, createTask, listProjects, preferences } from "./todocky";
import { openTodocky, reportError } from "./feedback";

interface Arguments {
  title: string;
  notes?: string;
}

export default async function QuickAddTask(props: LaunchProps<{ arguments: Arguments }>) {
  const title = props.arguments.title.trim();
  if (title.length === 0) {
    await showToast({ style: Toast.Style.Failure, title: "Give the task a name" });
    return;
  }

  const toast = await showToast({ style: Toast.Style.Animated, title: "Adding task…", message: title });
  const notifyPending = () => {
    toast.title = "Waiting for Todocky";
    toast.message = "Approve the request in Todocky on this Mac.";
  };

  try {
    const projects = await listProjects(notifyPending);
    if (projects.length === 0) {
      toast.style = Toast.Style.Failure;
      toast.title = "No projects in Todocky";
      toast.message = "Create one in the app first.";
      return;
    }

    // A misconfigured default project is worth stopping for: silently filing the
    // task somewhere else is harder to notice — and to undo — than an error here.
    const preferred = preferences().defaultProject?.trim();
    let project = preferred
      ? projects.find((candidate) => candidate.name.trim().toLowerCase() === preferred.toLowerCase())
      : undefined;
    if (preferred && !project) {
      toast.style = Toast.Style.Failure;
      toast.title = `No project named “${preferred}”`;
      toast.message = "Update the Default Project preference for this command.";
      return;
    }
    if (!project) {
      const remembered = await LocalStorage.getItem<string>(LAST_PROJECT_KEY);
      project =
        projects.find((candidate) => candidate.id === remembered) ??
        projects.find((candidate) => candidate.is_inbox) ??
        projects[0];
    }

    toast.title = "Adding task…";
    toast.message = title;
    await createTask(project.id, title, props.arguments.notes?.trim() ?? "", notifyPending);
    await LocalStorage.setItem(LAST_PROJECT_KEY, project.id);

    toast.style = Toast.Style.Success;
    toast.title = `Added to ${project.name}`;
    toast.message = title;
    toast.primaryAction = {
      title: "Open Todocky",
      shortcut: { modifiers: ["cmd", "shift"], key: "o" },
      onAction: () => {
        openTodocky();
        toast.hide();
      },
    };
  } catch (error) {
    await toast.hide();
    await reportError(error, "Could not add the task");
  }
}
