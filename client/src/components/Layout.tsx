import Nav from '@/components/Nav';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text-1)' }}>
      <Nav />
      <main>{children}</main>
    </div>
  );
}
