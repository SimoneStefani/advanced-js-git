const nodePath = require("path");
const fs = require("fs");

const Utils = require("./Utils");

/**
 * Returns true if the current working directory is inside
 * a repository.
 */
const inRepo = () => enkelgitPath() !== undefined;

/**
 * Throws error if the current working directory is not
 * inside a repository.
 */
const assertInRepo = () => {
  if (!inRepo()) {
    throw new Error("not a Enkelgit repository");
  }
};

/**
 * Returns path relative to the repo root
 *
 * @param {String} path
 */
const pathFromRepoRoot = (path) =>
  nodePath.relative(workingCopyPath(), nodePath.join(process.cwd(), path));

/**
 * Writes content to file at path, overwriting anything
 * that is already there.
 * @param {String} path
 * @param {String} content
 */
const write = (path, content) => {
  const prefix = require("os").platform() == "win32" ? "." : "/";
  writeFilesFromTree(
    Utils.setIn({}, path.split(nodePath.sep).concat(content)),
    prefix
  );
};

/**
 * Takes tree of files as a nested JS obj and writes all those
 * files to disk taking prefix as the root of the tree.
 * Tree format is: { a: { b: { c: "filecontent" }}}
 *
 * @param {Object} tree
 * @param {String} prefix
 */
const writeFilesFromTree = (tree, prefix) => {
  Object.keys(tree).forEach((name) => {
    let path = nodePath.join(prefix, name);
    if (Utils.isString(tree[name])) {
      fs.writeFileSync(path, tree[name]);
    } else {
      if (!fs.existsSync(path)) {
        fs.mkdirSync(path, "777");
      }

      writeFilesFromTree(tree[name], path);
    }
  });
};

/**
 * Recursively removes all the empty directories inside path.
 *
 * @param {String} path
 */
const rmEmptyDirs = (path) => {
  if (fs.statSync(path).isDirectory()) {
    fs.readdirSync(path).forEach((c) => rmEmptyDirs(nodePath.join(path, c)));

    if (fs.readdirSync(path).length === 0) {
      fs.rmdirSync(path);
    }
  }
};

/**
 * Returns the contents of the file at path as a string.
 * It returns undefined if the file doesn’t exist.
 *
 * @param {String} path
 */
const read = (path) => {
  if (fs.existsSync(path)) {
    return fs.readFileSync(path, "utf8");
  }
};

/**
 * Returns a string made by concatenating path to the
 * absolute path of the .enkelgit directory of the repository.
 *
 * @param {String} path
 */
const enkelgitPath = (path) => {
  function enkelgitDir(dir) {
    if (fs.existsSync(dir)) {
      const potentialConfigFile = nodePath.join(dir, "config");
      const potentialEnkelgitPath = nodePath.join(dir, ".enkelgit");
      if (
        fs.existsSync(potentialConfigFile) &&
        fs.statSync(potentialConfigFile).isFile() &&
        read(potentialConfigFile).match(/\[core\]/)
      ) {
        return dir;
      } else if (fs.existsSync(potentialEnkelgitPath)) {
        return potentialEnkelgitPath;
      } else if (dir !== "/") {
        return enkelgitDir(nodePath.join(dir, ".."));
      }
    }
  }

  const gDir = enkelgitDir(process.cwd());
  if (gDir !== undefined) {
    return nodePath.join(gDir, path || "");
  }
};

/**
 * Returns a string made by concatenating path
 * to the absolute path of the root of the repository.
 *
 * @param {String} path
 */
const workingCopyPath = (path = "") => {
  return nodePath.join(nodePath.join(enkelgitPath(), ".."), path);
};

/**
 * Returns an array of all the files found in a recursive
 * search of path.
 *
 * @param {String} path
 */
const lsRecursive = (path) => {
  if (!fs.existsSync(path)) {
    return [];
  } else if (fs.statSync(path).isFile()) {
    return [path];
  } else if (fs.statSync(path).isDirectory()) {
    return fs.readdirSync(path).reduce((fileList, dirChild) => {
      return fileList.concat(lsRecursive(nodePath.join(path, dirChild)));
    }, []);
  }
};

/**
 * Takes obj, a mapping of file path strings to content
 * and returns a nested JS obj where each key represents
 * a sub directory.
 *
 * @param {Object} obj
 */
const nestFlatTree = (obj) => {
  return Object.keys(obj).reduce((tree, wholePath) => {
    return Utils.setIn(
      tree,
      wholePath.split(nodePath.sep).concat(obj[wholePath])
    );
  }, {});
};

/**
 * Takes tree, a nested JS object where each key represents
 * a sub directory and returns a JS object mapping file path
 * strings to content.
 *
 * @param {Object} tree
 * @param {Object} obj
 * @param {String} prefix
 */
const flattenNestedTree = (tree, obj, prefix) => {
  if (obj === undefined) {
    return flattenNestedTree(tree, {}, "");
  }

  Object.keys(tree).forEach((dir) => {
    const path = nodePath.join(prefix, dir);
    if (Utils.isString(tree[dir])) {
      obj[path] = tree[dir];
    } else {
      flattenNestedTree(tree[dir], obj, path);
    }
  });

  return obj;
};

module.exports = {
  inRepo,
  assertInRepo,
  pathFromRepoRoot,
  write,
  writeFilesFromTree,
  rmEmptyDirs,
  read,
  enkelgitPath,
  workingCopyPath,
  lsRecursive,
  nestFlatTree,
  flattenNestedTree,
};
