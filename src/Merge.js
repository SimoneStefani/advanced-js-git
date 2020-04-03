const WorkingCopy = require("./WorkingCopy");
const Objects = require("./Objects");
const Config = require("./Config");
const Utils = require("./Utils");
const Files = require("./Files");
const Index = require("./Index");
const Refs = require("./Refers");
const Diff = require("./Diff");

const FILE_STATUS = {
  ADD: "A",
  MODIFY: "M",
  DELETE: "D",
  SAME: "SAME",
  CONFLICT: "CONFLICT",
};

/**
 * Returns the hash of the commit that is the most recent
 * common ancestor of aHash and bHash.
 *
 * @param {String} aHash
 * @param {String} bHash
 */
const commonAncestor = (aHash, bHash) => {
  const sorted = [aHash, bHash].sort();
  aHash = sorted[0];
  bHash = sorted[1];
  const aAncestors = [aHash].concat(Objects.ancestors(aHash));
  const bAncestors = [bHash].concat(Objects.ancestors(bHash));
  return Utils.intersection(aAncestors, bAncestors)[0];
};

/**
 * Returns true if the repository is in the middle of a merge.
 */
const isMergeInProgress = () => Refs.hash("MERGE_HEAD");

/**
 * A fast forward is possible if the changes made to get to
 * the giverHash commit already incorporate the changes made
 * to get to the receiverHash commit. So, canFastForward() returns
 * true if the receiverHash commit is an ancestor of the giverHash
 * commit. It also returns true if there is no receiverHash commit
 * because this indicates the repository has no commits, yet.
 *
 * @param {String} receiverHash
 * @param {String} giverHash
 */
const canFastForward = (receiverHash, giverHash) => {
  return (
    receiverHash === undefined || Objects.isAncestor(giverHash, receiverHash)
  );
};

/**
 * Returns true if hash for local commit (receiverHash) is not
 * ancestor of hash for fetched commit (giverHash).
 *
 * @param {String} receiverHash
 * @param {String} giverHash
 */
const isAForceFetch = (receiverHash, giverHash) => {
  return (
    receiverHash !== undefined && !Objects.isAncestor(giverHash, receiverHash)
  );
};

/**
 * Returns true if merging the commit for giverHash into the
 * commit for receiverHash would produce conflicts.
 *
 * @param {String} receiverHash
 * @param {String} giverHash
 */
const hasConflicts = (receiverHash, giverHash) => {
  const mrgDiff = mergeDiff(receiverHash, giverHash);
  return (
    Object.keys(mrgDiff).filter(
      (p) => mrgDiff[p].status === FILE_STATUS.CONFLICT
    ).length > 0
  );
};

/**
 * Returns a diff that represents the changes to get from
 * the receiverHash commit to the giverHash commit.
 * Because this is a merge diff, the function uses the
 * common ancestor of the receiverHash commit and giverHash
 * commit to avoid trivial conflicts.
 *
 * @param {String} receiverHash
 * @param {String} giverHash
 */
const mergeDiff = (receiverHash, giverHash) => {
  return Diff.tocDiff(
    Objects.commitToc(receiverHash),
    Objects.commitToc(giverHash),
    Objects.commitToc(commonAncestor(receiverHash, giverHash))
  );
};

/**
 * Creates a message for the merge commit that will potentially
 * be created when the giverHash commit is merged into the
 * receiverHash commit. It writes this message to .enkelgit/MERGE_MSG.
 *
 * @param {String} receiverHash
 * @param {String} giverHash
 * @param {String} ref
 */
const writeMergeMsg = (receiverHash, giverHash, ref) => {
  const msg = "Merge " + ref + " into " + Refs.headBranchName();

  const mrgDiff = mergeDiff(receiverHash, giverHash);
  const conflicts = Object.keys(mrgDiff).filter(
    (p) => mrgDiff[p].status === FILE_STATUS.CONFLICT
  );

  if (conflicts.length > 0) {
    msg += "\nConflicts:\n" + conflicts.join("\n");
  }

  Files.write(Files.enkelgitPath("MERGE_MSG"), msg);
};

/**
 * Merges the giverHash commit into the receiverHash commit
 * and writes the merged content to the index.
 *
 * @param {String} receiverHash
 * @param {String} giverHash
 */
const writeIndex = (receiverHash, giverHash) => {
  const mrgDiff = mergeDiff(receiverHash, giverHash);

  Index.write({});

  Object.keys(mrgDiff).forEach((p) => {
    if (mrgDiff[p].status === FILE_STATUS.CONFLICT) {
      Index.writeConflict(
        p,
        Objects.read(mrgDiff[p].receiver),
        Objects.read(mrgDiff[p].giver),
        Objects.read(mrgDiff[p].base)
      );
    } else if (mrgDiff[p].status === FILE_STATUS.MODIFY) {
      Index.writeNonConflict(p, Objects.read(mrgDiff[p].giver));
    } else if (
      mrgDiff[p].status === FILE_STATUS.ADD ||
      mrgDiff[p].status === FILE_STATUS.SAME
    ) {
      const content = Objects.read(mrgDiff[p].receiver || mrgDiff[p].giver);
      Index.writeNonConflict(p, content);
    }
  });
};

/**
 * Fast forwarding means making the current branch reflect
 * the commit that giverHash points at. No new commit is created.
 *
 * @param {String} receiverHash
 * @param {String} giverHash
 */
const writeFastForwardMerge = (receiverHash, giverHash) => {
  // Point head at giverHash.
  Refs.write(Refs.toLocalRef(Refs.headBranchName()), giverHash);

  // Make the index mirror the content of giverHash.
  Index.write(Index.tocToIndex(Objects.commitToc(giverHash)));

  // If the repo is bare, it has no working copy,
  // so there is no more work to do. If the repo is not bare…
  if (!Config.isBare()) {
    // Get an object that maps from file paths in the receiverHash
    // commit to hashes of the files’ content. If recevierHash
    // is undefined, the repository has no commits, yet, and the
    // mapping object is empty.
    var receiverToc =
      receiverHash === undefined ? {} : Objects.commitToc(receiverHash);

    // Write the content of the files to the working copy.
    WorkingCopy.write(Diff.tocDiff(receiverToc, Objects.commitToc(giverHash)));
  }
};

/**
 * A non fast forward merge creates a merge commit to integrate the
 * content of the receiverHash commit with the content of the giverHash
 * commit. This integration requires a merge commit because, unlike a
 * fast forward merge, no commit yet exists that embodies the combination
 * of these two commits. writeNonFastForwardMerge() does not actually
 * create the merge commit. It just sets the wheels in motion.
 *
 * @param {String} receiverHash
 * @param {String} giverHash
 * @param {String} giverRef
 */
const writeNonFastForwardMerge = (receiverHash, giverHash, giverRef) => {
  // Write giverHash to .enkelgit/MERGE_HEAD. This file
  // acts as a record of giverHash and as the signal
  // that the repository is in the merging state.
  Refs.write("MERGE_HEAD", giverHash);

  // Write a standard merge commit message that will
  // be used when the merge commit is created.
  writeMergeMsg(receiverHash, giverHash, giverRef);

  // Merge the receiverHash commit with the giverHash
  // commit and write the content to the index.
  writeIndex(receiverHash, giverHash);

  // If the repo is bare, it has no working copy, so there
  // is no more work to do. If the repo is not bare merge
  // the receiverHash commit with the giverHash commit and
  // write the content to the working copy.
  if (!Config.isBare()) {
    WorkingCopy.write(mergeDiff(receiverHash, giverHash));
  }
};

module.exports = {
  commonAncestor,
  isMergeInProgress,
  canFastForward,
  isAForceFetch,
  hasConflicts,
  mergeDiff,
  writeMergeMsg,
  writeIndex,
  writeFastForwardMerge,
  writeNonFastForwardMerge,
};
