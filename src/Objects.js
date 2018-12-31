const nodePath = require("path");

const Files = require("./Files");
const Utils = require("./Utils");

const write = str => {
  Files.write(
    nodePath.join(Files.enkelgitPath(), "objects", Utils.hash(str)),
    str
  );
  return Utils.hash(str);
};

module.exports = {
  write
};
