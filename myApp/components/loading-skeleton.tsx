'use client'

import { motion } from 'framer-motion'

export function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center gap-4">
        <motion.div
          className="h-10 w-10 rounded-xl bg-muted"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <div className="space-y-2">
          <motion.div
            className="h-4 w-32 rounded-lg bg-muted"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: 0.1 }}
          />
          <motion.div
            className="h-3 w-24 rounded-lg bg-muted"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
          />
        </div>
      </div>

      {/* Content skeletons */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <motion.div
          className="mb-4 h-5 w-24 rounded-lg bg-muted"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <motion.div
              key={i}
              className="h-4 rounded-lg bg-muted"
              style={{ width: `${100 - i * 10}%` }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1 }}
            />
          ))}
        </div>
      </div>

      {/* Cards skeleton */}
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2].map((i) => (
          <motion.div
            key={i}
            className="rounded-2xl border border-border bg-card p-6"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
          >
            <div className="mb-4 h-8 w-8 rounded-lg bg-muted" />
            <div className="mb-2 h-5 w-3/4 rounded-lg bg-muted" />
            <div className="space-y-2">
              <div className="h-3 w-full rounded-lg bg-muted" />
              <div className="h-3 w-5/6 rounded-lg bg-muted" />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
