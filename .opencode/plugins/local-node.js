// OpenCode's scheduler starts without the interactive shell's NVM setup.
const localNode = async () => ({
  'shell.env': async (_input, output) => {
    output.env.PATH = [
      '/Users/kartikarora/.nvm/versions/node/v22.23.2/bin',
      output.env.PATH || process.env.PATH,
    ].filter(Boolean).join(':');
  },
});

export default localNode;
