import Link from "next/link";
import AccessMenu from "@/components/access/AccessMenu";

export default function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="app-header">
      <Link href="/" className="brand">
        <span className="brand-name">Vellum</span>
        <span className="brand-beta">Beta</span>
      </Link>
      <div className="app-header-right">
        {children}
        <AccessMenu />
      </div>
    </header>
  );
}
