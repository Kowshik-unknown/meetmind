"use client";

import dynamic from "next/dynamic";

// WebGL only exists in the browser.
const NeuralBackground = dynamic(() => import("./NeuralBackground"), { ssr: false });

export default function BackgroundLoader() {
  return <NeuralBackground />;
}
