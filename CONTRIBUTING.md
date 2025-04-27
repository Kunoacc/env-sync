# Contributing to EnvSync

First off, thank you for considering contributing to EnvSync! It's people like you that make EnvSync such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by the EnvSync Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to [nelson@nelsonatuonwu.me](mailto:nelson@nelsonatuonwu.me).

## How Can I Contribute?

### Reporting Bugs

This section guides you through submitting a bug report for EnvSync. Following these guidelines helps maintainers and the community understand your report, reproduce the behavior, and find related reports.

* **Use a clear and descriptive title** for the issue to identify the problem.
* **Describe the exact steps which reproduce the problem** in as many details as possible.
* **Provide specific examples to demonstrate the steps**. Include links to files or GitHub projects, or copy/pasteable snippets, which you use in those examples.
* **Describe the behavior you observed after following the steps** and point out what exactly is the problem with that behavior.
* **Explain which behavior you expected to see instead and why.**
* **Include screenshots** which show you following the described steps and clearly demonstrate the problem.

### Suggesting Enhancements

This section guides you through submitting an enhancement suggestion for EnvSync, including completely new features and minor improvements to existing functionality.

* **Use a clear and descriptive title** for the issue to identify the suggestion.
* **Provide a step-by-step description of the suggested enhancement** in as many details as possible.
* **Provide specific examples to demonstrate the steps**. Include copy/pasteable snippets which you use in those examples.
* **Describe the current behavior** and **explain which behavior you expected to see instead** and why.
* **Include screenshots or GIFs** which help you demonstrate the steps or point out the part of EnvSync which the suggestion is related to.
* **Explain why this enhancement would be useful** to most EnvSync users.

### Pull Requests

* Fill in the required template
* Follow the style guide
* Document new code
* End all files with a newline

## Development Process

### Setting Up Development Environment

1. Fork the repo
2. Clone your fork
3. Create a branch
4. Set up development environment:
   ```bash
   npm install
   ```
5. Make your changes
6. Run tests:
   ```bash
   npm test
   ```
7. Commit your changes
8. Push to your fork
9. Submit a pull request

### Project Structure

```
├── dist/               # Compiled extension code
├── functions/          # Supabase Deno functions
├── src/                # Extension source code
│   ├── commands/       # VS Code commands
│   ├── encryption/     # Encryption utilities
│   ├── storage/        # Storage utilities
│   └── utils/          # Utilities
├── .github/workflows/  # CI/CD pipelines
└── ... (other files)
```

### Style Guide

#### Code Style

* Use TypeScript
* Follow the existing code style
* Add JSDoc comments for functions and methods
* Use meaningful variable names

#### Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
feat: add hat wobble
^--^  ^------------^
|     |
|     +-> Summary in present tense.
|
+-------> Type: feat, fix, docs, style, refactor, test, or chore.
```

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.
