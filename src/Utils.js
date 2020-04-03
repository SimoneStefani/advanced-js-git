/**
 * Returns true if val is a string.
 *
 * @param {Any} val
 */
const isString = (val) => typeof val === "string";

/**
 * Returns a hash of string.
 *
 * @param {String} string
 */
const hash = (string) => {
  var hashInt = 0;
  for (let i = 0; i < string.length; i++) {
    hashInt = hashInt * 31 + string.charCodeAt(i);
    hashInt = hashInt | 0;
  }

  return Math.abs(hashInt).toString(16);
};

/**
 * Takes an array that contains 1 or more keys and has one
 * value at the end. It drills down into obj using the keys
 * and sets the value as the value of the last key.
 * eg. setIn({}, ["a", "b", "me"]); // => { a: { b: "me" } }
 *
 * @param {Object} obj
 * @param {Array} arr
 */
const setIn = (obj, arr) => {
  if (arr.length === 2) {
    obj[arr[0]] = arr[1];
  } else if (arr.length > 2) {
    obj[arr[0]] = obj[arr[0]] || {};
    setIn(obj[arr[0]], arr.slice(1));
  }

  return obj;
};

/**
 * Takes a string, splits on newlines and returns an array of
 * the lines that are not empty.
 *
 * @param {String} str
 */
const lines = (str) => str.split("\n").filter((l) => l !== "");

/**
 * Returns a flattened version of arr.
 *
 * @param {Array} arr
 */
const flatten = (arr) =>
  [].concat(...arr.map((v) => (Array.isArray(v) ? flatten(v) : v)));

/**
 * Returns the unique elements in arr.
 *
 * @param {Array} arr
 */
const unique = (arr) => [...new Set(arr)];

/**
 * Takes two arrays a and b. It returns an array of the
 * items that appear in both.
 *
 * @param {Array} a
 * @param {Array} b
 */
const intersection = (a, b) => {
  const s = new Set(b);
  return a.filter((x) => s.has(x));
};

/**
 * Allows execution of a command on a remote repository.
 * It returns an anonymous function that takes another
 * function fn. When the anonymous function is run, it
 * switches to remotePath, executes fn, then switches
 * back to the original directory.
 *
 * @param {String} remotePath
 */
const onRemote = (remotePath) => {
  return (fn) => {
    let originalDir = process.cwd();
    process.chdir(remotePath);
    let result = fn.apply(null, Array.prototype.slice.call(arguments, 1));
    process.chdir(originalDir);
    return result;
  };
};

module.exports = {
  isString,
  hash,
  setIn,
  lines,
  flatten,
  unique,
  intersection,
  onRemote,
};
