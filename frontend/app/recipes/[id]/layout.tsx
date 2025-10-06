// Server component to satisfy static export requirements
export async function generateStaticParams() {
  return []; // Client-side routing only
}

export default function RecipeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children;
}
