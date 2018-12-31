const Files = require("./Files");
const Utils = require("./Utils");

/**
 * Returns true if there is an entry for path in the index stage.
 *
 * @param {String} path
 * @param {String} stage
 */
const hasFile = (path, stage) => read()[key(path, stage)] !== undefined;

/**
 * Returns the index as a JS object.
 */
const read = () => {
  const indexFilePath = Files.enkelgitPath("index");
  return Utils.lines(
    fs.existsSync(indexFilePath) ? Files.read(indexFilePath) : "\n"
  ).reduce((idx, blobStr) => {
    let blobData = blobStr.split(/ /);
    idx[key(blobData[0], blobData[1])] = blobData[2];
    return idx;
  }, {});
};

/**
 * Returns an index key made from path and stage.
 *
 * @param {String} path
 * @param {String} stage
 */
const key = (path, stage) => path + "," + stage;

/**
 * Returns a JS object that contains the path and stage of ‘key`.
 *
 * @param {String} key
 */
const keyPieces = key => {
  const pieces = key.split(/,/);
  return { path: pieces[0], stage: parseInt(pieces[1]) };
};

/**
 * Returns an object that maps file paths to hashes of their content.
 * This function is like read(), except the JS object it returns
 * only uses the file path as a key.
 */
const toc = () => {
  const idx = index.read();
  return Object.keys(idx).reduce(
    (obj, k) => Utils.setIn(obj, [k.split(",")[0], idx[k]]),
    {}
  );
};

/**
 * Returns true if the file for path is in conflict.
 *
 * @param {String} path
 */
const isFileInConflict = path => hasFile(path, 2);

/**
 * Returns an array of all the paths of files that
 * are in conflict.
 */
const conflictedPaths = () => {
  let idx = index.read();
  return Object.keys(idx)
    .filter(k => keyPieces(k).stage === 2)
    .map(k => keyPieces(k).path);
};

/**
 * sets a non-conflicting index entry for the file
 * at path to the hash of content. (If the file was in
 * conflict, it is set to be no longer in conflict.)
 *
 * @param {String} path
 * @param {Object} content
 */
const writeNonConflict = (path, content) => {
  // Remove all keys for the file from the index.
  writeRm(path);

  // Write a key for path at stage 0 to indicate
  // that the file is not in conflict.
  _writeStageEntry(path, 0, content);
};

/**
 * Sets an index entry for the file at path that indicates the
 * file is in conflict after a merge. receiverContent is the
 * version of the file that is being merged into. giverContent
 * is the version being merged in. baseContent is the version
 * that the receiver and giver both descended from.
 *
 * @param {String} path
 * @param {Object} receiverContent
 * @param {Object} giverContent
 * @param {Object} baseContent
 */
const writeConflict = (path, receiverContent, giverContent, baseContent) => {
  // Write a key for path at stage 1 for baseContent.
  // (There is no baseContent if the same file was added
  // for the first time by both versions being merged.)
  if (baseContent !== undefined) {
    _writeStageEntry(path, 1, baseContent);
  }

  // Write a key for path at stage 2 for receiverContent.
  _writeStageEntry(path, 2, receiverContent);

  // Write a key for path at stage 3 for giverContent.
  _writeStageEntry(path, 3, giverContent);
};

/**
 * Removes the index entry for the file at path. The file will
 * be removed from the index even if it is in conflict.
 * (See index.writeConflict() for more information on conflicts.)
 *
 * @param {String} path
 */
const writeRm = path => {
  const idx = read();
  [0, 1, 2, 3].forEach(stage => delete idx[key(path, stage)]);
  write(idx);
};

/**
 * Adds the hashed content to the index at key path,stage.
 *
 * @param {String} path
 * @param {String} stage
 * @param {Object} content
 */
const _writeStageEntry = (path, stage, content) => {
  const idx = read();
  idx[key(path, stage)] = objects.write(content); // TODO !!!!
  write(idx);
};

/**
 * Takes a JS object that represents an index and writes it
 * to .enkelgit/index.
 *
 * @param {Object} index
 */
const write = index => {
  let indexStr =
    Object.keys(index)
      .map(k => k.split(",")[0] + " " + k.split(",")[1] + " " + index[k])
      .join("\n") + "\n";
  Files.write(Files.enkelgitPath("index"), indexStr);
};

/**
 * Returns an object that maps the file paths in the
 * working copy to hashes of those files’ content.
 */
const workingCopyToc = () => {
  return Object.keys(read())
    .map(k => k.split(",")[0])
    .filter((p = fs.existsSync(Files.workingCopyPath(p))))
    .reduce((idx, p) => {
      idx[p] = Utils.hash(Files.read(Files.workingCopyPath(p)));
      return idx;
    }, {});
};

/**
 * Takes an object that maps file paths to hashes of the files’ content.
 * It returns an object that is identical, except the keys of the object
 * are composed of the file paths and stage 0.
 * eg: `{ “file1,0”: hash(1), “src/file2,0”: hash(2) }’
 *
 * @param {Object} toc
 */
const tocToIndex = toc => {
  return Object.keys(toc).reduce(
    (idx, p) => Utils.setIn(idx, [key(p, 0), toc[p]]),
    {}
  );
};

/**
 * Returns all the paths in the index that match pathSpec.
 * It matches relative to currentDir.
 *
 * @param {String} pathSpec
 */
const matchingFiles = pathSpec => {
  const searchPath = Files.pathFromRepoRoot(pathSpec);
  return Object.keys(toc()).filter(p =>
    p.match("^" + searchPath.replace(/\\/g, "\\\\"))
  );
};

module.exports = {
  hasFile,
  read,
  key,
  keyPieces,
  toc,
  isFileInConflict,
  conflictedPaths,
  writeNonConflict,
  writeConflict,
  writeRm,
  _writeStageEntry,
  write,
  workingCopyToc,
  tocToIndex,
  matchingFiles
};
