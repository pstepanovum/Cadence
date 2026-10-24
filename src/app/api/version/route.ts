// FILE: src/app/api/version/route.ts
//
// Latest and minimum supported versions per product, from the committed
// release manifest (release/manifest.json, written by scripts/release/bump.mjs).
// The mobile app reads it to show "Update available" below `ios.latest` and a
// blocking screen below `ios.minimumBuild`. Public: it names versions only.
import manifest from "../../../../release/manifest.json";

export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      web: manifest.web,
      desktop: {
        latest: manifest.desktop.latest,
        minimum: manifest.desktop.minimum,
        url: manifest.desktop.url,
      },
      ios: {
        latest: manifest.ios.latest,
        minimumBuild: manifest.ios.minimumBuild,
        appStoreUrl: manifest.ios.appStoreUrl,
      },
    },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
