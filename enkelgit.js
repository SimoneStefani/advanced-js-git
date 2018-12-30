#!/usr/bin/env node

const chalk = require("chalk");

const Core = require("./src/Core");

/**
 * Takes the process.argv object passed when enkelgit.js
 * is run as a script. It returns an object that contains
 * the parsed parameters to be formed into a Enkelgit command.
 *
 * @param {String} argv
 */
const parseOptions = argv => {
  let name;
  return argv.reduce(
    (opts, arg) => {
      if (arg.match(/^-/)) {
        name = arg.replace(/^-+/, "");
        opts[name] = true;
      } else if (name !== undefined) {
        opts[name] = arg;
        name = undefined;
      } else {
        opts._.push(arg);
      }

      return opts;
    },
    { _: [] }
  );
};

/**
 * takes the process.argv object passed when enkelgit.js is run
 * as a script. It parses the command line arguments, runs the
 * corresponding Enkelgit command and returns the string returned
 * by the command.
 */
const runCli = (module.exports.runCli = argv => {
  let opts = parseOptions(argv);
  let commandName = opts._[2];

  if (commandName === undefined) {
    throw new Error(chalk.red("you must specify a Enkelgit command to run"));
  } else {
    let commandFnName = commandName.replace(/-/g, "_");
    let fn = Core[commandFnName];

    if (fn === undefined) {
      throw new Error(
        chalk.red("'" + commandFnName + "' is not a Enkelgit command")
      );
    } else {
      let commandArgs = opts._.slice(3);
      while (commandArgs.length < fn.length - 1) {
        commandArgs.push(undefined);
      }

      return fn.apply(Core, commandArgs.concat(opts));
    }
  }
});

/**
 * If enkelgit.js is run as a script, pass the process.argv
 * array of script arguments to runCli() so they can be used
 * to run a Enkelgit command. Print the return value of the
 * Enkelgit command. If the Enkelgit command throws, print the
 * error message.
 */
if (require.main === module) {
  try {
    let result = runCli(process.argv);
    if (result !== undefined) {
      console.log(result);
    }
  } catch (e) {
    console.error(e.toString());
  }
}
