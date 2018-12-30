workflow "Linting & Testing" {
  on = "push"
  resolves = ["Run tests"]
}

action "Install dependencies" {
  uses = "actions/npm@e7aaefe"
  args = "install"
}

action "Run Prettier" {
  uses = "actions/npm@e7aaefe"
  args = "run format"
  needs = ["Install dependencies"]
}

action "Run tests" {
  uses = "actions/npm@e7aaefe"
  needs = ["Run Prettier"]
  args = "run test"
}