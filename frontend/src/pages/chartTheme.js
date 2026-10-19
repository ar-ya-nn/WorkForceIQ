export const COLORS = {
  violet: "#a78bfa",
  cyan: "#22d3ee",
  pink: "#f472b6",
  red: "#fb7185",
  amber: "#fbbf24",
  green: "#34d399",
  grid: "rgba(255,255,255,0.06)",
  axis: "#7d869c",
};

export const axisProps = { stroke: COLORS.axis, fontSize: 12, tickLine: false, axisLine: false };

export const tooltipProps = {
  contentStyle: {
    background: "rgba(17, 20, 31, 0.92)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    color: "#e8eaf2",
    backdropFilter: "blur(10px)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
  },
  labelStyle: { color: "#e8eaf2", fontWeight: 600 },
  itemStyle: { color: "#e8eaf2" },
  cursor: { fill: "rgba(167, 139, 250, 0.08)" },
};
