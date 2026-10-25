// One colour family (midnight blue) at different strengths, for a calm, uniform look.
// Keys are kept from earlier versions so every chart picks them up automatically.
export const COLORS = {
  red: "#2c4a8c",     // high risk / strongest
  amber: "#7d93cc",   // medium
  green: "#c3cfeb",   // low / lightest
  blue: "#2c4a8c",
  cyan: "#4a68b0",
  violet: "#4a68b0",
  pink: "#34559c",
  teal: "#9fb1dc",
  grid: "rgba(28, 47, 87, 0.08)",
  axis: "#8a909c",
};

export const axisProps = { stroke: COLORS.axis, fontSize: 12, tickLine: false, axisLine: false };

export const tooltipProps = {
  contentStyle: {
    background: "rgba(255, 255, 255, 0.72)",
    border: "1px solid rgba(255, 255, 255, 0.85)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    borderRadius: 14,
    color: "#1b1f27",
    boxShadow: "0 8px 30px rgba(28, 47, 87, 0.15)",
    fontSize: 13,
  },
  labelStyle: { color: "#1b1f27", fontWeight: 600 },
  itemStyle: { color: "#1b1f27" },
  cursor: { fill: "rgba(28, 47, 87, 0.04)" },
};
