"use client";

import dynamic from "next/dynamic";

const Signer = dynamic(() => import("./Signer"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-500 font-medium">Loading Signer...</p>
      </div>
    </div>
  ),
});

export default function Home() {
  return <Signer />;
}