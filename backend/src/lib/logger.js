const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, 'app.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(level, module, message, data = null) {
  const timestamp = new Date().toISOString();
  let logMsg = `${timestamp} [${level}] [${module}] ${message}`;
  if (data) {
    if (data instanceof Error) {
      logMsg += ` | Error: ${data.message}`;
      if (data.code) logMsg += ` (Code: ${data.code})`;
    } else {
      logMsg += ` | Data: ${JSON.stringify(data)}`;
    }
  }
  logMsg += '\n';
  
  logStream.write(logMsg);
  
  // Also output to console for immediate visibility
  const consoleMsg = `${timestamp} [${level}] [${module}] ${message}`;
  if (level === 'ERROR') {
    console.error(consoleMsg);
    if (data && data instanceof Error && data.stack) {
      console.error(data.stack);
    }
  } else {
    console.log(consoleMsg);
  }
}

module.exports = { log };
