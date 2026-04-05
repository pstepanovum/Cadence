import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/signup", "/forgot-password", "/help", "/contact", "/privacy", "/terms"],
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
