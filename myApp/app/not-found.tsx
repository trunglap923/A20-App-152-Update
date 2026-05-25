import Link from 'next/link'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-white px-4 text-center text-[#333]">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center">
        <p className="text-[160px] font-bold leading-none text-cyan-400 md:text-[220px]">404</p>
        <h1 className="mt-4 text-4xl font-semibold text-[#2f2f2f] md:text-6xl">Oops! Page not found</h1>
        <p className="mt-4 max-w-2xl text-base text-[#666] md:text-lg">
          Sorry, but the page you are looking for is not found. Please, make sure you have typed the current URL.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            Quay lại đăng nhập
          </Link>
        </div>
      </div>
    </div>
  )
}
