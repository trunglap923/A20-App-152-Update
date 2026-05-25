'use client'

import { useState } from 'react'
import { resetPasswordForEmail } from '@/lib/supabase/auth'

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setMessage('')

        try {
            const { error } = await resetPasswordForEmail(email)

            if (error) {
                setMessage(`Gửi thất bại: ${error.message}`)
            } else {
                setMessage('Nếu email tồn tại, link reset đã được gửi 📩')
            }
        } catch (error) {
            setMessage('Có lỗi xảy ra, thử lại nhé')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">

                <h1 className="text-2xl font-bold text-center mb-2">
                    Quên mật khẩu
                </h1>

                <p className="text-sm text-gray-500 text-center mb-6">
                    Nhập email để nhận link đặt lại mật khẩu
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">

                    <input
                        type="email"
                        placeholder="Nhập email của bạn"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full rounded-lg border px-4 py-2 outline-none focus:ring-2 focus:ring-black"
                    />

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-lg py-2 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 text-white"
                    >
                        {loading ? 'Đang gửi...' : 'Gửi link reset'}
                    </button>
                </form>

                {message && (
                    <p className="mt-4 text-center text-sm text-gray-600">
                        {message}
                    </p>
                )}

                <div className="mt-6 text-center text-sm">
                    <a href="/login" className="text-black font-medium hover:underline">
                        ← Quay lại đăng nhập
                    </a>
                </div>
            </div>
        </div>
    )
}
