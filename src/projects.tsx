import { Action, ActionPanel, Icon, List, Toast, showToast, Keyboard } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { Project, TaskSummary, listProjects, listTasks } from "./todocky";
import { openTodocky, reportError } from "./feedback";
import AddTask from "./add-task";

export default function Projects() {
  const {
    data: projects,
    isLoading,
    revalidate,
    error,
  } = useCachedPromise(loadProjects, [], {
    initialData: [],
    keepPreviousData: true,
    onError: (error) => reportError(error, "Could not load projects"),
  });

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search projects">
      {/* An unreachable Todocky must not read as "you have no projects" — say
          which of the two it is, right where the list would have been. */}
      <List.EmptyView
        icon={error ? Icon.ExclamationMark : Icon.Tray}
        title={error ? "Could not reach Todocky" : isLoading ? "Loading projects…" : "No projects yet"}
        description={error ? error.message : isLoading ? undefined : "Create one in Todocky, then reload here."}
        actions={
          <ActionPanel>
            <Action icon={Icon.ArrowClockwise} title="Try Again" onAction={revalidate} />
            <Action icon={Icon.AppWindow} title="Open Todocky" onAction={openTodocky} />
          </ActionPanel>
        }
      />
      {projects.map((project) => (
        <List.Item
          key={project.id}
          icon={project.is_inbox ? Icon.Tray : Icon.Folder}
          title={project.name}
          actions={
            <ActionPanel>
              {/* Enter opens the project, the way Enter drills in everywhere else
                  in Raycast; creating gets Cmd+N, the way it does everywhere else
                  on the Mac. */}
              <Action.Push icon={Icon.List} title="Open Project" target={<ProjectTasks project={project} />} />
              <Action.Push
                icon={Icon.PlusCircle}
                title="New Task Here"
                shortcut={Keyboard.Shortcut.Common.New}
                target={<AddTask projectId={project.id} />}
              />
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
  const {
    data: tasks,
    isLoading,
    revalidate,
    error,
  } = useCachedPromise((projectId: string) => listTasks(projectId), [project.id], {
    initialData: [],
    keepPreviousData: true,
    onError: (error) => reportError(error, "Could not load tasks"),
  });

  const open = tasks.filter((task) => !task.is_completed);
  const done = tasks.filter((task) => task.is_completed);
  const newTaskActions = <TaskActions project={project} onChanged={revalidate} />;

  return (
    <List isLoading={isLoading} navigationTitle={project.name} searchBarPlaceholder={`Search in ${project.name}`}>
      <List.EmptyView
        icon={error ? Icon.ExclamationMark : Icon.CheckCircle}
        title={error ? "Could not reach Todocky" : isLoading ? "Loading tasks…" : "Nothing here yet"}
        description={error ? error.message : isLoading ? undefined : "Press ⌘N to add the first one."}
        actions={newTaskActions}
      />
      <List.Section title="Open" subtitle={open.length > 0 ? String(open.length) : undefined}>
        {open.map((task) => (
          <List.Item
            key={task.id}
            icon={Icon.Circle}
            title={task.name}
            actions={<TaskActions project={project} task={task} onChanged={revalidate} />}
          />
        ))}
      </List.Section>
      <List.Section title="Completed" subtitle={done.length > 0 ? String(done.length) : undefined}>
        {done.map((task) => (
          <List.Item
            key={task.id}
            icon={Icon.CheckCircle}
            title={task.name}
            actions={<TaskActions project={project} task={task} onChanged={revalidate} />}
          />
        ))}
      </List.Section>
    </List>
  );
}

function TaskActions({ project, task, onChanged }: { project: Project; task?: TaskSummary; onChanged: () => void }) {
  return (
    <ActionPanel>
      {/* Enter hands the task to the app itself, which opens its card. Todocky
          only honours this for a task the active workspace can actually reach,
          so a stale row here just brings the app forward. */}
      {task ? <Action.Open icon={Icon.AppWindow} title="Open in Todocky" target={`todocky://task/${task.id}`} /> : null}
      <Action.Push
        icon={Icon.PlusCircle}
        title="New Task"
        shortcut={Keyboard.Shortcut.Common.New}
        target={<AddTask projectId={project.id} onCreated={onChanged} />}
      />
      <Action
        icon={Icon.ArrowClockwise}
        title="Reload Tasks"
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={onChanged}
      />
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
