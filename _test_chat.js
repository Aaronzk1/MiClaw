const Database = require('better-sqlite3');
const db = new Database('C:/Users/Administrator/AppData/Roaming/aaronclaw/data/aaronclaw.db', {readonly:true});

// Check config
const config = db.prepare("SELECT data FROM kv WHERE ns='config' AND id='main'").get();
if (config) {
  const d = JSON.parse(config.data);
  console.log('Config:', JSON.stringify(d, null, 2));
} else {
  console.log('No config found!');
}

// Check models
const models = db.prepare("SELECT data FROM kv WHERE ns='models'").all();
console.log('\nModels:', models.length);
const enabled = models.filter(m => JSON.parse(m.data).enabled !== false);
console.log('Enabled models:', enabled.length);
if (enabled.length > 0) {
  console.log('First enabled:', JSON.parse(enabled[0].data).id, JSON.parse(enabled[0].data).name);
}

db.close();
process.exit(0);
