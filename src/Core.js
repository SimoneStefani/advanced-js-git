const fs = require("fs");

const Config = require("./Config");
const Files = require("./Files");
const Index = require("./Index");
const CLI = require("./CLI");

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

/**
 * Adds files that match path to the index.
 *
 * @param {String} path
 * @param {Any} _
 */
const add = (path, _) => {
  Files.assertInRepo();
  Config.assertNotBare();

  // Get the paths of all the files matching path.
  const addedFiles = Files.lsRecursive(path);

  // Abort if no files matched path. Otherwise, use the update_index()
  // Git command to actually add the files.
  if (addedFiles.length === 0) {
    throw new Error(Files.pathFromRepoRoot(path) + " did not match any files");
  } else {
    addedFiles.forEach(p => update_index(p, { add: true }));
  }
};

const update_index = (path, opts = {}) => {
  Files.assertInRepo();
  Config.assertNotBare();

  const pathFromRoot = Files.pathFromRepoRoot(path);
  const isOnDisk = fs.existsSync(path);
  const isInIndex = Index.hasFile(path, 0);

  // Abort if path is a directory. update_index() only handles single files.
  if (isOnDisk && fs.statSync(path).isDirectory()) {
    throw new Error(pathFromRoot + " is a directory - add files inside\n");
  } else if (opts.remove && !isOnDisk && isInIndex) {
    if (Index.isFileInConflict(path)) {
      // Abort if file is being removed and is in conflict.
      // Enkelgit doesn’t support this.
      throw new Error("unsupported");
    } else {
      // If files is being removed, is not on disk and is in
      // the index, remove it from the index.
      Index.writeRm(path);
      return "\n";
    }
  } else if (opts.remove && !isOnDisk && !isInIndex) {
    // If file is being removed, is not on disk and not in
    // the index, there is no work to do.
    return "\n";
  } else if (!opts.add && isOnDisk && !isInIndex) {
    // Abort if the file is on disk and not in the index and
    // the --add was not passed.
    throw new Error(
      "cannot add " + pathFromRoot + " to index - use --add option\n"
    );
  } else if (isOnDisk && (opts.add || isInIndex)) {
    // If file is on disk and either -add was passed or the file is
    // in the index, add the file’s current content to the index.
    Index.writeNonConflict(path, Files.read(Files.workingCopyPath(path)));
    return "\n";
  } else if (!opts.remove && !isOnDisk) {
    // Abort if the file is not on disk and --remove not passed.
    throw new Error(pathFromRoot + " does not exist and --remove not passed\n");
  }
};

module.exports = {
  init,
  add
};
