const chalk = require("chalk");
const log = console.log;

/**
 * Print a blue log statement.
 *
 * @param {String} message
 */
const info = (message) => log(chalk.blue(message));

/**
 * Print a red log statement.
 *
 * @param {String} message
 */
const error = (message) => log(chalk.red(message));

module.exports = {
  info,
  error,
};
