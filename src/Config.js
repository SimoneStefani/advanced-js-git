const Files = require("../src/Files");
const Utils = require("../src/Utils");

/**
 * Returns true if the repository is bare.
 */
const isBare = () => read().core[""].bare === "true";

/**
 * Throws error if the repository is bare.
 */
const assertNotBare = () => {
  if (isBare()) {
    throw new Error("this operation must be run in a work tree");
  }
};

/**
 * Returns the contents of the config file as a nested JS object.
 */
const read = () => strToObj(Files.read(Files.enkelgitPath("config")));

/**
 * Stringifies the nested JS object configObj and overwrites the
 * config file with it.
 *
 * @param {Object} configObj
 */
const write = configObj =>
  Files.write(Files.enkelgitPath("config"), objToStr(configObj));

/**
 * Parses the config string str and returns its contents as a
 * nested JS object.
 *
 * @param {String} str
 */
const strToObj = str => {
  return str
    .split("[")
    .map(item => item.trim())
    .filter(item => item !== "")
    .reduce(
      (c, item) => {
        const lines = item.split("\n");
        let entry = [];

        entry.push(lines[0].match(/([^ \]]+)( |\])/)[1]);

        const subsectionMatch = lines[0].match(/\"(.+)\"/);
        const subsection = subsectionMatch === null ? "" : subsectionMatch[1];
        entry.push(subsection);
        entry.push(
          lines.slice(1).reduce((s, l) => {
            s[l.split("=")[0].trim()] = l.split("=")[1].trim();
            return s;
          }, {})
        );

        return Utils.setIn(c, entry);
      },
      { remote: {} }
    );
};

/**
 * ConfigObj is a JS object that holds the config for the repository.
 * objToStr() stringifies the object and returns the string.
 *
 * @param {String} configObj
 */
const objToStr = configObj => {
  return Object.keys(configObj)
    .reduce((arr, section) => {
      return arr.concat(
        Object.keys(configObj[section]).map(subsection => {
          return { section: section, subsection: subsection };
        })
      );
    }, [])
    .map(entry => {
      const subsection =
        entry.subsection === "" ? "" : ' "' + entry.subsection + '"';
      const settings = configObj[entry.section][entry.subsection];
      return (
        "[" +
        entry.section +
        subsection +
        "]\n" +
        Object.keys(settings)
          .map(k => "  " + k + " = " + settings[k])
          .join("\n") +
        "\n"
      );
    })
    .join("");
};

module.exports = {
  isBare,
  assertNotBare,
  read,
  write,
  strToObj,
  objToStr
};
