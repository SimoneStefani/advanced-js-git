const fs = require("fs");

const WorkingCopy = require("./WorkingCopy");
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
    refs: { heads: {} },
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
    addedFiles.forEach((p) => update_index(p, { add: true }));
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
      filesToRm.forEach((p) => update_index(p, { remove: true }));
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
const commit = (opts) => {
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
        conflictedPaths.map((p) => "U " + p).join("\n") +
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
        fs.unlinkSync(Files.enkelgitPath("MERGE_MSG"));
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
const branch = (name) => {
  Files.assertInRepo();

  if (name === undefined) {
    // If no branch name was passed, list the local branches.
    return (
      Object.keys(Refs.localHeads())
        .map((branch) => {
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
 * Changes the index, working copy and HEAD to reflect the
 * content of ref. ref might be a branch name or a commit hash.
 *
 * @param {String} ref
 * @param {Any} _
 */
const checkout = (ref, _) => {
  Files.assertInRepo();
  Config.assertNotBare();

  // Get the hash of the commit to check out.
  var toHash = Refs.hash(ref);

  if (!Objects.exists(toHash)) {
    // Abort if ref cannot be found.
    throw new Error(ref + " did not match any file(s) known to Enkelgit");
  } else if (Objects.type(Objects.read(toHash)) !== "commit") {
    // Abort if the hash to check out points to an object that is a not a commit.
    throw new Error("reference is not a tree: " + ref);
  } else if (
    ref === Refs.headBranchName() ||
    ref === Files.read(Files.enkelgitPath("HEAD"))
  ) {
    // Abort if ref is the name of the branch currently checked out.
    // Abort if head is detached, ref is a commit hash and HEAD is
    // pointing at that hash.
    return "Already on " + ref;
  } else {
    var paths = Diff.changedFilesCommitWouldOverwrite(toHash);
    if (paths.length > 0) {
      // Get a list of files changed in the working copy.
      // Get a list of the files that are different in the
      // head commit and the commit to check out. If any files
      // appear in both lists then abort.
      throw new Error(
        "local changes would be lost\n" + paths.join("\n") + "\n"
      );
    } else {
      // Otherwise, perform the checkout.
      process.chdir(Files.workingCopyPath());

      // If the ref is in the objects directory, it must be a
      // hash and so this checkout is detaching the head.
      var isDetachingHead = Objects.exists(ref);

      // Get the list of differences between the current commit
      // and the commit to check out. Write them to the working copy.
      WorkingCopy.write(Diff.diff(Refs.hash("HEAD"), toHash));

      // Write the commit being checked out to HEAD. If the head is
      // being detached, the commit hash is written directly to the HEAD file.
      // If the head is not being detached, the branch being checked out is
      // written to HEAD.
      Refs.write(
        "HEAD",
        isDetachingHead ? toHash : "ref: " + Refs.toLocalRef(ref)
      );

      // Set the index to the contents of the commit being checked out.
      Index.write(Index.tocToIndex(Objects.commitToc(toHash)));

      // Report the result of the checkout.
      return isDetachingHead
        ? "Note: checking out " + toHash + "\nYou are in detached HEAD state."
        : "Switched to branch " + ref;
    }
  }
};

/**
 * Shows the changes required to go from the ref1 commit to the ref2 commit.
 *
 * @param {String} ref1
 * @param {String} ref2
 */
const diff = (ref1, ref2) => {
  Files.assertInRepo();
  Config.assertNotBare();

  if (ref1 !== undefined && Refs.hash(ref1) === undefined) {
    // Abort if ref1 was supplied, but it does not resolve to a hash.
    throw new Error("ambiguous argument " + ref1 + ": unknown revision");
  } else if (ref2 !== undefined && Refs.hash(ref2) === undefined) {
    // Abort if ref2 was supplied, but it does not resolve to a hash.
    throw new Error("ambiguous argument " + ref2 + ": unknown revision");
  } else {
    // Otherwise, perform diff. Enkelgit only shows the name of each changed
    // file and whether it was added, modified or deleted. For simplicity,
    // the changed content is not shown. The diff happens between two versions
    // of the repository. The first version is either the hash that ref1 resolves
    // to, or the index. The second version is either the hash that ref2 resolves
    // to, or the working copy.
    var nameToStatus = Diff.nameStatus(
      Diff.diff(Refs.hash(ref1), Refs.hash(ref2))
    );

    // Show the path of each changed file.
    return (
      Object.keys(nameToStatus)
        .map((path) => nameToStatus[path] + " " + path)
        .join("\n") + "\n"
    );
  }
};

/**
 * Records the locations of remote versions of this repository.
 *
 * @param {String} command
 * @param {String} name
 * @param {String} path
 */
const remote = (command, name, path) => {
  Files.assertInRepo();

  if (command !== "add") {
    // Abort if command is not “add”. Only “add” is supported.
    throw new Error("unsupported");
  } else if (name in Config.read()["remote"]) {
    // Abort if repository already has a record for a remote called name.
    throw new Error("remote " + name + " already exists");
  } else {
    // Otherwise, add remote record. Write to the config file a record
    // of the name and path of the remote.
    Config.write(Utils.setIn(Config.read(), ["remote", name, "url", path]));
    return "\n";
  }
};

/**
 * Records the commit that branch is at on remote. It
 * does not change the local branch.
 *
 * @param {String} remote
 * @param {String} branch
 */
const fetch = (remote, branch) => {
  Files.assertInRepo();

  if (remote === undefined || branch === undefined) {
    // Abort if a remote or branch not passed.
    throw new Error("unsupported");
  } else if (!(remote in Config.read().remote)) {
    // Abort if remote not recorded in config file.
    throw new Error(remote + " does not appear to be a git repository");
  } else {
    // Get the location of the remote.
    const remoteUrl = Config.read().remote[remote].url;

    // Turn the unqualified branch name into a qualified
    // remote ref eg [branch] -> refs/remotes/[remote]/[branch]
    const remoteRef = Refs.toRemoteRef(remote, branch);

    // Go to the remote repository and get the hash of
    // the commit that branch is on.
    const newHash = Utils.onRemote(remoteUrl)(Refs.hash, branch);

    if (newHash === undefined) {
      // Abort if branch did not exist on the remote.
      throw new Error("couldn't find remote ref " + branch);
    } else {
      // Otherwise, perform the fetch. Note down the hash of the commit
      // this repository currently thinks the remote branch is on.
      const oldHash = Refs.hash(remoteRef);

      // Get all the objects in the remote objects directory and write them.
      // to the local objects directory. (This is an inefficient way of
      // getting all the objects required to recreate locally the commit the
      // remote branch is on)
      const remoteObjects = Utils.onRemote(remoteUrl)(Objects.allObjects);
      remoteObjects.forEach(Objects.write);

      // Set the contents of the file at .enkelgit/refs/remotes/[remote]/[branch]
      // to newHash, the hash of the commit that the remote branch is on.
      update_ref(remoteRef, newHash);

      // Record the hash of the commit that the remote branch is on in FETCH_HEAD.
      // (The user can call enkelgit merge FETCH_HEAD to merge the remote version
      // of the branch into their local branch.
      Refs.write(
        "FETCH_HEAD",
        newHash + " branch " + branch + " of " + remoteUrl
      );

      // Report the result of the fetch.
      return (
        [
          "From " + remoteUrl,
          "Count " + remoteObjects.length,
          branch +
            " -> " +
            remote +
            "/" +
            branch +
            (Merge.isAForceFetch(oldHash, newHash) ? " (forced)" : ""),
        ].join("\n") + "\n"
      );
    }
  }
};

/**
 * Finds the set of differences between the commit that the currently
 * checked out branch is on and the commit that ref points to. It
 * finds or creates a commit that applies these differences to the
 * checked out branch.
 *
 * @param {String} ref
 */
const merge = (ref) => {
  Files.assertInRepo();
  Config.assertNotBare();

  // Get the receiverHash, the hash of the commit that the
  // current branch is on.
  var receiverHash = Refs.hash("HEAD");

  // Get the giverHash, the hash for the commit to merge
  // into the receiver commit.
  var giverHash = Refs.hash(ref);

  if (Refs.isHeadDetached()) {
    // Abort if head is detached. Merging into a detached
    // head is not supported.
    throw new Error("unsupported");
  } else if (
    giverHash === undefined ||
    Objects.type(Objects.read(giverHash)) !== "commit"
  ) {
    // Abort if ref did not resolve to a hash, or if that
    // hash is not for a commit object.
    throw new Error(ref + ": expected commit type");
  } else if (Objects.isUpToDate(receiverHash, giverHash)) {
    // Do not merge if the current branch - the receiver - already
    // has the giver’s changes. This is the case if the receiver
    // and giver are the same commit, or if the giver is an
    // ancestor of the receiver.
    return "Already up-to-date";
  } else {
    var paths = Diff.changedFilesCommitWouldOverwrite(giverHash);
    // Get a list of files changed in the working copy. Get a
    // list of the files that are different in the receiver
    // and giver. If any files appear in both lists then abort.
    if (paths.length > 0) {
      throw new Error(
        "local changes would be lost\n" + paths.join("\n") + "\n"
      );
    } else if (Merge.canFastForward(receiverHash, giverHash)) {
      // If the receiver is an ancestor of the giver, a fast forward
      // is performed. This is possible because there is already a
      // commit that incorporates all of the giver’s changes into
      // the receiver.
      Merge.writeFastForwardMerge(receiverHash, giverHash);
      return "Fast-forward";
    } else {
      // If the receiver is not an ancestor of the giver, a
      // merge commit must be created.
      // The repository is put into the merge state. The MERGE_HEAD
      // file is written and its contents set to giverHash. The MERGE_MSG
      // file is written and its contents set to a boilerplate merge
      // commit message. A merge diff is created that will turn the
      // contents of receiver into the contents of giver. This contains
      // the path of every file that is different and whether it was added,
      // removed or modified, or is in conflict. Added files are added to
      // the index and working copy. Removed files are removed from the
      // index and working copy. Modified files are modified in the index
      // and working copy. Files that are in conflict are written to the
      // working copy to include the receiver and giver versions. Both the
      // receiver and giver versions are written to the index.
      Merge.writeNonFastForwardMerge(receiverHash, giverHash, ref);

      if (Merge.hasConflicts(receiverHash, giverHash)) {
        // If there are any conflicted files, a message is shown to say
        // that the user must sort them out before the merge can be completed.
        return "Automatic merge failed. Fix conflicts and commit the result.";
      } else {
        // If there are no conflicted files, a commit is created from the
        // merged changes and the merge is over.
        return commit();
      }
    }
  }
};

/**
 * Fetches the commit that branch is on at remote.
 * It merges that commit into the current branch.
 *
 * @param {String} remote
 * @param {String} branch
 */
const pull = (remote, branch) => {
  Files.assertInRepo();
  Config.assertNotBare();

  fetch(remote, branch);
  return merge("FETCH_HEAD");
};

/**
 * Gets the commit that branch is on in the local repo
 * and points branch on remote at the same commit.
 *
 * @param {String} remote
 * @param {String} branch
 * @param {Object} opts
 */
const push = (remote, branch, opts = {}) => {
  Files.assertInRepo();

  if (remote === undefined || branch === undefined) {
    // Abort if a remote or branch not passed.
    throw new Error("unsupported");
  } else if (!(remote in Config.read().remote)) {
    // Abort if remote not recorded in config file.
    throw new Error(remote + " does not appear to be a git repository");
  } else {
    var remotePath = Config.read().remote[remote].url;
    var remoteCall = Utils.onRemote(remotePath);

    if (remoteCall(Refs.isCheckedOut, branch)) {
      // Abort if remote repository is not bare and branch is checked out.
      throw new Error("refusing to update checked out branch " + branch);
    } else {
      // Get receiverHash, the hash of the commit that branch is on at remote.
      var receiverHash = remoteCall(Refs.hash, branch);

      // Get giverHash, the hash of the commit that branch is on at
      // the local repository.
      var giverHash = Refs.hash(branch);

      if (Objects.isUpToDate(receiverHash, giverHash)) {
        // Do nothing if the remote branch - the receiver - has already
        // incorporated the commit that giverHash points to. This is the
        // case if the receiver commit and giver commit are the same, or
        // if the giver commit is an ancestor of the receiver commit.
        return "Already up-to-date";
      } else if (!opts.f && !Merge.canFastForward(receiverHash, giverHash)) {
        // Abort if branch on remote cannot be fast forwarded to the commit
        // that giverHash points to. A fast forward can only be done if the
        // receiver commit is an ancestor of the giver commit.
        throw new Error("failed to push some refs to " + remotePath);
      } else {
        // Otherwise, do the push. Put all the objects in the local objects
        // directory into the remote objects directory.
        Objects.allObjects().forEach(function (o) {
          remoteCall(objects.write, o);
        });

        // Point branch on remote at giverHash.
        remoteCall(update_ref(), Refs.toLocalRef(branch), giverHash);

        // Set the local repo’s record of what commit branch is on at remote
        // to giverHash (since that is what it is now is).
        update_ref(refs.toRemoteRef(remote, branch), giverHash);

        // Report the result of the push.
        return (
          [
            "To " + remotePath,
            "Count " + Objects.allObjects().length,
            branch + " -> " + branch,
          ].join("\n") + "\n"
        );
      }
    }
  }
};

const clone = (remotePath, targetPath, opts = {}) => {
  if (remotePath === undefined || targetPath === undefined) {
    // Abort if a remotePath or targetPath not passed.
    throw new Error("you must specify remote path and target path");
  } else if (
    !fs.existsSync(remotePath) ||
    !Utils.onRemote(remotePath)(Files.inRepo)
  ) {
    // Abort if remotePath does not exist, or is not a Enkelgit repository.
    throw new Error("repository " + remotePath + " does not exist");
  } else if (
    fs.existsSync(targetPath) &&
    fs.readdirSync(targetPath).length > 0
  ) {
    // Abort if targetPath exists and is not empty.
    throw new Error(targetPath + " already exists and is not empty");
  } else {
    // Otherwise, do the clone.
    remotePath = nodePath.resolve(process.cwd(), remotePath);

    // If targetPath doesn’t exist, create it.
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath);
    }

    // In the directory for the new remote repository…
    Utils.onRemote(targetPath)(function () {
      // Initialize the directory as a Enkelgit repository.
      init(opts);

      // Set up remotePath as a remote called “origin”.
      remote("add", "origin", nodePath.relative(process.cwd(), remotePath));

      // Get the hash of the commit that master is pointing
      // at on the remote repository.
      var remoteHeadHash = Utils.onRemote(remotePath)(Refs.hash, "master");

      // If the remote repo has any commits, that hash will exist.
      // The new repository records the commit that the passed branch
      // is at on the remote. It then sets master on the new repository
      // to point at that commit.
      if (remoteHeadHash !== undefined) {
        fetch("origin", "master");
        Merge.writeFastForwardMerge(undefined, remoteHeadHash);
      }
    });

    // Report the result of the clone.
    return "Cloning into " + targetPath;
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
const status = (_) => {
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
const write_tree = (_) => {
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
  branch,
  checkout,
  diff,
  remote,
  fetch,
  merge,
  pull,
  push,
  clone,
};
