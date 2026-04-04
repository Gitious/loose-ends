import Nav from "@/components/ui/Nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-dvh flex flex-col bg-le-void text-le-text">
      <div className="shrink-0">
        <Nav />
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
