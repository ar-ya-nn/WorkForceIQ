# React Bits components

These files follow the React Bits API (same file names and props), so the
dashboard works straight away. To use the official React Bits code instead:

1. Open https://reactbits.dev and find the component.
2. Choose the **JS + CSS** variant and copy the code.
3. Paste it over the file with the same name here (and its .css file).

| File          | React Bits page                  | Used for              |
|---------------|----------------------------------|-----------------------|
| CountUp       | Text Animations -> Count Up      | animated KPI numbers  |
| SpotlightCard | Components -> Spotlight Card     | KPI and chart cards   |
| ShinyText     | Text Animations -> Shiny Text    | sidebar logo          |
| GradientText  | Text Animations -> Gradient Text | page titles           |

The official CountUp uses the `motion` package, which is already in package.json.


## Maintenance and Testing

- Keep component props consistent with their usage across the dashboard.
- Check the corresponding CSS file when updating a component's appearance.
- Verify animations and responsive layouts after making UI changes.
- Confirm that required dependencies are installed before replacing components.