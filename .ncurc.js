import { defineConfig } from 'npm-check-updates';

export default defineConfig({
  target: (packageName) => {
    if (packageName === '@types/node' || packageName === 'cdk-nag') {
      return 'minor';
    }

    return 'latest';
  },
});
