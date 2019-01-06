const fs = require("fs");

const Objects = require("./Objects");
const Config = require("./Config");
const Status = require("./Status");
const Files = require("./Files");
const Merge = require("./Merge");
const Index = require("./Index");
const Utils = require("./Utils");
const Diff = require("./Diff");
const Refs = require("./Refers");
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

/**
 * Removes files that match path from the index.
 *
 * @param {String} path
 * @param {Object} opts
 */
const rm = (path, opts = {}) => {
  Files.assertInRepo();
  Config.assertNotBare();

  // Get the paths of all files in the index that match path.
  const filesToRm = Index.matchingFiles(path);

  if (opts.f) {
    // Abort if -f was passed. The removal of files with
    // changes is not supported.
    throw new Error("unsupported");
  } else if (filesToRm.length === 0) {
    // Abort if no files matched path.
    throw new Error(Files.pathFromRepoRoot(path) + " did not match any files");
  } else if (
    fs.existsSync(path) &&
    fs.statSync(path).isDirectory() &&
    !opts.r
  ) {
    // Abort if path is a directory and -r was not passed.
    throw new Error("not removing " + path + " recursively without -r");
  } else {
    // Get a list of all files that are to be removed and have also
    // been changed on disk. If this list is not empty then abort.
    var changesToRm = Utils.intersection(
      Diff.addedOrModifiedFiles(),
      filesToRm
    );

    if (changesToRm.length > 0) {
      throw new Error(
        "these files have changes:\n" + changesToRm.join("\n") + "\n"
      );
    } else {
      // Otherwise, remove the files that match path. Delete them from
      // disk and remove from the index.
      filesToRm
        .map(Files.workingCopyPath())
        .filter(fs.existsSync)
        .forEach(fs.unlinkSync);
      filesToRm.forEach(p => update_index(p, { remove: true }));
    }
  }
};

/**
 * Creates a commit object that represents the current state
 * of the index, writes the commit to the objects directory
 * and points HEAD at the commit.
 *
 * @param {Object} opts
 */
const commit = opts => {
  Files.assertInRepo();
  Config.assertNotBare();

  // Write a tree set of tree objects that represent
  // the current state of the index.
  const treeHash = write_tree();
  const headDesc = Refs.isHeadDetached()
    ? "detached HEAD"
    : Refs.headBranchName();

  if (
    Refs.hash("HEAD") !== undefined &&
    treeHash === Objects.treeHash(Objects.read(Refs.hash("HEAD")))
  ) {
    // Compare the hash of the tree object at the top of the tree that was
    // just written with the hash of the tree object that the HEAD commit
    // points at. If they are the same, abort because there is nothing new to commit.
    throw new Error(
      "# On " + headDesc + "\nnothing to commit, working directory clean"
    );
  } else {
    const conflictedPaths = Index.conflictedPaths();
    if (Merge.isMergeInProgress() && conflictedPaths.length > 0) {
      // Abort if the repository is in the merge state and there are
      // unresolved merge conflicts.
      throw new Error(
        conflictedPaths.map(p => "U " + p).join("\n") +
          "\ncannot commit because you have unmerged files\n"
      );
    } else {
      // If the repository is in the merge state, use a pre-written merge
      // commit message. If the repository is not in the merge state,
      // use the message passed with -m.
      const m = Merge.isMergeInProgress()
        ? Files.read(Files.enkelgitPath("MERGE_MSG"))
        : opts.m;

      // Write the new commit to the objects directory.
      const commitHash = Objects.writeCommit(
        treeHash,
        m,
        Refs.commitParentHashes()
      );

      // Point HEAD at new commit.
      update_ref("HEAD", commitHash);

      if (Merge.isMergeInProgress()) {
        // If MERGE_HEAD exists, the repository was in the merge state.
        // Remove MERGE_HEAD and MERGE_MSGto exit the merge state.
        // Report that the merge is complete.
        fs.unlinkSync(Files.gitletPath("MERGE_MSG"));
        Refs.rm("MERGE_HEAD");
        return "Merge made by the three-way strategy";
      } else {
        // Repository was not in the merge state, so just report that
        // the commit is complete.
        return "[" + headDesc + " " + commitHash + "] " + m;
      }
    }
  }
};

/**
 * Creates a new branch that points at the commit that HEAD points at.
 *
 * @param {String} name
 */
const branch = name => {
  Files.assertInRepo();

  if (name === undefined) {
    // If no branch name was passed, list the local branches.
    return (
      Object.keys(Refs.localHeads())
        .map(branch => {
          return (branch === Refs.headBranchName() ? "* " : "  ") + branch;
        })
        .join("\n") + "\n"
    );
  } else if (Refs.hash("HEAD") === undefined) {
    // HEAD is not pointing at a commit, so there is no commit
    // for the new branch to point at. Abort. This is most likely
    // to happen if the repository has no commits.
    throw new Error(Refs.headBranchName() + " not a valid object name");
  } else if (Refs.exists(Refs.toLocalRef(name))) {
    // Abort because a branch called name already exists.
    throw new Error("A branch named " + name + " already exists");
  } else {
    // Otherwise, create a new branch by creating a new file called
    // name that contains the hash of the commit that HEAD points at.
    update_ref(Refs.toLocalRef(name), Refs.hash("HEAD"));
  }
};

/**
 * Reports the state of the repo: the current branch,
 * untracked files, conflicted files, files that are
 * staged to be committed and files that are not staged
 * to be committed.
 *
 * @param {Any} _
 */
const status = _ => {
  Files.assertInRepo();
  Config.assertNotBare();
  return Status.toString();
};

/**
 * Adds the contents of the file at path to the index,
 * or removes the file from the index.
 *
 * @param {String} path
 * @param {Object} opts
 */
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

/**
 * Takes the content of the index and stores a tree object
 * that represents that content to the objects directory.
 *
 * @param {Any} _
 */
const write_tree = _ => {
  Files.assertInRepo();
  return Objects.writeTree(Files.nestFlatTree(Index.toc()));
};

/**
 * Gets the hash of the commit that refToUpdateTo points
 * at and sets refToUpdate to point at the same hash.
 *
 * @param {String} refToUpdate
 * @param {String} refToUpdateTo
 * @param {Any} _
 */
const update_ref = (refToUpdate, refToUpdateTo, _) => {
  Files.assertInRepo();

  // Get the hash that refToUpdateTo points at.
  var hash = Refs.hash(refToUpdateTo);

  if (!Objects.exists(hash)) {
    // Abort if refToUpdateTo does not point at a hash.
    throw new Error(refToUpdateTo + " not a valid SHA1");
  } else if (!Refs.isRef(refToUpdate)) {
    // Abort if refToUpdate does not match the syntax of a ref.
    throw new Error("cannot lock the ref " + refToUpdate);
  } else if (Objects.type(Objects.read(hash)) !== "commit") {
    // Abort if hash points to an object in the objects directory
    // that is not a commit.
    var branch = Refs.terminalRef(refToUpdate);
    throw new Error(
      branch + " cannot refer to non-commit object " + hash + "\n"
    );
  } else {
    // Otherwise, set the contents of the file that the
    // ref represents to hash.
    Refs.write(Refs.terminalRef(refToUpdate), hash);
  }
};

module.exports = {
  init,
  add,
  rm,
  status,
  commit,
  branch
};
