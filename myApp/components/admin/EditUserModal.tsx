'use client'

import { useEffect, useState } from 'react'
import { X, Save, Loader2, Upload } from 'lucide-react'
import { toast } from 'react-toastify'
import { Button } from '@/components/ui/button'
import type { AdminUserRow } from '@/lib/admin-mock-data'
import UserAvatar from '@/components/UserAvatar'

type Props = {
    user: AdminUserRow | null
    open: boolean
    onClose: () => void
    onUpdated: (user: AdminUserRow) => void
}

type EditableUser = {
    id: string
    fullName: string
    email: string
    avatarUrl: string
    phoneNumber: string
    birthDate: string
}

export default function EditUserModal({
    user,
    open,
    onClose,
    onUpdated,
}: Props) {
    const [form, setForm] = useState<EditableUser | null>(null)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [isUploading, setIsUploading] = useState(false)

    const [selectedAvatar, setSelectedAvatar] = useState<File | null>(null)
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

    useEffect(() => {
        return () => {
            if (avatarPreview) URL.revokeObjectURL(avatarPreview)
        }
    }, [avatarPreview])

    useEffect(() => {
        const fetchUserDetail = async () => {
            if (!open || !user) return

            try {
                setLoading(true)

                const res = await fetch(`/api/admin/users/${user.id}`)
                const data = await res.json()

                if (!res.ok) {
                    throw new Error(data.error || 'Không thể tải thông tin người dùng')
                }

                setForm({
                    id: data.id,
                    fullName: data.fullName || '',
                    email: data.email || '',
                    avatarUrl: data.avatarUrl || '',
                    phoneNumber: data.phoneNumber || '',
                    birthDate: data.birthDate || '',
                })

                setSelectedAvatar(null)
                setAvatarPreview(null)
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : 'Không thể tải thông tin người dùng'
                )
                onClose()
            } finally {
                setLoading(false)
            }
        }

        fetchUserDetail()
    }, [open, user, onClose])

    const revokePreview = () => {
        if (avatarPreview) {
            URL.revokeObjectURL(avatarPreview)
            setAvatarPreview(null)
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (file.size > 2 * 1024 * 1024) {
            toast.error('Ảnh phải nhỏ hơn 2MB')
            return
        }

        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            toast.error('Chỉ hỗ trợ file JPG, PNG, WebP')
            return
        }

        revokePreview()
        setSelectedAvatar(file)
        setAvatarPreview(URL.createObjectURL(file))
    }

    const uploadAvatar = async (file: File, userId: string) => {
        try {
            const formData = new FormData()
            formData.append('file', file)

            const res = await fetch(`/api/admin/users/${userId}/avatar`, {
                method: 'POST',
                body: formData,
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Tải ảnh lên thất bại')
            }

            return data.avatarUrl as string
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Tải ảnh lên thất bại'
            )
            return null
        }
    }

    const handleSubmit = async () => {
        if (!form) return

        try {
            setSaving(true)

            let nextAvatarUrl = form.avatarUrl

            if (selectedAvatar) {
                setIsUploading(true)
                const uploadedUrl = await uploadAvatar(selectedAvatar, form.id)
                if (uploadedUrl) nextAvatarUrl = uploadedUrl
                setIsUploading(false)
            }

            const res = await fetch(`/api/admin/users/${form.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    fullName: form.fullName,
                    phoneNumber: form.phoneNumber,
                    birthDate: form.birthDate,
                    avatarUrl: nextAvatarUrl,
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Không thể cập nhật user')
            }

            onUpdated({
                ...user!,
                fullName: form.fullName,
                avatarUrl: nextAvatarUrl,
                phoneNumber: form.phoneNumber,
                birthDate: form.birthDate,
            })

            toast.success('Cập nhật người dùng thành công')
            revokePreview()
            setSelectedAvatar(null)
            onClose()
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Không thể cập nhật user'
            )
        } finally {
            setSaving(false)
            setIsUploading(false)
        }
    }

    if (!open || !user) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <h2 className="text-lg font-semibold text-slate-900">
                        Chỉnh sửa người dùng
                    </h2>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {loading || !form ? (
                    <div className="flex items-center justify-center px-6 py-12 text-sm text-slate-500">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Đang tải thông tin người dùng...
                    </div>
                ) : (
                    <>
                        <div className="space-y-5 px-6 py-5">
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <UserAvatar
                                        fullName={form.fullName}
                                        avatarUrl={avatarPreview || form.avatarUrl}
                                    />
                                    <label className="absolute bottom-0 right-0 rounded-full bg-cyan-500 p-2 text-white shadow-md cursor-pointer hover:bg-cyan-600">
                                        <Upload className="h-4 w-4" />
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            onChange={handleFileChange}
                                            className="hidden"
                                        />
                                    </label>
                                </div>

                                <div className="flex-1">
                                    <p className="text-sm font-medium text-slate-700">
                                        Ảnh đại diện
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        JPG, PNG hoặc WebP. Tối đa 2MB.
                                    </p>
                                </div>
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">
                                    Họ tên
                                </label>
                                <input
                                    value={form.fullName}
                                    onChange={(e) =>
                                        setForm((prev) =>
                                            prev ? { ...prev, fullName: e.target.value } : prev
                                        )
                                    }
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">
                                    Email
                                </label>
                                <input
                                    value={form.email}
                                    disabled
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                                />
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <input
                                    value={form.phoneNumber}
                                    onChange={(e) =>
                                        setForm((prev) =>
                                            prev ? { ...prev, phoneNumber: e.target.value } : prev
                                        )
                                    }
                                    placeholder="Số điện thoại"
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                                <input
                                    type="date"
                                    value={form.birthDate}
                                    onChange={(e) =>
                                        setForm((prev) =>
                                            prev ? { ...prev, birthDate: e.target.value } : prev
                                        )
                                    }
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
                            <Button variant="outline" onClick={onClose}>
                                Hủy
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={saving || isUploading}
                                className="gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 text-white"
                            >
                                {saving || isUploading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="h-4 w-4" />
                                )}
                                {isUploading ? 'Đang tải ảnh...' : 'Lưu thay đổi'}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}