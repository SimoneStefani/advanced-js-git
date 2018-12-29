const Utils = require("../src/Utils");

test("Utils.isString() test", () => {
  expect(Utils.isString("10")).toBe(true);
  expect(Utils.isString(10)).toBe(false);
});

test("Utils.hash() test", () => {
  expect(Utils.hash("In a hole in the ground there lived a hobbit"))
    .toBe("3a9034a");
});

test("Utils.setIn() test", () => {
  expect(Utils.setIn({}, ["a", "b", "me"])).toEqual({ a: { b: "me" } });
});

test("Utils.lines() test", () => {
  expect(Utils.lines("In a hole in the ground\n there lived a hobbit"))
    .toEqual(['In a hole in the ground', ' there lived a hobbit']);
});

test("Utils.flatten() test", () => {
  expect(Utils.flatten([1, [2], [[3], 4], 5]))
    .toEqual([1, 2, 3, 4, 5]);
});

test("Utils.unique() test", () => {
  expect(Utils.unique([1, 2, 2, 3, 4, 4, 5]))
    .toEqual([1, 2, 3, 4, 5]);
});

test("Utils.intersection() test", () => {
  expect(Utils.intersection([1, 2, 3], [4, 3, 2]))
    .toEqual([2, 3]);
});
