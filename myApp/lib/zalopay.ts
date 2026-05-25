import CryptoJS from 'crypto-js'
import { APP_BASE_URL } from './env'

export const zaloConfig = {
    app_id: Number(process.env.ZALOPAY_APP_ID),
    key1: process.env.ZALOPAY_KEY1!,
    key2: process.env.ZALOPAY_KEY2!,
    endpoint: process.env.ZALOPAY_CREATE_ORDER_URL!,
}

type CreateOrderInput = {
    amount: number
    orderCode: string
    description: string
    userId?: string
}

export async function createZaloOrder({
    amount,
    orderCode,
    description,
    userId,
}: CreateOrderInput) {
    const appBase = APP_BASE_URL || ''
    const app_time = Date.now()

    // format đúng của ZaloPay: yymmdd_transid
    const yy = new Date().getFullYear().toString().slice(-2)
    const mm = String(new Date().getMonth() + 1).padStart(2, '0')
    const dd = String(new Date().getDate()).padStart(2, '0')
    const app_trans_id = `${yy}${mm}${dd}_${orderCode}`

    const embed_data = JSON.stringify({
        redirecturl: `${appBase}/payment/success`,
    })

    const item = JSON.stringify([])

    const order = {
        app_id: zaloConfig.app_id,
        app_user: userId || 'user',
        app_time,
        amount,
        app_trans_id,
        embed_data,
        item,
        description,
        bank_code: '',
        callback_url: `${appBase}/api/payment/zalopay/callback`,
    }

    const data =
        `${order.app_id}|${order.app_trans_id}|${order.app_user}|${order.amount}|${order.app_time}|${order.embed_data}|${order.item}`

    const mac = CryptoJS.HmacSHA256(data, zaloConfig.key1).toString()

    const body = new URLSearchParams({
        ...Object.entries(order).reduce<Record<string, string>>((acc, [key, value]) => {
            acc[key] = String(value)
            return acc
        }, {}),
        mac,
    })

    const response = await fetch(zaloConfig.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
    })

    const result = await response.json()
    return result
}
