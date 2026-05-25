import ResetPasswordForm from '../reset-password-form'

type PageProps = {
  params: Promise<{ code: string }>
}

export default async function ResetPasswordCodePage({ params }: PageProps) {
  const { code } = await params

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4">
      <ResetPasswordForm recoveryCode={decodeURIComponent(code)} />
    </div>
  )
}
