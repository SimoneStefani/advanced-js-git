const Config = require("../src/Config");
const Files = require("../src/Files");
const CLI = require("../src/CLI");

const init = (opts = {}) => {
  if (Files.inRepo()) {
    CLI.error("This EnkelGit repository is already initialized!");
  }

  var enkelgitStructure = {
    HEAD: "ref: refs/heads/master\n",
    config: Config.objToStr({ core: { "": { bare: opts.bare === true } } }),

    objects: {},
    refs: {
      heads: {}
    }
  };

  Files.writeFilesFromTree(
    opts.bare ? enkelgitStructure : { ".enkelgit": enkelgitStructure },
    process.cwd()
  );
};
