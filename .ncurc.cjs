module.exports = {
  target: (packageName) => {
    if (packageName === '@types/node') {
      return 'minor';
    }

    return 'latest';
  },
};
