import type { Category } from "./git.ts";

const DOC_EXT = /\.(md|mdx|markdown|rst|adoc|txt)$/i;
const DOC_NAME = /^(readme|changelog|license|contributing|authors|notice|copying)(\.|$)/i;
const DOC_DIR = /(^|\/)docs?\//i;
const TEST_DIR = /(^|\/)(tests?|__tests__|__snapshots__|spec|specs|e2e|fixtures?|testdata|test-data|mocks?|__mocks__)\//i;
const TEST_NAME = /(\.(test|spec|e2e)\.[^/]+$)|(_test\.(go|py|rb|exs?)$)|(^test_[^/]+\.py$)|(_spec\.rb$)|(Tests?\.(java|kt|cs|swift)$)|(\.snap$)/;
const LOCKFILE = /^(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|deno\.lock|cargo\.lock|go\.sum|flake\.lock|poetry\.lock|uv\.lock|gemfile\.lock|composer\.lock|pipfile\.lock)$/i;
const CONFIG_NAME = /^(package\.json|tsconfig(\.[\w-]+)?\.json|jsconfig\.json|dockerfile|makefile|justfile|\.gitignore|\.gitattributes|\.editorconfig|\.npmrc|\.nvmrc|\.env\.example|codeowners)$/i;
const CONFIG_EXT = /\.(json|jsonc|ya?ml|toml|ini|cfg|conf|properties|lock)$/i;
const CONFIG_DIR = /(^|\/)\.(github|circleci|husky|vscode|devcontainer)\//;

/**
 * Sorts a changed file into the page's filter groups by path alone. Docs win
 * over tests so a README under test/ still reads as docs.
 */
export function categorize(path: string): Category {
  const name = path.split("/").pop() ?? path;
  if (DOC_EXT.test(name) || DOC_NAME.test(name) || (DOC_DIR.test(path) && !/\.(ts|tsx|js|jsx|py|go|rs)$/.test(name))) {
    return "docs";
  }
  if (TEST_DIR.test(path) || TEST_NAME.test(name)) {
    return "test";
  }
  if (LOCKFILE.test(name) || CONFIG_NAME.test(name) || CONFIG_DIR.test(path) || CONFIG_EXT.test(name)) {
    return "config";
  }
  return "impl";
}
