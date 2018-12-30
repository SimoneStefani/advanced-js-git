const Config = require("../src/Config");
const Files = require("../src/Files");
const CLI = require("../src/CLI");

/**
 * Initializes the current directory as a new repository.
 *
 * @param {Object} opts
 */
const init = (opts = {}) => {
  // Abort if already a repository.
  if (Files.inRepo()) {
    CLI.error("This EnkelGit repository is already initialized!");
  }

  // Create a JS object that mirrors the Git basic directory structure.
  // If --bare was passed, write to the Git config indicating that the
  // repository is bare. If --bare was not passed, write to the Git
  // config saying the repository is not bare.
  let enkelgitStructure = {
    HEAD: "ref: refs/heads/master\n",
    config: Config.objToStr({ core: { "": { bare: opts.bare === true } } }),
    objects: {},
    refs: { heads: {} }
  };

  // Write the standard Git directory structure using the enkelStructure
  // JS object. If the repository is not bare, put the directories inside
  // the .enkelgit directory. If the repository is bare, put them in the
  // top level of the repository.
  Files.writeFilesFromTree(
    opts.bare ? enkelgitStructure : { ".enkelgit": enkelgitStructure },
    process.cwd()
  );
};

module.exports = {
  init
};
