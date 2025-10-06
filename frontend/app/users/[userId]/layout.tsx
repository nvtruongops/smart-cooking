// Server component to satisfy static export requirements
export async function generateStaticParams() {
  return []; // Client-side routing only
}

export default function UserLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children;
}
