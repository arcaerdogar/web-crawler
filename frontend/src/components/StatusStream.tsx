interface Props {
  logs: string[];
}

export function StatusStream({ logs }: Props) {
  return (
    <div className="status-stream">
      {logs.map((msg, i) => (
        <div key={i} className="stream-entry">{msg}</div>
      ))}
    </div>
  );
}
