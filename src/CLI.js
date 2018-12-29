const chalk = require("chalk");
const log = console.log;

const info = message => log(chalk.blue(message));

const error = message => log(chalk.red(message));

module.exports = {
  info,
  error
};
