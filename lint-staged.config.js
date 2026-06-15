export default {
  '*.md': 'prettier --write',
  '*.{js,json,ts}': 'biome format --fix --no-errors-on-unmatched',
  '*.{js,ts}': 'biome lint --fix --no-errors-on-unmatched',
};
