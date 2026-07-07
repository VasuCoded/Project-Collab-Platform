export function PaneLoader() {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--background)" }}>
      <div style={{ width: 120, height: 2, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
        <div className="loader-bar" />
      </div>
    </div>
  );
}
