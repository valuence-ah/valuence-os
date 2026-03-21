// Simple passthrough layout — the parent (dashboard) layout supplies the sidebar
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
