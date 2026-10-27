"use client";

import { motion } from "framer-motion";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#5ee7ff" />
          <stop offset="0.5" stopColor="#8b7bff" />
          <stop offset="1" stopColor="#ff5fd2" />
        </linearGradient>
      </defs>
      <motion.circle
        cx="16"
        cy="16"
        r="14"
        stroke="url(#lg)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        animate={{ rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
        style={{ originX: "50%", originY: "50%" }}
      />
      {[6, 10, 14, 18, 22, 26].map((x, i) => (
        <motion.rect
          key={x}
          x={x - 1}
          width="2"
          rx="1"
          fill="url(#lg)"
          initial={{ height: 4, y: 14 }}
          animate={{ height: [4, 10 + (i % 3) * 3, 4], y: [14, 11 - (i % 3) * 1.5, 14] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
        />
      ))}
    </svg>
  );
}
