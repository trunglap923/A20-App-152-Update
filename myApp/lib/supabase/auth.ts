import { createClient } from '@/lib/supabaseClient'
import { getResetPasswordRedirectUrl } from './redirect'
import { secureSignOut } from './secure-signout'
import { logAuthEvent } from '@/lib/audit-log'

const supabase = createClient()

export const loginWithEmail = async (email: string, password: string) => {
    const result = await supabase.auth.signInWithPassword({
        email,
        password,
    })
    await logAuthEvent({
        event: 'login',
        email,
        success: !result.error,
        errorCode: result.error?.message,
    })
    return result
}

const oauthPostLoginUrl = () =>
    `${window.location.origin}/auth/post-login`

export const loginWithGoogle = async () => {
    return await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: oauthPostLoginUrl(),
        },
    })
}

export const loginWithFacebook = async () => {
    return await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
            redirectTo: oauthPostLoginUrl(),
        },
    })
}

export const logout = async () => {
    return await secureSignOut(supabase)
}
export const resetPasswordForEmail = async (email: string) => {
    const result = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getResetPasswordRedirectUrl(),
    })
    await logAuthEvent({
        event: 'password_reset',
        email,
        success: !result.error,
        errorCode: result.error?.message,
    })
    return result
}

/**
 * Đổi mật khẩu cho người dùng đã đăng nhập.
 * 1. Xác minh mật khẩu hiện tại bằng cách đăng nhập lại (re-auth).
 * 2. Cập nhật mật khẩu mới qua supabase.auth.updateUser().
 */
export const changePassword = async (
    currentPassword: string,
    newPassword: string
): Promise<{ success: boolean; error?: string }> => {
    // Lấy thông tin user hiện tại
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user || !user.email) {
        return { success: false, error: 'Không tìm thấy người dùng. Vui lòng đăng nhập lại.' }
    }

    // Xác minh mật khẩu hiện tại bằng cách re-auth
    const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
    })

    if (signInError) {
        return { success: false, error: 'Mật khẩu hiện tại không đúng.' }
    }

    // Cập nhật mật khẩu mới
    const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
    })

    if (updateError) {
        return { success: false, error: updateError.message || 'Đổi mật khẩu thất bại.' }
    }

    return { success: true }
}
