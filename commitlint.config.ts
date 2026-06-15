import type { SyncRule, UserConfig } from '@commitlint/types';

const noAiReferences: SyncRule = (parsed) => {
  const { body, footer, header } = parsed;
  const content = [body, footer, header].filter((s) => s !== null).join('\n');

  return [
    !/claude(?!\.md)|ai assistance/i.test(content),
    'Commit message must not reference Claude, Claude Code, or AI assistance',
  ];
};

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'no-ai-references': noAiReferences,
      },
    },
  ],
  rules: {
    'no-ai-references': [2, 'always'],
  },
} satisfies UserConfig;
