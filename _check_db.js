const Database = require('better-sqlite3');
const db = new Database('C:/Users/Administrator/AppData/Roaming/aaronclaw/data/aaronclaw.db', {readonly:true});
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name));
try {
  const msgs = db.prepare('SELECT role, content, timestamp, tokens, pinned FROM messages WHERE conv_id = ? ORDER BY rowid').all('test');
  console.log('msgList test: OK, rows:', msgs.length);
} catch(e) {
  console.log('msgList test FAILED:', e.message);
}
try {
  const convs = db.prepare("SELECT data FROM kv WHERE ns = 'conversations'").all();
  console.log('conversations:', convs.length);
  if (convs.length > 0) {
    const first = JSON.parse(convs[0].data);
    console.log('First conv id:', first.id);
    const msgs = db.prepare('SELECT role, content FROM messages WHERE conv_id = ? ORDER BY rowid').all(first.id);
    console.log('Messages for first conv:', msgs.length);
  }
} catch(e) {
  console.log('FAILED:', e.message);
}
db.close();
process.exit(0);
