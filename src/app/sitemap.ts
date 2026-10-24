import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const routes = [
    { path: "/", priority: 1, changeFrequency: "monthly" as const },
    { path: "/practice", priority: 0.9, changeFrequency: "weekly" as const },
    { path: "/sounds", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/grammar", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/pricing", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/connector", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "/newsletter", priority: 0.4, changeFrequency: "yearly" as const },
    { path: "/support", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/privacy", priority: 0.5, changeFrequency: "yearly" as const },
    { path: "/terms", priority: 0.5, changeFrequency: "yearly" as const },
  ];

  return routes.map((r) => ({
    url: `${appUrl}${r.path}`,
    lastModified: new Date(),
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
