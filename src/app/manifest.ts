import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Adi Assistant",
    short_name: "Adi",
    description: "AI-powered work assistant for email and Slack",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
