import { Header } from "@/components/layout/header";
import { TasksClient } from "@/components/tasks/tasks-client";
export const dynamic = "force-dynamic";
export const metadata = { title: "Task Intelligence" };
export default function TasksPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Task Intelligence" subtitle="Action items and follow-ups" />
      <TasksClient />
    </div>
  );
}
