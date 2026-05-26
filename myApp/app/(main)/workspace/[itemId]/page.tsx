import { redirect } from 'next/navigation'

export default async function WorkspaceItemRedirect({ params }: { params: { itemId: string } }) {
  // Await params if using Next.js 15+ constraints, though usually params is accessible directly.
  // We'll redirect to the default 'summary' tab.
  redirect(`/workspace/${params.itemId}/summary`)
}
