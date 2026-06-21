module.exports = {
  target: (packageName) => {
    if (packageName === '@types/node' || packageName === 'cdk-nag') {
      return 'minor';
    }

    return 'latest';
  },
};
