import { MainLayout } from '@/components/layouts/main-layout'
import { ReactNode } from 'react'

export default function MainRouteLayout({ children }: { children: ReactNode }) {
  return <MainLayout>{children}</MainLayout>
}
