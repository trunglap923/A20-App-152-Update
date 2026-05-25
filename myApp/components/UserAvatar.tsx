import { useState } from "react"

export default function UserAvatar({ fullName, avatarUrl }: { fullName: string; avatarUrl?: string }) {
    const [imgError, setImgError] = useState(false)

    const showFallback = !avatarUrl || imgError

    return (
        <div className="h-10 w-10 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
            {showFallback ? (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-100 to-indigo-100 text-sm font-semibold text-slate-700">
                    {fullName.charAt(0).toUpperCase()}
                </div>
            ) : (
                <img
                    src={avatarUrl}
                    alt={fullName}
                    className="h-full w-full object-cover"
                    onError={() => setImgError(true)}
                />
            )}
        </div>
    )
}