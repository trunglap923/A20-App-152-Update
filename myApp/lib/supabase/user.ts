import { createClient } from '@/lib/supabaseClient'
import { isUserAdminEmail } from '@/lib/admin-auth'

const supabase = createClient()

export type UserProfile = {
    name: string
    email: string
    phoneNumber: string
    birthDate: string
    avatarUrl?: string
    role?: string | null
    providers?: string[]
}

/** Role trong bảng `user_profiles` (vd: admin, student). */
export async function getProfileRoleByUserId(userId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle()

    if (error) {
        console.warn('[getProfileRoleByUserId]', error.message)
        return null
    }
    return data?.role ?? null
}

/**
 * Sau đăng nhập: `user_profiles.role === admin` hoặc email trong `NEXT_PUBLIC_ADMIN_EMAILS` → /admin;
 * không thì `redirect` hợp lệ hoặc /.
 */
export function resolvePathAfterAuth(
    role: string | null | undefined,
    redirectParam: string | null,
    email?: string | null
): string {
    if (role?.toLowerCase() === 'admin') return '/admin'
    if (email && isUserAdminEmail(email)) return '/admin'
    if (redirectParam?.startsWith('/') && !redirectParam.startsWith('//')) {
        return redirectParam
    }
    return '/'
}

/** Đọc role với vài lần thử (sau đăng nhập RLS / replica đôi khi trả chậm). */
export async function getProfileRoleByUserIdWithRetry(
    userId: string,
    attempts = 4,
    delayMs = 100
): Promise<string | null> {
    for (let i = 0; i < attempts; i++) {
        const role = await getProfileRoleByUserId(userId)
        if (role) return role
        if (i < attempts - 1) {
            await new Promise((r) => setTimeout(r, delayMs))
        }
    }
    return null
}

export const getUserProfile = async () => {
    const { data, error } = await supabase.auth.getUser()
    if (error) throw error

    const user = data.user
    if (!user) return null

    const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('phone_number, birth_date, role')
        .eq('id', user.id)
        .maybeSingle()

    if (profileError) {
      console.warn('[getUserProfile] user_profiles:', profileError.message)
    }

    return {
        name: user.user_metadata?.full_name || 'Chưa có tên',
        email: user.email || '',
        phoneNumber: (!profileError && profileData?.phone_number) || '',
        birthDate: (!profileError && profileData?.birth_date) || '',
        avatarUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
        role: (!profileError && profileData?.role) || null,
        providers: user.app_metadata?.providers || [],
    } as UserProfile
}

/**
 * Cập nhật hồ sơ người dùng (phone, birthDate, avatarUrl)
 */
export const updateUserProfile = async (updates: {
    phoneNumber?: string
    birthDate?: string
    avatarUrl?: string
}) => {
    const { data, error } = await supabase.auth.getUser()
    if (error) throw error

    const user = data.user
    if (!user) throw new Error('Không tìm thấy người dùng')

    // 1. Cập nhật thông tin vào bảng user_profiles
    const { error: profileError } = await supabase.from('user_profiles').upsert({
        id: user.id,
        phone_number: updates.phoneNumber || null,
        birth_date: updates.birthDate || null,
        updated_at: new Date().toISOString(),
    })

    if (profileError) throw profileError

    // 2. Cập nhật avatarUrl vào auth.user_metadata (nếu có)
    if (updates.avatarUrl !== undefined) {
        const { error: metadataError } = await supabase.auth.updateUser({
            data: {
                avatar_url: updates.avatarUrl,
            }
        })

        if (metadataError) throw metadataError
    }
}