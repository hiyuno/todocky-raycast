import {
  Action,
  ActionPanel,
  Form,
  Icon,
  Keyboard,
  LocalStorage,
  Toast,
  popToRoot,
  showHUD,
  showToast,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useEffect, useRef, useState } from "react";
import { LAST_PROJECT_KEY, createTask, listProjects, preferences } from "./todocky";
import { openTodocky, reportError } from "./feedback";

interface FormValues {
  projectId: string;
  title: string;
  description: string;
}

export default function AddTask(props: { projectId?: string; onCreated?: () => void }) {
  const titleField = useRef<Form.TextField>(null);
  const [projectId, setProjectId] = useState<string | undefined>(props.projectId);
  const [titleError, setTitleError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    data: projects,
    isLoading,
    revalidate,
    error,
  } = useCachedPromise(
    async () => {
      const toast = await showToast({ style: Toast.Style.Animated, title: "Loading projects…" });
      try {
        const result = await listProjects(() => {
          toast.title = "Waiting for Todocky";
          toast.message = "Approve the request in Todocky on this Mac.";
        });
        await toast.hide();
        return result;
      } catch (error) {
        await toast.hide();
        throw error;
      }
    },
    [],
    { initialData: [], keepPreviousData: true, onError: (error) => reportError(error, "Could not load projects") },
  );

  // Preselect the project this command last added to, so repeat captures are one
  // keystroke. Runs once projects arrive, and never overrides a manual pick.
  useEffect(() => {
    if (projectId !== undefined || projects.length === 0) return;
    (async () => {
      const remembered = await LocalStorage.getItem<string>(LAST_PROJECT_KEY);
      const preferred = preferences().defaultProject?.trim().toLowerCase();
      const match =
        projects.find((project) => project.id === remembered) ??
        (preferred ? projects.find((project) => project.name.trim().toLowerCase() === preferred) : undefined) ??
        projects.find((project) => project.is_inbox) ??
        projects[0];
      setProjectId(match?.id);
    })();
  }, [projects, projectId]);

  async function handleSubmit(values: FormValues) {
    const title = values.title.trim();
    if (title.length === 0) {
      setTitleError("Give the task a name");
      titleField.current?.focus();
      return;
    }
    const project = projects.find((candidate) => candidate.id === values.projectId);
    if (!project) {
      await showToast({ style: Toast.Style.Failure, title: "Pick a project first" });
      return;
    }

    setIsSubmitting(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "Adding task…" });
    try {
      await createTask(project.id, title, values.description.trim(), () => {
        toast.title = "Waiting for Todocky";
        toast.message = "Approve the request in Todocky on this Mac.";
      });
      await LocalStorage.setItem(LAST_PROJECT_KEY, project.id);

      // Get out of the way once the task is filed. Leaving the form up read as
      // "nothing happened", so confirm in a HUD — which closes Raycast on its
      // own — and reset the navigation for the next launch.
      await toast.hide();
      await showHUD(`Added to ${project.name}`);
      await popToRoot({ clearSearchBar: true });
    } catch (error) {
      await toast.hide();
      await reportError(error, "Could not add the task");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form
      isLoading={isLoading || isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm icon={Icon.PlusCircle} title="Add Task" onSubmit={handleSubmit} />
          <Action
            icon={Icon.ArrowClockwise}
            title="Reload Projects"
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={revalidate}
          />
          <Action
            icon={Icon.AppWindow}
            title="Open Todocky"
            shortcut={Keyboard.Shortcut.Common.Open}
            onAction={openTodocky}
          />
        </ActionPanel>
      }
    >
      {/* Without this the picker just sits empty, which reads as "no projects"
          rather than "Todocky never answered". */}
      {error ? <Form.Description title="Todocky" text={`Could not load projects. ${error.message}`} /> : null}
      <Form.Dropdown id="projectId" title="Project" value={projectId ?? ""} onChange={setProjectId}>
        {projects.map((project) => (
          <Form.Dropdown.Item
            key={project.id}
            value={project.id}
            title={project.name}
            icon={project.is_inbox ? Icon.Tray : Icon.Folder}
          />
        ))}
      </Form.Dropdown>
      <Form.TextField
        id="title"
        ref={titleField}
        title="Task"
        placeholder="What needs doing?"
        error={titleError}
        onChange={() => setTitleError(undefined)}
      />
      <Form.TextArea id="description" title="Notes" placeholder="Optional details" />
    </Form>
  );
}
