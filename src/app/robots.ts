import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/practice", "/sounds", "/grammar", "/pricing", "/connector", "/newsletter", "/support", "/download", "/login", "/signup", "/privacy", "/terms"],
        disallow: [
          "/dashboard",
          "/learn",
          "/coach",
          "/conversation",
          "/onboarding",
          "/reset-password",
          "/api/",
        ],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
