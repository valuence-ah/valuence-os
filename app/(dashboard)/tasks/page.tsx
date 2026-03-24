import { TasksClient } from "@/components/tasks/tasks-client";
export const dynamic = "force-dynamic";
export const metadata = { title: "Task Intelligence" };
export default function TasksPage() {
  return <TasksClient />;
}
