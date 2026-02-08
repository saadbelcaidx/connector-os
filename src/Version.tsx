declare const __BUILD_SHA__: string;
declare const __BUILD_TIME__: string;

const sha = typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'unknown';
const time = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'unknown';

export default function Version() {
  return (
    <pre style={{ margin: 0, padding: 16, fontFamily: 'monospace', background: '#000', color: '#fff', minHeight: '100vh' }}>
      {sha}{'\n'}{time}
    </pre>
  );
}
