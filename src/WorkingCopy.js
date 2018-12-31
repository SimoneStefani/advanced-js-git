const fs = require("fs");

const Objects = require("./Objects");
const Files = require("./Files");

const FILE_STATUS = {
  ADD: "A",
  MODIFY: "M",
  DELETE: "D",
  SAME: "SAME",
  CONFLICT: "CONFLICT"
};

/**
 * Takes a diff object (see the diff module for a description of
 * the format) and applies the changes in it to the working copy.
 *
 * @param {Object} dif
 */
const write = dif => {
  // Takes the hashes of two versions of the same file
  // and returns a string that represents the two versions
  // as a conflicted file.
  const composeConflict = (receiverFileHash, giverFileHash) => {
    return (
      "<<<<<<\n" +
      Objects.read(receiverFileHash) +
      "\n======\n" +
      Objects.read(giverFileHash) +
      "\n>>>>>>\n"
    );
  };

  // Go through all the files that have changed, updating
  // the working copy for each.
  Object.keys(dif).forEach(p => {
    if (dif[p].status === FILE_STATUS.ADD) {
      Files.write(
        Files.workingCopyPath(p),
        Objects.read(dif[p].receiver || dif[p].giver)
      );
    } else if (dif[p].status === FILE_STATUS.CONFLICT) {
      Files.write(
        Files.workingCopyPath(p),
        composeConflict(dif[p].receiver, dif[p].giver)
      );
    } else if (dif[p].status === FILE_STATUS.MODIFY) {
      Files.write(Files.workingCopyPath(p), Objects.read(dif[p].giver));
    } else if (dif[p].status === FILE_STATUS.DELETE) {
      fs.unlinkSync(Files.workingCopyPath(p));
    }
  });

  // Remove any directories that have been left empty after
  // the deletion of all the files in them.
  fs.readdirSync(Files.workingCopyPath())
    .filter(n => n !== ".enkelgit")
    .forEach(Files.rmEmptyDirs());
};

module.exports = {
  write
};
