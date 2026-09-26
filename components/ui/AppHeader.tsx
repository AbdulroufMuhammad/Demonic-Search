import Link from "next/link";

export default function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="app-header">
      <Link href="/" className="brand">
        <span className="brand-name">Demonic Search</span>
        <span className="brand-beta">Beta</span>
      </Link>
      <div className="app-header-right">
        {children}
        <span className="avatar" title="You">
          Y
        </span>
      </div>
    </header>
  );
}
