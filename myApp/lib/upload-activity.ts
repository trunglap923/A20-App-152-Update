/**
 * Đồng bộ từ DocumentProcessingProvider: true khi đang upload / xử lý tài liệu
 * (dùng để không điều hướng timeout full-page trong lúc đó).
 */
export const uploadActivityRef = { current: false }

/** true khi đang ghi âm hoặc còn bản ghi chưa gửi (preview) */
export const recordingActivityRef = { current: false }
