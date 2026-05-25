'use client'

import 'react-toastify/dist/ReactToastify.css'
import { ToastContainer, type ToastContainerProps } from 'react-toastify'

export function ToastProvider() {
  const toastClassName: ToastContainerProps['toastClassName'] = (context) => {
    const type = context?.type ?? 'default'
    if (type === 'success') return 'app-toast app-toast--success'
    if (type === 'error') return 'app-toast app-toast--error'
    return 'app-toast app-toast--default'
  }

  return (
    <ToastContainer
      position="top-right"
      autoClose={3000}
      hideProgressBar
      newestOnTop
      closeOnClick
      pauseOnHover={false}
      draggable={false}
      toastClassName={toastClassName}
    />
  )
}
