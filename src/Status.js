const fs = require("fs");

const Objects = require("./Objects");
const Files = require("./Files");
const Index = require("./Index");
const Utils = require("./Utils");
const Diff = require("./Diff");
const Refs = require("./Refers");

/**
 * Returns an array of lines listing the files not being tracked by Enkelgit.
 */
const untracked = () => {
  return fs
    .readdirSync(Files.workingCopyPath())
    .filter((p) => Index.toc()[p] === undefined && p !== ".enkelgit");
};

/**
 * Returns an array of lines listing the files that have changes
 * that will be included in the next commit.
 */
const toBeCommitted = () => {
  const headHash = Refs.hash("HEAD");
  const headToc = headHash === undefined ? {} : Objects.commitToc(headHash);
  const ns = Diff.nameStatus(Diff.tocDiff(headToc, Index.toc()));
  return Object.keys(ns).map((p) => ns[p] + " " + p);
};

/**
 * Returns an array of lines listing the files that have changes
 * that will not be included in the next commit.
 */
const notStagedForCommit = () => {
  const ns = Diff.nameStatus(Diff.diff());
  return Object.keys(ns).map((p) => ns[p] + " " + p);
};

/**
 * Keeps lines (prefixed by heading) only if it’s nonempty.
 *
 * @param {Array} heading
 * @param {Array} lines
 */
const listing = (heading, lines) => (lines.length > 0 ? [heading, lines] : []);

/**
 * Returns the repository status as a human-readable string.
 */
const toString = () => {
  return Utils.flatten([
    "On branch " + Refs.headBranchName(),
    listing("Untracked files:", untracked()),
    listing("Unmerged paths:", Index.conflictedPaths()),
    listing("Changes to be committed:", toBeCommitted()),
    listing("Changes not staged for commit:", notStagedForCommit()),
  ]).join("\n");
};

module.exports = {
  toString,
};
