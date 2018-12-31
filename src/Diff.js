const Objects = require("./Objects");
const Index = require("./Index");
const Utils = require("./Utils");
const Refs = require("./Refs");

const FILE_STATUS = {
  ADD: "A",
  MODIFY: "M",
  DELETE: "D",
  SAME: "SAME",
  CONFLICT: "CONFLICT"
};

/**
 * returns a diff object (see above for the format of a diff object).
 * If hash1 is passed, it is used as the first version in the diff.
 * If it is not passed, the index is used. If hash2 is passed,
 * it is used as the second version in the diff. If it is not passed,
 * the working copy is used.
 *
 * @param {String} hash1
 * @param {String} hash2
 */
const diff = (hash1, hash2) => {
  const a = hash1 === undefined ? Index.toc() : Objects.commitToc(hash1);
  const b =
    hash2 === undefined ? Index.workingCopyToc() : Objects.commitToc(hash2);
  return tocDiff(a, b);
};

/**
 * Takes a diff and returns a JS object that maps from file paths to file statuses.
 * @param {Object} dif
 */
const nameStatus = dif => {
  return Object.keys(dif)
    .filter(p => dif[p].status !== FILE_STATUS.SAME)
    .reduce((ns, p) => Utils.setIn(ns, [p, dif[p].status]), {});
};

/**
 * takes three JS objects that map file paths to hashes of file content.
 * It returns a diff between receiver and giver (see the module description
 * for the format). base is the version that is the most recent comment
 * ancestor of the receiver and giver. If base is not passed, receiver
 * is used as the base. The base is only passed when getting the diff for
 * a merge. This is the only time the conflict status might be used.
 *
 * @param {Object} receiver
 * @param {Object} giver
 * @param {Object} base
 */
const tocDiff = (receiver, giver, base) => {
  // fileStatus() takes three strings that represent
  // different versions of the content of a file.
  // It returns the change that needs to be made to
  // get from the receiver to the giver.
  const fileStatus = (receiver, giver, base) => {
    const receiverPresent = receiver !== undefined;
    const basePresent = base !== undefined;
    const giverPresent = giver !== undefined;
    if (receiverPresent && giverPresent && receiver !== giver) {
      if (receiver !== base && giver !== base) {
        return FILE_STATUS.CONFLICT;
      } else {
        return FILE_STATUS.MODIFY;
      }
    } else if (receiver === giver) {
      return FILE_STATUS.SAME;
    } else if (
      (!receiverPresent && !basePresent && giverPresent) ||
      (receiverPresent && !basePresent && !giverPresent)
    ) {
      return FILE_STATUS.ADD;
    } else if (
      (receiverPresent && basePresent && !giverPresent) ||
      (!receiverPresent && basePresent && giverPresent)
    ) {
      return FILE_STATUS.DELETE;
    }
  };

  // If base was not passed, use receiver as the base.
  base = base || receiver;

  // Get an array of all the paths in all the versions.
  const paths = Object.keys(receiver)
    .concat(Object.keys(base))
    .concat(Object.keys(giver));

  // Create and return diff.
  return Utils.unique(paths).reduce((idx, p) => {
    return Utils.setIn(idx, [
      p,
      {
        status: fileStatus(receiver[p], giver[p], base[p]),
        receiver: receiver[p],
        base: base[p],
        giver: giver[p]
      }
    ]);
  }, {});
};

/**
 * Gets a list of files changed in the working copy.
 * It gets a list of the files that are different in the head
 * commit and the commit for the passed hash. It returns a list
 * of paths that appear in both lists.
 *
 * @param {String} hash
 */
const changedFilesCommitWouldOverwrite = hash => {
  const headHash = Refs.hash("HEAD");
  return Utils.intersection(
    Object.keys(nameStatus(diff(headHash))),
    Object.keys(nameStatus(diff(headHash, hash)))
  );
};

/**
 * Returns a list of files that have been added to or
 * modified in the working copy since the last commit.
 */
const addedOrModifiedFiles = () => {
  const headToc = Refs.hash("HEAD") ? Objects.commitToc(Refs.hash("HEAD")) : {};
  const wc = nameStatus(tocDiff(headToc, Index.workingCopyToc()));
  return Object.keys(wc).filter(p => wc[p] !== FILE_STATUS.DELETE);
};

module.exports = {
  diff,
  nameStatus,
  tocDiff,
  changedFilesCommitWouldOverwrite,
  addedOrModifiedFiles
};
