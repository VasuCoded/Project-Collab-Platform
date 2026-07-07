export function Badge({ n }: { n: number }) {
  if (n <= 0) return null
  return (
    <span style={{
      minWidth: 16,
      height: 16,
      padding: '0 5px',
      borderRadius: 4,
      background: 'var(--accent)',
      color: '#fff',
      fontSize: 10,
      fontFamily: 'var(--font-mono), monospace',
      fontWeight: 700,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      {n > 99 ? '99+' : n}
    </span>
  )
}
