// Public research pages (search, profiles, nearby, methodology) use the editorial
// RunwayML-inspired system in DESIGN.md, scoped under .rw so the advanced dashboard
// keeps its own look.
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return <div className="rw flex min-h-full flex-1 flex-col bg-white">{children}</div>;
}
