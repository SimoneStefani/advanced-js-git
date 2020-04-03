const nodePath = require("path");
const fs = require("fs");

const Files = require("./Files");
const Utils = require("./Utils");

/**
 * Stores a graph of tree objects that represent the content
 * currently in the index.
 *
 * @param {Object} tree
 */
const writeTree = (tree) => {
  const treeObject =
    Object.keys(tree)
      .map((key) => {
        if (Utils.isString(tree[key])) {
          return "blob " + tree[key] + " " + key;
        } else {
          return "tree " + writeTree(tree[key]) + " " + key;
        }
      })
      .join("\n") + "\n";

  return write(treeObject);
};

/**
 * Takes a tree hash and finds the corresponding tree object.
 * It reads the connected graph of tree objects into a nested
 * JS object, like: { file1: "hash(1)", src: { file2: "hash(2)" }
 *
 * @param {String} treeHash
 * @param {Object} tree
 */
const fileTree = (treeHash, tree) => {
  if (tree === undefined) {
    return fileTree(treeHash, {});
  }

  Utils.lines(read(treeHash)).forEach((line) => {
    const lineTokens = line.split(/ /);
    tree[lineTokens[2]] =
      lineTokens[0] === "tree" ? fileTree(lineTokens[1], {}) : lineTokens[1];
  });

  return tree;
};

/**
 * Creates a commit object and writes it to the objects database.
 *
 * @param {String} treeHash
 * @param {String} message
 * @param {Array} parentHashes
 */
const writeCommit = (treeHash, message, parentHashes) => {
  return write(
    "commit " +
      treeHash +
      "\n" +
      parentHashes.map((h) => "parent " + h + "\n").join("") +
      "Date:  " +
      new Date().toString() +
      "\n" +
      "\n" +
      "    " +
      message +
      "\n"
  );
};

/**
 * Writes str to the objects database.
 *
 * @param {String} str
 */
const write = (str) => {
  Files.write(
    nodePath.join(Files.enkelgitPath(), "objects", Utils.hash(str)),
    str
  );
  return Utils.hash(str);
};

/**
 * Returns true if the giver commit has already been incorporated
 * into the receiver commit. That is, it returns true if the giver
 * commit is an ancestor of the receiver, or they are the same commit.
 *
 * @param {String} receiverHash
 * @param {String} giverHash
 */
const isUpToDate = (receiverHash, giverHash) => {
  return (
    receiverHash !== undefined &&
    (receiverHash === giverHash || isAncestor(receiverHash, giverHash))
  );
};

/**
 * Returns true if there is an object in the database called objectHash
 *
 * @param {String} objectHash
 */
const exists = (objectHash) => {
  return (
    objectHash !== undefined &&
    fs.existsSync(nodePath.join(Files.enkelgitPath(), "objects", objectHash))
  );
};

/**
 * Returns the content of the object called objectHash.
 *
 * @param {String} objectHash
 */
const read = (objectHash) => {
  if (objectHash !== undefined) {
    const objectPath = nodePath.join(
      Files.enkelgitPath(),
      "objects",
      objectHash
    );
    if (fs.existsSync(objectPath)) {
      return Files.read(objectPath);
    }
  }
};

/**
 * Returns an array of the string content of all the objects in the database
 */
const allObjects = () => {
  return fs.readdirSync(Files.enkelgitPath("objects")).map(objects.read);
};

/**
 * Parses str as an object and returns its type: commit, tree or blob.
 *
 * @param {String} str
 */
const type = (str) => {
  return (
    { commit: "commit", tree: "tree", blob: "tree" }[str.split(" ")[0]] ||
    "blob"
  );
};

/**
 * Returns true if descendentHash is a descendent of ancestorHash.
 *
 * @param {String} descendentHash
 * @param {String} ancestorHash
 */
const isAncestor = (descendentHash, ancestorHash) => {
  return ancestors(descendentHash).indexOf(ancestorHash) !== -1;
};

/**
 * Returns an array of the hashes of all the ancestor commits of commitHash.
 *
 * @param {String} commitHash
 */
const ancestors = (commitHash) => {
  const parents = parentHashes(read(commitHash));
  return Utils.flatten(parents.concat(parents.map(ancestors)));
};

/**
 * Parses str as a commit and returns the hashes of its parents.
 *
 * @param {String} str
 */
const parentHashes = (str) => {
  if (type(str) === "commit") {
    return str
      .split("\n")
      .filter((line) => line.match(/^parent/))
      .map((line) => line.split(" ")[1]);
  }
};

/**
 * Parses str as a commit and returns the tree it points at.
 *
 * @param {String} str
 */
const treeHash = (str) => {
  if (type(str) === "commit") {
    return str.split(/\s/)[1];
  }
};

/**
 * takes the hash of a commit and reads the content stored in the
 * tree on the commit. It turns that tree into a table of content
 * that maps filenames to hashes of the files’ content,
 * like: { "file1": hash(1), "a/file2": "hash(2)" }
 *
 * @param {String} hash
 */
const commitToc = (hash) =>
  Files.flattenNestedTree(fileTree(treeHash(read(hash))));

module.exports = {
  writeTree,
  fileTree,
  writeCommit,
  write,
  isUpToDate,
  exists,
  read,
  allObjects,
  type,
  isAncestor,
  ancestors,
  parentHashes,
  treeHash,
  commitToc,
};
