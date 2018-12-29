const Files = require("../src/Files");

const isBare = () => read().core[""].bare === "true";

const assertNotBare = () => {
  if (isBare()) {
    throw new Error("this operation must be run in a work tree");
  }
};

const read = () => strToObj(Files.read(Files.enkelgitPath("config")));

const write = configObj =>
  Files.write(Files.enkelgitPath("config"), objToStr(configObj));

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
