import Nav from "@/components/ui/Nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Nav />
      <main className="pt-14">{children}</main>
    </>
  );
}
