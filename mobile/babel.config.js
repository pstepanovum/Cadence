/* global __dirname */
// Expo's preset, plus one rewrite: `import { Check } from "lucide-react-native"`
// becomes `import Check from "lucide-react-native/icons/check"`. Metro does
// not tree-shake, so the barrel put every lucide icon (about 1.2 MB) into the
// bundle for the fifty or so the app draws.
const fs = require("fs");
const path = require("path");

let iconFiles = null;

/** Exported name to icon file, read from the package's own barrel. */
function lucideIcons() {
  if (iconFiles) return iconFiles;
  iconFiles = new Map();
  const barrel = path.join(__dirname, "node_modules/lucide-react-native/dist/esm/lucide-react-native.mjs");
  const source = fs.readFileSync(barrel, "utf8");
  for (const match of source.matchAll(/export \{([^}]+)\} from '\.\/icons\/([^']+)\.mjs';/g)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().replace(/^default as /, "");
      if (name) iconFiles.set(name, match[2]);
    }
  }
  return iconFiles;
}

function lucideImports({ types: t }) {
  return {
    visitor: {
      ImportDeclaration(nodePath) {
        if (nodePath.node.source.value !== "lucide-react-native" || nodePath.node.importKind === "type") return;
        const icons = lucideIcons();
        const kept = [];
        const direct = [];
        for (const specifier of nodePath.node.specifiers) {
          const imported = specifier.type === "ImportSpecifier" ? specifier.imported.name : null;
          const file = imported && specifier.importKind !== "type" ? icons.get(imported) : null;
          if (file) direct.push(t.importDeclaration([t.importDefaultSpecifier(t.identifier(specifier.local.name))], t.stringLiteral(`lucide-react-native/icons/${file}`)));
          else kept.push(specifier);
        }
        if (direct.length === 0) return;
        if (kept.length > 0) nodePath.insertAfter(t.importDeclaration(kept, t.stringLiteral("lucide-react-native")));
        nodePath.replaceWithMultiple(direct);
      },
    },
  };
}

module.exports = function config(api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [lucideImports],
  };
};
