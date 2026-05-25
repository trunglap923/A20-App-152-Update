import type { Metadata } from 'next'
import { AdminShell } from '@/components/admin-shell'

export const metadata: Metadata = {
  title: 'Admin — Nexus',
  description: 'Bảng điều khiển quản trị Nexus',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
