const Database = require('better-sqlite3');
const db = new Database('C:/Users/Administrator/AppData/Roaming/aaronclaw/data/aaronclaw.db', {readonly:true});
const config = db.prepare("SELECT data FROM kv WHERE ns='config' AND id='main'").get();
if (config) { const d = JSON.parse(config.data); console.log('Config model:', d.ai?.model, 'port:', d.gateway?.port); }
else { console.log('No config!'); }
db.close();
process.exit(0);
