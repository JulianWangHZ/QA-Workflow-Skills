# Changelog

## [0.4.0](https://github.com/JulianWangHZ/QA-Workflow-Skills/compare/v0.3.1...v0.4.0) (2026-09-29)


### ⚠ BREAKING CHANGES

* selfReview.breakdown uses fixed keys (riskCoverage, techniques, stateMachine, oracle, grounding, bdd, concise), each an object with score, max, checked and deductions. Runs still in the cases stage must be re-reviewed.

### Features

* run stages inline and require evidence for case-review scores ([#6](https://github.com/JulianWangHZ/QA-Workflow-Skills/issues/6)) ([c2bb7f7](https://github.com/JulianWangHZ/QA-Workflow-Skills/commit/c2bb7f7862414a2320f14f1a7c790a28640d9d52))

## [0.3.1](https://github.com/JulianWangHZ/QA-Workflow-Skills/compare/v0.3.0...v0.3.1) (2026-09-28)


### Bug Fixes

* wrap long case-ID lists and show correct rubric maxima on the review page ([#4](https://github.com/JulianWangHZ/QA-Workflow-Skills/issues/4)) ([04d034d](https://github.com/JulianWangHZ/QA-Workflow-Skills/commit/04d034da8bea9bc24c05b49559ec2ef672d1da9f))

## [0.3.0](https://github.com/JulianWangHZ/QA-Workflow-Skills/compare/v0.2.0...v0.3.0) (2026-09-28)


### Features

* report progress before and after every subagent dispatch ([#2](https://github.com/JulianWangHZ/QA-Workflow-Skills/issues/2)) ([497af32](https://github.com/JulianWangHZ/QA-Workflow-Skills/commit/497af322d375cf3cede5d991e6f795ca59836680))

## [0.2.0](https://github.com/JulianWangHZ/QA-Workflow-Skills/compare/v0.1.0...v0.2.0) (2026-09-28)


### Features

* initial release of qa-workflow plugin ([0c09f14](https://github.com/JulianWangHZ/QA-Workflow-Skills/commit/0c09f14efb5e01cfc3cf9f412cab77dacb5ef932))


### Bug Fixes

* run tests on Node 20 by letting the shell expand the test glob ([f0cf738](https://github.com/JulianWangHZ/QA-Workflow-Skills/commit/f0cf738aab591554b625231e0bf3d3f1db4d9071))
* unquote the test glob in the CLI end-to-end test for Node 20 ([029262a](https://github.com/JulianWangHZ/QA-Workflow-Skills/commit/029262ad2026eda3a9d36bfb0ec7828ab835935c))
