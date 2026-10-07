// BSTONKEX Credential Panel — Secure API key and RPC configuration
import { useState, useEffect, useCallback } from 'react';
import { loadCredentials, saveCredential, testCredential, type CredentialEntry } from '../../lib/engine/credential-store';

export default function CredentialPanel() {
  const [creds, setCreds] = useState<CredentialEntry[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [testing, setTesting] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const entries = await loadCredentials();
    setCreds(entries);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function handleSave(key: string, label: string, category: CredentialEntry['category']) {
    if (!inputValue.trim()) return;
    await saveCredential(key, inputValue.trim(), label, category);
    setInputValue('');
    setEditing(null);
    await reload();
  }

  async function handleTest(entry: CredentialEntry) {
    setTesting(entry.id);
    const result = await testCredential(entry);
    setCreds(prev => prev.map(c => c.id === entry.id ? { ...c, testResult: result.pass ? 'pass' : 'fail', testDetail: result.detail, lastTested: Date.now() } : c));
    setTesting(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em', marginBottom: 4 }}>
        ⚙ CREDENTIAL CONFIGURATION
      </div>
      <div style={{ fontSize: 8, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 8 }}>
        Configure API keys and RPC endpoints. Credentials are stored securely and never displayed in full after saving.
      </div>

      {creds.map(cred => (
        <div key={cred.id} style={{
          padding: 10, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-bright)' }}>{cred.label}</div>
              <div style={{ fontSize: 7, color: 'var(--text-muted)' }}>
                {cred.configured
                  ? <span style={{ color: 'var(--green)' }}>✓ Configured: {cred.masked}</span>
                  : <span style={{ color: 'var(--amber)' }}>○ Not configured</span>
                }
              </div>
            </div>
            <span style={{
              fontSize: 6, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
              background: cred.category === 'rpc' ? 'rgba(0,221,255,0.1)' : cred.category === 'api' ? 'rgba(0,255,100,0.1)' : 'rgba(255,180,0,0.1)',
              color: cred.category === 'rpc' ? 'var(--cyan)' : cred.category === 'api' ? 'var(--green)' : 'var(--amber)',
            }}>
              {cred.category.toUpperCase()}
            </span>
          </div>

          {/* Test Result */}
          {cred.lastTested && (
            <div style={{
              fontSize: 7, padding: '4px 6px', borderRadius: 3,
              background: cred.testResult === 'pass' ? 'rgba(0,255,100,0.08)' : 'rgba(255,48,96,0.08)',
              color: cred.testResult === 'pass' ? 'var(--green)' : 'var(--red)',
            }}>
              {cred.testResult === 'pass' ? '✓' : '✗'} {cred.testDetail}
            </div>
          )}

          {/* Edit Form */}
          {editing === cred.id ? (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <input
                type="password"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder={`Enter ${cred.label}...`}
                style={{
                  flex: 1, minWidth: 150, padding: '5px 8px', borderRadius: 4,
                  border: '1px solid var(--border)', background: 'rgba(0,0,0,0.3)',
                  color: 'var(--text-bright)', fontSize: 8, fontFamily: 'var(--font-mono)',
                }}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(cred.key, cred.label, cred.category); }}
                autoFocus
              />
              <button onClick={() => handleSave(cred.key, cred.label, cred.category)} style={{
                padding: '5px 10px', borderRadius: 4, border: '1px solid var(--green)',
                background: 'rgba(0,255,100,0.1)', color: 'var(--green)',
                fontSize: 7, fontWeight: 900, cursor: 'pointer',
              }}>SAVE</button>
              <button onClick={() => { setEditing(null); setInputValue(''); }} style={{
                padding: '5px 10px', borderRadius: 4, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-muted)',
                fontSize: 7, fontWeight: 700, cursor: 'pointer',
              }}>CANCEL</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => { setEditing(cred.id); setInputValue(''); }} style={{
                padding: '4px 8px', borderRadius: 4, border: '1px solid var(--cyan)',
                background: 'rgba(0,221,255,0.1)', color: 'var(--cyan)',
                fontSize: 7, fontWeight: 700, cursor: 'pointer',
              }}>
                {cred.configured ? 'UPDATE' : 'CONFIGURE'}
              </button>
              {cred.configured && (
                <button onClick={() => handleTest(cred)} disabled={testing === cred.id} style={{
                  padding: '4px 8px', borderRadius: 4, border: '1px solid var(--green)',
                  background: 'rgba(0,255,100,0.1)', color: testing === cred.id ? 'var(--text-muted)' : 'var(--green)',
                  fontSize: 7, fontWeight: 700, cursor: testing === cred.id ? 'default' : 'pointer',
                }}>
                  {testing === cred.id ? 'TESTING...' : 'TEST'}
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      <div style={{
        padding: 8, borderRadius: 4, fontSize: 7, color: 'var(--text-muted)',
        background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)', lineHeight: 1.5,
      }}>
        <span style={{ fontWeight: 900, color: 'var(--amber)' }}>NEVER</span> share API keys or private keys. Credentials are stored in your browser session and transmitted only to their respective services.
      </div>
    </div>
  );
}