import { Action, ActionPanel, Icon, List, Toast, showToast, Keyboard } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { Project, listProjects, listTasks } from "./todocky";
import { openTodocky, reportError } from "./feedback";
import AddTask from "./add-task";

export default function Projects() {
  const {
    data: projects,
    isLoading,
    revalidate,
  } = useCachedPromise(loadProjects, [], {
    initialData: [],
    keepPreviousData: true,
    onError: (error) => reportError(error, "Could not load projects"),
  });

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search projects">
      <List.EmptyView
        icon={Icon.Tray}
        title={isLoading ? "Loading projects…" : "No projects yet"}
        description={isLoading ? undefined : "Create one in Todocky, then reload here."}
      />
      {projects.map((project) => (
        <List.Item
          key={project.id}
          icon={project.is_inbox ? Icon.Tray : Icon.Folder}
          title={project.name}
          actions={
            <ActionPanel>
              <Action.Push icon={Icon.PlusCircle} title="Add Task Here" target={<AddTask projectId={project.id} />} />
              <Action.Push icon={Icon.List} title="Show Tasks" target={<ProjectTasks project={project} />} />
              <Action
                icon={Icon.ArrowClockwise}
                title="Reload Projects"
                shortcut={Keyboard.Shortcut.Common.Refresh}
                onAction={revalidate}
              />
              <Action icon={Icon.AppWindow} title="Open Todocky" onAction={openTodocky} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function ProjectTasks({ project }: { project: Project }) {
  const { data: tasks, isLoading } = useCachedPromise((projectId: string) => listTasks(projectId), [project.id], {
    initialData: [],
    onError: (error) => reportError(error, "Could not load tasks"),
  });

  const open = tasks.filter((task) => !task.is_completed);
  const done = tasks.filter((task) => task.is_completed);

  return (
    <List isLoading={isLoading} navigationTitle={project.name} searchBarPlaceholder={`Search in ${project.name}`}>
      <List.EmptyView icon={Icon.CheckCircle} title={isLoading ? "Loading tasks…" : "Nothing here yet"} />
      <List.Section title="Open" subtitle={open.length > 0 ? String(open.length) : undefined}>
        {open.map((task) => (
          <List.Item key={task.id} icon={Icon.Circle} title={task.name} actions={<TaskActions project={project} />} />
        ))}
      </List.Section>
      <List.Section title="Completed" subtitle={done.length > 0 ? String(done.length) : undefined}>
        {done.map((task) => (
          <List.Item
            key={task.id}
            icon={Icon.CheckCircle}
            title={task.name}
            actions={<TaskActions project={project} />}
          />
        ))}
      </List.Section>
    </List>
  );
}

function TaskActions({ project }: { project: Project }) {
  return (
    <ActionPanel>
      <Action.Push icon={Icon.PlusCircle} title="Add Task Here" target={<AddTask projectId={project.id} />} />
      <Action icon={Icon.AppWindow} title="Open Todocky" onAction={openTodocky} />
    </ActionPanel>
  );
}

async function loadProjects(): Promise<Project[]> {
  const toast = await showToast({ style: Toast.Style.Animated, title: "Loading projects…" });
  try {
    const projects = await listProjects(() => {
      toast.title = "Waiting for Todocky";
      toast.message = "Approve the request in Todocky on this Mac.";
    });
    await toast.hide();
    return projects;
  } catch (error) {
    await toast.hide();
    throw error;
  }
}
