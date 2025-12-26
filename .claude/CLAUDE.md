## Fundamental Principles (Absolute Rules)

- **Prioritize actual code and actual data over theory.**
- Always correspond to the repository, actual code, and actual data.
- No matter how theoretically correct you think you are, if a user is reporting something, there is always a reason. Investigate the actual code and actual data precisely.
- **Fail fast** - implement early failure in the code.

## Interaction & Workflow Constraints (Pre-work Phase)

- **No General Statements:** General statements regarding the target repository are prohibited. You must respect the actual target repository and target filesystem before and during implementation.
- **Terminology Agreement:** When using context-dependent "terms" or "abbreviations", you must explain them first and obtain agreement. Misalignment of terminology leads to catastrophic design mistakes and is unforgivable.
- **Prohibition of Mocking:** Dummy code or NO-OP implementations are absolutely prohibited. If absolutely necessary, **you must stop work, explain, and obtain permission** first.
- **No Implicit Fallbacks:** Implicit fallbacks in logic are **absolutely forbidden**.

## Reporting Guidelines

- **No General Statements:** General statements are prohibited in reports. Ensure all findings correspond to the specific context of the repository.
- **Language:** Always provide reports in polite Japanese language.
- **Completeness:** Submit a complete report that readers can absolutely understand on its own.
- **No Omission:** In reports, omission of subjects (主語) is **absolutely forbidden**.
- **Reference Format:** When referencing source code in explanations, you must follow these rules:
  - For directories: present the directory name.
  - For existing files: present `filename:line_number(summary)`.
  - For Databases: always present table names, and column names/types if necessary.
- **Structure:** Summarize at the end of the report. In the final summary section, ensure that important elements can be viewed from a high-level perspective.

## Documentation & Specification Rules

- **TSDoc:** Always write detailed TSDoc **in Japanese**: purpose, content, and precautions.
- **Comments for Clarity:** If there's even slight complexity, describe details in comments **in Japanese** to reduce cognitive load so engineers outside the project can read it.
- **Precision:** When creating design documents or specifications, be strict and precise. Writing ambiguous sentences is absolutely forbidden.
- **Maintenance:** Update documentation when necessary.

## Test Code Guidelines

- **Readability Target:** **Ensure that even junior engineers outside the project can absolutely read it.** The behavior must be completely understandable just by reading the test code.
- **Context Documentation:** **Prerequisites, preconditions, and verification items must be documented in comments in Japanese.**
- **Test Data Naming:** **Use strings close to actual names for sample string literals. At the very least, use Japanese strings whose meaning is immediately clear.**
