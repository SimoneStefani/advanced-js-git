const nodePath = require("path");
const fs = require("fs");

const Config = require("./Config");
const Files = require("./Files");
const Utils = require("./Utils");

/**
 * Returns true if ref matches valid qualified ref syntax.
 *
 * @param {String} ref
 */
const isRef = ref => {
  return (
    ref !== undefined &&
    (ref.match("^refs/heads/[A-Za-z-]+$") ||
      ref.match("^refs/remotes/[A-Za-z-]+/[A-Za-z-]+$") ||
      ["HEAD", "FETCH_HEAD", "MERGE_HEAD"].indexOf(ref) !== -1)
  );
};

/**
 * Resolves ref to the most specific ref possible.
 *
 * @param {String} ref
 */
const terminalRef = ref => {
  if (ref === "HEAD" && !isHeadDetached()) {
    // If ref is “HEAD” and head is pointing at a branch, return the branch.
    return Files.read(Files.enkelgitPath("HEAD")).match(
      "ref: (refs/heads/.+)"
    )[1];
  } else if (isRef(ref)) {
    // If ref is qualified, return it.
    return ref;
  } else {
    // Otherwise, assume ref is an unqualified local ref (like master)
    // and turn it into a qualified ref (like refs/heads/master)
    return toLocalRef(ref);
  }
};

/**
 * Returns the hash that refOrHash points to.
 *
 * @param {String} refOrHash
 */
const hash = refOrHash => {
  if (Objects.exists(refOrHash)) {
    // TODO!!!
    return refOrHash;
  } else {
    const terminalRef = terminalRef(refOrHash);
    if (terminalRef === "FETCH_HEAD") {
      return fetchHeadBranchToMerge(headBranchName());
    } else if (exists(terminalRef)) {
      return Files.read(Files.enkelgitPath(terminalRef));
    }
  }
};

/**
 * Returns true if HEAD contains a commit hash, rather than the ref of a branch.
 */
const isHeadDetached = () =>
  Files.read(Files.enkelgitPath("HEAD")).match("refs") === null;

/**
 * Returns true if the repository is not bare and HEAD is pointing
 * at the branch called branch.
 *
 * @param {String} branch
 */
const isCheckedOut = branch => !Config.isBare() && headBranchName() === branch;

/**
 * Converts the branch name name into a qualified local branch ref.
 *
 * @param {String} name
 */
const toLocalRef = name => "refs/heads/" + name;

/**
 * Converts remote and branch name name into a qualified remote branch ref.
 *
 * @param {String} remote
 * @param {String} name
 */
const toRemoteRef = (remote, name) => "refs/remotes/" + remote + "/" + name;

/**
 * Sets the content of the file for the qualified ref ref to content.
 *
 * @param {String} ref
 * @param {String} content
 */
const write = (ref, content) => {
  if (isRef(ref)) {
    Files.write(Files.enkelgitPath(nodePath.normalize(ref)), content);
  }
};

/**
 * Removes the file for the qualified ref ref.
 *
 * @param {String} ref
 */
const rm = ref => {
  if (isRef(ref)) {
    fs.unlinkSync(Files.enkelgitPath(ref));
  }
};

/**
 * Reads the FETCH_HEAD file and gets the hash that the remote
 * branchName is pointing at.
 *
 * @param {String} branchName
 */
const fetchHeadBranchToMerge = branchName => {
  return Utils.lines(Files.read(Files.enkelgitPath("FETCH_HEAD")))
    .filter(l => l.match("^.+ branch " + branchName + " of"))
    .map(l => l.match("^([^ ]+) ")[1])[0];
};

/**
 * Returns a JS object that maps local branch names to the hash
 * of the commit they point to.
 */
const localHeads = () => {
  return fs
    .readdirSync(nodePath.join(Files.enkelgitPath(), "refs", "heads"))
    .reduce((o, n) => Utils.setIn(o, [n, hash(n)]), {});
};

/**
 * Returns true if the qualified ref ref exists.
 *
 * @param {String} ref
 */
const exists = ref => isRef(ref) && fs.existsSync(Files.enkelgitPath(ref));

/**
 * Returns the name of the branch that HEAD is pointing at.
 */
const headBranchName = () => {
  if (!isHeadDetached()) {
    return Files.read(Files.enkelgitPath("HEAD")).match("refs/heads/(.+)")[1];
  }
};

/**
 * Returns the array of commits that would be the parents
 * of the next commit.
 */
const commitParentHashes = () => {
  const headHash = hash("HEAD");
  if (Merge.isMergeInProgress()) {
    // TODO!!!
    // If the repository is in the middle of a merge,
    // return the hashes of the two commits being merged.
    return [headHash, hash("MERGE_HEAD")];
  } else if (headHash === undefined) {
    // If this repository has no commits, return an empty array.
    return [];
  } else {
    // Otherwise, return the hash of the commit that HEAD is
    // currently pointing at.
    return [headHash];
  }
};

module.exports = {
  isRef,
  terminalRef,
  hash,
  isHeadDetached,
  isCheckedOut,
  toLocalRef,
  toRemoteRef,
  write,
  rm,
  fetchHeadBranchToMerge,
  localHeads,
  exists,
  headBranchName,
  commitParentHashes
};
