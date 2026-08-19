# Content-Driven UI Width Design Specification

To ensure UI professionalism and accessibility, all UI development MUST adhere to these "Content-Driven UI" rules:

- **NO Hardcoded Widths/Heights**: 
  - Never hardcode width (e.g., `w-64`, `width: 200px`) for interactive components like Selects, Inputs, or Buttons. Use `auto`, `min-content`, or `flex-1`.
  - Never hardcode height (e.g., `h-10`, `height: 40px`). Use `min-height` to allow growth, and `max-height` with `overflow-y: auto` if limitations are required.
- **Space Management**:
  - Prefer `flex` or `grid` with `gap` (e.g., `gap-2`, `gap-4`) over `margin` for spacing between child elements.
- **Overflow Defense**:
  - Use `.text-ellipsis` for single-line truncation in titles or labels.
  - **MANDATORY**: When using truncation, provide a `Tooltip` or `title` attribute to show full content on hover.
- **Validation**: Test with extreme-length real data before submitting.

